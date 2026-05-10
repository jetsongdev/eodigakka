import unittest
from datetime import date
from unittest.mock import MagicMock

import pandas as pd

from fetch_rtms import (
    DEFAULT_MONTHS,
    MAX_MONTHS,
    filter_cancelled,
    month_tokens,
    parse_args,
    update_etl_status,
)


class FilterCancelledTest(unittest.TestCase):
    def test_keeps_non_o_values_and_drops_o_rows(self) -> None:
        df = pd.DataFrame(
            {
                "해제여부": ["N", "", None, "O", " o ", "X"],
                "row_id": [1, 2, 3, 4, 5, 6],
            }
        )

        result = filter_cancelled(df)

        self.assertEqual(result["row_id"].tolist(), [1, 2, 3, 6])


def _mock_conn() -> tuple[MagicMock, MagicMock]:
    cursor = MagicMock()
    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=cursor)
    ctx.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor = MagicMock(return_value=ctx)
    return conn, cursor


class UpdateEtlStatusTest(unittest.TestCase):
    def test_includes_last_contract_date_columns_when_provided(self) -> None:
        conn, cursor = _mock_conn()

        update_etl_status(
            conn,
            succeeded=True,
            refreshed=True,
            last_contract_date_trade=date(2026, 5, 7),
            last_contract_date_rent=date(2026, 5, 8),
        )

        update_sql, update_params = cursor.execute.call_args_list[1].args
        self.assertIn("last_contract_date_trade = %s", update_sql)
        self.assertIn("last_contract_date_rent = %s", update_sql)
        self.assertIn(date(2026, 5, 7), update_params)
        self.assertIn(date(2026, 5, 8), update_params)

    def test_omits_last_contract_date_columns_when_none(self) -> None:
        conn, cursor = _mock_conn()

        update_etl_status(conn, started=True)

        update_sql, _ = cursor.execute.call_args_list[1].args
        self.assertNotIn("last_contract_date_trade", update_sql)
        self.assertNotIn("last_contract_date_rent", update_sql)


class MonthTokensTest(unittest.TestCase):
    def test_default_returns_three_descending_months(self) -> None:
        tokens = month_tokens(date(2026, 5, 10), count=3)
        self.assertEqual(tokens, ["202605", "202604", "202603"])

    def test_count_24_crosses_year_boundary(self) -> None:
        tokens = month_tokens(date(2026, 5, 10), count=24)
        self.assertEqual(len(tokens), 24)
        self.assertEqual(tokens[0], "202605")
        self.assertEqual(tokens[-1], "202406")  # 24 months ago = 2024-06
        # 모두 unique + 내림차순
        self.assertEqual(len(set(tokens)), 24)
        self.assertEqual(tokens, sorted(tokens, reverse=True))


class ParseArgsTest(unittest.TestCase):
    def test_default_months_matches_default_constant(self) -> None:
        ns = parse_args([])
        self.assertEqual(ns.months, DEFAULT_MONTHS)

    def test_explicit_months_override(self) -> None:
        ns = parse_args(["--months", "24"])
        self.assertEqual(ns.months, 24)

    def test_max_months_accepted(self) -> None:
        ns = parse_args(["--months", str(MAX_MONTHS)])
        self.assertEqual(ns.months, MAX_MONTHS)

    def test_zero_or_negative_rejected(self) -> None:
        with self.assertRaises(SystemExit):
            parse_args(["--months", "0"])
        with self.assertRaises(SystemExit):
            parse_args(["--months", "-1"])

    def test_above_max_rejected(self) -> None:
        with self.assertRaises(SystemExit):
            parse_args(["--months", str(MAX_MONTHS + 1)])


if __name__ == "__main__":
    unittest.main()
