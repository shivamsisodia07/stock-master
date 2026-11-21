import React, { useEffect, useState } from "react";
import { appRoutePath } from "../lib/useAppRouter.js";

function followRoute(event, navigate, path) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(path);
}

export function Breadcrumb({ navigate, current }) {
  if (current === "Home") {
    return <div className="breadcrumb"><strong aria-current="page">Home</strong></div>;
  }
  return (
    <div className="breadcrumb">
      <button className="breadcrumb-link" type="button" onClick={() => navigate("/")}>Home</button>
      <span>/</span>
      <strong aria-current="page">{current}</strong>
    </div>
  );
}

function BrandMark() {
  return <img className="brand-mark" src="/swingtrader-logo.png" alt="" />;
}

function readTheme() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("swingTrader-theme") || "null");
    const savedTheme = typeof saved === "string" ? saved : saved?.theme;
    return savedTheme === "light" ? "light" : "dark";
  } catch (error) {
    console.warn("Unable to read saved theme settings.", error);
    return "dark";
  }
}

function StockSearch({ stocks, navigate }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? stocks.filter((stock) => stock.symbol.toLowerCase().includes(normalizedQuery) || stock.name.toLowerCase().includes(normalizedQuery)).slice(0, 8)
    : [];

  function selectStock(stock) {
    setOpen(false);
    setQuery("");
    navigate(`/stocks/${encodeURIComponent(stock.symbol)}`);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") setOpen(false);
    if (event.key === "Enter" && matches.length) {
      event.preventDefault();
      selectStock(matches[0]);
    }
  }

  return (
    <div className="header-stock-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <label className="header-search-box">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          role="combobox"
          aria-label="Search stocks"
          aria-autocomplete="list"
          aria-expanded={open && Boolean(normalizedQuery)}
          aria-controls="header-stock-suggestions"
          placeholder="Search any stock by name or symbol"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
        />
      </label>
      {open && normalizedQuery && (
        <div className="header-stock-suggestions" id="header-stock-suggestions" role="listbox">
          {matches.length
            ? matches.map((stock) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                key={stock.symbol}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectStock(stock)}
              >
                <strong>{stock.symbol}</strong><span>{stock.name}</span>
              </button>
            ))
            : <div className="header-search-empty" role="status">{stocks.length ? "No matching stocks in the current market list." : "Stock list is still loading."}</div>}
        </div>
      )}
    </div>
  );
}

export default function WorkspaceLayout({
  view,
  navigate,
  scannerCount,
  watchlistCount,
  alertCount,
  stocks = [],
  children,
}) {
  const [mobileSidebar, setMobileSidebar] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia("(max-width: 820px)").matches);
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const handleViewportChange = () => {
      setMobileSidebar(mediaQuery.matches);
      setSidebarOpen(!mediaQuery.matches);
    };
    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    try {
      window.localStorage.setItem("swingTrader-theme", JSON.stringify({ theme }));
    } catch (error) {
      console.warn("Unable to save theme settings.", error);
    }
  }, [theme]);

  const shellClass = [
    "app-shell min-h-screen bg-swing-bg font-sans text-swing-text antialiased",
    mobileSidebar ? "sidebar-mobile" : "",
    sidebarOpen ? "sidebar-open" : "sidebar-collapsed",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <header className="site-header">
        <div className="site-header-left">
          <a className="site-header-brand" href={appRoutePath("/")} onClick={(event) => followRoute(event, navigate, "/")} aria-label="swingTrader home">
            <BrandMark />
            <span><strong>swingTrader</strong></span>
          </a>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >{sidebarOpen ? "‹" : "☰"}</button>
          <StockSearch stocks={stocks} navigate={navigate} />
        </div>
        <div className="site-header-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Current theme: ${theme}`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >{theme === "light" ? "☀" : "◐"}</button>
        </div>
      </header>
      <aside className="sidebar">
        {/* <a className="brand" href="/swingtrader" onClick={(event) => followRoute(event, navigate, "/")} aria-label="swingTrader home">
          <BrandMark />
          <span>swingTrader<small className="brand-sub">PRICE STRUCTURE RESEARCH</small></span>
        </a> */}
        <a href={appRoutePath("/")} title="Home" className={`nav-item ${view === "home" ? "active" : ""}`} aria-current={view === "home" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/")}>
          <span className="nav-icon">⌂</span> Home
        </a>
        <a href={appRoutePath("/scanner")} title="Zone scanner" className={`nav-item ${view === "scanner" ? "active" : ""}`} aria-current={view === "scanner" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/scanner")}>
          <span className="nav-icon">◫</span> Zone scanner {scannerCount != null && <span className="nav-count">{scannerCount}</span>}
        </a>
        <a href={appRoutePath("/journal")} title="Trade journal" className={`nav-item ${view === "journal" ? "active" : ""}`} aria-current={view === "journal" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/journal")}>
          <span className="nav-icon">▤</span> Trade journal
        </a>
        <a href={appRoutePath("/watchlist")} title="Watchlist" className={`nav-item ${view === "watchlist" ? "active" : ""}`} aria-current={view === "watchlist" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/watchlist")}>
          <span className="nav-icon">☆</span> Watchlist <span className="nav-count">{watchlistCount}</span>
        </a>
        <a href={appRoutePath("/alerts")} title="Alerts" className={`nav-item ${view === "alerts" ? "active" : ""}`} aria-current={view === "alerts" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/alerts")}>
          <span className="nav-icon">◉</span> Alerts <span className="nav-count">{alertCount}</span>
        </a>
        <a href={appRoutePath("/learn")} title="Learn" className={`nav-item ${view === "learn" ? "active" : ""}`} aria-current={view === "learn" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/learn")}>
          <span className="nav-icon">⌁</span> Learn
        </a>
        <div className="sidebar-bottom">
          <div className="sidebar-feedback">
            <strong>Have feedback?</strong>
            <small>Help make swingTrader better.</small>
            <a href="mailto:shivamsisodia8656816@gmail.com?subject=swingTrader%20feedback">Send feedback ↗</a>
          </div>
          <details className="sidebar-settings">
            <summary><span aria-hidden="true">⚙</span> Settings</summary>
            <div className="sidebar-setting-controls">
              <label>Theme
                <select aria-label="Color theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
            </div>
          </details>
        </div>
      </aside>
      {mobileSidebar && sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setSidebarOpen(false)} />}
      <main className="main-content min-w-0">
        {children}
        <footer className="page-footer">
          <span>© {new Date().getFullYear()} swingTrader.</span>
          <span className="footer-disclaimer">For educational purposes only. Automated analysis is not investment advice.</span>
        </footer>
      </main>
    </div>
  );
}
