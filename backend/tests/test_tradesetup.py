import unittest

import pandas as pd

from backend.services.tradesetup import SETUPS, ema, execution_trigger, trend_is_up


class IncomeTradeSetupTests(unittest.TestCase):
    def test_summary_has_all_six_setups(self):
        self.assertEqual(set(SETUPS), {"HIT", "DIT", "WIT", "MIT", "QIT", "YIT"})

    def test_trend_requires_recent_high_and_low_structure(self):
        frame = pd.DataFrame({
            "Open": [100] * 12,
            "High": [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112],
            "Low": [99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
            "Close": [100] * 12,
            "Volume": [100] * 12,
        })
        self.assertTrue(trend_is_up(frame))

    def test_execution_trigger_requires_completed_reclaim(self):
        close = pd.Series([100, 102, 101, 104], dtype=float)
        frame = pd.DataFrame({
            "Open": close,
            "High": close + 1,
            "Low": close - 1,
            "Close": close,
            "Volume": [100] * 4,
        })
        fast = ema(close, 9)
        self.assertEqual(close.iloc[-1] > fast.iloc[-1] and close.iloc[-2] <= fast.iloc[-2],
                         execution_trigger(frame))


if __name__ == "__main__":
    unittest.main()
