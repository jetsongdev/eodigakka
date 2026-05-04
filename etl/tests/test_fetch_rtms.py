import unittest

import pandas as pd

from fetch_rtms import filter_cancelled


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


if __name__ == "__main__":
    unittest.main()
