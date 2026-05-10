import unittest
from datetime import date
from unittest.mock import MagicMock

import pandas as pd

from fetch_rtms import filter_cancelled, update_etl_status


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


if __name__ == "__main__":
    unittest.main()
