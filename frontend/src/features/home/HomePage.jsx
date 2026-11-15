import React from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import useMarketData from "../scanner/useMarketData.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import useAlerts from "../alerts/useAlerts.js";
import { relativeTime } from "../../lib/format.js";

export default function HomePage({ navigate }) {
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);

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
