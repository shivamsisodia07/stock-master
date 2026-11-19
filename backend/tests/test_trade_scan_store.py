import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.jobs.nightly_trade_scan import run_nightly_scan
from backend.services.trade_scan_store import get_latest_trade_scan, save_trade_scan
from backend.services.tradesetup import SETUPS


class TradeScanStoreTests(unittest.TestCase):
    def test_latest_run_returns_all_saved_setup_results(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "scans.sqlite3"
            save_trade_scan(
                "previous-run",
                "2026-01-01T22:00:00+00:00",
                {"mode": "HIT", "scanned": 100, "matched": 1, "failed": [], "rows": []},
                database_path=database_path,
            )
            save_trade_scan(
                "latest-run",
                "2026-01-02T22:00:00+00:00",
                {"mode": "MIT", "scanned": 100, "matched": 2, "failed": [], "rows": []},
                database_path=database_path,
            )
            save_trade_scan(
                "latest-run",
                "2026-01-02T22:00:00+00:00",
                {"mode": "WIT", "scanned": 100, "matched": 3, "failed": [{"symbol": "XYZ"}], "rows": []},
                database_path=database_path,
            )

            result = get_latest_trade_scan(database_path)

        self.assertEqual(result["run_id"], "latest-run")
        self.assertEqual(result["scanned"], 200)
        self.assertEqual(result["matched"], 5)
        self.assertEqual(result["failed"], 1)
        self.assertEqual({setup["mode"] for setup in result["setups"]}, {"MIT", "WIT"})

    def test_nightly_scan_persists_all_modes_and_scan_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "scans.sqlite3"
            successful_result = {
                "setup": SETUPS["DIT"],
                "scanned": 100,
                "matched": 0,
                "failed": [],
                "rows": [],
            }

            def fake_scan(mode):
                if mode == "HIT":
                    raise RuntimeError("provider unavailable")
                return {"mode": mode, **successful_result, "setup": SETUPS[mode]}

            with self.assertLogs("backend.jobs.nightly_trade_scan", level="ERROR"):
                with patch(
                    "backend.jobs.nightly_trade_scan.scan_nifty100",
                    side_effect=fake_scan,
                ):
                    results = run_nightly_scan(database_path)

            stored = get_latest_trade_scan(database_path)

        self.assertEqual(len(results), len(SETUPS))
        self.assertEqual(len(stored["setups"]), len(SETUPS))
        self.assertEqual(stored["failed"], 1)
        self.assertEqual(stored["setups"][0]["mode"], "HIT")
        self.assertEqual(stored["setups"][0]["error"], "provider unavailable")


if __name__ == "__main__":
    unittest.main()
