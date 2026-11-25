import React, { useEffect, useState } from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import useMarketData from "../scanner/useMarketData.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import useAlerts from "../alerts/useAlerts.js";
import { relativeTime } from "../../lib/format.js";
import { getLatestIncomeTradeScan } from "../../lib/api.js";
import TradingViewWidget from "../../components/TradingViewWidget.jsx";

export default function HomePage({ navigate }) {
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);
  const [tradeScan, setTradeScan] = useState(null);
  const [tradeScanLoading, setTradeScanLoading] = useState(true);
  const [tradeScanError, setTradeScanError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getLatestIncomeTradeScan(controller.signal)
      .then(setTradeScan)
      .catch((error) => {
        if (!controller.signal.aborted) setTradeScanError(error.message || "Unable to load the latest trade scan.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setTradeScanLoading(false);
      });
    return () => controller.abort();
  }, []);

  const tradeRows = (tradeScan?.setups || []).flatMap((setup) =>
    setup.rows.map((row) => ({ ...row, mode: setup.mode })),
  );

  return (
    <WorkspaceLayout view="home" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={market.stocks}>
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Home" />
        <div className="top-actions">
          <div className="market-status"><i style={{ background: market.error ? "var(--red)" : "var(--green)" }} /><span>{market.error ? "FEED UNAVAILABLE" : "MARKET OVERVIEW"}</span></div>
          <div className="date-label">{market.updatedAt ? relativeTime(market.updatedAt) : "Waiting for quotes"}</div>
        </div>
      </header>

      <section className="home-hero">
        <div className="eyebrow"><span className="eyebrow-line" />NSE · THOUGHTFUL MARKET RESEARCH</div>
        <h1>Read the market, <span>your way.</span></h1>
        <p>Explore demand and supply zones across multiple timeframes, follow stocks that matter to you, and keep your research in one place.</p>
        <div className="home-actions">
          <button className="primary-button" onClick={() => navigate("/scanner")}>Open zone scanner ↗</button>
          <button className="secondary-button" onClick={() => navigate("/watchlist")}>View watchlist</button>
        </div>
      </section>

      {market.error && <div className="error-banner" role="alert">{market.error} <button className="text-button" onClick={market.refresh}>Retry</button></div>}

      <section className="home-summary grid grid-cols-1 gap-3 min-[561px]:grid-cols-3" aria-label="Market summary">
        <article className="home-summary-card"><span>STOCKS IN UNIVERSE</span><strong>{market.loading ? "…" : market.stocks.length}</strong><small>Nifty 100 market coverage</small></article>
        <article className="home-summary-card"><span>WATCHLIST</span><strong>{watchlist.symbols.length}</strong><small>Stocks saved on this device</small></article>
        <article className="home-summary-card"><span>ACTIVE ALERTS</span><strong>{alerts.rules.length}</strong><small>Zone-entry rules on this device</small></article>
      </section>

      <section className="home-market-heatmap" aria-labelledby="nifty-heatmap-title">
        <div className="stock-section-heading">
          <div><h2 id="nifty-heatmap-title">NIFTY 500 heatmap</h2><p>Market-cap weighted view of Indian stocks and sector performance.</p></div>
          <a href="https://www.tradingview.com/heatmap/stock/" target="_blank" rel="noreferrer">TradingView ↗</a>
        </div>
        <div className="tradingview-panel">
          <TradingViewWidget type="heatmap" />
        </div>
      </section>

      <section className="income-results home-trade-results" aria-label="Latest nightly trade scan">
        <div className="income-results-heading">
          <div>
            <h2>Latest nightly trade scan <span className="results-count">{tradeScan?.matched || 0} matches</span></h2>
            <p>{tradeScan?.started_at ? `Scanned ${tradeScan.scanned} stocks across ${tradeScan.setups.length} setups · ${relativeTime(tradeScan.started_at)}` : "Nightly Nifty 100 income-trade collection"}</p>
          </div>
        </div>
        {tradeScanLoading && <div className="loading-banner">Loading the latest collected scans…</div>}
        {tradeScanError && <div className="error-banner" role="alert">{tradeScanError}</div>}
        {!tradeScanLoading && !tradeScanError && !tradeScan?.started_at && <div className="empty-state"><h3>No nightly scans collected yet</h3><p>Collected trade setups will appear here after the scheduled scan runs.</p></div>}
        {tradeScan?.started_at && tradeScan.failed > 0 && <div className="warning-banner" role="status">{tradeScan.failed} stock or setup scans failed; available results are shown.</div>}
        {tradeScan?.started_at && tradeRows.length > 0 && (
          <div className="income-table-wrap">
            <table className="zone-table income-table">
              <thead><tr><th>Setup</th><th>Stock</th><th>Status</th><th>Close</th><th>Zone</th><th>Stop</th><th>Target</th><th>Risk</th></tr></thead>
              <tbody>{tradeRows.map((row) => (
                <tr key={`${row.mode}-${row.symbol}`}>
                  <td>{row.mode}</td>
                  <td><button className="stock-table-link" type="button" onClick={() => navigate(`/stocks/${encodeURIComponent(row.symbol)}`)}><strong>{row.symbol}</strong></button></td>
                  <td><span className={`income-status ${row.status === "SIGNAL" ? "signal" : "watch"}`}>{row.status}</span></td>
                  <td className="table-price">₹{row.close.toLocaleString("en-IN")}</td>
                  <td className="table-zone demand-table-zone">₹{row.zone_low.toLocaleString("en-IN")}–₹{row.zone_high.toLocaleString("en-IN")}</td>
                  <td className="table-zone">{row.stop == null ? "—" : `₹${row.stop.toLocaleString("en-IN")}`}</td>
                  <td className="table-zone">{row.target == null ? "—" : `₹${row.target.toLocaleString("en-IN")}`}</td>
                  <td className="table-zone">{row.risk_pct == null ? "—" : `${row.risk_pct}%`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {tradeScan?.started_at && tradeRows.length === 0 && <div className="empty-state"><h3>No qualifying income trades</h3><p>The latest scan found no matches across the selected setup rules.</p></div>}
      </section>

      <section className="home-shortcuts" aria-label="Research tools">
        <button className="home-shortcut" onClick={() => navigate("/scanner")}>
          <span className="home-shortcut-icon">◫</span><span><strong>Zone scanner</strong><small>Find monthly, weekly, and daily zone opportunities.</small></span><b>↗</b>
        </button>
        <button className="home-shortcut" onClick={() => navigate("/watchlist")}>
          <span className="home-shortcut-icon">☆</span><span><strong>Your watchlist</strong><small>Review your saved stocks and their current zones.</small></span><b>↗</b>
        </button>
        <button className="home-shortcut" onClick={() => navigate("/alerts")}>
          <span className="home-shortcut-icon">◉</span><span><strong>Price alerts</strong><small>Manage your saved zone-entry notifications.</small></span><b>↗</b>
        </button>
      </section>
    </WorkspaceLayout>
  );
}
