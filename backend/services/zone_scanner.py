from __future__ import annotations

from calendar import monthrange
from datetime import datetime, time
from zoneinfo import ZoneInfo

NSE_TIMEZONE = ZoneInfo("Asia/Kolkata")
TIMEFRAMES = ("daily", "weekly", "monthly", "quarterly")
MIN_ZONE_SCORE = 5


def _body_ratio(candle: dict) -> float:
    candle_range = candle["high"] - candle["low"]
    if candle_range <= 0:
        return 0.0
    return abs(candle["close"] - candle["open"]) / candle_range


def _direction(candle: dict) -> int:
    if candle["close"] > candle["open"]:
        return 1
    if candle["close"] < candle["open"]:
        return -1
    return 0


def _is_exciting(candle: dict) -> bool:
    return _body_ratio(candle) > 0.5


def _strength_score(candles: list[dict], leg_in_index: int, leg_out_index: int, zone_type: str) -> int:
    exciting_legs = sum(
        _is_exciting(candles[index])
        for index in (leg_in_index, leg_out_index)
    )
    if exciting_legs == 2:
        return 2
    if exciting_legs == 0:
        return 0

    if leg_out_index > 0:
        previous = candles[leg_out_index - 1]
        gap = (
            candles[leg_out_index]["low"] > previous["high"]
            if zone_type == "demand"
            else candles[leg_out_index]["high"] < previous["low"]
        )
        if gap:
            return 2
    return 1


def _is_forming_candle(candle: dict, timeframe: str, now: datetime) -> bool:
    candle_date = datetime.fromisoformat(candle["date"]).date()
    today = now.astimezone(NSE_TIMEZONE).date()
    if timeframe == "daily":
        return candle_date == today and now.astimezone(NSE_TIMEZONE).time() < time(15, 30)
    if timeframe == "weekly":
        week_start = today.fromordinal(today.toordinal() - today.weekday())
        market_time = now.astimezone(NSE_TIMEZONE).time()
        week_complete = today.weekday() > 4 or (today.weekday() == 4 and market_time >= time(15, 30))
        return candle_date >= week_start and not week_complete
    if timeframe in ("monthly", "quarterly"):
        if timeframe == "monthly":
            candle_period = (candle_date.year, candle_date.month)
            current_period = (today.year, today.month)
            end_month = today.month
        else:
            candle_period = (candle_date.year, (candle_date.month - 1) // 3)
            current_period = (today.year, (today.month - 1) // 3)
            end_month = ((today.month - 1) // 3 + 1) * 3
        if candle_period != current_period:
            return False
        last_day = datetime(today.year, end_month, monthrange(today.year, end_month)[1]).date()
        last_session_day = last_day
        while last_session_day.weekday() > 4:
            last_session_day = last_session_day.fromordinal(last_session_day.toordinal() - 1)
        market_time = now.astimezone(NSE_TIMEZONE).time()
        period_complete = today > last_session_day or (
            today == last_session_day and market_time >= time(15, 30)
        )
        return not period_complete
    raise ValueError(f"Unsupported timeframe: {timeframe}")


def _completed_candles(candles: list[dict], timeframe: str, now: datetime) -> list[dict]:
    if candles and _is_forming_candle(candles[-1], timeframe, now):
        return candles[:-1]
    return candles


def _candidate(candles: list[dict], base_start: int, leg_in_index: int, leg_out_index: int, timeframe: str, pattern: str, zone_type: str, base_indices: list[int]) -> dict:
    leg_in = candles[leg_in_index]
    leg_out = candles[leg_out_index]
    if pattern == "DBR" and leg_out["close"] <= leg_in["high"]:
        return {}
    if pattern == "RBD" and leg_out["close"] >= leg_in["low"]:
        return {}

    base = [candles[index] for index in base_indices]
    if zone_type == "demand":
        proximal = max(max(item["open"], item["close"]) for item in base)
        distal = min(min(item["low"] for item in base), leg_out["low"])
        if pattern == "DBR":
            distal = min(distal, leg_in["low"])
    else:
        proximal = min(min(item["open"], item["close"]) for item in base)
        distal = max(max(item["high"] for item in base), leg_out["high"])
        if pattern == "RBD":
            distal = max(distal, leg_in["high"])
    if proximal <= 0 or distal <= 0 or proximal == distal:
        return {}
    if zone_type == "demand" and distal > proximal:
        return {}
    if zone_type == "supply" and proximal > distal:
        return {}

    follow_through = candles[leg_out_index:min(leg_out_index + 3, len(candles))]
    good_closing = any(
        candle["close"] > leg_in["high"] if zone_type == "demand"
        else candle["close"] < leg_in["low"]
        for candle in follow_through
    )
    if not good_closing:
        return {}

    tests = 0
    was_wick_touching = False
    last_test = None
    broken = False
    for candle in candles[leg_out_index + 1:]:
        if zone_type == "demand":
            if candle["close"] < distal:
                broken = True
                break
            wick_touching = candle["low"] <= proximal
        else:
            if candle["close"] > distal:
                broken = True
                break
            wick_touching = candle["high"] >= proximal

        if wick_touching and not was_wick_touching:
            tests += 1
            last_test = candle["date"]
        was_wick_touching = wick_touching
    if broken or tests >= 2:
        return {}

    base_count = 0 if pattern == "without-base" else len(base)
    base_score = 2 if 1 <= base_count <= 3 else 1 if 4 <= base_count <= 5 else 0
    freshness_score = 3 if tests == 0 else 1.5 if tests == 1 else 0
    score_breakdown = {
        "freshness": freshness_score,
        "strength": _strength_score(candles, leg_in_index, leg_out_index, zone_type),
        "base_candles": base_score,
    }
    score = round(sum(score_breakdown.values()), 1)
    if score < MIN_ZONE_SCORE:
        return {}
    return {
        "id": f"{timeframe}:{zone_type}:{candles[base_start]['date']}:{candles[leg_out_index]['date']}",
        "type": zone_type,
        "timeframe": timeframe,
        "pattern": pattern,
        "proximal": round(proximal, 2),
        "distal": round(distal, 2),
        "score": score,
        "max_score": 7,
        "tests": tests,
        "last_test": last_test,
        "formed_at": candles[base_start]["date"],
        "leg_out_at": leg_out["date"],
        "freshness": "fresh" if tests == 0 else "tested once",
        "score_breakdown": score_breakdown,
        "broken": False,
    }


def detect_zones(candles: list[dict], timeframe: str, now: datetime | None = None) -> list[dict]:
    if timeframe not in TIMEFRAMES:
        raise ValueError(f"Unsupported timeframe: {timeframe}")
    as_of = now or datetime.now(NSE_TIMEZONE)
    completed = _completed_candles(candles, timeframe, as_of)
    zones = []
    seen = set()

    for leg_out_index, leg_out in enumerate(completed):
        leg_out_direction = _direction(leg_out)
        if not _is_exciting(leg_out) or not leg_out_direction:
            continue

        base_start = leg_out_index
        while base_start > 0 and not _is_exciting(completed[base_start - 1]):
            base_start -= 1
        base_indices = list(range(base_start, leg_out_index))
        leg_in_index = base_start - 1
        no_base = not base_indices

        if no_base:
            leg_in_index = leg_out_index - 1
            if leg_in_index < 0:
                continue
            base_indices = [leg_in_index]
            base_start = leg_in_index
        if leg_in_index < 0:
            continue

        leg_in = completed[leg_in_index]
        leg_in_direction = _direction(leg_in)
        if not _is_exciting(leg_in) or not leg_in_direction:
            continue

        zone_type = "demand" if leg_out_direction > 0 else "supply"
        if zone_type == "demand" and not no_base:
            pattern = "DBR" if leg_in_direction < 0 else "RBR"
        elif zone_type == "supply" and not no_base:
            pattern = "RBD" if leg_in_direction > 0 else "DBD"
        else:
            pattern = "without-base"

        key = (zone_type, completed[leg_out_index]["date"])
        if key in seen:
            continue
        zone = _candidate(
            completed, base_start, leg_in_index, leg_out_index,
            timeframe, pattern, zone_type, base_indices,
        )
        if zone:
            zones.append(zone)
            seen.add(key)

    return zones


def nearest_zone(zones: list[dict], price: float, zone_type: str, max_distance_pct: float | None = None) -> dict | None:
    candidates = []
    for zone in zones:
        if zone["type"] != zone_type:
            continue
        if zone_type == "demand":
            if price < zone["distal"]:
                continue
            distance_pct = max(0.0, (price - zone["proximal"]) / zone["proximal"] * 100)
            if price < zone["proximal"]:
                distance_pct = 0.0
        else:
            if price > zone["distal"]:
                continue
            distance_pct = max(0.0, (zone["proximal"] - price) / zone["proximal"] * 100)
            if price > zone["proximal"]:
                distance_pct = 0.0
        if max_distance_pct is not None and distance_pct > max_distance_pct:
            continue
        candidates.append((distance_pct, zone))

    if not candidates:
        return None
    if zone_type == "demand":
        return max(candidates, key=lambda item: (item[1]["proximal"], -item[0]))[1]
    return min(candidates, key=lambda item: (item[1]["proximal"], item[0]))[1]
