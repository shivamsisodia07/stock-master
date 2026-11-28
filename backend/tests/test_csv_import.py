import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pandas as pd

import backend.services.market_data as market_data
from backend.services.csv_import import parse_ohlc_csv
from backend.services.market_data import (
    _aggregate_candles,
    _calendar_events,
    _qualifying_chart_zones,
    _news_item,
    _refresh_history,
    get_chart_data,
    get_market_data,
    get_stock_quotes,
    import_csv_market_data,
    search_stock_universe,
)


def csv_for_days(count: int = 30) -> str:
    rows = ["Date,Symbol,Open,High,Low,Close,Volume"]
    start = date(2024, 1, 1)
    for offset in range(count):
        candle_date = start + timedelta(days=offset)
        rows.append(f"{candle_date},TEST.NS,100,102,99,101,1000")
    return "\n".join(rows)


class CsvImportTests(unittest.TestCase):
    def test_market_data_response_cache_expires_after_five_minutes(self):
        with (
            patch("backend.services.market_data._cache", None),
            patch("backend.services.market_data._cache_updated_at", None),
            patch("backend.services.market_data._history_cache_updated_at", None),
            patch("backend.services.market_data.get_universe", return_value=([], {})),
            patch("backend.services.market_data._refresh_history"),
            patch("backend.services.market_data._refresh_quotes"),
            patch(
                "backend.services.market_data._build_market_data",
                side_effect=[{"revision": 1}, {"revision": 2}],
            ) as build_market_data,
        ):
            first = get_market_data()

            market_data._cache_updated_at = datetime.now(timezone.utc) - timedelta(minutes=4, seconds=59)
            self.assertIs(get_market_data(), first)

            market_data._cache_updated_at = datetime.now(timezone.utc) - timedelta(minutes=5)
            self.assertEqual(get_market_data(), {"revision": 2})
            self.assertEqual(build_market_data.call_count, 2)

    def test_formats_current_and_legacy_news_items(self):
        current = _news_item({
            "content": {
                "title": "Company update",
                "summary": "Quarterly update",
                "pubDate": "2025-01-03T10:00:00Z",
                "provider": {"displayName": "Market News"},
                "canonicalUrl": {"url": "https://example.test/news"},
            },
        })
        legacy = _news_item({
            "title": "Legacy headline",
            "publisher": "Wire",
            "providerPublishTime": 1735898400,
            "link": "https://example.test/legacy",
        })

        self.assertEqual(current["title"], "Company update")
        self.assertEqual(current["publisher"], "Market News")
        self.assertEqual(current["url"], "https://example.test/news")
        self.assertEqual(legacy["publisher"], "Wire")
        self.assertTrue(legacy["published_at"].startswith("2025-01-"))

    def test_formats_calendar_date_values(self):
        events = _calendar_events({
            "Earnings Date": ["2025-01-03T00:00:00"],
            "Ex-Dividend Date": None,
            "Revenue Estimate": 120,
        })

        self.assertEqual(events, [{"title": "Earnings Date", "date": "2025-01-03"}])

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
        self.assertEqual(weekly["current_price"], 101)
        self.assertGreater(len(weekly["candles"]), 1)
        self.assertEqual(len(monthly["candles"]), 1)
        self.assertEqual(len(quarterly["candles"]), 1)
        self.assertIn("quarterly", quarterly["zones_by_timeframe"])

    def test_aggregated_monthly_candle_uses_first_trading_session_date(self):
        daily = [
            {"date": "2026-08-03", "open": 100, "high": 105, "low": 99, "close": 104, "volume": 10},
            {"date": "2026-08-31", "open": 104, "high": 108, "low": 102, "close": 107, "volume": 20},
        ]

        monthly = _aggregate_candles(daily, "monthly")

        self.assertEqual(monthly[0]["date"], "2026-08-03")

    def test_live_weekly_and_monthly_dates_align_to_first_session(self):
        daily = [
            {"date": "2026-07-31", "open": 100, "high": 102, "low": 99, "close": 101, "volume": 10},
            {"date": "2026-08-03", "open": 101, "high": 103, "low": 100, "close": 102, "volume": 10},
            {"date": "2026-08-04", "open": 102, "high": 104, "low": 101, "close": 103, "volume": 10},
            {"date": "2026-08-11", "open": 103, "high": 105, "low": 102, "close": 104, "volume": 10},
            {"date": "2026-08-12", "open": 104, "high": 106, "low": 103, "close": 105, "volume": 10},
        ]
        weekly = [
            {"date": "2026-08-10", "open": 103, "high": 106, "low": 102, "close": 105, "volume": 20},
        ]
        monthly = [
            {"date": "2026-08-01", "open": 100, "high": 106, "low": 99, "close": 105, "volume": 50},
        ]

        with (
            patch.object(market_data, "_history_by_symbol", {}),
            patch.object(market_data, "_zones_by_symbol", {}),
            patch.object(market_data, "_history_cache_updated_at", None),
            patch.object(market_data, "_history_failures", []),
            patch.object(market_data, "_quotes_by_symbol", {}),
            patch("backend.services.market_data._symbol_batches", return_value=[["TATASTEEL.NS"]]),
            patch(
                "backend.services.market_data._download_candles",
                side_effect=[
                    {"TATASTEEL": daily},
                    {"TATASTEEL": weekly},
                    {"TATASTEEL": monthly},
                ],
            ),
            patch("backend.services.market_data.detect_zones", return_value=[]),
        ):
            _refresh_history([("TATASTEEL", "Tata Steel")], datetime.now(timezone.utc))

            weekly_chart = get_chart_data("TATASTEEL", "weekly")
            monthly_chart = get_chart_data("TATASTEEL", "monthly")

        self.assertEqual(weekly_chart["candles"][0]["date"], "2026-08-11")
        self.assertEqual(monthly_chart["candles"][0]["date"], "2026-08-03")

    def test_chart_fetches_history_for_only_requested_symbol(self):
        daily = [
            {"date": "2026-07-31", "open": 98, "high": 100, "low": 97, "close": 99, "volume": 10},
            {"date": "2026-08-03", "open": 100, "high": 105, "low": 99, "close": 104, "volume": 10},
        ]
        weekly = [
            {"date": "2026-08-03", "open": 100, "high": 105, "low": 99, "close": 104, "volume": 10},
        ]
        monthly = [
            {"date": "2026-08-01", "open": 100, "high": 105, "low": 99, "close": 104, "volume": 10},
        ]

        with (
            patch.object(market_data, "_history_by_symbol", {}),
            patch.object(market_data, "_history_updated_at_by_symbol", {}),
            patch.object(market_data, "_zones_by_symbol", {}),
            patch.object(market_data, "_quotes_by_symbol", {}),
            patch.object(market_data, "_quote_updated_at_by_symbol", {}),
            patch(
                "backend.services.market_data._download_candles",
                side_effect=[
                    {"TATASTEEL": daily},
                    {"TATASTEEL": weekly},
                    {"TATASTEEL": monthly},
                ],
            ) as download_candles,
            patch("backend.services.market_data._download_quotes", return_value={}),
            patch("backend.services.market_data.detect_zones", return_value=[]),
        ):
            chart = get_chart_data("TATASTEEL", "monthly")

        self.assertEqual(chart["name"], "Tata Steel")
        self.assertEqual(chart["candles"][0]["date"], "2026-08-03")
        self.assertEqual(download_candles.call_count, 3)
        self.assertTrue(all(call.args[0] == ["TATASTEEL.NS"] for call in download_candles.call_args_list))

    def test_chart_adds_latest_session_candle_when_daily_history_lags(self):
        daily = [
            {"date": "2026-11-25", "open": 163.17, "high": 164.9, "low": 156.7, "close": 159.3, "volume": 100},
        ]
        latest_session = {
            "date": "2026-11-26",
            "open": 159.3,
            "high": 164.0,
            "low": 158.0,
            "close": 163.54,
            "volume": 500,
        }
        with (
            patch.object(market_data, "_history_by_symbol", {}),
            patch.object(market_data, "_history_updated_at_by_symbol", {}),
            patch.object(market_data, "_zones_by_symbol", {}),
            patch.object(market_data, "_quotes_by_symbol", {}),
            patch.object(market_data, "_quote_updated_at_by_symbol", {}),
            patch(
                "backend.services.market_data._download_candles",
                side_effect=[
                    {"TATASTEEL": daily},
                    {"TATASTEEL": []},
                    {"TATASTEEL": []},
                ],
            ),
            patch(
                "backend.services.market_data._download_quotes",
                return_value={
                    "TATASTEEL": {
                        "price": 163.54,
                        "as_of": "2026-11-26T09:58:00+00:00",
                        "source": "intraday",
                        "candle": latest_session,
                    },
                },
            ),
            patch("backend.services.market_data.detect_zones", return_value=[]),
        ):
            chart = get_chart_data("TATASTEEL", "daily")

        self.assertEqual(chart["candles"][-1], latest_session)

    def test_intraday_quote_aggregates_latest_session_ohlcv(self):
        ticker = "TATASTEEL.NS"
        columns = pd.MultiIndex.from_tuples([
            (ticker, "Open"),
            (ticker, "High"),
            (ticker, "Low"),
            (ticker, "Close"),
            (ticker, "Volume"),
        ])
        frame = pd.DataFrame(
            [
                [10, 11, 9, 10.5, 100],
                [10.5, 12, 10, 11.5, 200],
                [11.5, 13, 11, 12.5, 300],
            ],
            index=pd.date_range(
                "2026-11-26 15:26",
                periods=3,
                freq="min",
                tz="Asia/Kolkata",
            ),
            columns=columns,
        )
        with patch("backend.services.market_data.yf.download", return_value=frame):
            quote = market_data._download_quotes([ticker])["TATASTEEL"]

        self.assertEqual(
            quote["candle"],
            {
                "date": "2026-11-26",
                "open": 10,
                "high": 13,
                "low": 9,
                "close": 12.5,
                "volume": 600,
            },
        )

    def test_stock_search_returns_only_matching_universe_rows(self):
        universe = [
            ("TATASTEEL", "Tata Steel"),
            ("TATAMOTORS", "Tata Motors"),
            ("RELIANCE", "Reliance Industries"),
        ]
        with patch("backend.services.market_data.get_universe", return_value=(universe, {})):
            results = search_stock_universe("tata", limit=1)

        self.assertEqual(results, [{"symbol": "TATASTEEL", "name": "Tata Steel"}])

    def test_stock_quote_request_returns_only_requested_symbols(self):
        quotes = {
            "TATASTEEL": {"price": 150, "as_of": "2026-08-03T10:00:00+00:00"},
            "RELIANCE": {"price": 1200, "as_of": "2026-08-03T10:00:00+00:00"},
        }
        with (
            patch.object(market_data, "_quotes_by_symbol", quotes),
            patch.object(market_data, "_quote_updated_at_by_symbol", {}),
            patch("backend.services.market_data._refresh_symbol_quote") as refresh_quote,
        ):
            payload = get_stock_quotes(["TATASTEEL"])

        self.assertEqual(
            payload["stocks"],
            [{
                "symbol": "TATASTEEL",
                "name": "Tata Steel",
                "price": 150,
                "as_of": "2026-08-03T10:00:00+00:00",
            }],
        )
        self.assertEqual(refresh_quote.call_count, 1)
        self.assertEqual(refresh_quote.call_args.args[0], "TATASTEEL")

    def test_chart_overlay_includes_all_qualifying_zones_nearest_first(self):
        demand_near = {"id": "demand-near", "type": "demand", "proximal": 100, "distal": 96, "score": 6}
        demand_far = {"id": "demand-far", "type": "demand", "proximal": 80, "distal": 76, "score": 7}
        supply_near = {"id": "supply-near", "type": "supply", "proximal": 110, "distal": 114, "score": 6.5}
        zones = {
            "daily": {"demand": [demand_near, demand_far], "supply": [supply_near]},
            "weekly": {"demand": [demand_far], "supply": []},
        }

        overlays = _qualifying_chart_zones(zones, 104)

        self.assertEqual(
            [zone["id"] for zone in overlays["daily"]],
            ["demand-near", "supply-near", "demand-far"],
        )
        self.assertEqual([zone["id"] for zone in overlays["weekly"]], ["demand-far"])
        self.assertEqual(overlays["monthly"], [])

    def test_chart_overlay_ignores_zones_scoring_below_five(self):
        low_score_near = {"id": "low-score", "type": "demand", "proximal": 100, "distal": 96, "score": 4.5}
        qualifying_zone = {"id": "qualifying", "type": "demand", "proximal": 90, "distal": 86, "score": 5}

        overlays = _qualifying_chart_zones(
            {"daily": {"demand": [low_score_near, qualifying_zone], "supply": []}},
            104,
        )

        self.assertEqual(overlays["daily"], [qualifying_zone])

    def test_market_data_selects_zones_relative_to_the_live_price(self):
        fetched_at = datetime(2026, 11, 27, 10, 0, tzinfo=timezone.utc)
        daily = [
            {
                "date": (date(2026, 10, 1) + timedelta(days=index)).isoformat(),
                "open": 2060,
                "high": 2070,
                "low": 2050,
                "close": 2067,
                "volume": 100,
            }
            for index in range(25)
        ]
        live_zone = {
            "id": "near-live-price",
            "type": "demand",
            "proximal": 2110,
            "distal": 2090,
            "score": 6,
        }
        last_close_zone = {
            "id": "near-last-close",
            "type": "demand",
            "proximal": 2070,
            "distal": 2050,
            "score": 6,
        }
        data = market_data._build_market_data(
            [("TEST", "Test")],
            {},
            fetched_at,
            history_source={"TEST": {"daily": daily}},
            zones_source={
                "TEST": {
                    "weekly": {
                        "demand": [live_zone, last_close_zone],
                        "supply": [],
                    },
                },
            },
            quotes_source={
                "TEST": {
                    "price": 2102.5,
                    "as_of": fetched_at.isoformat(),
                    "source": "intraday",
                },
            },
        )

        self.assertEqual(data["stocks"][0]["last_close"], 2067)
        self.assertEqual(data["stocks"][0]["weekly_demand"], live_zone)

    def test_intraday_chart_includes_zones_detected_for_its_selected_timeframe(self):
        now = datetime.now(timezone.utc)
        candles = [{
            "date": int((now - timedelta(hours=2)).timestamp()),
            "open": 101,
            "high": 105,
            "low": 99,
            "close": 104,
            "volume": 10,
        }]
        for timeframe in ("60m", "75m"):
            with self.subTest(timeframe=timeframe):
                zone = {
                    "id": f"intraday-demand-{timeframe}",
                    "type": "demand",
                    "timeframe": timeframe,
                    "proximal": 100,
                    "distal": 96,
                    "score": 6,
                }
                with (
                    patch.object(market_data, "_imported_history", {}),
                    patch.object(market_data, "_history_by_symbol", {"TEST": {"daily": [{"close": 104}]}}),
                    patch.object(market_data, "_intraday_chart_cache", {
                        ("TEST", timeframe): (now - timedelta(minutes=1), candles),
                    }),
                    patch.object(market_data, "_quotes_by_symbol", {}),
                    patch.object(market_data, "_zones_by_symbol", {}),
                    patch("backend.services.market_data.detect_zones", return_value=[zone]) as detect,
                ):
                    chart = get_chart_data("TEST", timeframe)

                self.assertEqual(chart["zones_by_timeframe"][timeframe], [zone])
                self.assertEqual(chart["zones"]["demand"], [zone])
                detect.assert_called_once()
                self.assertEqual(detect.call_args.args, (candles, timeframe))
                self.assertEqual(detect.call_args.kwargs.keys(), {"now"})

    def test_daily_chart_merges_the_current_session_quote_candle(self):
        now = datetime.now(timezone.utc)
        session_date = now.astimezone(market_data.NSE_TIMEZONE).date().isoformat()
        history_candle = {
            "date": session_date,
            "open": 2060,
            "high": 2070,
            "low": 2050,
            "close": 2067,
            "volume": 100,
        }
        quote_candle = {
            "date": session_date,
            "open": 2060,
            "high": 2102.5,
            "low": 2050,
            "close": 2102.5,
            "volume": 200,
        }
        with (
            patch.object(market_data, "_imported_history", {}),
            patch.object(market_data, "_history_by_symbol", {"TEST": {"daily": [history_candle]}}),
            patch.object(market_data, "_history_updated_at_by_symbol", {"TEST": now}),
            patch.object(market_data, "_quotes_by_symbol", {
                "TEST": {"price": 2102.5, "candle": quote_candle},
            }),
            patch.object(market_data, "_zones_by_symbol", {}),
            patch("backend.services.market_data._refresh_symbol_quote"),
        ):
            chart = get_chart_data("TEST", "daily")

        self.assertEqual(chart["current_price"], 2102.5)
        self.assertEqual(chart["candles"][-1], quote_candle)


if __name__ == "__main__":
    unittest.main()
