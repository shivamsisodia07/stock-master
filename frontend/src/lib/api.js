import axios from "axios";
import { API_BASE_URL } from "../utlis/baseUrl.js";
import { API_ROUTES } from "../utlis/api_routes.js";

const apiClient = axios.create({ baseURL: API_BASE_URL });

async function request(path, signal, options = {}) {
  try {
    const response = await apiClient.request({ url: path, signal, ...options });
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === "string" && detail) throw new Error(detail);
      if (error.response) {
        throw new Error(`Market data request failed (${error.response.status}).`);
      }
    }
    throw error;
  }
}

export function getMarketData(signal) {
  return request(API_ROUTES.MARKET_DATA, signal);
}

export function getStockChart(symbol, timeframe, signal) {
  return request(API_ROUTES.STOCK_CHART(symbol, timeframe), signal);
}

export function getStockSectorChart(symbol, timeframe, signal) {
  return request(API_ROUTES.STOCK_SECTOR_CHART(symbol, timeframe), signal);
}

export function searchStocks(query, signal) {
  return request(API_ROUTES.STOCK_SEARCH(query), signal);
}

export function getStockQuotes(symbols, signal) {
  return request(API_ROUTES.STOCK_QUOTES(symbols), signal);
}

export function getStockNews(symbol, signal) {
  return request(API_ROUTES.STOCK_NEWS(symbol), signal);
}

export function getIncomeTradeModes(signal) {
  return request(API_ROUTES.INCOME_TRADE_MODES, signal);
}

export function getLatestIncomeTradeScan(signal) {
  return request(API_ROUTES.INCOME_TRADE_LATEST, signal);
}

export function scanIncomeTrades(mode, symbol, signal) {
  return request(API_ROUTES.INCOME_TRADE_SCAN(mode, symbol), signal);
}

export function getJournalTrades(signal) {
  return request(API_ROUTES.TRADES, signal);
}

export function saveJournalTrade(trade, id) {
  return request(id ? API_ROUTES.TRADE(id) : API_ROUTES.TRADES, undefined, {
    method: id ? "PUT" : "POST",
    data: trade,
  });
}

export function deleteJournalTrade(id) {
  return request(API_ROUTES.TRADE(id), undefined, { method: "DELETE" });
}

export function getTradeSetupGuide(signal) {
  return request(API_ROUTES.TRADE_SETUP_GUIDE, signal);
}

export function deliverAlert(payload) {
  return request(API_ROUTES.ALERT_DELIVERY, undefined, {
    method: "POST",
    data: payload,
  });
}
