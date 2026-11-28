from __future__ import annotations

import logging
import math
import re
import threading
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import yfinance as yf
from fastapi import HTTPException

from backend.data.universe import STOCKS, get_universe
from backend.data.sector_indices import STOCK_SECTOR_INDEX
from backend.services.csv_import import parse_ohlc_csv
from backend.services.zone_scanner import (
    CHART_TIMEFRAMES,
    MIN_ZONE_SCORE,
    TIMEFRAMES,
    detect_zones,
    nearest_zone,
)

logger = logging.getLogger(__name__)
NSE_TIMEZONE = ZoneInfo("Asia/Kolkata")
CACHE_SECONDS = 5 * 60
HISTORY_CACHE_SECONDS = 15 * 60
INTRADAY_CHART_CACHE_SECONDS = 5 * 60
BATCH_SIZE = 20
STOCK_NAMES = dict(STOCKS)
INTERVALS = {
    "daily": ("2y", "1d"),
    "weekly": ("10y", "1wk"),
    "monthly": ("max", "1mo"),
}
_cache: dict | None = None
_cache_updated_at: datetime | None = None
_history_cache_updated_at: datetime | None = None
_history_by_symbol: dict[str, dict[str, list[dict]]] = {}
_history_updated_at_by_symbol: dict[str, datetime] = {}
_zones_by_symbol: dict[str, dict[str, list[dict]]] = {}
_quotes_by_symbol: dict[str, dict] = {}
_quote_updated_at_by_symbol: dict[str, datetime] = {}
_history_failures: list[str] = []
_quote_failures: list[str] = []
_intraday_chart_cache: dict[tuple[str, str], tuple[datetime, list[dict]]] = {}
_sector_chart_cache: dict[tuple[str, str], tuple[datetime, dict]] = {}
_sector_history_cache: dict[str, tuple[datetime, dict[str, list[dict]]]] = {}
_imported_history: dict[str, dict[str, list[dict]]] = {}
_imported_zones: dict[str, dict[str, list[dict]]] = {}
_cache_lock = threading.Lock()


def calculate_sma7_trend(candles: list[dict]) -> dict:
    """Classify the 7-period SMA angle using the value 7 candles earlier."""
    if len(candles) < 8:
        return {"trend": "INSUFFICIENT", "cmp_position": "Unknown", "action": "WAIT", "sma7": None}

    closes = [float(candle["close"]) for candle in candles]
    sma_values = []
    for index in range(6, len(closes)):
        sma_values.append(sum(closes[index - 6:index + 1]) / 7)

    if len(sma_values) < 2:
        return {"trend": "INSUFFICIENT", "cmp_position": "Unknown", "action": "WAIT", "sma7": round(sma_values[-1], 2)}

    current_sma = sma_values[-1]
    previous_index = len(sma_values) - 8
    previous_sma = sma_values[previous_index] if previous_index >= 0 else sma_values[0]
    tolerance = max(current_sma * 0.001, 0.01)
    if current_sma > previous_sma + tolerance:
        trend = "UPTREND"
    elif current_sma < previous_sma - tolerance:
        trend = "DOWNTREND"
    else:
        trend = "SIDEWAYS"

    recent = closes[-20:] if len(closes) >= 20 else closes
    low = min(recent)
    high = max(recent)
    span = high - low
    cmp = closes[-1]
    if span <= 0:
        cmp_position = "Equilibrium"
    elif cmp <= low + span * 0.25:
        cmp_position = "Very low" if cmp <= low + span * 0.12 else "Low"
    elif cmp >= high - span * 0.25:
        cmp_position = "Very high" if cmp >= high - span * 0.12 else "High"
    else:
        cmp_position = "Equilibrium"

    if cmp_position in ("Low", "Very low"):
        action = "DEFINITELY BUY" if cmp_position == "Very low" else "BUY"
    elif cmp_position in ("High", "Very high"):
        action = "DEFINITELY SELL" if cmp_position == "Very high" else "SELL"
    else:
        action = "GO WITH THE TREND"

    return {
        "trend": trend,
        "cmp_position": cmp_position,
        "action": action,
        "sma7": round(current_sma, 2),
    }


def _column_for_ticker(frame, ticker: str, field: str):
    expected = field.lower()
    if getattr(frame.columns, "nlevels", 1) == 1:
        for column in frame.columns:
            if str(column).lower() == expected:
                return frame[column]
        return None
    for column in frame.columns:
        parts = [str(part) for part in column]
        if ticker in parts and any(part.lower() == expected for part in parts):
            return frame[column]
    return None


def _date_string(index) -> str:
    if hasattr(index, "date"):
        return index.date().isoformat()
    return str(index)[:10]


def _download_candles(
    tickers: list[str],
    period: str,
    interval: str,
    preserve_time: bool = False,
) -> dict[str, list[dict]]:
    frame = yf.download(
        tickers=tickers,
        period=period,
        interval=interval,
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=True,
        timeout=30,
    )
    if frame is None or frame.empty:
        return {}

    result: dict[str, list[dict]] = {}
    for ticker in tickers:
        columns = {
            field.lower(): _column_for_ticker(frame, ticker, field)
            for field in ("Open", "High", "Low", "Close", "Volume")
        }
        if any(series is None for series in columns.values()):
            continue

        candles = []
        for index in frame.index:
            values = {field: series.loc[index] for field, series in columns.items()}
            if any(not math.isfinite(float(value)) for value in values.values()):
                continue
            candle = {
                "date": int(index.timestamp()) if preserve_time else _date_string(index),
                "open": round(float(values["open"]), 2),
                "high": round(float(values["high"]), 2),
                "low": round(float(values["low"]), 2),
                "close": round(float(values["close"]), 2),
                "volume": int(values["volume"]),
            }
            if (
                candle["close"] <= 0
                or candle["low"] > candle["high"]
                or candle["low"] > min(candle["open"], candle["close"])
                or candle["high"] < max(candle["open"], candle["close"])
            ):
                continue
            candles.append(candle)
        if candles:
            result[ticker.removesuffix(".NS")] = candles
    return result


def _download_quotes(tickers: list[str]) -> dict[str, dict]:
    frame = yf.download(
        tickers=tickers,
        period="1d",
        interval="1m",
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=True,
        timeout=30,
    )
    if frame is None or frame.empty:
        return {}

    quotes = {}
    for ticker in tickers:
        close = _column_for_ticker(frame, ticker, "Close")
        if close is None:
            continue
        valid = [(index, float(value)) for index, value in close.items() if math.isfinite(float(value)) and float(value) > 0]
        if not valid:
            continue
        quote_time, price = valid[-1]
        quote_index = quote_time
        quote_date = _date_string(quote_time)
        if hasattr(quote_time, "to_pydatetime"):
            quote_time = quote_time.to_pydatetime()
        if quote_time.tzinfo is None:
            quote_time = quote_time.replace(tzinfo=NSE_TIMEZONE)
        quote = {
            "price": round(price, 2),
            "as_of": quote_time.astimezone(timezone.utc).isoformat(),
            "source": "intraday",
        }
        open_series = _column_for_ticker(frame, ticker, "Open")
        high_series = _column_for_ticker(frame, ticker, "High")
        low_series = _column_for_ticker(frame, ticker, "Low")
        volume_series = _column_for_ticker(frame, ticker, "Volume")
        if all(series is not None for series in (open_series, high_series, low_series, volume_series)):
            last_high = float(high_series.loc[quote_index])
            last_low = float(low_series.loc[quote_index])
            if math.isfinite(last_high) and math.isfinite(last_low):
                quote["last_high"] = round(last_high, 2)
                quote["last_low"] = round(last_low, 2)
            session_rows = []
            for index in frame.index:
                if _date_string(index) != quote_date:
                    continue
                values = {
                    "open": float(open_series.loc[index]),
                    "high": float(high_series.loc[index]),
                    "low": float(low_series.loc[index]),
                    "close": float(close.loc[index]),
                    "volume": float(volume_series.loc[index]),
                }
                if (
                    any(not math.isfinite(value) for value in values.values())
                    or values["low"] > values["high"]
                    or values["low"] > min(values["open"], values["close"])
                    or values["high"] < max(values["open"], values["close"])
                ):
                    continue
                session_rows.append(values)
            if session_rows:
                quote["candle"] = {
                    "date": quote_date,
                    "open": round(session_rows[0]["open"], 2),
                    "high": round(max(row["high"] for row in session_rows), 2),
                    "low": round(min(row["low"] for row in session_rows), 2),
                    "close": round(session_rows[-1]["close"], 2),
                    "volume": int(sum(row["volume"] for row in session_rows)),
                }
        quotes[ticker.removesuffix(".NS")] = quote
    return quotes


def _merge_intraday_candle(candles: list[dict], quote: dict) -> list[dict]:
    candle = quote.get("candle")
    if not candle or (candles and candle["date"] < candles[-1]["date"]):
        return candles
    if candles and candle["date"] == candles[-1]["date"]:
        return [*candles[:-1], candle]
    return [*candles, candle]


def _fallback_quote(candles: list[dict], now: datetime) -> dict:
    local_now = now.astimezone(NSE_TIMEZONE)
    market_open = local_now.weekday() < 5 and time(9, 15) <= local_now.time().replace(tzinfo=None) <= time(15, 30)
    candle = candles[-1]
    if market_open and candle["date"] == local_now.date().isoformat():
        candle = candles[-2]
    close_time = datetime.fromisoformat(candle["date"]).replace(tzinfo=NSE_TIMEZONE, hour=15, minute=30)
    return {
        "price": candle["close"],
        "as_of": close_time.astimezone(timezone.utc).isoformat(),
        "source": "daily_close",
    }


def _freshness(quote: dict, latest_candle_date: str, now: datetime) -> dict:
    as_of = datetime.fromisoformat(quote["as_of"])
    age_seconds = max(0, int((now - as_of).total_seconds()))
    local_now = now.astimezone(NSE_TIMEZONE)
    market_open = local_now.weekday() < 5 and time(9, 15) <= local_now.time().replace(tzinfo=None) <= time(15, 30)
    if quote["source"] == "daily_close" and latest_candle_date == local_now.date().isoformat() and not market_open:
        status = "session close"
    elif age_seconds <= 15 * 60:
        status = "fresh"
    elif age_seconds <= 24 * 60 * 60:
        status = "delayed"
    else:
        status = "stale"
    return {
        "status": status,
        "age_seconds": age_seconds,
        "as_of": quote["as_of"],
        "quote_source": quote["source"],
        "candle_date": latest_candle_date,
    }


def _nearest_by_timeframe(zones: dict[str, list[dict]], price: float, zone_type: str, max_distance: float | None = None) -> dict | None:
    qualifying_zones = [
        zone for zone in zones.get(zone_type, [])
        if zone.get("score", 0) >= MIN_ZONE_SCORE
    ]
    return nearest_zone(qualifying_zones, price, zone_type, max_distance_pct=max_distance)


def _qualifying_chart_zones(zones_by_timeframe: dict, price: float) -> dict:
    qualifying = {}
    for timeframe in CHART_TIMEFRAMES:
        timeframe_zones = zones_by_timeframe.get(timeframe, {})
        candidates = [
            zone
            for zone_type in ("demand", "supply")
            for zone in timeframe_zones.get(zone_type, [])
            if zone.get("score", 0) >= MIN_ZONE_SCORE
        ]

        def distance_to_zone(zone: dict) -> float:
            low = min(zone["proximal"], zone["distal"])
            high = max(zone["proximal"], zone["distal"])
            distance = max(low - price, 0, price - high)
            return distance / max(price, 1)

        qualifying[timeframe] = sorted(
            candidates,
            key=lambda zone: (distance_to_zone(zone), -zone["score"]),
        )
    return qualifying


def _zones_by_type(zones: list[dict]) -> dict[str, list[dict]]:
    return {
        zone_type: [zone for zone in zones if zone["type"] == zone_type]
        for zone_type in ("demand", "supply")
    }


def _symbol_batches(universe: list[tuple[str, str]]) -> list[list[str]]:
    symbol_batches = [
        [f"{symbol}.NS" for symbol, _ in universe[start:start + BATCH_SIZE]]
        for start in range(0, len(universe), BATCH_SIZE)
    ]
    return symbol_batches


def _refresh_history(universe: list[tuple[str, str]], now: datetime) -> None:
    global _history_by_symbol, _zones_by_symbol, _history_cache_updated_at, _history_failures
    history = {
        symbol: dict(_history_by_symbol[symbol])
        for symbol, _ in universe
        if symbol in _history_by_symbol
    }
    failed_batches: list[str] = []
    symbol_batches = _symbol_batches(universe)
    for interval_name, (period, interval) in INTERVALS.items():
        for batch_index, tickers in enumerate(symbol_batches):
            try:
                bars = _download_candles(tickers, period, interval)
                for symbol, candles in bars.items():
                    history.setdefault(symbol, {})[interval_name] = candles
            except Exception:
                failed_batches.append(f"{interval_name}:{batch_index + 1}")
                logger.exception("Failed downloading %s candles for batch %s", interval_name, batch_index + 1)

    for stock_history in history.values():
        daily = stock_history.get("daily", [])
        if daily:
            for timeframe in ("weekly", "monthly"):
                candles = stock_history.get(timeframe, [])
                if candles:
                    stock_history[timeframe] = _align_candles_to_first_session(
                        candles,
                        daily,
                        timeframe,
                    )

        monthly = stock_history.get("monthly", [])
        if monthly:
            stock_history["quarterly"] = _aggregate_candles(monthly, "quarterly")

    zones_by_symbol = {}
    for symbol, _ in universe:
        stock_history = history.get(symbol, {})
        zones_by_symbol[symbol] = {}
        for timeframe in TIMEFRAMES:
            found = detect_zones(stock_history.get(timeframe, []), timeframe, now=now)
            zones_by_symbol[symbol][timeframe] = {
                "demand": [zone for zone in found if zone["type"] == "demand"],
                "supply": [zone for zone in found if zone["type"] == "supply"],
            }
    _history_by_symbol = history
    _zones_by_symbol = zones_by_symbol
    _history_updated_at_by_symbol.update({symbol: now for symbol in history})
    _history_cache_updated_at = now
    _history_failures = failed_batches


def _refresh_symbol_history(symbol: str, now: datetime) -> None:
    global _history_by_symbol, _zones_by_symbol
    history = dict(_history_by_symbol.get(symbol, {}))
    ticker = f"{symbol}.NS"
    for timeframe, (period, interval) in INTERVALS.items():
        try:
            bars = _download_candles([ticker], period, interval)
            if symbol in bars:
                history[timeframe] = bars[symbol]
        except Exception:
            logger.exception("Failed downloading %s candles for %s", timeframe, symbol)

    daily = history.get("daily", [])
    if not daily:
        return

    try:
        intraday_quotes = _download_quotes([ticker])
    except Exception:
        logger.exception("Failed downloading latest session candle for %s", symbol)
    else:
        quote = intraday_quotes.get(symbol)
        if quote is not None:
            _quotes_by_symbol.update(intraday_quotes)
            _quote_updated_at_by_symbol[symbol] = now
            daily = _merge_intraday_candle(daily, quote)
            history["daily"] = daily

    for timeframe in ("weekly", "monthly"):
        candles = history.get(timeframe, [])
        if candles:
            history[timeframe] = _align_candles_to_first_session(candles, daily, timeframe)
    if history.get("monthly"):
        history["quarterly"] = _aggregate_candles(history["monthly"], "quarterly")

    zones = {}
    for timeframe in TIMEFRAMES:
        found = detect_zones(history.get(timeframe, []), timeframe, now=now)
        zones[timeframe] = {
            "demand": [zone for zone in found if zone["type"] == "demand"],
            "supply": [zone for zone in found if zone["type"] == "supply"],
        }

    updated_history = dict(_history_by_symbol)
    updated_history[symbol] = history
    _history_by_symbol = updated_history
    updated_zones = dict(_zones_by_symbol)
    updated_zones[symbol] = zones
    _zones_by_symbol = updated_zones
    _history_updated_at_by_symbol[symbol] = now


def _refresh_quotes(universe: list[tuple[str, str]]) -> None:
    global _quotes_by_symbol, _quote_failures
    quotes = dict(_quotes_by_symbol)
    failed_batches = []
    symbol_batches = _symbol_batches(universe)
    refreshed_symbols = set()
    for batch_index, tickers in enumerate(symbol_batches):
        try:
            fresh_quotes = _download_quotes(tickers)
            quotes.update(fresh_quotes)
            refreshed_symbols.update(fresh_quotes)
        except Exception:
            failed_batches.append(f"intraday:{batch_index + 1}")
            logger.exception("Failed downloading intraday prices for batch %s", batch_index + 1)
    _quotes_by_symbol = quotes
    refreshed_at = datetime.now(timezone.utc)
    _quote_updated_at_by_symbol.update({
        symbol: refreshed_at
        for symbol in refreshed_symbols
    })
    _quote_failures = failed_batches


def _refresh_symbol_quote(symbol: str, now: datetime) -> None:
    last_updated = _quote_updated_at_by_symbol.get(symbol)
    if last_updated is not None and now - last_updated < timedelta(seconds=CACHE_SECONDS):
        return
    local_now = now.astimezone(NSE_TIMEZONE)
    if not (
        local_now.weekday() < 5
        and time(9, 15) <= local_now.time().replace(tzinfo=None) <= time(15, 30)
    ):
        return
    try:
        quotes = _download_quotes([f"{symbol}.NS"])
    except Exception:
        logger.exception("Failed downloading intraday price for %s", symbol)
        return
    _quotes_by_symbol.update(quotes)
    _quote_updated_at_by_symbol[symbol] = now


def _build_market_data(
    universe: list[tuple[str, str]],
    universe_info: dict,
    fetched_at: datetime,
    history_source: dict[str, dict[str, list[dict]]] | None = None,
    zones_source: dict[str, dict[str, list[dict]]] | None = None,
    quotes_source: dict[str, dict] | None = None,
) -> dict:
    history_source = _history_by_symbol if history_source is None else history_source
    zones_source = _zones_by_symbol if zones_source is None else zones_source
    quotes_source = _quotes_by_symbol if quotes_source is None else quotes_source
    stocks = []
    for symbol, name in universe:
        stock_history = history_source.get(symbol, {})
        daily = stock_history.get("daily", [])
        if len(daily) < 25:
            continue
        fallback = _fallback_quote(daily, fetched_at)
        quote = quotes_source.get(symbol)
        if quote is None or datetime.fromisoformat(quote["as_of"]) < datetime.fromisoformat(fallback["as_of"]):
            quote = fallback
        current_price = quote["price"]
        last_close = daily[-1]["close"]
        timeframe_zones = zones_source.get(symbol, {})
        trends = {
            timeframe: calculate_sma7_trend(stock_history.get(timeframe, []))
            for timeframe in TIMEFRAMES
        }
        daily_zones = timeframe_zones.get("daily", {"demand": [], "supply": []})
        demand = _nearest_by_timeframe(daily_zones, current_price, "demand", max_distance=3)
        supply = _nearest_by_timeframe(daily_zones, current_price, "supply", max_distance=3)
        weekly = timeframe_zones.get("weekly", {"demand": [], "supply": []})
        monthly = timeframe_zones.get("monthly", {"demand": [], "supply": []})
        quarterly = timeframe_zones.get("quarterly", {"demand": [], "supply": []})
        previous_close = daily[-2]["close"]
        stocks.append({
            "symbol": symbol,
            "name": name,
            "price": current_price,
            "last_close": last_close,
            "previous_close": previous_close,
            "change_pct": round((current_price - previous_close) / previous_close * 100, 2),
            "quote_as_of": quote["as_of"],
            "freshness": _freshness(quote, daily[-1]["date"], fetched_at),
            "latest_candle_date": daily[-1]["date"],
            "demand": demand,
            "supply": supply,
            "weekly_demand": _nearest_by_timeframe(weekly, current_price, "demand"),
            "weekly_supply": _nearest_by_timeframe(weekly, current_price, "supply"),
            "monthly_demand": _nearest_by_timeframe(monthly, current_price, "demand"),
            "monthly_supply": _nearest_by_timeframe(monthly, current_price, "supply"),
            "quarterly_demand": _nearest_by_timeframe(quarterly, current_price, "demand"),
            "quarterly_supply": _nearest_by_timeframe(quarterly, current_price, "supply"),
            "trends": trends,
            "has_nearby_zone": demand is not None or supply is not None,
        })

    if not stocks:
        raise HTTPException(
            status_code=503,
            detail="Yahoo Finance returned no usable daily candles. Check provider availability and try again.",
        )
    local_now = fetched_at.astimezone(NSE_TIMEZONE)
    market_open = local_now.weekday() < 5 and time(9, 15) <= local_now.time().replace(tzinfo=None) <= time(15, 30)
    return {
        "source": "Yahoo Finance",
        "universe": universe_info,
        "data_delay_note": "Yahoo Finance data may be delayed; intraday quotes are not guaranteed real time.",
        "updated_at": fetched_at.isoformat(),
        "market_status": "open" if market_open else "closed",
        "poll_interval_seconds": CACHE_SECONDS,
        "failed_batches": _history_failures + _quote_failures,
        "stocks": stocks,
    }


def _period_key(candle_date: date, timeframe: str) -> tuple[int, int]:
    if timeframe == "weekly":
        iso_date = candle_date.isocalendar()
        return (iso_date.year, iso_date.week)
    if timeframe == "monthly":
        return (candle_date.year, candle_date.month)
    if timeframe == "quarterly":
        return (candle_date.year, (candle_date.month - 1) // 3)
    raise ValueError(f"Unsupported aggregation timeframe: {timeframe}")


def _align_candles_to_first_session(
    candles: list[dict],
    daily_candles: list[dict],
    timeframe: str,
) -> list[dict]:
    if timeframe not in ("weekly", "monthly"):
        raise ValueError(f"Unsupported alignment timeframe: {timeframe}")
    if not candles or not daily_candles:
        return candles

    first_sessions: dict[tuple[int, int], str] = {}
    for candle in daily_candles:
        key = _period_key(date.fromisoformat(candle["date"]), timeframe)
        first_date = first_sessions.get(key)
        if first_date is None or candle["date"] < first_date:
            first_sessions[key] = candle["date"]

    earliest_daily_date = min(date.fromisoformat(candle["date"]) for candle in daily_candles)
    partial_period_key = _period_key(earliest_daily_date, timeframe)
    aligned = []
    for candle in candles:
        key = _period_key(date.fromisoformat(candle["date"]), timeframe)
        first_session = first_sessions.get(key)
        if first_session is None or key == partial_period_key:
            aligned.append(candle)
        else:
            aligned.append({**candle, "date": first_session})
    return aligned


def _aggregate_candles(candles: list[dict], timeframe: str) -> list[dict]:
    grouped: dict[tuple[int, int], list[dict]] = {}
    for candle in candles:
        candle_date = datetime.fromisoformat(candle["date"]).date()
        key = _period_key(candle_date, timeframe)
        grouped.setdefault(key, []).append(candle)

    result = []
    for group in grouped.values():
        result.append({
            "date": group[0]["date"],
            "open": group[0]["open"],
            "high": max(candle["high"] for candle in group),
            "low": min(candle["low"] for candle in group),
            "close": group[-1]["close"],
            "volume": sum(candle["volume"] for candle in group),
        })
    return result


def _aggregate_intraday_candles(candles: list[dict], bars_per_candle: int = 5) -> list[dict]:
    by_session: dict[date, list[dict]] = {}
    for candle in sorted(candles, key=lambda item: item["date"]):
        session_date = datetime.fromtimestamp(
            candle["date"],
            timezone.utc,
        ).astimezone(NSE_TIMEZONE).date()
        by_session.setdefault(session_date, []).append(candle)

    aggregated = []
    for session_candles in by_session.values():
        for start in range(0, len(session_candles), bars_per_candle):
            group = session_candles[start:start + bars_per_candle]
            aggregated.append({
                "date": group[0]["date"],
                "open": group[0]["open"],
                "high": max(candle["high"] for candle in group),
                "low": min(candle["low"] for candle in group),
                "close": group[-1]["close"],
                "volume": sum(candle["volume"] for candle in group),
            })
    return aggregated


def import_csv_market_data(content: str) -> dict:
    global _imported_history, _imported_zones
    imported = parse_ohlc_csv(content)
    now = datetime.now(timezone.utc)
    universe = [(symbol, name) for symbol, name, _ in imported]
    history = {}
    zones_by_symbol = {}
    quotes = {}

    for symbol, _, daily in imported:
        history[symbol] = {"daily": daily}
        history[symbol]["weekly"] = _aggregate_candles(daily, "weekly")
        history[symbol]["monthly"] = _aggregate_candles(daily, "monthly")
        history[symbol]["quarterly"] = _aggregate_candles(history[symbol]["monthly"], "quarterly")
        zones_by_symbol[symbol] = {}
        for timeframe in TIMEFRAMES:
            found = detect_zones(history[symbol][timeframe], timeframe, now=now)
            zones_by_symbol[symbol][timeframe] = {
                "demand": [zone for zone in found if zone["type"] == "demand"],
                "supply": [zone for zone in found if zone["type"] == "supply"],
            }
        quote_date = datetime.fromisoformat(daily[-1]["date"])
        quote_date = quote_date.replace(tzinfo=NSE_TIMEZONE, hour=15, minute=30)
        quotes[symbol] = {
            "price": daily[-1]["close"],
            "as_of": quote_date.astimezone(timezone.utc).isoformat(),
            "source": "csv_import",
        }

    _imported_history = history
    _imported_zones = zones_by_symbol
    result = _build_market_data(
        universe,
        {"source": "Imported CSV", "count": len(universe)},
        now,
        history_source=history,
        zones_source=zones_by_symbol,
        quotes_source=quotes,
    )
    result.update({
        "source": "Imported CSV",
        "data_delay_note": "CSV-imported prices are static; freshness is based on the latest imported candle date.",
        "market_status": "imported",
        "poll_interval_seconds": None,
        "failed_batches": [],
    })
    return result


def get_market_data() -> dict:
    global _cache, _cache_updated_at
    with _cache_lock:
        now = datetime.now(timezone.utc)
        if _cache is not None and _cache_updated_at is not None:
            if now - _cache_updated_at < timedelta(seconds=CACHE_SECONDS):
                return _cache
        universe, universe_info = get_universe(now)
        history_expired = (
            _history_cache_updated_at is None
            or now - _history_cache_updated_at >= timedelta(seconds=HISTORY_CACHE_SECONDS)
            or any(symbol not in _history_by_symbol for symbol, _ in universe)
        )
        if history_expired:
            _refresh_history(universe, now)
        _refresh_quotes(universe)
        _cache = _build_market_data(universe, universe_info, now)
        _cache_updated_at = datetime.now(timezone.utc)
        return _cache


def get_chart_data(symbol: str, timeframe: str) -> dict:
    if timeframe not in (*TIMEFRAMES, "60m", "75m"):
        raise HTTPException(status_code=400, detail="Timeframe must be daily, weekly, monthly, quarterly, 60m, or 75m.")
    normalized_symbol = symbol.upper().removesuffix(".NS")
    if timeframe in ("60m", "75m"):
        if normalized_symbol in _imported_history:
            raise HTTPException(status_code=503, detail="Intraday charts are unavailable for imported CSV data.")
        now = datetime.now(timezone.utc)
        if normalized_symbol not in _history_by_symbol or not _history_by_symbol[normalized_symbol].get("daily"):
            _refresh_symbol_history(normalized_symbol, now)

        cache_key = (normalized_symbol, timeframe)
        cached = _intraday_chart_cache.get(cache_key)
        if cached is None or now - cached[0] >= timedelta(seconds=INTRADAY_CHART_CACHE_SECONDS):
            period, interval = ("730d", "60m") if timeframe == "60m" else ("60d", "15m")
            downloaded = _download_candles(
                [f"{normalized_symbol}.NS"],
                period,
                interval,
                preserve_time=True,
            ).get(normalized_symbol, [])
            candles = downloaded if timeframe == "60m" else _aggregate_intraday_candles(downloaded)
            if not candles:
                raise HTTPException(status_code=503, detail=f"No {timeframe} chart history is currently available for {normalized_symbol}.")
            _intraday_chart_cache[cache_key] = (now, candles)
        candles = _intraday_chart_cache[cache_key][1]
        price = _quotes_by_symbol.get(normalized_symbol, {}).get("price", candles[-1]["close"])
        intraday_zones = detect_zones(candles, timeframe, now=now)
        symbol_zones = dict(_zones_by_symbol.get(normalized_symbol, {}))
        symbol_zones[timeframe] = {
            "demand": [zone for zone in intraday_zones if zone["type"] == "demand"],
            "supply": [zone for zone in intraday_zones if zone["type"] == "supply"],
        }
        zones_by_timeframe = _qualifying_chart_zones(
            symbol_zones,
            price,
        )
        history = _history_by_symbol.get(normalized_symbol, {})
        trends = {
            zone_timeframe: calculate_sma7_trend(history.get(zone_timeframe, []))
            for zone_timeframe in TIMEFRAMES
        }
        updated_at = _history_updated_at_by_symbol.get(normalized_symbol)
        return {
            "symbol": normalized_symbol,
            "name": STOCK_NAMES.get(normalized_symbol, normalized_symbol),
            "timeframe": timeframe,
            "current_price": price,
            "candles": candles,
            "zones": _zones_by_type(zones_by_timeframe.get(timeframe, [])),
            "zones_by_timeframe": zones_by_timeframe,
            "trends": trends,
            "updated_at": updated_at.isoformat() if updated_at else None,
        }

    if normalized_symbol in _imported_history:
        history = _imported_history[normalized_symbol]
        current_price = history.get("daily", [{}])[-1].get("close", 0)
        zones_by_timeframe = _qualifying_chart_zones(
            _imported_zones.get(normalized_symbol, {}),
            current_price,
        )
        selected_zones = zones_by_timeframe.get(timeframe, [])
        trends = {
            zone_timeframe: calculate_sma7_trend(history.get(zone_timeframe, []))
            for zone_timeframe in TIMEFRAMES
        }
        return {
            "symbol": normalized_symbol,
            "name": STOCK_NAMES.get(normalized_symbol, normalized_symbol),
            "timeframe": timeframe,
            "current_price": current_price,
            "candles": history.get(timeframe, []),
            "zones": _zones_by_type(selected_zones),
            "zones_by_timeframe": zones_by_timeframe,
            "trends": trends,
            "updated_at": None,
        }

    now = datetime.now(timezone.utc)
    last_history_update = _history_updated_at_by_symbol.get(normalized_symbol)
    if (
        normalized_symbol not in _history_by_symbol
        or last_history_update is None
        or now - last_history_update >= timedelta(seconds=HISTORY_CACHE_SECONDS)
    ):
        _refresh_symbol_history(normalized_symbol, now)

    candles_by_timeframe = _history_by_symbol.get(normalized_symbol)
    if candles_by_timeframe is None or not candles_by_timeframe.get("daily"):
        raise HTTPException(status_code=503, detail=f"No chart history is currently available for {normalized_symbol}.")
    _refresh_symbol_quote(normalized_symbol, now)
    daily = candles_by_timeframe.get("daily", [])
    price = _quotes_by_symbol.get(normalized_symbol, {}).get(
        "price",
        daily[-1]["close"] if daily else 0,
    )
    updated_at = (
        _history_updated_at_by_symbol.get(normalized_symbol)
        or _history_cache_updated_at
    )
    chart_candles = candles_by_timeframe.get(timeframe, [])
    if timeframe == "daily":
        chart_candles = _merge_intraday_candle(
            chart_candles,
            _quotes_by_symbol.get(normalized_symbol, {}),
        )
    zones_by_timeframe = _qualifying_chart_zones(
        _zones_by_symbol.get(normalized_symbol, {}),
        price,
    )
    selected_zones = zones_by_timeframe.get(timeframe, [])
    trends = {
        zone_timeframe: calculate_sma7_trend(candles_by_timeframe.get(zone_timeframe, []))
        for zone_timeframe in TIMEFRAMES
    }
    return {
        "symbol": normalized_symbol,
        "name": STOCK_NAMES.get(normalized_symbol, normalized_symbol),
        "timeframe": timeframe,
        "current_price": price,
        "candles": chart_candles,
        "zones": _zones_by_type(selected_zones),
        "zones_by_timeframe": zones_by_timeframe,
        "trends": trends,
        "updated_at": updated_at.isoformat() if updated_at else None,
    }


def _refresh_sector_history(index_ticker: str, now: datetime) -> dict[str, list[dict]]:
    index_symbol = index_ticker.removesuffix(".NS")
    history = dict(_sector_history_cache.get(index_ticker, (now, {}))[1])
    for timeframe, (period, interval) in INTERVALS.items():
        try:
            downloaded = _download_candles([index_ticker], period, interval)
        except Exception:
            logger.exception("Failed downloading %s sector candles for %s", timeframe, index_ticker)
            continue
        candles = downloaded.get(index_symbol)
        if candles:
            history[timeframe] = candles

    daily = history.get("daily", [])
    for timeframe in ("weekly", "monthly"):
        candles = history.get(timeframe, [])
        if candles and daily:
            history[timeframe] = _align_candles_to_first_session(candles, daily, timeframe)
    if history.get("monthly"):
        history["quarterly"] = _aggregate_candles(history["monthly"], "quarterly")

    if history:
        _sector_history_cache[index_ticker] = (now, history)
    return history


def get_sector_chart_data(symbol: str, timeframe: str) -> dict:
    if timeframe not in (*TIMEFRAMES, "60m", "75m"):
        raise HTTPException(status_code=400, detail="Unsupported chart timeframe.")
    normalized_symbol = symbol.upper().removesuffix(".NS")
    sector_index = STOCK_SECTOR_INDEX.get(normalized_symbol)
    if sector_index is None:
        raise HTTPException(
            status_code=404,
            detail=f"No sector index is mapped for {normalized_symbol}.",
        )

    now = datetime.now(timezone.utc)
    cache_key = (sector_index["ticker"], timeframe)
    cached = _sector_chart_cache.get(cache_key)
    cache_ttl = INTRADAY_CHART_CACHE_SECONDS if timeframe in ("60m", "75m") else HISTORY_CACHE_SECONDS
    if cached is not None and now - cached[0] < timedelta(seconds=cache_ttl):
        return cached[1]

    if timeframe in TIMEFRAMES:
        history_cache = _sector_history_cache.get(sector_index["ticker"])
        if (
            history_cache is None
            or now - history_cache[0] >= timedelta(seconds=HISTORY_CACHE_SECONDS)
        ):
            history = _refresh_sector_history(sector_index["ticker"], now)
        else:
            history = history_cache[1]
    else:
        history = {}

    if timeframe == "60m":
        period, interval = "730d", "60m"
        preserve_time = True
    elif timeframe == "75m":
        period, interval = "60d", "15m"
        preserve_time = True
    else:
        preserve_time = False

    if timeframe in ("60m", "75m"):
        downloaded = _download_candles(
            [sector_index["ticker"]],
            period,
            interval,
            preserve_time=preserve_time,
        )
        index_symbol = sector_index["ticker"].removesuffix(".NS")
        candles = downloaded.get(index_symbol, [])
    else:
        candles = history.get(timeframe, [])
    if timeframe == "75m":
        candles = _aggregate_intraday_candles(candles)
    if not candles:
        raise HTTPException(
            status_code=503,
            detail=f"No {sector_index['name']} chart history is currently available.",
        )

    sector_zones = {
        zone_timeframe: _zones_by_type(
            detect_zones(history.get(zone_timeframe, []), zone_timeframe, now=now)
        )
        for zone_timeframe in TIMEFRAMES
    }
    if timeframe in ("60m", "75m"):
        sector_zones[timeframe] = _zones_by_type(detect_zones(candles, timeframe, now=now))
    qualifying_zones = _qualifying_chart_zones(sector_zones, candles[-1]["close"])
    chart = {
        "symbol": sector_index["ticker"],
        "name": sector_index["name"],
        "timeframe": timeframe,
        "current_price": candles[-1]["close"],
        "candles": candles,
        "zones": _zones_by_type(qualifying_zones[timeframe]),
        "zones_by_timeframe": qualifying_zones,
        "is_proxy": sector_index["is_proxy"],
        "updated_at": now.isoformat(),
    }
    _sector_chart_cache[cache_key] = (now, chart)
    return chart


def search_stock_universe(query: str, limit: int = 8) -> list[dict]:
    normalized_query = query.strip().casefold()
    if not normalized_query:
        return []

    universe, _ = get_universe()
    exact = []
    prefix = []
    contains = []
    for symbol, name in universe:
        normalized_symbol = symbol.casefold()
        normalized_name = name.casefold()
        stock = {"symbol": symbol, "name": name}
        if normalized_symbol == normalized_query:
            exact.append(stock)
        elif normalized_symbol.startswith(normalized_query) or normalized_name.startswith(normalized_query):
            prefix.append(stock)
        elif normalized_query in normalized_symbol or normalized_query in normalized_name:
            contains.append(stock)
    return (exact + prefix + contains)[:limit]


def get_stock_quotes(symbols: list[str]) -> dict:
    normalized_symbols = list(dict.fromkeys(
        symbol.strip().upper().removesuffix(".NS")
        for symbol in symbols
        if isinstance(symbol, str) and symbol.strip()
    ))
    if not normalized_symbols:
        raise ValueError("At least one stock symbol is required.")
    if len(normalized_symbols) > 100:
        raise ValueError("A maximum of 100 stock symbols can be requested.")
    if any(not re.fullmatch(r"[A-Z0-9&-]{1,20}", symbol) for symbol in normalized_symbols):
        raise ValueError("One or more stock symbols are invalid.")

    now = datetime.now(timezone.utc)
    stocks = []
    for symbol in normalized_symbols:
        _refresh_symbol_quote(symbol, now)
        quote = _quotes_by_symbol.get(symbol)
        if quote is not None:
            stock_quote = {
                "symbol": symbol,
                "name": STOCK_NAMES.get(symbol, symbol),
                "price": quote["price"],
                "as_of": quote["as_of"],
            }
            if quote.get("last_high") is not None and quote.get("last_low") is not None:
                stock_quote["last_high"] = quote["last_high"]
                stock_quote["last_low"] = quote["last_low"]
            stocks.append(stock_quote)

    local_now = now.astimezone(NSE_TIMEZONE)
    market_open = local_now.weekday() < 5 and time(9, 15) <= local_now.time().replace(tzinfo=None) <= time(15, 30)
    return {
        "market_status": "open" if market_open else "closed",
        "stocks": stocks,
    }


def _news_item(item: dict) -> dict | None:
    content = item.get("content") if isinstance(item.get("content"), dict) else item
    title = content.get("title")
    if not isinstance(title, str) or not title.strip():
        return None
    provider = content.get("provider")
    canonical_url = content.get("canonicalUrl")
    click_url = content.get("clickThroughUrl")
    published_at = content.get("pubDate") or content.get("providerPublishTime")
    if isinstance(published_at, (int, float)):
        published_at = datetime.fromtimestamp(published_at, timezone.utc).isoformat()
    return {
        "title": title.strip(),
        "summary": content.get("summary") if isinstance(content.get("summary"), str) else "",
        "publisher": (
            provider.get("displayName")
            if isinstance(provider, dict)
            else content.get("publisher", "")
        ),
        "published_at": published_at if isinstance(published_at, str) else "",
        "url": (
            canonical_url.get("url")
            if isinstance(canonical_url, dict)
            else click_url.get("url")
            if isinstance(click_url, dict)
            else content.get("link", "")
        ),
    }


def _calendar_events(calendar) -> list[dict]:
    events = []
    if calendar is None:
        return events
    if hasattr(calendar, "iterrows"):
        rows = ((str(label), row.tolist()) for label, row in calendar.iterrows())
    elif isinstance(calendar, dict):
        rows = calendar.items()
    else:
        return events

    for label, values in rows:
        if not any(term in label.lower() for term in ("date", "earnings", "dividend")):
            continue
        candidates = values if isinstance(values, (list, tuple)) else [values]
        for value in candidates:
            if value is None:
                continue
            if isinstance(value, dict):
                candidates.extend(value.values())
                continue
            date_value = value.isoformat() if hasattr(value, "isoformat") else str(value)
            if date_value.lower() in {"nan", "nat", "none"}:
                continue
            events.append({"title": label, "date": date_value[:10]})
    return events


def get_stock_news_and_events(symbol: str) -> dict:
    normalized_symbol = symbol.upper().removesuffix(".NS")
    ticker = yf.Ticker(f"{normalized_symbol}.NS")
    news = []
    events = []
    news_error = ""
    events_error = ""

    try:
        news = [
            formatted
            for item in (ticker.news or [])
            if isinstance(item, dict)
            if (formatted := _news_item(item)) is not None
        ][:20]
    except Exception as error:
        logger.exception("Failed retrieving news for %s", normalized_symbol)
        news_error = f"Yahoo Finance news is temporarily unavailable: {error}"

    try:
        events = _calendar_events(ticker.calendar)
    except Exception as error:
        logger.exception("Failed retrieving company calendar for %s", normalized_symbol)
        events_error = f"Yahoo Finance company dates are temporarily unavailable: {error}"

    return {
        "symbol": normalized_symbol,
        "news": news,
        "events": events,
        "news_error": news_error,
        "events_error": events_error,
    }
