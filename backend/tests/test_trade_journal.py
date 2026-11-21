import tempfile
import unittest
from pathlib import Path

from backend.services.trade_journal import create_trade, delete_trade, list_trades, update_trade


def trade_data(**overrides):
    return {
        "symbol": "RELIANCE",
        "setup": "MIT",
        "side": "LONG",
        "entry_date": "2026-11-18",
        "exit_date": "2026-11-20",
        "entry_price": 100,
        "exit_price": 110,
        "quantity": 10,
        "stop_price": 95,
        "target_price": 115,
        "fees": 5,
        "zone_score": 8,
        "trigger": "Daily EMA 9 reclaim",
        "exit_reason": "Target reached",
        "followed_rules": True,
        "emotions": "Patient",
        "lessons": "Waited for confirmation",
        "screenshot_url": "",
        "notes": "",
        **overrides,
    }


class TradeJournalTests(unittest.TestCase):
    def test_closed_trades_persist_and_include_net_pnl_and_r_multiple(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "journal.sqlite3"

            saved = create_trade(trade_data(), database_path)
            rows = list_trades(database_path)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], saved["id"])
        self.assertEqual(rows[0]["status"], "CLOSED")
        self.assertEqual(rows[0]["pnl"], 95)
        self.assertEqual(rows[0]["risk_amount"], 50)
        self.assertEqual(rows[0]["r_multiple"], 1.9)
        self.assertEqual(rows[0]["return_pct"], 9.5)

    def test_short_trade_metrics_use_short_direction(self):
        with tempfile.TemporaryDirectory() as directory:
            saved = create_trade(
                trade_data(side="SHORT", entry_price=100, exit_price=90, stop_price=105, target_price=85),
                Path(directory) / "journal.sqlite3",
            )

        self.assertEqual(saved["pnl"], 95)
        self.assertEqual(saved["r_multiple"], 1.9)

    def test_open_trade_has_no_realized_metrics_and_can_be_updated_or_deleted(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "journal.sqlite3"
            saved = create_trade(
                trade_data(exit_date=None, exit_price=None),
                database_path,
            )
            updated = update_trade(
                saved["id"],
                trade_data(exit_date=None, exit_price=None, notes="Still open"),
                database_path,
            )

            self.assertEqual(saved["status"], "OPEN")
            self.assertIsNone(saved["pnl"])
            self.assertEqual(updated["notes"], "Still open")
            self.assertTrue(delete_trade(saved["id"], database_path))
            self.assertEqual(list_trades(database_path), [])
            self.assertFalse(delete_trade(saved["id"], database_path))

    def test_invalid_stop_and_incomplete_close_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "journal.sqlite3"
            with self.assertRaisesRegex(ValueError, "Stop price"):
                create_trade(trade_data(stop_price=101), database_path)
            with self.assertRaisesRegex(ValueError, "both an exit date and exit price"):
                create_trade(trade_data(exit_date=None), database_path)
            self.assertEqual(list_trades(database_path), [])


if __name__ == "__main__":
    unittest.main()
