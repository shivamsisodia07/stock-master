import asyncio
import logging
import os
import urllib.parse
import urllib.request
from urllib.error import HTTPError
import json
from pathlib import Path
from datetime import date
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError
from dotenv import load_dotenv

from backend.services.market_data import (
    get_chart_data,
    get_market_data,
    get_sector_chart_data,
    get_stock_quotes,
    get_stock_news_and_events,
    search_stock_universe,
)
from backend.services.trade_journal import create_trade, delete_trade, list_trades, update_trade
from backend.services.tradesetup import SETUPS, analyze_symbol, scan_nifty100
from backend.services.trade_scan_store import get_latest_trade_scan
from backend.services.firebase_auth import require_firebase_user
from backend.services.mongo_user_data import (
    MongoDBNotConfigured,
    get_user_workspace,
    save_user_workspace,
)

app = FastAPI(title="swingTrader Market Data API", version="2.0.0")
load_dotenv(Path(__file__).resolve().parent / ".env")
logger = logging.getLogger(__name__)
FRONTEND_DIRECTORY = Path(__file__).resolve().parent / "static"
TRADE_SETUP_DOCUMENT = Path(__file__).resolve().parent / "docs" / "trade_setup.md"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/market-data")
async def market_data() -> dict:
    return await asyncio.to_thread(get_market_data)


@app.get("/api/stocks/search")
async def stock_search(
    q: str = Query(min_length=1, max_length=100),
    limit: int = Query(default=8, ge=1, le=20),
) -> dict:
    return {"stocks": await asyncio.to_thread(search_stock_universe, q, limit)}


@app.get("/api/stocks/quotes")
async def stock_quotes(symbols: list[str] = Query(min_length=1)) -> dict:
    try:
        return await asyncio.to_thread(get_stock_quotes, symbols)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


class AlertDeliveryRequest(BaseModel):
    telegram_enabled: bool = False
    telegram_chat_id: str = Field(default="", max_length=100)
    title: str = Field(default="swingTrader alert", max_length=200)
    message: str = Field(min_length=1, max_length=2000)


class UserWorkspaceRequest(BaseModel):
    watchlist: list[str] = Field(default_factory=list, max_length=500)
    alert_rules: list[dict[str, Any]] = Field(default_factory=list, max_length=1000)
    alert_history: list[dict[str, Any]] = Field(default_factory=list, max_length=1000)
    alert_delivery: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    updated_at: int = Field(gt=0)


class TradeJournalInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    setup: str
    side: Literal["LONG", "SHORT"] = "LONG"
    entry_date: date
    exit_date: date | None = None
    entry_price: float = Field(gt=0)
    exit_price: float | None = Field(default=None, gt=0)
    quantity: float = Field(gt=0)
    stop_price: float | None = Field(default=None, gt=0)
    target_price: float | None = Field(default=None, gt=0)
    fees: float = Field(default=0, ge=0)
    zone_score: int | None = Field(default=None, ge=0, le=10)
    trigger: str = Field(default="", max_length=200)
    exit_reason: str = Field(default="", max_length=200)
    followed_rules: bool = True
    emotions: str = Field(default="", max_length=1000)
    lessons: str = Field(default="", max_length=2000)
    screenshot_url: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=4000)


@app.get("/api/user-data")
async def user_workspace(user_id: str = Depends(require_firebase_user)) -> dict:
    try:
        return await asyncio.to_thread(get_user_workspace, user_id)
    except MongoDBNotConfigured as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except PyMongoError as error:
        logger.exception("Unable to read the user's MongoDB workspace.")
        raise HTTPException(status_code=503, detail="MongoDB is unavailable.") from error


@app.put("/api/user-data")
async def save_user_workspace_data(
    request: UserWorkspaceRequest,
    user_id: str = Depends(require_firebase_user),
) -> dict:
    data = request.model_dump(exclude={"updated_at"})
    try:
        return await asyncio.to_thread(save_user_workspace, user_id, data, request.updated_at)
    except MongoDBNotConfigured as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except PyMongoError as error:
        logger.exception("Unable to save the user's MongoDB workspace.")
        raise HTTPException(status_code=503, detail="MongoDB is unavailable.") from error




@app.post("/api/alerts/deliver")
async def deliver_alert(request: AlertDeliveryRequest) -> dict:
    if not request.telegram_enabled:
        raise HTTPException(status_code=400, detail="Telegram alerts are not enabled.")

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = request.telegram_chat_id.strip()
    if not bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN is not configured.")
    if not chat_id:
        raise HTTPException(status_code=400, detail="Telegram chat ID is required.")

    try:
        payload = urllib.parse.urlencode({
            "chat_id": chat_id,
            "text": f"{request.title}\n\n{request.message}",
        }).encode("utf-8")
        api_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        request_object = urllib.request.Request(
            api_url,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            with urllib.request.urlopen(request_object, timeout=15) as response:
                response_data = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            response_data = json.loads(error.read().decode("utf-8"))
            raise RuntimeError(response_data.get("description", f"Telegram HTTP {error.code}")) from error
        if not response_data.get("ok"):
            raise RuntimeError(response_data.get("description", "Telegram rejected the alert"))
        return {"delivered": ["telegram"]}
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Telegram: {error}") from error


@app.get("/api/trades")
async def journal_trades() -> dict:
    return {"trades": await asyncio.to_thread(list_trades)}


@app.post("/api/trades")
async def add_journal_trade(request: TradeJournalInput) -> dict:
    try:
        trade = await asyncio.to_thread(create_trade, request.model_dump(mode="json"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"trade": trade}


@app.put("/api/trades/{trade_id}")
async def edit_journal_trade(trade_id: str, request: TradeJournalInput) -> dict:
    try:
        trade = await asyncio.to_thread(update_trade, trade_id, request.model_dump(mode="json"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found.")
    return {"trade": trade}


@app.delete("/api/trades/{trade_id}")
async def remove_journal_trade(trade_id: str) -> dict:
    deleted = await asyncio.to_thread(delete_trade, trade_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Trade not found.")
    return {"deleted": True}


@app.get("/api/stocks/{symbol}/chart")
async def stock_chart(symbol: str, timeframe: str = Query(default="daily")) -> dict:
    return await asyncio.to_thread(get_chart_data, symbol, timeframe)


@app.get("/api/stocks/{symbol}/sector-chart")
async def stock_sector_chart(symbol: str, timeframe: str = Query(default="daily")) -> dict:
    return await asyncio.to_thread(get_sector_chart_data, symbol, timeframe)


@app.get("/api/stocks/{symbol}/news")
async def stock_news(symbol: str) -> dict:
    return await asyncio.to_thread(get_stock_news_and_events, symbol)


@app.get("/api/income-trades/modes")
async def income_trade_modes() -> dict:
    return {"setups": SETUPS}


@app.get("/api/income-trades/latest")
async def latest_income_trade_scan() -> dict:
    return await asyncio.to_thread(get_latest_trade_scan)


@app.get("/api/income-trades/scan")
async def income_trade_scan(mode: str = Query(default="MIT"), symbol: str | None = None) -> dict:
    normalized_mode = mode.upper()
    if normalized_mode not in SETUPS:
        raise HTTPException(status_code=400, detail="Mode must be one of HIT, DIT, WIT, MIT, QIT, YIT.")
    if symbol:
        try:
            row = await asyncio.to_thread(analyze_symbol, symbol.strip().upper(), normalized_mode)
        except Exception as error:
            raise HTTPException(status_code=502, detail=f"Unable to scan {symbol}: {error}") from error
        return {"mode": normalized_mode, "setup": SETUPS[normalized_mode], "matched": 1 if row else 0, "rows": [row] if row else []}
    try:
        return await asyncio.to_thread(scan_nifty100, normalized_mode)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Unable to run the Nifty 100 scan: {error}") from error


@app.get("/api/docs", include_in_schema=False)
async def api_docs() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/api/docs/trade-setup", response_class=FileResponse)
async def trade_setup_document() -> FileResponse:
    if not TRADE_SETUP_DOCUMENT.is_file():
        raise HTTPException(status_code=503, detail="Trade setup guide is missing.")
    return FileResponse(TRADE_SETUP_DOCUMENT, media_type="text/markdown")


def _frontend_file(path: str = "") -> Path:
    index_file = FRONTEND_DIRECTORY / "index.html"
    if not index_file.is_file():
        raise HTTPException(status_code=503, detail="Frontend build is missing. Build the frontend before starting the server.")
    root = FRONTEND_DIRECTORY.resolve()
    requested_file = (FRONTEND_DIRECTORY / path).resolve()
    try:
        requested_file.relative_to(root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Not found.") from error
    return requested_file if requested_file.is_file() else index_file


@app.get("/", include_in_schema=False)
async def frontend_home() -> RedirectResponse:
    return RedirectResponse(url="/swingtrader")


@app.get("/{path:path}", include_in_schema=False)
async def frontend_route(path: str) -> FileResponse:
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found.")
    return FileResponse(_frontend_file(path))
