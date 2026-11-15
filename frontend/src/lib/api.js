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

export function getStockNews(symbol, signal) {
  return request(API_ROUTES.STOCK_NEWS(symbol), signal);
}

export function importCsv(content) {
  return request(API_ROUTES.IMPORT_CSV, undefined, {
    method: "POST",
    data: { content },
  });
}
