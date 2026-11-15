import asyncio
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from backend.services.market_data import get_chart_data, get_market_data, get_stock_news_and_events, import_csv_market_data

app = FastAPI(title="swingTrader Market Data API", version="2.0.0")
FRONTEND_DIRECTORY = Path(__file__).resolve().parent / "static"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/market-data")
async def market_data() -> dict:
    return await asyncio.to_thread(get_market_data)


class CsvImportRequest(BaseModel):
    content: str


@app.post("/api/import-csv")
async def import_csv(request: CsvImportRequest) -> dict:
    try:
        return await asyncio.to_thread(import_csv_market_data, request.content)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/stocks/{symbol}/chart")
async def stock_chart(symbol: str, timeframe: str = Query(default="daily")) -> dict:
    return get_chart_data(symbol, timeframe)


@app.get("/api/stocks/{symbol}/news")
async def stock_news(symbol: str) -> dict:
    return await asyncio.to_thread(get_stock_news_and_events, symbol)


@app.get("/api/docs", include_in_schema=False)
async def api_docs() -> RedirectResponse:
    return RedirectResponse(url="/docs")


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
