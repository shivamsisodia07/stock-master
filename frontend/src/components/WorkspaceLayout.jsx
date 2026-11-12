import React from "react";

function followRoute(event, navigate, path) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(path);
}

export default function WorkspaceLayout({
  view,
  navigate,
  scannerCount,
  watchlistCount,
  alertCount,
  children,
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" onClick={(event) => followRoute(event, navigate, "/")} aria-label="swingTrader home">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="1" y="1" width="38" height="38" rx="12" fill="#14291f" stroke="#385347" />
            <rect x="8" y="9" width="24" height="8" rx="2" fill="#57d6a022" stroke="#57d6a0" />
            <path d="M8 29h24M20 19v15m-4-10h8v6h-8z" stroke="#d7e3f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 29h24" stroke="#fa7f87" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>swingTrader<span className="brand-sub">ZONE INTELLIGENCE</span></span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <a href="/" className={`nav-item ${view === "scanner" ? "active" : ""}`} aria-current={view === "scanner" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/")}>
          <span className="nav-icon">◫</span> Zone scanner {scannerCount != null && <span className="nav-count">{scannerCount}</span>}
        </a>
        <a href="/watchlist" className={`nav-item ${view === "watchlist" ? "active" : ""}`} aria-current={view === "watchlist" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/watchlist")}>
          <span className="nav-icon">☆</span> Watchlist <span className="nav-count">{watchlistCount}</span>
        </a>
        <a href="/alerts" className={`nav-item ${view === "alerts" ? "active" : ""}`} aria-current={view === "alerts" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/alerts")}>
          <span className="nav-icon">◉</span> Alerts <span className="nav-count">{alertCount}</span>
        </a>
        <div className="side-label strategy-label">TIMEFRAMES</div>
        <div className="legend-row"><i className="legend-dot breakout-dot" /><span>Daily zones</span></div>
        <div className="legend-row"><i className="legend-dot pullback-dot" /><span>Weekly context</span></div>
        <div className="legend-row"><i className="legend-dot inside-dot" /><span>Monthly context</span></div>
        <div className="sidebar-bottom">
          <div className="disclaimer-mini">Research tool only<br /><span>Not investment advice</span></div>
          <div className="profile"><div className="avatar">N</div><div><strong>Nifty 100</strong><small>NSE · Yahoo Finance</small></div><span className="online-dot" /></div>
        </div>
      </aside>
      <main className="main-content">
        {children}
        <footer className="page-footer"><span><b>swingTrader</b> · Built for thoughtful research.</span><span>Automated zones are not investment advice.</span></footer>
      </main>
    </div>
  );
}
