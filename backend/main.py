import asyncio

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.services.market_data import get_chart_data, get_market_data, import_csv_market_data

app = FastAPI(title="swingTrader Market Data API", version="2.0.0")
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
