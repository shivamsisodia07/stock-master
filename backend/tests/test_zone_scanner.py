import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from backend.services.zone_scanner import _strength_score, detect_zones, nearest_zone


def candle(day, open_, high, low, close):
    return {
        "date": f"2024-01-{day:02d}",
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": 1000,
    }


def dbr_candles(after_zone=None):
    candles = [
        candle(1, 109, 111, 99, 100),
        candle(2, 100, 103, 97, 101),
        candle(3, 101, 115, 100, 113),
        candle(4, 114, 117, 113, 116),
        candle(5, 116, 119, 115, 118),
    ]
    return candles + (after_zone or [])


def demand_setup(base_count=1, tested_once=False):
    candles = [candle(1, 200, 260, 90, 100)]
    candles.extend(
        candle(day, 100, 150, 80, 120)
        for day in range(2, base_count + 2)
    )
    leg_out_day = base_count + 2
    candles.append(candle(leg_out_day, 250, 280, 240, 275))
    if tested_once:
        candles.append(candle(leg_out_day + 1, 119, 210, 115, 200))
    return candles


class ZoneScannerTests(unittest.TestCase):
    def setUp(self):
        self.as_of = datetime(2024, 2, 1, tzinfo=timezone.utc)

    def test_detects_dbr_and_scores_zone_out_of_seven(self):
        zones = detect_zones(dbr_candles(), "daily", self.as_of)
        demand = next(zone for zone in zones if zone["type"] == "demand")
        self.assertEqual(demand["pattern"], "DBR")
        self.assertEqual(demand["proximal"], 101)
        self.assertEqual(demand["distal"], 97)
        self.assertEqual(demand["score"], 7)
        self.assertEqual(demand["score_breakdown"], {
            "freshness": 3,
            "strength": 2,
            "base_candles": 2,
        })
        self.assertGreaterEqual(demand["score"], 0)
        self.assertLessEqual(demand["score"], 7)

    def test_discards_zones_scoring_below_five(self):
        low_score_pattern = demand_setup(base_count=4, tested_once=True)

        with patch("backend.services.zone_scanner.MIN_ZONE_SCORE", 0):
            detected = detect_zones(low_score_pattern, "daily", self.as_of)
        self.assertTrue(detected)
        self.assertEqual(detected[0]["score"], 4.5)
        self.assertFalse(detect_zones(low_score_pattern, "daily", self.as_of))

    def test_one_retest_receives_one_and_a_half_freshness_points(self):
        zone = next(
            zone for zone in detect_zones(demand_setup(tested_once=True), "daily", self.as_of)
            if zone["type"] == "demand"
        )

        self.assertEqual(zone["freshness"], "tested once")
        self.assertEqual(zone["score"], 5.5)
        self.assertEqual(zone["score_breakdown"]["freshness"], 1.5)

    def test_wick_only_touch_counts_as_test_without_second_leg_out(self):
        zone = next(
            zone for zone in detect_zones(dbr_candles([
                candle(6, 102, 103, 100, 102),
                candle(7, 102, 103, 99, 100),
            ]), "daily", self.as_of)
            if zone["type"] == "demand" and zone["leg_out_at"] == "2024-01-03"
        )

        self.assertEqual(zone["tests"], 1)
        self.assertEqual(zone["last_test"], "2024-01-06")
        self.assertEqual(zone["freshness"], "tested once")
        self.assertEqual(zone["score_breakdown"]["freshness"], 1.5)

    def test_wick_pullback_followed_by_second_leg_out_counts_once(self):
        later_candles = [
            candle(6, 102, 104, 100, 103),
            candle(7, 103, 112, 102, 111),
        ]
        zone = next(
            zone for zone in detect_zones(dbr_candles(later_candles), "daily", self.as_of)
            if zone["type"] == "demand" and zone["leg_out_at"] == "2024-01-03"
        )

        self.assertEqual(zone["tests"], 1)
        self.assertEqual(zone["last_test"], "2024-01-06")
        self.assertEqual(zone["freshness"], "tested once")

    def test_two_separate_body_reentries_discard_zone(self):
        revisits = [
            candle(6, 100, 103, 99, 102),
            candle(7, 103, 106, 102, 104),
            candle(8, 100, 103, 99, 102),
        ]

        zones = detect_zones(dbr_candles(revisits), "daily", self.as_of)

        self.assertFalse(any(zone["type"] == "demand" and zone["leg_out_at"] == "2024-01-03" for zone in zones))

    def test_base_candle_score_covers_four_to_five_and_over_five(self):
        four_base_zone = next(
            zone for zone in detect_zones(demand_setup(base_count=4), "daily", self.as_of)
            if zone["type"] == "demand"
        )
        six_base_zone = next(
            zone for zone in detect_zones(demand_setup(base_count=6), "daily", self.as_of)
            if zone["type"] == "demand"
        )

        self.assertEqual(four_base_zone["score_breakdown"]["base_candles"], 1)
        self.assertEqual(four_base_zone["score"], 6)
        self.assertEqual(six_base_zone["score_breakdown"]["base_candles"], 0)
        self.assertEqual(six_base_zone["score"], 5)

    def test_strength_score_accounts_for_directional_gap(self):
        incoming = candle(1, 100, 110, 95, 105)
        gapped_outgoing = candle(2, 130, 150, 125, 145)
        nongapped_outgoing = candle(3, 105, 130, 100, 125)
        gapped_down_outgoing = candle(3, 78, 80, 65, 66)
        quiet = candle(4, 100, 110, 95, 105)

        self.assertEqual(_strength_score([incoming, gapped_outgoing], 0, 1, "demand"), 2)
        self.assertEqual(_strength_score([incoming, nongapped_outgoing], 0, 1, "demand"), 1)
        self.assertEqual(_strength_score([incoming, gapped_down_outgoing], 0, 1, "supply"), 2)
        self.assertEqual(_strength_score([incoming, quiet], 0, 1, "demand"), 0)

    def test_discards_zone_after_two_tests(self):
        retests = [
            candle(6, 100, 103, 99, 102),
            candle(7, 103, 107, 102, 104),
            candle(8, 100, 103, 99, 102),
        ]
        zones = detect_zones(dbr_candles(retests), "daily", self.as_of)
        self.assertFalse(any(zone["type"] == "demand" for zone in zones))

    def test_discards_zone_broken_by_a_close_beyond_distal(self):
        broken = [candle(6, 98, 100, 95, 96)]
        zones = detect_zones(dbr_candles(broken), "daily", self.as_of)
        self.assertFalse(any(zone["type"] == "demand" for zone in zones))

    def test_ignores_still_forming_daily_candle(self):
        candles = dbr_candles()[:3]
        candles[-1]["date"] = "2024-01-03"
        market_open = datetime(2024, 1, 3, 6, 30, tzinfo=timezone.utc)
        zones = detect_zones(candles, "daily", market_open)
        self.assertFalse(zones)

    def test_detects_rbd_supply_zone(self):
        supply = [
            candle(1, 100, 111, 99, 110),
            candle(2, 109, 113, 106, 110),
            candle(3, 110, 111, 96, 98),
            candle(4, 97, 99, 94, 95),
        ]
        zones = detect_zones(supply, "daily", self.as_of)
        zone = next(zone for zone in zones if zone["type"] == "supply")
        self.assertEqual(zone["pattern"], "RBD")
        self.assertEqual(zone["proximal"], 109)
        self.assertEqual(zone["distal"], 113)

    def test_dbr_requires_leg_out_close_above_leg_in_high(self):
        setup = [
            candle(1, 109, 111, 99, 100),
            candle(2, 100, 103, 97, 101),
            candle(3, 101, 112, 100, 108),
            candle(4, 108, 115, 107, 113),
        ]

        zones = detect_zones(setup, "daily", self.as_of)

        self.assertFalse(any(
            zone["pattern"] == "DBR" and zone["leg_out_at"] == "2024-01-03"
            for zone in zones
        ))

    def test_rbd_requires_leg_out_close_below_leg_in_low(self):
        setup = [
            candle(1, 100, 111, 99, 110),
            candle(2, 109, 113, 106, 110),
            candle(3, 110, 111, 98, 102),
            candle(4, 101, 103, 94, 95),
        ]

        zones = detect_zones(setup, "daily", self.as_of)

        self.assertFalse(any(
            zone["pattern"] == "RBD" and zone["leg_out_at"] == "2024-01-03"
            for zone in zones
        ))

    def test_leg_in_or_out_wicks_extend_zone_distal(self):
        setups = [
            (
                "demand leg-in wick",
                [
                    candle(1, 109, 111, 95, 100),
                    candle(2, 100, 103, 97, 101),
                    candle(3, 101, 115, 100, 113),
                ],
                "DBR",
                95,
            ),
            (
                "demand leg-out wick",
                [
                    candle(1, 109, 111, 99, 100),
                    candle(2, 100, 103, 97, 101),
                    candle(3, 101, 125, 94, 120),
                ],
                "DBR",
                94,
            ),
            (
                "supply leg-in wick",
                [
                    candle(1, 100, 115, 99, 110),
                    candle(2, 109, 113, 106, 110),
                    candle(3, 110, 111, 96, 98),
                ],
                "RBD",
                115,
            ),
            (
                "supply leg-out wick",
                [
                    candle(1, 100, 111, 99, 110),
                    candle(2, 109, 113, 106, 110),
                    candle(3, 120, 125, 90, 98),
                ],
                "RBD",
                125,
            ),
        ]

        for label, setup, pattern, expected_distal in setups:
            with self.subTest(label=label):
                zone = next(
                    zone for zone in detect_zones(setup, "daily", self.as_of)
                    if zone["pattern"] == pattern
                )
                self.assertEqual(zone["distal"], expected_distal)

    def test_rbr_and_dbd_use_base_and_leg_out_but_not_leg_in_wick(self):
        setups = [
            (
                "RBR leg-in wick",
                [
                    candle(1, 100, 111, 95, 110),
                    candle(2, 100, 103, 98, 101),
                    candle(3, 102, 117, 101, 115),
                ],
                "RBR",
                98,
            ),
            (
                "RBR leg-out wick",
                [
                    candle(1, 100, 111, 95, 110),
                    candle(2, 100, 103, 98, 101),
                    candle(3, 102, 132, 90, 130),
                ],
                "RBR",
                90,
            ),
            (
                "DBD leg-in wick",
                [
                    candle(1, 110, 115, 99, 100),
                    candle(2, 109, 113, 106, 110),
                    candle(3, 110, 111, 95, 98),
                ],
                "DBD",
                113,
            ),
            (
                "DBD leg-out wick",
                [
                    candle(1, 110, 111, 99, 100),
                    candle(2, 109, 113, 106, 110),
                    candle(3, 120, 125, 90, 98),
                ],
                "DBD",
                125,
            ),
        ]

        for label, setup, pattern, expected_distal in setups:
            with self.subTest(label=label):
                zone = next(
                    zone for zone in detect_zones(setup, "daily", self.as_of)
                    if zone["pattern"] == pattern
                )
                self.assertEqual(zone["distal"], expected_distal)

    def test_supply_body_entry_counts_as_test(self):
        supply = [
            candle(1, 100, 111, 99, 110),
            candle(2, 109, 113, 106, 110),
            candle(3, 110, 111, 96, 98),
            candle(4, 97, 99, 94, 95),
            candle(5, 108, 111, 106, 110),
        ]

        zone = next(
            zone for zone in detect_zones(supply, "daily", self.as_of)
            if zone["type"] == "supply" and zone["leg_out_at"] == "2024-01-03"
        )

        self.assertEqual(zone["tests"], 1)
        self.assertEqual(zone["freshness"], "tested once")

    def test_ignores_forming_but_uses_completed_monthly_candle(self):
        candles = dbr_candles()[:3]
        during_month = datetime(2024, 1, 15, 6, 0, tzinfo=timezone.utc)
        month_end_after_close = datetime(2024, 1, 31, 10, 30, tzinfo=timezone.utc)
        self.assertFalse(detect_zones(candles, "monthly", during_month))
        self.assertTrue(detect_zones(candles, "monthly", month_end_after_close))

    def test_ignores_forming_but_uses_completed_quarterly_candle(self):
        candles = dbr_candles()[:3]
        during_quarter = datetime(2024, 1, 15, 6, 0, tzinfo=timezone.utc)
        quarter_end_after_close = datetime(2024, 3, 31, 10, 30, tzinfo=timezone.utc)
        self.assertFalse(detect_zones(candles, "quarterly", during_quarter))
        self.assertTrue(detect_zones(candles, "quarterly", quarter_end_after_close))

    def test_nearest_demand_applies_three_percent_proximity_limit(self):
        zone = {
            "type": "demand",
            "proximal": 100,
            "distal": 96,
        }
        self.assertIsNotNone(nearest_zone([zone], 102, "demand", max_distance_pct=3))
        self.assertIsNone(nearest_zone([zone], 104, "demand", max_distance_pct=3))


if __name__ == "__main__":
    unittest.main()
