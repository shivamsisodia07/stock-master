from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "trade_scans.sqlite3"
SETUP_CODES = {"HIT", "DIT", "WIT", "MIT", "QIT", "YIT"}


def _connect(database_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(database_path or os.environ.get("TRADE_SCAN_DB_PATH", DEFAULT_DATABASE_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS journal_trades (
            id TEXT PRIMARY KEY,
            trade_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    return connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_trade(trade: dict[str, Any]) -> None:
    symbol = trade["symbol"].strip().upper()
    if not symbol:
        raise ValueError("Stock symbol cannot be blank.")
    trade["symbol"] = symbol

    if trade["setup"] not in SETUP_CODES:
        raise ValueError("Setup must be one of HIT, DIT, WIT, MIT, QIT, or YIT.")

    entry_price = trade["entry_price"]
    side = trade["side"]
    stop_price = trade.get("stop_price")
    target_price = trade.get("target_price")
    if stop_price is not None and (
        (side == "LONG" and stop_price >= entry_price)
        or (side == "SHORT" and stop_price <= entry_price)
    ):
        raise ValueError("Stop price must be below entry for a long trade and above entry for a short trade.")
    if target_price is not None and (
        (side == "LONG" and target_price <= entry_price)
        or (side == "SHORT" and target_price >= entry_price)
    ):
        raise ValueError("Target price must be above entry for a long trade and below entry for a short trade.")

    exit_price = trade.get("exit_price")
    exit_date = trade.get("exit_date")
    if (exit_price is None) != (exit_date is None):
        raise ValueError("Enter both an exit date and exit price to close a trade.")
    if exit_date and exit_date < trade["entry_date"]:
        raise ValueError("Exit date cannot be before entry date.")


def _with_metrics(trade_id: str, trade: dict[str, Any], created_at: str, updated_at: str) -> dict[str, Any]:
    result = {
        "id": trade_id,
        **trade,
        "status": "CLOSED" if trade.get("exit_price") is not None else "OPEN",
        "pnl": None,
        "return_pct": None,
        "risk_amount": None,
        "r_multiple": None,
        "created_at": created_at,
        "updated_at": updated_at,
    }
    if result["status"] == "CLOSED":
        direction = 1 if trade["side"] == "LONG" else -1
        gross_pnl = (trade["exit_price"] - trade["entry_price"]) * trade["quantity"] * direction
        result["pnl"] = round(gross_pnl - trade["fees"], 2)
        result["return_pct"] = round(result["pnl"] / (trade["entry_price"] * trade["quantity"]) * 100, 2)
        if trade.get("stop_price") is not None:
            result["risk_amount"] = round(
                abs(trade["entry_price"] - trade["stop_price"]) * trade["quantity"],
                2,
            )
            result["r_multiple"] = round(result["pnl"] / result["risk_amount"], 2)
    return result


def _decode_row(row: sqlite3.Row) -> dict[str, Any]:
    return _with_metrics(
        row["id"],
        json.loads(row["trade_json"]),
        row["created_at"],
        row["updated_at"],
    )


def list_trades(database_path: str | Path | None = None) -> list[dict[str, Any]]:
    with closing(_connect(database_path)) as connection:
        rows = connection.execute(
            """
            SELECT id, trade_json, created_at, updated_at FROM journal_trades
            ORDER BY json_extract(trade_json, '$.entry_date') DESC, created_at DESC
            """
        ).fetchall()
    return [_decode_row(row) for row in rows]


def create_trade(trade: dict[str, Any], database_path: str | Path | None = None) -> dict[str, Any]:
    _validate_trade(trade)
    trade_id = str(uuid.uuid4())
    timestamp = _now()
    with closing(_connect(database_path)) as connection:
        with connection:
            connection.execute(
                "INSERT INTO journal_trades (id, trade_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (trade_id, json.dumps(trade), timestamp, timestamp),
            )
    return _with_metrics(trade_id, trade, timestamp, timestamp)


def update_trade(
    trade_id: str,
    trade: dict[str, Any],
    database_path: str | Path | None = None,
) -> dict[str, Any] | None:
    _validate_trade(trade)
    with closing(_connect(database_path)) as connection:
        with connection:
            existing = connection.execute(
                "SELECT created_at FROM journal_trades WHERE id = ?",
                (trade_id,),
            ).fetchone()
            if existing is None:
                return None
            timestamp = _now()
            connection.execute(
                "UPDATE journal_trades SET trade_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(trade), timestamp, trade_id),
            )
    return _with_metrics(trade_id, trade, existing["created_at"], timestamp)


def delete_trade(trade_id: str, database_path: str | Path | None = None) -> bool:
    with closing(_connect(database_path)) as connection:
        with connection:
            cursor = connection.execute("DELETE FROM journal_trades WHERE id = ?", (trade_id,))
            return cursor.rowcount > 0
