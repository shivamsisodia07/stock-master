import csv
import io
import math
from datetime import date


_COLUMNS = {
    "date": ("date", "datetime", "timestamp"),
    "symbol": ("symbol", "ticker", "stock"),
    "open": ("open", "o"),
    "high": ("high", "h"),
    "low": ("low", "l"),
    "close": ("close", "adj close", "c"),
    "volume": ("volume", "vol", "v"),
}


def parse_ohlc_csv(content: str) -> list[tuple[str, str, list[dict]]]:
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")))
    if not reader.fieldnames:
        raise ValueError("CSV needs a header and at least one candle.")

    fields = {field.strip().lower(): field for field in reader.fieldnames if field}
    columns = {
        name: next((fields[alias] for alias in aliases if alias in fields), None)
        for name, aliases in _COLUMNS.items()
    }
    if any(field is None for field in columns.values()):
        raise ValueError("Required columns: date, symbol, open, high, low, close, volume.")

    grouped: dict[str, list[dict]] = {}
    for row_number, row in enumerate(reader, start=2):
        symbol = (row.get(columns["symbol"]) or "").upper().replace(".NS", "").replace(" ", "")
        try:
            candle_date = (row.get(columns["date"]) or "").strip()[:10]
            date.fromisoformat(candle_date)
            candle = {
                "date": candle_date,
                "open": float(row[columns["open"]]),
                "high": float(row[columns["high"]]),
                "low": float(row[columns["low"]]),
                "close": float(row[columns["close"]]),
                "volume": float(row[columns["volume"]]),
            }
        except (KeyError, TypeError, ValueError):
            raise ValueError(f"Invalid date or numeric data on row {row_number}.") from None

        if not symbol or any(not math.isfinite(value) for value in candle.values() if isinstance(value, float)):
            raise ValueError(f"Invalid symbol or numeric data on row {row_number}.")
        if (
            candle["close"] <= 0
            or candle["low"] > candle["high"]
            or candle["low"] > min(candle["open"], candle["close"])
            or candle["high"] < max(candle["open"], candle["close"])
        ):
            raise ValueError(f"Invalid OHLC range on row {row_number}.")
        grouped.setdefault(symbol, []).append(candle)

    eligible = []
    for symbol, candles in grouped.items():
        if len(candles) < 25:
            continue
        candles.sort(key=lambda candle: candle["date"])
        eligible.append((symbol, symbol, candles))
    if not eligible:
        raise ValueError("No symbols have at least 25 valid candles.")
    return eligible
