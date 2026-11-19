from __future__ import annotations

import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "trade_scans.sqlite3"


def _connect(database_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(database_path or os.environ.get("TRADE_SCAN_DB_PATH", DEFAULT_DATABASE_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_scans (
            run_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            mode TEXT NOT NULL,
            result_json TEXT NOT NULL,
            error TEXT,
            PRIMARY KEY (run_id, mode)
        )
        """
    )
    return connection


def save_trade_scan(
    run_id: str,
    started_at: str,
    result: dict[str, Any],
    error: str | None = None,
    database_path: str | Path | None = None,
) -> None:
    with closing(_connect(database_path)) as connection:
        with connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO trade_scans (run_id, started_at, mode, result_json, error)
                VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, started_at, result["mode"], json.dumps(result), error),
            )


def get_latest_trade_scan(database_path: str | Path | None = None) -> dict[str, Any]:
    with closing(_connect(database_path)) as connection:
        latest = connection.execute(
            "SELECT run_id, started_at FROM trade_scans ORDER BY started_at DESC, rowid DESC LIMIT 1"
        ).fetchone()
        if latest is None:
            return {
                "run_id": None,
                "started_at": None,
                "scanned": 0,
                "matched": 0,
                "failed": 0,
                "setups": [],
            }

        records = connection.execute(
            """
            SELECT result_json, error FROM trade_scans
            WHERE run_id = ?
            ORDER BY CASE mode
                WHEN 'HIT' THEN 0 WHEN 'DIT' THEN 1 WHEN 'WIT' THEN 2
                WHEN 'MIT' THEN 3 WHEN 'QIT' THEN 4 WHEN 'YIT' THEN 5
                ELSE 6
            END
            """,
            (latest["run_id"],),
        ).fetchall()

    setups = []
    for record in records:
        result = json.loads(record["result_json"])
        result["error"] = record["error"]
        setups.append(result)
    return {
        "run_id": latest["run_id"],
        "started_at": latest["started_at"],
        "scanned": sum(result.get("scanned", 0) for result in setups),
        "matched": sum(result.get("matched", 0) for result in setups),
        "failed": sum(len(result.get("failed", [])) + bool(result.get("error")) for result in setups),
        "setups": setups,
    }
