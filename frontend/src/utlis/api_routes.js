export const API_ROUTES = {
  MARKET_DATA: "/api/market-data",
  STOCK_CHART: (symbol, timeframe) => `/api/stocks/${encodeURIComponent(symbol)}/chart?timeframe=${timeframe}`,
  STOCK_NEWS: (symbol) => `/api/stocks/${encodeURIComponent(symbol)}/news`,
  IMPORT_CSV: "/api/import-csv",
  INCOME_TRADE_MODES: "/api/income-trades/modes",
  INCOME_TRADE_LATEST: "/api/income-trades/latest",
  INCOME_TRADE_SCAN: (mode, symbol) => `/api/income-trades/scan?mode=${encodeURIComponent(mode)}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}`,
};