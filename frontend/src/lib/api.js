const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, signal, options = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...options, signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Market data request failed (${response.status}).`);
  }
  return response.json();
}

export function getMarketData(signal) {
  return request("/api/market-data", signal);
}

export function getStockChart(symbol, timeframe, signal) {
  return request(`/api/stocks/${encodeURIComponent(symbol)}/chart?timeframe=${timeframe}`, signal);
}

export function importCsv(content) {
  return request("/api/import-csv", undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
