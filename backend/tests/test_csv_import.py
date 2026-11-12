import unittest
from datetime import date, timedelta
from unittest.mock import patch

from backend.services.csv_import import parse_ohlc_csv
from backend.services.market_data import _nearest_chart_zones, get_chart_data, import_csv_market_data


def csv_for_days(count: int = 30) -> str:
    rows = ["Date,Symbol,Open,High,Low,Close,Volume"]
    start = date(2024, 1, 1)
    for offset in range(count):
        candle_date = start + timedelta(days=offset)
        rows.append(f"{candle_date},TEST.NS,100,102,99,101,1000")
    return "\n".join(rows)


class CsvImportTests(unittest.TestCase):
    def test_parses_quoted_headers_and_sorts_candles(self):
        source = csv_for_days()
        lines = source.splitlines()
        content = "\n".join([lines[0].replace("Date", '"Date"'), *reversed(lines[1:])])

        imported = parse_ohlc_csv(content)

        self.assertEqual(imported[0][0], "TEST")
        self.assertEqual(imported[0][2][0]["date"], "2024-01-01")
        self.assertEqual(imported[0][2][-1]["date"], "2024-01-30")

    def test_rejects_invalid_ohlc(self):
        lines = csv_for_days().splitlines()
        lines[1] = "2024-01-01,TEST,100,98,99,101,1000"

        with self.assertRaisesRegex(ValueError, "Invalid OHLC range on row 2"):
            parse_ohlc_csv("\n".join(lines))

    def test_import_generates_chartable_timeframes(self):
        with patch("backend.services.market_data.detect_zones", return_value=[]):
            payload = import_csv_market_data(csv_for_days())

        self.assertEqual(payload["source"], "Imported CSV")
        self.assertEqual(payload["stocks"][0]["price"], 101)
        self.assertEqual(payload["stocks"][0]["freshness"]["quote_source"], "csv_import")
        weekly = get_chart_data("TEST", "weekly")
        monthly = get_chart_data("TEST", "monthly")
        quarterly = get_chart_data("TEST", "quarterly")
        self.assertGreater(len(weekly["candles"]), 1)
        self.assertEqual(len(monthly["candles"]), 1)
        self.assertEqual(len(quarterly["candles"]), 1)
        self.assertIn("quarterly", quarterly["zones_by_timeframe"])

    def test_chart_overlay_selects_only_one_nearest_zone_per_timeframe(self):
        demand_near = {"id": "demand-near", "type": "demand", "proximal": 100, "distal": 96, "score": 5}
        demand_far = {"id": "demand-far", "type": "demand", "proximal": 80, "distal": 76, "score": 7}
        supply_near = {"id": "supply-near", "type": "supply", "proximal": 110, "distal": 114, "score": 6}
        zones = {
            "daily": {"demand": [demand_near, demand_far], "supply": [supply_near]},
            "weekly": {"demand": [demand_far], "supply": []},
        }

        overlays = _nearest_chart_zones(zones, 104)

        self.assertEqual([zone["id"] for zone in overlays["daily"]], ["demand-near"])
        self.assertEqual([zone["id"] for zone in overlays["weekly"]], ["demand-far"])
        self.assertEqual(overlays["monthly"], [])

    def test_chart_overlay_ignores_zones_scoring_below_five(self):
        low_score_near = {"id": "low-score", "type": "demand", "proximal": 100, "distal": 96, "score": 4}
        qualifying_zone = {"id": "qualifying", "type": "demand", "proximal": 90, "distal": 86, "score": 5}

        overlays = _nearest_chart_zones(
            {"daily": {"demand": [low_score_near, qualifying_zone], "supply": []}},
            104,
        )

        self.assertEqual(overlays["daily"], [qualifying_zone])


if __name__ == "__main__":
    unittest.main()
