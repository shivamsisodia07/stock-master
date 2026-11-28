import unittest
from datetime import datetime, timezone

from backend.services.market_data import _aggregate_intraday_candles


class IntradayChartTests(unittest.TestCase):
    def test_aggregates_five_bars_into_a_seventy_five_minute_candle(self):
        start = int(datetime(2026, 1, 5, 3, 45, tzinfo=timezone.utc).timestamp())
        bars = [
            {
                "date": start + index * 900,
                "open": 100 + index,
                "high": 105 + index,
                "low": 95 + index,
                "close": 102 + index,
                "volume": 10 + index,
            }
            for index in range(5)
        ]

        aggregated = _aggregate_intraday_candles(bars)

        self.assertEqual(len(aggregated), 1)
        self.assertEqual(aggregated[0], {
            "date": start,
            "open": 100,
            "high": 109,
            "low": 95,
            "close": 106,
            "volume": 60,
        })

    def test_does_not_combine_bars_from_different_sessions(self):
        first_session = int(datetime(2026, 1, 5, 3, 45, tzinfo=timezone.utc).timestamp())
        second_session = int(datetime(2026, 1, 6, 3, 45, tzinfo=timezone.utc).timestamp())
        bars = [
            {"date": first_session + index * 900, "open": 1, "high": 2, "low": 1, "close": 2, "volume": 1}
            for index in range(3)
        ] + [
            {"date": second_session + index * 900, "open": 2, "high": 3, "low": 2, "close": 3, "volume": 1}
            for index in range(3)
        ]

        aggregated = _aggregate_intraday_candles(bars)

        self.assertEqual([candle["date"] for candle in aggregated], [first_session, second_session])
        self.assertEqual([candle["volume"] for candle in aggregated], [3, 3])
