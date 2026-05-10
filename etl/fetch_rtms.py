from __future__ import annotations

import argparse
import math
import os
import sys
from dataclasses import dataclass
from datetime import date
from typing import Any

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from PublicDataReader import TransactionPrice

load_dotenv()

if os.getenv("ETL_DISABLED") == "1":
    sys.exit(0)

GANGBUK_14 = [
    "11110",
    "11140",
    "11170",
    "11200",
    "11215",
    "11230",
    "11260",
    "11290",
    "11305",
    "11320",
    "11350",
    "11380",
    "11410",
    "11440",
]
GANGNAM_11 = [
    "11470",
    "11500",
    "11530",
    "11545",
    "11560",
    "11590",
    "11620",
    "11650",
    "11680",
    "11710",
    "11740",
]
SEOUL_25 = GANGBUK_14 + GANGNAM_11
assert len(set(SEOUL_25)) == 25

TARGET_GU = GANGBUK_14
ETL_JOB_NAME = "rtms_phase1"


@dataclass(frozen=True)
class DbConfig:
    dsn: str


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def month_tokens(reference: date, count: int = 3) -> list[str]:
    tokens: list[str] = []
    year = reference.year
    month = reference.month
    for offset in range(count):
        current_month = month - offset
        current_year = year
        while current_month <= 0:
            current_month += 12
            current_year -= 1
        tokens.append(f"{current_year:04d}{current_month:02d}")
    return tokens


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    return text or None


def normalize_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    return int(value)


def build_contract_date(row: pd.Series) -> date:
    return date(
        int(row["계약년도"]),
        int(row["계약월"]),
        int(row["계약일"]),
    )


def build_bjd_code_from_columns(row: pd.Series) -> str | None:
    sigungu_code = normalize_text(row.get("법정동시군구코드"))
    umd_code = normalize_text(row.get("법정동읍면동코드"))
    if not sigungu_code or not umd_code:
        return None
    return f"{sigungu_code.zfill(5)}{umd_code.zfill(5)}"


def fetch_month(api: TransactionPrice, gu_code: str, year_month: str, trade_type: str) -> pd.DataFrame:
    return api.get_data(
        property_type="아파트",
        trade_type=trade_type,
        sigungu_code=gu_code,
        year_month=year_month,
        translate=True,
    )


def load_bjd_lookup(conn: psycopg2.extensions.connection) -> dict[tuple[str, str], str]:
    lookup: dict[tuple[str, str], str] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT LEFT(bjd_code, 5) AS sigungu_code, dong, bjd_code
            FROM bjd_polygon
            """
        )
        for sigungu_code, dong, bjd_code in cur.fetchall():
            key = (str(sigungu_code).strip(), str(dong).strip())
            if key not in lookup:
                lookup[key] = str(bjd_code).strip()
    return lookup


def apply_bjd_fallback(df: pd.DataFrame, lookup: dict[tuple[str, str], str]) -> pd.Series:
    codes: list[str | None] = []
    for _, row in df.iterrows():
        direct_code = build_bjd_code_from_columns(row)
        if direct_code:
            codes.append(direct_code)
            continue
        sigungu_code = normalize_text(row.get("법정동시군구코드"))
        dong = normalize_text(row.get("법정동"))
        codes.append(lookup.get((sigungu_code or "", dong or "")))
    return pd.Series(codes, index=df.index, dtype="object")


def filter_cancelled(df: pd.DataFrame) -> pd.DataFrame:
    if "해제여부" not in df.columns:
        return df
    active = df["해제여부"].apply(
        lambda value: str(value).strip().upper() != "O"
    )
    return df.loc[active].copy()


def normalize_trade_df(df: pd.DataFrame, lookup: dict[tuple[str, str], str]) -> list[tuple[Any, ...]]:
    if df.empty:
        return []
    df = filter_cancelled(df)
    if df.empty:
        return []
    df = df.copy()
    df["bjd_code"] = apply_bjd_fallback(df, lookup)
    df = df.loc[df["bjd_code"].notna()].copy()
    records: list[tuple[Any, ...]] = []
    for _, row in df.iterrows():
        records.append(
            (
                normalize_text(row["법정동시군구코드"]),
                normalize_text(row["bjd_code"]),
                normalize_text(row["단지명"]),
                round(float(row["전용면적"]), 2),
                normalize_optional_int(row.get("건축년도")),
                normalize_optional_int(row.get("층")),
                int(row["거래금액"]),
                build_contract_date(row),
            )
        )
    return records


def normalize_rent_df(df: pd.DataFrame, lookup: dict[tuple[str, str], str]) -> list[tuple[Any, ...]]:
    if df.empty:
        return []
    df = df.copy()
    df["bjd_code"] = apply_bjd_fallback(df, lookup)
    df = df.loc[df["bjd_code"].notna()].copy()
    records: list[tuple[Any, ...]] = []
    for _, row in df.iterrows():
        records.append(
            (
                normalize_text(row["법정동시군구코드"]),
                normalize_text(row["bjd_code"]),
                normalize_text(row["단지명"]),
                round(float(row["전용면적"]), 2),
                normalize_optional_int(row.get("건축년도")),
                normalize_optional_int(row.get("층")),
                int(row["보증금액"]),
                int(row["월세금액"]),
                build_contract_date(row),
            )
        )
    return records


def ensure_etl_status_table(conn: psycopg2.extensions.connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS etl_job_status (
              job_name TEXT PRIMARY KEY,
              last_started_at TIMESTAMPTZ,
              last_succeeded_at TIMESTAMPTZ,
              mv_refreshed_at TIMESTAMPTZ,
              last_error TEXT,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cur.execute(
            """
            ALTER TABLE etl_job_status
            ADD COLUMN IF NOT EXISTS last_contract_date_trade DATE,
            ADD COLUMN IF NOT EXISTS last_contract_date_rent DATE
            """
        )
    conn.commit()


def update_etl_status(
    conn: psycopg2.extensions.connection,
    *,
    started: bool = False,
    succeeded: bool = False,
    refreshed: bool = False,
    error: str | None = None,
    last_contract_date_trade: date | None = None,
    last_contract_date_rent: date | None = None,
) -> None:
    set_clauses = ["updated_at = NOW()"]
    params_list: list[Any] = []
    if started:
        set_clauses.append("last_started_at = NOW()")
        set_clauses.append("last_error = NULL")
    if succeeded:
        set_clauses.append("last_succeeded_at = NOW()")
        set_clauses.append("last_error = NULL")
    if refreshed:
        set_clauses.append("mv_refreshed_at = NOW()")
    if error is not None:
        set_clauses.append("last_error = %s")
        params_list.append(error)
    if last_contract_date_trade is not None:
        set_clauses.append("last_contract_date_trade = %s")
        params_list.append(last_contract_date_trade)
    if last_contract_date_rent is not None:
        set_clauses.append("last_contract_date_rent = %s")
        params_list.append(last_contract_date_rent)

    with conn.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO etl_job_status (job_name, updated_at)
            VALUES (%s, NOW())
            ON CONFLICT (job_name) DO NOTHING
            """,
            (ETL_JOB_NAME,),
        )
        cur.execute(
            f"""
            UPDATE etl_job_status
            SET {", ".join(set_clauses)}
            WHERE job_name = %s
            """,
            tuple(params_list) + (ETL_JOB_NAME,),
        )
    conn.commit()


def insert_trade_rows(conn: psycopg2.extensions.connection, rows: list[tuple[Any, ...]]) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO tx_apt_trade (
              sigungu_code,
              bjd_code,
              complex_name,
              area_m2,
              build_year,
              floor,
              price_man,
              contract_date
            ) VALUES %s
            ON CONFLICT DO NOTHING
            """,
            rows,
        )
    conn.commit()
    return len(rows)


def insert_rent_rows(conn: psycopg2.extensions.connection, rows: list[tuple[Any, ...]]) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO tx_apt_rent (
              sigungu_code,
              bjd_code,
              complex_name,
              area_m2,
              build_year,
              floor,
              deposit_man,
              monthly_man,
              contract_date
            ) VALUES %s
            ON CONFLICT DO NOTHING
            """,
            rows,
        )
    conn.commit()
    return len(rows)


def refresh_materialized_views(dsn: str) -> None:
    # CONCURRENTLY는 트랜잭션 밖(autocommit)에서만 실행 가능 → 별도 커넥션 사용
    with psycopg2.connect(dsn) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dong_stats")
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_jeonse_ratio")


DEFAULT_MONTHS = 3
MAX_MONTHS = 36


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="RTMS 매매·전월세 fetch + raw 적재 (강북 14구).",
    )
    parser.add_argument(
        "--months",
        type=int,
        default=DEFAULT_MONTHS,
        help=(
            f"fetch할 직전 N개월 (default {DEFAULT_MONTHS}, max {MAX_MONTHS}). "
            f"정기 cron은 default 3 유지(신고지연 보정), 풀 재적재 1회용은 24."
        ),
    )
    args = parser.parse_args(argv)
    if args.months < 1 or args.months > MAX_MONTHS:
        parser.error(f"--months must be 1..{MAX_MONTHS}, got {args.months}")
    return args


def main() -> int:
    if os.getenv("ETL_DISABLED") == "1":
        return 0

    args = parse_args()

    db_config = DbConfig(dsn=require_env("DATABASE_URL"))
    api = TransactionPrice(require_env("RTMS_KEY"))
    months = month_tokens(date.today(), count=args.months)
    print(f"ETL started: months={args.months} (window {months[-1]}~{months[0]})")

    with psycopg2.connect(db_config.dsn) as conn:
        ensure_etl_status_table(conn)
        update_etl_status(conn, started=True)
        lookup = load_bjd_lookup(conn)

        trade_rows_inserted = 0
        rent_rows_inserted = 0

        try:
            for year_month in months:
                for gu_code in TARGET_GU:
                    trade_df = fetch_month(api, gu_code, year_month, "매매")
                    trade_rows_inserted += insert_trade_rows(
                        conn, normalize_trade_df(trade_df, lookup)
                    )

                    rent_df = fetch_month(api, gu_code, year_month, "전월세")
                    rent_rows_inserted += insert_rent_rows(
                        conn, normalize_rent_df(rent_df, lookup)
                    )

            with conn.cursor() as cur:
                cur.execute("SELECT MAX(contract_date) FROM tx_apt_trade")
                max_trade = cur.fetchone()[0]
                cur.execute("SELECT MAX(contract_date) FROM tx_apt_rent")
                max_rent = cur.fetchone()[0]

            refresh_materialized_views(db_config.dsn)
            update_etl_status(
                conn,
                succeeded=True,
                refreshed=True,
                last_contract_date_trade=max_trade,
                last_contract_date_rent=max_rent,
            )
            print(
                f"ETL completed: trade_rows_seen={trade_rows_inserted}, "
                f"rent_rows_seen={rent_rows_inserted}, "
                f"last_contract_date_trade={max_trade}, "
                f"last_contract_date_rent={max_rent}"
            )
            return 0
        except Exception as exc:
            update_etl_status(conn, error=str(exc))
            raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ETL failed: {exc}", file=sys.stderr)
        raise
