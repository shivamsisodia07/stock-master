from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.services.tradesetup import SETUPS, scan_nifty100
from backend.services.trade_scan_store import save_trade_scan

logger = logging.getLogger(__name__)


def run_nightly_scan(database_path: str | Path | None = None) -> list[dict[str, Any]]:
    run_id = str(uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    results = []
    for mode in SETUPS:
        error_message = None
        try:
            result = scan_nifty100(mode)
        except Exception as error:
            logger.exception("Nightly %s scan failed.", mode)
            error_message = str(error)
            result = {
                "mode": mode,
                "setup": SETUPS[mode],
                "scanned": 0,
                "matched": 0,
                "failed": [],
                "rows": [],
            }
        save_trade_scan(run_id, started_at, result, error_message, database_path)
        results.append(result | {"error": error_message})
    return results


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    results = run_nightly_scan()
    scanned = sum(result.get("scanned", 0) for result in results)
    matched = sum(result.get("matched", 0) for result in results)
    failed = sum(len(result.get("failed", [])) + bool(result.get("error")) for result in results)
    logger.info(
        "Nightly scan completed: %d setup types, %d stocks scanned, %d matches, %d failures.",
        len(results),
        scanned,
        matched,
        failed,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
