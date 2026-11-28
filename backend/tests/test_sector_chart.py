import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException

from backend.data.sector_indices import STOCK_SECTOR_INDEX
from backend.data.universe import STOCKS
from backend.services.market_data import get_sector_chart_data


class SectorChartTests(unittest.TestCase):
    def test_every_bundled_stock_has_a_sector_index_mapping(self):
        unmapped = {symbol for symbol, _ in STOCKS} - set(STOCK_SECTOR_INDEX)

        self.assertEqual(unmapped, set())

    def test_returns_selected_sector_candles_and_qualifying_zones(self):
        candle = {
            "date": "2026-01-05",
            "open": 100,
            "high": 110,
            "low": 95,
            "close": 105,
            "volume": 1000,
        }
        zone = {
            "type": "demand",
            "proximal": 100,
            "distal": 95,
            "score": 5,
        }
        with patch("backend.services.market_data._sector_chart_cache", {}), \
                patch("backend.services.market_data._sector_history_cache", {}), \
                patch(
                    "backend.services.market_data._download_candles",
                    return_value={"TNIDETF": [candle]},
                ) as download, \
                patch("backend.services.market_data.detect_zones", return_value=[zone]):
            chart = get_sector_chart_data("BHARTIARTL", "daily")

        self.assertEqual(chart["name"], "NIFTY India Digital ETF proxy")
        self.assertTrue(chart["is_proxy"])
        self.assertEqual(chart["candles"], [candle])
        self.assertEqual(chart["zones"]["demand"], [zone])
        self.assertEqual(chart["zones_by_timeframe"]["weekly"], [zone])
        self.assertEqual(chart["current_price"], candle["close"])
        self.assertEqual(
            [call.args for call in download.call_args_list],
            [
                (["TNIDETF.NS"], "2y", "1d"),
                (["TNIDETF.NS"], "10y", "1wk"),
                (["TNIDETF.NS"], "max", "1mo"),
            ],
        )

    def test_unknown_stock_has_an_explicit_unmapped_error(self):
        with self.assertRaises(HTTPException) as raised:
            get_sector_chart_data("NOT-A-STOCK", "daily")

        self.assertEqual(raised.exception.status_code, 404)

    def test_aggregates_sector_bars_for_seventy_five_minute_chart(self):
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
        with patch("backend.services.market_data._sector_chart_cache", {}), \
                patch(
                    "backend.services.market_data._download_candles",
                    return_value={"TNIDETF": bars},
                ), \
                patch("backend.services.market_data.detect_zones", return_value=[]):
            chart = get_sector_chart_data("BHARTIARTL", "75m")

        self.assertEqual(len(chart["candles"]), 1)
        self.assertEqual(chart["candles"][0]["date"], start)
        self.assertEqual(chart["candles"][0]["close"], 106)
        self.assertEqual(chart["zones_by_timeframe"]["75m"], [])


if __name__ == "__main__":
    unittest.main()
