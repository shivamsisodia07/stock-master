import React, { useEffect, useMemo, useState } from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import useMarketData from "../scanner/useMarketData.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import useAlerts from "../alerts/useAlerts.js";
import { getIncomeTradeModes, scanIncomeTrades } from "../../lib/api.js";

const SETUP_ORDER = ["HIT", "DIT", "WIT", "MIT", "QIT", "YIT"];

export default function IncomeTradesPage({ navigate }) {
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);
  const [mode, setMode] = useState("MIT");
  const [symbol, setSymbol] = useState("");
  const [scope, setScope] = useState("nifty100");
  const [setups, setSetups] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getIncomeTradeModes(controller.signal).then((payload) => setSetups(payload.setups || {})).catch(() => {});
    return () => controller.abort();
  }, []);

  async function runScan(event) {
    event?.preventDefault();
    const selectedSymbol = scope === "stock" ? symbol.trim() : "";
    if (scope === "stock" && !selectedSymbol) {
      setError("Enter a Nifty 100 stock symbol.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    const controller = new AbortController();
    try {
      setResult(await scanIncomeTrades(mode, selectedSymbol, controller.signal));
    } catch (requestError) {
      setError(requestError.message || "Unable to run the income-trade scan.");
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => result?.rows || [], [result]);
  const setup = setups[mode] || result?.setup;

  return (
    <WorkspaceLayout view="income-trades" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={market.stocks}>
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Income trades" />
        <div className="top-actions"><div className="market-status"><i style={{ background: error ? "var(--red)" : "var(--green)" }} /><span>{loading ? "SCANNING" : "NIFTY 100"}</span></div></div>
      </header>

      <section className="page-heading flex flex-col items-start gap-3 min-[561px]:flex-row min-[561px]:items-end min-[561px]:justify-between">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />LOCATION · TREND · EXECUTION</div>
          <h1>Income <span>trades.</span></h1>
          <p className="page-subtitle">Scan the listed setups across a location, trend, and execution timeframe.</p>
        </div>
        <button className="primary-button" type="button" disabled={loading} onClick={runScan}>{loading ? "Scanning…" : "Run scan ↗"}</button>
      </section>

      <section className="income-setup-strip" aria-label="Income trade summary">
        {SETUP_ORDER.map((code) => (
          <button type="button" key={code} className={`income-setup-card ${mode === code ? "active" : ""}`} onClick={() => setMode(code)}>
            <strong>{code}</strong>
            <span>{(setups[code] || {}).full_name || `${code} setup`}</span>
          </button>
        ))}
      </section>

      <form className="income-scan-controls" onSubmit={runScan}>
        <div className="income-scope" role="group" aria-label="Scan scope">
          <button type="button" className={scope === "nifty100" ? "active" : ""} onClick={() => setScope("nifty100")}>Nifty 100</button>
          <button type="button" className={scope === "stock" ? "active" : ""} onClick={() => setScope("stock")}>One stock</button>
        </div>
        {scope === "stock" && (
          <label className="income-symbol">
            <span>Stock symbol</span>
            <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="RELIANCE" list="nifty-symbols" />
            <datalist id="nifty-symbols">{market.stocks.map((stock) => <option key={stock.symbol} value={stock.symbol}>{stock.name}</option>)}</datalist>
          </label>
        )}
        <label className="income-select">
          <span>Income setup</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {SETUP_ORDER.map((code) => <option key={code} value={code}>{code} · {(setups[code] || {}).full_name || "Income Trade"}</option>)}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={loading}>{loading ? "Scanning…" : scope === "nifty100" ? "Scan Nifty 100" : "Scan stock"}</button>
      </form>

      {setup && (
        <section className="income-timeframe-strip" aria-label="Selected setup timeframes">
          <div><span>LOCATION</span><strong>{setup.location}</strong></div>
          <b>→</b>
          <div><span>TREND</span><strong>{setup.trend}</strong></div>
          <b>→</b>
          <div><span>EXECUTION</span><strong>{setup.execution}</strong></div>
          <div className="income-holding"><span>TYPICAL HOLDING</span><strong>{setup.holding}</strong></div>
        </section>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <div className="loading-banner">Loading candles and checking location, trend, and execution…</div>}

      {result && !loading && (
        <section className="income-results">
          <div className="income-results-heading">
            <div><h2>{mode} scan <span className="results-count">{rows.length} matches</span></h2><p>{result.scanned ? `Scanned ${result.scanned} Nifty 100 stocks` : "Single-stock analysis"} · EMA values are additional trend support.</p></div>
          </div>
          {rows.length ? (
            <div className="income-table-wrap">
              <table className="zone-table income-table">
                <thead><tr><th>Stock</th><th>Status</th><th>Close</th><th>Zone</th><th>Stop</th><th>Target</th><th>Risk</th><th>EMA support</th><th>Execution</th></tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.symbol}>
                    <td><button className="stock-table-link" type="button" onClick={() => navigate(`/stocks/${encodeURIComponent(row.symbol)}`)}><strong>{row.symbol}</strong></button></td>
                    <td><span className={`income-status ${row.status === "SIGNAL" ? "signal" : "watch"}`}>{row.status}</span></td>
                    <td className="table-price">₹{row.close.toLocaleString("en-IN")}</td>
                    <td className="table-zone demand-table-zone">₹{row.zone_low.toLocaleString("en-IN")}–₹{row.zone_high.toLocaleString("en-IN")}</td>
                    <td className="table-zone">{row.stop == null ? "—" : `₹${row.stop.toLocaleString("en-IN")}`}</td>
                    <td className="table-zone">{row.target == null ? "—" : `₹${row.target.toLocaleString("en-IN")}`}</td>
                    <td className="table-zone">{row.risk_pct == null ? "—" : `${row.risk_pct}%`}</td>
                    <td><span className={row.ema_support ? "income-yes" : "income-no"}>{row.ema_support ? "Aligned" : "Not aligned"}</span></td>
                    <td className="table-zone">{row.trigger}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <section className="empty-state"><div className="empty-icon">↗</div><h3>No qualifying income trades</h3><p>No stock matched the location, trend, and execution rules at this scan.</p></section>
          )}
        </section>
      )}
    </WorkspaceLayout>
  );
}
