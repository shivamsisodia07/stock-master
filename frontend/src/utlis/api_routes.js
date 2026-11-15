export const API_ROUTES = {
  MARKET_DATA: "/api/market-data",
  STOCK_CHART: (symbol, timeframe) => `/api/stocks/${encodeURIComponent(symbol)}/chart?timeframe=${timeframe}`,
  STOCK_NEWS: (symbol) => `/api/stocks/${encodeURIComponent(symbol)}/news`,
  IMPORT_CSV: "/api/import-csv",
};