from __future__ import annotations

import asyncio
import math
import threading
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


STOCKS = [
    ("RELIANCE", "Reliance Industries"), ("HDFCBANK", "HDFC Bank"),
    ("ICICIBANK", "ICICI Bank"), ("BHARTIARTL", "Bharti Airtel"),
    ("INFY", "Infosys"), ("SBIN", "State Bank of India"),
    ("LICI", "Life Insurance Corp"), ("ITC", "ITC"),
    ("HINDUNILVR", "Hindustan Unilever"), ("LT", "Larsen & Toubro"),
    ("BAJFINANCE", "Bajaj Finance"), ("HCLTECH", "HCL Technologies"),
    ("SUNPHARMA", "Sun Pharmaceutical"), ("MARUTI", "Maruti Suzuki"),
    ("TCS", "Tata Consultancy Services"), ("KOTAKBANK", "Kotak Mahindra Bank"),
    ("AXISBANK", "Axis Bank"), ("M&M", "Mahindra & Mahindra"), ("NTPC", "NTPC"),
    ("TATAMOTORS", "Tata Motors"), ("ULTRACEMCO", "UltraTech Cement"),
    ("ONGC", "Oil & Natural Gas Corp"), ("TITAN", "Titan Company"),
    ("ADANIPORTS", "Adani Ports"), ("POWERGRID", "Power Grid Corp"),
    ("ASIANPAINT", "Asian Paints"), ("COALINDIA", "Coal India"),
    ("ADANIENT", "Adani Enterprises"), ("BAJAJFINSV", "Bajaj Finserv"),
    ("WIPRO", "Wipro"), ("NESTLEIND", "Nestle India"), ("JSWSTEEL", "JSW Steel"),
    ("TATASTEEL", "Tata Steel"), ("GRASIM", "Grasim Industries"), ("TRENT", "Trent"),
    ("HINDALCO", "Hindalco Industries"), ("TECHM", "Tech Mahindra"),
    ("INDUSINDBK", "IndusInd Bank"), ("SBILIFE", "SBI Life Insurance"),
    ("CIPLA", "Cipla"), ("DRREDDY", "Dr. Reddy's Laboratories"),
    ("EICHERMOT", "Eicher Motors"), ("APOLLOHOSP", "Apollo Hospitals"),
    ("DIVISLAB", "Divi's Laboratories"), ("BPCL", "Bharat Petroleum"),
    ("BRITANNIA", "Britannia Industries"), ("TATACONSUM", "Tata Consumer Products"),
    ("HEROMOTOCO", "Hero MotoCorp"), ("BAJAJ-AUTO", "Bajaj Auto"),
    ("HDFCLIFE", "HDFC Life Insurance"), ("SHRIRAMFIN", "Shriram Finance"),
    ("BEL", "Bharat Electronics"), ("PFC", "Power Finance Corp"),
    ("RECLTD", "REC Limited"), ("IOC", "Indian Oil Corp"), ("DABUR", "Dabur India"),
    ("GAIL", "GAIL India"), ("PIDILITIND", "Pidilite Industries"),
    ("AMBUJACEM", "Ambuja Cements"), ("GODREJCP", "Godrej Consumer Products"),
    ("ICICIPRULI", "ICICI Prudential Life"), ("INDIGO", "InterGlobe Aviation"),
    ("MOTHERSON", "Samvardhana Motherson"), ("CANBK", "Canara Bank"),
    ("CHOLAFIN", "Cholamandalam Investment"), ("JIOFIN", "Jio Financial Services"),
    ("TORNTPHARM", "Torrent Pharmaceuticals"), ("TVSMOTOR", "TVS Motor Company"),
    ("HAL", "Hindustan Aeronautics"), ("VBL", "Varun Beverages"),
    ("ZOMATO", "Eternal"), ("DLF", "DLF"), ("NAUKRI", "Info Edge"),
    ("SIEMENS", "Siemens"), ("MAXHEALTH", "Max Healthcare Institute"),
    ("POLICYBZR", "PB Fintech"), ("BOSCHLTD", "Bosch"), ("HAVELLS", "Havells India"),
    ("ICICIGI", "ICICI Lombard"), ("ZYDUSLIFE", "Zydus Lifesciences"),
    ("INDUSTOWER", "Indus Towers"), ("AUROPHARMA", "Aurobindo Pharma"),
    ("MARICO", "Marico"), ("COLPAL", "Colgate-Palmolive India"), ("LUPIN", "Lupin"),
    ("OFSS", "Oracle Financial Services"), ("BERGEPAINT", "Berger Paints India"),
    ("BSE", "BSE"), ("IREDA", "Indian Renewable Energy Dev"),
    ("PAYTM", "One 97 Communications"), ("DMART", "Avenue Supermarts"),
    ("PAGEIND", "Page Industries"), ("CONCOR", "Container Corporation"),
    ("ASHOKLEY", "Ashok Leyland"), ("MANAPPURAM", "Manappuram Finance"),
    ("FEDERALBNK", "Federal Bank"), ("BANKBARODA", "Bank of Baroda"),
    ("PNB", "Punjab National Bank"), ("YESBANK", "Yes Bank"), ("IDEA", "Vodafone Idea"),
]

NSE_TIMEZONE = ZoneInfo("Asia/Kolkata")
CACHE_SECONDS = 50
_cache: dict | None = None
_cache_updated_at: datetime | None = None
_cache_lock = threading.Lock()

app = FastAPI(title="Pivot Market Data API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _column_for_ticker(frame, ticker: str, field: str):
    columns = frame.columns
    expected = field.lower()
    if not getattr(columns, "nlevels", 1) > 1:
        for column in columns:
            if str(column).lower() == expected:
                return frame[column]
        return None

    for column in columns:
        parts = [str(part) for part in column]
        if ticker in parts and any(part.lower() == expected for part in parts):
            return frame[column]
    return None


def _download_batch(tickers: list[str]) -> dict[str, list[dict]]:
    frame = yf.download(
        tickers=tickers,
        period="3mo",
        interval="1d",
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=True,
        timeout=25,
    )
    if frame is None or frame.empty:
        return {}

    result: dict[str, list[dict]] = {}
    for ticker in tickers:
        series_by_field = {
            field: _column_for_ticker(frame, ticker, field)
            for field in ("Open", "High", "Low", "Close", "Volume")
        }
        if any(series is None for series in series_by_field.values()):
            continue

        candles = []
        for index in frame.index:
            values = {field.lower(): series.loc[index] for field, series in series_by_field.items()}
            if any(not math.isfinite(float(value)) for value in values.values()):
                continue
            candle = {
                "date": index.date().isoformat(),
                "open": round(float(values["open"]), 2),
                "high": round(float(values["high"]), 2),
                "low": round(float(values["low"]), 2),
                "close": round(float(values["close"]), 2),
                "volume": int(values["volume"]),
            }
            if (
                candle["low"] > candle["high"]
                or candle["low"] > min(candle["open"], candle["close"])
                or candle["high"] < max(candle["open"], candle["close"])
                or candle["close"] <= 0
            ):
                continue
            candles.append(candle)
        if candles:
            result[ticker.removesuffix(".NS")] = candles
    return result


def _fetch_market_data() -> dict:
    symbol_batches = [
        [f"{symbol}.NS" for symbol, _ in STOCKS[start:start + 20]]
        for start in range(0, len(STOCKS), 20)
    ]
    candles_by_symbol: dict[str, list[dict]] = {}
    failed_batches = 0
    for batch in symbol_batches:
        try:
            candles_by_symbol.update(_download_batch(batch))
        except Exception:
            failed_batches += 1

    stocks = [
        {"symbol": symbol, "name": name, "candles": candles_by_symbol[symbol]}
        for symbol, name in STOCKS
        if symbol in candles_by_symbol and len(candles_by_symbol[symbol]) >= 25
    ]
    if not stocks:
        raise HTTPException(
            status_code=503,
            detail="Yahoo Finance returned no usable daily candles. Check provider availability and try again.",
        )

    now = datetime.now(timezone.utc)
    market_now = now.astimezone(NSE_TIMEZONE)
    market_open = market_now.weekday() < 5 and time(9, 15) <= market_now.time().replace(tzinfo=None) <= time(15, 30)
    return {
        "source": "Yahoo Finance",
        "data_delay_note": "Yahoo Finance data may be delayed; this is not a guaranteed real-time exchange feed.",
        "updated_at": now.isoformat(),
        "market_status": "open" if market_open else "closed",
        "poll_interval_seconds": 60,
        "failed_batches": failed_batches,
        "stocks": stocks,
    }


def _get_market_data() -> dict:
    global _cache, _cache_updated_at
    with _cache_lock:
        now = datetime.now(timezone.utc)
        if _cache is not None and _cache_updated_at is not None:
            if now - _cache_updated_at < timedelta(seconds=CACHE_SECONDS):
                return _cache
        _cache = _fetch_market_data()
        _cache_updated_at = datetime.now(timezone.utc)
        return _cache


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/market-data")
async def market_data() -> dict:
    return await asyncio.to_thread(_get_market_data)
