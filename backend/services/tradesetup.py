from __future__ import annotations

import math
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf

from backend.data.universe import get_universe
from backend.services.zone_scanner import detect_zones


SETUPS = {
    "HIT": {"full_name": "Hourly Income Trade", "location": "1-hour", "trend": "15-minute", "execution": "5-minute", "holding": "Minutes to 1 day"},
    "DIT": {"full_name": "Daily Income Trade", "location": "Daily", "trend": "1-hour", "execution": "15-minute", "holding": "1 to 3 days"},
    "WIT": {"full_name": "Weekly Income Trade", "location": "Weekly", "trend": "Daily", "execution": "1-hour", "holding": "1 to 7 days"},
    "MIT": {"full_name": "Monthly Income Trade", "location": "Monthly", "trend": "Weekly", "execution": "Daily", "holding": "1 to 6 weeks"},
    "QIT": {"full_name": "Quarterly Income Trade", "location": "Quarterly", "trend": "Monthly", "execution": "Weekly", "holding": "2 to 6 months"},
    "YIT": {"full_name": "Yearly Income Trade", "location": "Yearly", "trend": "Quarterly", "execution": "Monthly", "holding": "1 to 3+ years"},
}


def ema(series: pd.Series, periods: int) -> pd.Series:
    return series.ewm(span=periods, adjust=False).mean()


def atr(candles: pd.DataFrame, periods: int = 14) -> pd.Series:
    previous_close = candles["Close"].shift(1)
    true_range = pd.concat([
        candles["High"] - candles["Low"],
        (candles["High"] - previous_close).abs(),
        (candles["Low"] - previous_close).abs(),
    ], axis=1).max(axis=1)
    return true_range.rolling(periods).mean()


def _single_ticker_frame(frame: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if getattr(frame.columns, "nlevels", 1) > 1:
        values = {}
        for field in ("Open", "High", "Low", "Close", "Volume"):
            series = None
            for column in frame.columns:
                if ticker in column and str(column[-1]).lower() == field.lower():
                    series = frame[column]
                    break
            values[field] = series
        if any(series is None for series in values.values()):
            return pd.DataFrame()
        frame = pd.DataFrame(values)
    frame = frame.rename(columns=str.title)
    return frame.dropna(subset=["Open", "High", "Low", "Close"]).copy()


def download_candles(ticker: str, period: str, interval: str) -> pd.DataFrame:
    frame = yf.download(tickers=ticker, period=period, interval=interval, auto_adjust=True,
                         progress=False, threads=True, timeout=30)
    if frame is None or frame.empty:
        return pd.DataFrame()
    result = _single_ticker_frame(frame, ticker)
    result.index = pd.to_datetime(result.index)
    if getattr(result.index, "tz", None) is not None:
        result.index = result.index.tz_convert(None)
    return result


def resample_ohlc(candles: pd.DataFrame, rule: str) -> pd.DataFrame:
    if candles.empty:
        return pd.DataFrame()
    return candles.resample(rule).agg({
        "Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum",
    }).dropna()


def candles_to_dict(frame: pd.DataFrame) -> list[dict]:
    rows = []
    for index, row in frame.iterrows():
        rows.append({
            "date": str(index.date()),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"]) if "Volume" in row and pd.notna(row["Volume"]) else 0,
        })
    return rows


def trend_is_up(trend: pd.DataFrame) -> bool:
    if len(trend) < 10:
        return False
    recent = trend.tail(5)
    earlier = trend.iloc[-10:-5]
    return (recent["High"].max() >= earlier["High"].max()
            and recent["Low"].min() >= earlier["Low"].min())


def ema_support(trend: pd.DataFrame) -> bool:
    if len(trend) < 50:
        return False
    close = trend["Close"]
    return bool(ema(close, 20).iloc[-1] > ema(close, 50).iloc[-1])


def execution_trigger(execution: pd.DataFrame) -> bool:
    if len(execution) < 2:
        return False
    close = execution["Close"]
    fast = ema(close, 9)
    return bool(close.iloc[-1] > fast.iloc[-1] and close.iloc[-2] <= fast.iloc[-2])


def load_setup_candles(symbol: str, mode: str) -> dict[str, pd.DataFrame]:
    ticker = symbol if symbol.upper().endswith(".NS") else f"{symbol.upper()}.NS"
    if mode == "HIT":
        raw = download_candles(ticker, "60d", "5m")
        return {"location": resample_ohlc(raw, "1h"), "trend": resample_ohlc(raw, "15min"), "execution": raw}
    if mode == "DIT":
        location = download_candles(ticker, "2y", "1d")
        execution = download_candles(ticker, "60d", "15m")
        return {"location": location, "trend": resample_ohlc(execution, "1h"), "execution": execution}
    if mode == "WIT":
        execution = download_candles(ticker, "2y", "1h")
        daily = download_candles(ticker, "10y", "1d")
        return {"location": resample_ohlc(daily, "1W-FRI"), "trend": daily, "execution": execution}
    if mode == "MIT":
        daily = download_candles(ticker, "10y", "1d")
        return {"location": resample_ohlc(daily, "1ME"), "trend": resample_ohlc(daily, "1W-FRI"), "execution": daily}
    if mode in ("QIT", "YIT"):
        monthly = download_candles(ticker, "max", "1mo")
        if mode == "QIT":
            return {"location": resample_ohlc(monthly, "3ME"), "trend": monthly, "execution": resample_ohlc(monthly, "1W-FRI")}
        return {"location": resample_ohlc(monthly, "1YE"), "trend": resample_ohlc(monthly, "3ME"), "execution": monthly}
    raise ValueError("Unsupported trade setup")


def analyze_symbol(symbol: str, mode: str, now: datetime | None = None) -> dict | None:
    mode = mode.upper()
    if mode not in SETUPS:
        raise ValueError("Mode must be one of HIT, DIT, WIT, MIT, QIT, YIT")
    data = load_setup_candles(symbol, mode)
    location, trend, execution = data["location"], data["trend"], data["execution"]
    if location.empty or trend.empty or execution.empty:
        return None

    detector_timeframe = {
        "HIT": "daily",
        "DIT": "daily",
        "WIT": "weekly",
        "MIT": "monthly",
        "QIT": "quarterly",
        "YIT": "monthly",
    }[mode]
    zones = detect_zones(candles_to_dict(location), detector_timeframe, now=now or datetime.now(timezone.utc))
    demand_zones = [zone for zone in zones if zone["type"] == "demand"]
    if not demand_zones:
        return None

    price = float(execution["Close"].iloc[-1])
    latest_low = float(execution["Low"].iloc[-1])
    in_zone = None
    for zone in demand_zones:
        low, high = min(zone["proximal"], zone["distal"]), max(zone["proximal"], zone["distal"])
        if low <= price <= high or low <= latest_low <= high:
            in_zone = zone
            break
    if in_zone is None or not trend_is_up(trend):
        return None

    distal = float(in_zone["distal"])
    atr_values = atr(execution)
    atr_value = float(atr_values.iloc[-1]) if len(atr_values) and pd.notna(atr_values.iloc[-1]) else 0
    risk = price - (distal - (0.25 * atr_value))
    target = price + (2 * risk) if risk > 0 else None
    triggered = execution_trigger(execution)
    return {
        "symbol": symbol.upper(),
        "mode": mode,
        "setup": SETUPS[mode]["full_name"],
        "status": "SIGNAL" if triggered else "WATCH",
        "location": round(float(min(in_zone["proximal"], in_zone["distal"])), 2),
        "zone_low": round(distal, 2),
        "zone_high": round(float(max(in_zone["proximal"], in_zone["distal"])), 2),
        "close": round(price, 2),
        "stop": round(distal - (0.25 * atr_value), 2) if risk > 0 else None,
        "target": round(target, 2) if target is not None else None,
        "risk_pct": round(risk / price * 100, 2) if risk > 0 else None,
        "ema_support": ema_support(trend),
        "trend": "Uptrend",
        "trigger": "EMA 9 reclaim" if triggered else "Waiting for execution trigger",
        "bar": str(execution.index[-1]),
    }


def scan_nifty100(mode: str) -> dict:
    mode = mode.upper()
    universe, universe_info = get_universe()
    rows, failures = [], []
    for symbol, _ in universe:
        try:
            result = analyze_symbol(symbol, mode)
            if result:
                rows.append(result)
        except Exception as error:
            failures.append({"symbol": symbol, "error": str(error)})
    return {
        "mode": mode,
        "setup": SETUPS[mode],
        "universe": universe_info,
        "scanned": len(universe),
        "matched": len(rows),
        "failed": failures,
        "rows": sorted(rows, key=lambda row: (row["status"] != "SIGNAL", row["risk_pct"] or math.inf)),
    }
