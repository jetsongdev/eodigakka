"""
법정동 경계 GeoJSON/Shapefile → bjd_polygon 테이블 적재

데이터 출처 (둘 중 하나):
  A. 국가공간정보포털 (data.nsdi.go.kr) → 법정동경계 shapefile (EPSG:5179)
  B. 행정안전부 GitHub 배포 GeoJSON (EPSG:4326, 이미 변환됨)

사용법:
  python load_polygon.py <파일경로> [--sido 서울특별시]

예시:
  python load_polygon.py ~/Downloads/LSMD_CONT_LDREG_11.shp --sido 서울특별시
  python load_polygon.py ~/Downloads/HangJeongDong_ver20231001.geojson --sido 서울특별시
"""

from __future__ import annotations

import argparse
import os
import sys

import geopandas as gpd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from shapely.geometry import MultiPolygon, Polygon

load_dotenv()

SIDO_DEFAULT = "서울특별시"


def require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Missing env var: {name}")
    return val


def to_multipolygon(geom) -> MultiPolygon | None:
    if geom is None:
        return None
    if isinstance(geom, MultiPolygon):
        return geom
    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    return None


def detect_bjd_code_column(gdf: gpd.GeoDataFrame) -> str:
    """법정동코드 컬럼명 자동 탐지 (shapefile마다 이름 다름)."""
    # adm_cd2가 10자리 행정동 코드 (HangJeongDong 포맷)
    # LDONG_CD / EMD_CD가 10자리 법정동 코드 (NSDI LSMD_CONT_LDREG 포맷)
    candidates = [
        "LDONG_CD", "EMD_CD", "BJD_CD",                        # NSDI LSMD 법정동
        "adm_cd2",                                              # HangJeongDong 행정동
        "BJD_CODE", "BJDONG_CODE", "bjd_code",                  # 일반
        "PNU", "LSMD_CONT", "ADM_CD", "CTPRVN_CD",
    ]
    for c in candidates:
        if c in gdf.columns:
            return c
    # 10자리 숫자형 컬럼 탐지
    for c in gdf.columns:
        sample = gdf[c].dropna().astype(str).iloc[:5]
        if all(v.isdigit() and len(v) == 10 for v in sample):
            return c
    raise ValueError(f"법정동코드 컬럼을 찾을 수 없음. 컬럼 목록: {gdf.columns.tolist()}")


def detect_bjd_name_column(gdf: gpd.GeoDataFrame) -> str:
    candidates = [
        "LDONG_NM", "EMD_NM", "BJD_NM",                         # NSDI LSMD 법정동명
        "adm_nm",                                                # HangJeongDong
        "bjd_name", "ADM_NM", "ENG_NM",
    ]
    for c in candidates:
        if c in gdf.columns:
            return c
    raise ValueError(f"법정동명 컬럼을 찾을 수 없음. 컬럼 목록: {gdf.columns.tolist()}")


def load_file(path: str, sido_filter: str) -> gpd.GeoDataFrame:
    print(f"파일 로드: {path}")
    gdf = gpd.read_file(path)
    print(f"  원본 CRS: {gdf.crs}, 행 수: {len(gdf)}")

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)
        print(f"  → EPSG:4326 변환 완료")

    # HangJeongDong 포맷: sido 컬럼(2자리 코드)으로 서울 필터
    if "sido" in gdf.columns:
        gdf = gdf[gdf["sido"] == "11"].copy()
    elif "sidonm" in gdf.columns:
        gdf = gdf[gdf["sidonm"] == sido_filter].copy()
    else:
        bjd_col = detect_bjd_code_column(gdf)
        gdf[bjd_col] = gdf[bjd_col].astype(str).str.zfill(10)
        gdf = gdf[gdf[bjd_col].str.startswith("11")].copy()

    print(f"  서울 필터 후: {len(gdf)}행")
    return gdf


def build_bjd_name(row, bjd_name_col: str) -> str:
    name = str(row[bjd_name_col]).strip()
    # 전체 주소가 아닌 동 이름만 들어있는 경우 "서울특별시 XX구 XX동" 형태로 재구성
    if not name.startswith("서울"):
        sido = "서울특별시"
        # sigungu 추정 (bjd_code 앞 5자리 → 구 이름은 별도 매핑 없으면 그냥 name 사용)
        name = f"{sido} {name}"
    return name


def parse_sigungu(bjd_code: str) -> str:
    return bjd_code[:5]


def infer_dong(bjd_name: str) -> str:
    parts = bjd_name.strip().split()
    return parts[-1] if parts else bjd_name


def infer_sigungu(bjd_name: str) -> str:
    parts = bjd_name.strip().split()
    if len(parts) >= 3:
        return parts[1]
    return ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("file", help="GeoJSON 또는 Shapefile 경로")
    parser.add_argument("--sido", default=SIDO_DEFAULT)
    parser.add_argument("--dry-run", action="store_true", help="DB 적재 없이 파싱만")
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="적재 전 bjd_polygon TRUNCATE (행정동→법정동 같은 코드 체계 마이그레이션 시 필요)",
    )
    args = parser.parse_args()

    gdf = load_file(args.file, args.sido)

    bjd_col = detect_bjd_code_column(gdf)
    bjd_name_col = detect_bjd_name_column(gdf)

    print(f"\n컬럼 매핑: code={bjd_col}, name={bjd_name_col}")
    print(gdf[[bjd_col, bjd_name_col]].head(3).to_string())

    rows: list[tuple] = []
    skipped = 0
    has_sggnm = "sggnm" in gdf.columns
    has_sidonm = "sidonm" in gdf.columns
    for _, row in gdf.iterrows():
        bjd_code = str(row[bjd_col]).zfill(10)
        bjd_name = str(row[bjd_name_col]).strip()
        geom = to_multipolygon(row.geometry)
        if geom is None or geom.is_empty:
            skipped += 1
            continue

        sido_val = str(row["sidonm"]).strip() if has_sidonm else args.sido
        sigungu = str(row["sggnm"]).strip() if has_sggnm else infer_sigungu(bjd_name)
        dong = infer_dong(bjd_name)

        rows.append((
            bjd_code,
            bjd_name,
            sido_val,
            sigungu,
            dong,
            geom.wkt,
        ))

    print(f"\n적재 대상: {len(rows)}건, 스킵(빈 폴리곤): {skipped}건")

    if args.dry_run:
        print("[dry-run] DB 적재 건너뜀")
        return

    dsn = require_env("DATABASE_URL")
    with psycopg2.connect(dsn) as conn:
        with conn.cursor() as cur:
            if args.truncate:
                cur.execute("TRUNCATE bjd_polygon CASCADE")
                print("bjd_polygon TRUNCATE 완료")
            execute_values(
                cur,
                """
                INSERT INTO bjd_polygon (bjd_code, bjd_name, sido, sigungu, dong, geom)
                VALUES %s
                ON CONFLICT (bjd_code) DO UPDATE
                  SET bjd_name = EXCLUDED.bjd_name,
                      geom     = ST_GeomFromText(EXCLUDED.geom::text, 4326)
                """,
                [(r[0], r[1], r[2], r[3], r[4],
                  f"SRID=4326;{r[5]}") for r in rows],
                template="(%s, %s, %s, %s, %s, ST_GeomFromEWKT(%s))",
            )
        conn.commit()
        print(f"DB 적재 완료: {len(rows)}건")

    # 확인
    with psycopg2.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM bjd_polygon WHERE sido = %s", (args.sido,))
            count = cur.fetchone()[0]
            print(f"bjd_polygon 서울 행 수: {count}")


if __name__ == "__main__":
    main()
