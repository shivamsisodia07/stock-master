from __future__ import annotations

import logging
import math
import threading
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import yfinance as yf
from fastapi import HTTPException

from backend.data.universe import get_universe
from backend.services.csv_import import parse_ohlc_csv
from backend.services.zone_scanner import MIN_ZONE_SCORE, TIMEFRAMES, detect_zones, nearest_zone

logger = logging.getLogger(__name__)
NSE_TIMEZONE = ZoneInfo("Asia/Kolkata")
CACHE_SECONDS = 5 * 60
HISTORY_CACHE_SECONDS = 15 * 60
MIN_CHART_ZONE_SCORE = 6
BATCH_SIZE = 20
INTERVALS = {
    "daily": ("2y", "1d"),
    "weekly": ("10y", "1wk"),
    "monthly": ("max", "1mo"),
}
_cache: dict | None = None
_cache_updated_at: datetime | None = None
_history_cache_updated_at: datetime | None = None
_history_by_symbol: dict[str, dict[str, list[dict]]] = {}
_zones_by_symbol: dict[str, dict[str, list[dict]]] = {}
_quotes_by_symbol: dict[str, dict] = {}
_history_failures: list[str] = []
_quote_failures: list[str] = []
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


def _download_candles(tickers: list[str], period: str, interval: str) -> dict[str, list[dict]]:
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
                "date": _date_string(index),
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
        if hasattr(quote_time, "to_pydatetime"):
            quote_time = quote_time.to_pydatetime()
        if quote_time.tzinfo is None:
            quote_time = quote_time.replace(tzinfo=NSE_TIMEZONE)
        quotes[ticker.removesuffix(".NS")] = {
            "price": round(price, 2),
            "as_of": quote_time.astimezone(timezone.utc).isoformat(),
            "source": "intraday",
        }
    return quotes


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
    for timeframe in TIMEFRAMES:
        timeframe_zones = zones_by_timeframe.get(timeframe, {})
        candidates = [
            zone
            for zone_type in ("demand", "supply")
            for zone in timeframe_zones.get(zone_type, [])
            if zone.get("score", 0) >= MIN_CHART_ZONE_SCORE
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
    _history_cache_updated_at = now
    _history_failures = failed_batches


def _refresh_quotes(universe: list[tuple[str, str]]) -> None:
    global _quotes_by_symbol, _quote_failures
    quotes = dict(_quotes_by_symbol)
    failed_batches = []
    symbol_batches = _symbol_batches(universe)
    for batch_index, tickers in enumerate(symbol_batches):
        try:
            quotes.update(_download_quotes(tickers))
        except Exception:
            failed_batches.append(f"intraday:{batch_index + 1}")
            logger.exception("Failed downloading intraday prices for batch %s", batch_index + 1)
    _quotes_by_symbol = quotes
    _quote_failures = failed_batches


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
        demand = _nearest_by_timeframe(daily_zones, last_close, "demand", max_distance=3)
        supply = _nearest_by_timeframe(daily_zones, last_close, "supply", max_distance=3)
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
            "weekly_demand": _nearest_by_timeframe(weekly, last_close, "demand"),
            "weekly_supply": _nearest_by_timeframe(weekly, last_close, "supply"),
            "monthly_demand": _nearest_by_timeframe(monthly, last_close, "demand"),
            "monthly_supply": _nearest_by_timeframe(monthly, last_close, "supply"),
            "quarterly_demand": _nearest_by_timeframe(quarterly, last_close, "demand"),
            "quarterly_supply": _nearest_by_timeframe(quarterly, last_close, "supply"),
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


def _aggregate_candles(candles: list[dict], timeframe: str) -> list[dict]:
    grouped: dict[tuple[int, int], list[dict]] = {}
    for candle in candles:
        candle_date = datetime.fromisoformat(candle["date"]).date()
        if timeframe == "weekly":
            iso_date = candle_date.isocalendar()
            key = (iso_date.year, iso_date.week)
        elif timeframe == "monthly":
            key = (candle_date.year, candle_date.month)
        elif timeframe == "quarterly":
            key = (candle_date.year, (candle_date.month - 1) // 3)
        else:
            raise ValueError(f"Unsupported aggregation timeframe: {timeframe}")
        grouped.setdefault(key, []).append(candle)

    result = []
    for group in grouped.values():
        result.append({
            "date": group[-1]["date"],
            "open": group[0]["open"],
            "high": max(candle["high"] for candle in group),
            "low": min(candle["low"] for candle in group),
            "close": group[-1]["close"],
            "volume": sum(candle["volume"] for candle in group),
        })
    return result


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
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail="Timeframe must be daily, weekly, monthly, or quarterly.")
    normalized_symbol = symbol.upper().removesuffix(".NS")
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
            "timeframe": timeframe,
            "current_price": current_price,
            "candles": history.get(timeframe, []),
            "zones": _zones_by_type(selected_zones),
            "zones_by_timeframe": zones_by_timeframe,
            "trends": trends,
            "updated_at": None,
        }
    candles_by_timeframe = _history_by_symbol.get(normalized_symbol)
    if candles_by_timeframe is None:
        raise HTTPException(status_code=404, detail=f"No market data found for {normalized_symbol}.")
    daily = candles_by_timeframe.get("daily", [])
    price = _quotes_by_symbol.get(normalized_symbol, {}).get(
        "price",
        daily[-1]["close"] if daily else 0,
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
        "timeframe": timeframe,
        "current_price": price,
        "candles": candles_by_timeframe.get(timeframe, []),
        "zones": _zones_by_type(selected_zones),
        "zones_by_timeframe": zones_by_timeframe,
        "trends": trends,
        "updated_at": _history_cache_updated_at.isoformat() if _history_cache_updated_at else None,
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
