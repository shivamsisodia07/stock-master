import React, { useEffect, useRef, useState } from "react";
import { appRoutePath } from "../lib/useAppRouter.js";
import { searchStocks } from "../lib/api.js";
import { notifySyncableDataChanged, useCloudSync } from "../lib/firebaseSync.jsx";
import LoadingIndicator from "./LoadingIndicator.jsx";

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

function profileInitials(user) {
  const label = user?.displayName || user?.email || "";
  const words = label.split(/[\s@._-]+/).filter(Boolean);
  if (!words.length) return "?";
  return words.length > 1
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : words[0].slice(0, 2).toUpperCase();
}

function StockSearch({ stocks, navigate, remoteStockSearch }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [remoteMatches, setRemoteMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const localMatches = normalizedQuery
    ? stocks.filter((stock) => stock.symbol.toLowerCase().includes(normalizedQuery) || stock.name.toLowerCase().includes(normalizedQuery)).slice(0, 8)
    : [];
  const matches = remoteStockSearch ? remoteMatches : localMatches;

  useEffect(() => {
    if (!remoteStockSearch || !normalizedQuery) {
      setRemoteMatches([]);
      setSearching(false);
      setSearchError("");
      return undefined;
    }

    setRemoteMatches([]);
    setSearching(true);
    setSearchError("");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchStocks(normalizedQuery, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setRemoteMatches(result.stocks || []);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setRemoteMatches([]);
            setSearchError(error.message || "Unable to search stocks.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, remoteStockSearch]);

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
            : <div className="header-search-empty" role={searching ? undefined : "status"}>
              {searchError || (searching
                ? <LoadingIndicator compact label="Searching stocks…" />
                : remoteStockSearch
                  ? "No matching stocks found."
                  : stocks.length
                    ? "No matching stocks in the current market list."
                    : <LoadingIndicator compact label="Stock list is still loading." />)}
            </div>}
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
  remoteStockSearch = false,
  children,
}) {
  const [mobileSidebar, setMobileSidebar] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia("(max-width: 820px)").matches);
  const [theme, setTheme] = useState(readTheme);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const {
    user,
    syncStatus,
    syncError,
    mongoSyncStatus,
    mongoSyncError,
    signIn,
    signOutUser,
  } = useCloudSync();

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
      notifySyncableDataChanged("swingTrader-theme");
    } catch (error) {
      console.warn("Unable to save theme settings.", error);
    }
  }, [theme]);

  useEffect(() => {
    const applySyncedTheme = (event) => {
      if (event.detail?.key === "swingTrader-theme") setTheme(readTheme());
    };
    window.addEventListener("swingTrader:cloud-data-updated", applySyncedTheme);
    return () => window.removeEventListener("swingTrader:cloud-data-updated", applySyncedTheme);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setProfileMenuOpen(false);
      profileMenuRef.current?.querySelector(".profile-menu-trigger")?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  async function handleAccountAction() {
    try {
      if (user) await signOutUser();
      else await signIn();
      setProfileMenuOpen(false);
    } catch (error) {
      console.warn("Google account action failed.", error);
    }
  }

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
          {user && <StockSearch stocks={stocks} navigate={navigate} remoteStockSearch={remoteStockSearch} />}
        </div>
        <div className="site-header-actions">
          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button
              className="profile-menu-trigger"
              type="button"
              aria-label={user ? `Account menu for ${user.displayName || user.email}` : "Open account menu"}
              aria-haspopup="true"
              aria-expanded={profileMenuOpen}
              aria-controls={profileMenuOpen ? "header-profile-menu" : undefined}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <span className="profile-header-avatar" aria-hidden="true">
                <span>{profileInitials(user)}</span>
                {user?.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
              </span>
              {/* <span className="profile-menu-chevron" aria-hidden="true">⌄</span> */}
            </button>
            {profileMenuOpen && (
              <div className="header-profile-menu" id="header-profile-menu">
                <div className="header-profile-identity">
                  <span className="profile-header-avatar large" aria-hidden="true">
                    <span>{profileInitials(user)}</span>
                    {user?.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
                  </span>
                  <div>
                    <strong>{user?.displayName || (user ? "Google account" : "Guest profile")}</strong>
                    <small>{user?.email || "Sign in to sync across devices"}</small>
                  </div>
                </div>
                <button className="header-profile-menu-action" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                  <span>Appearance</span><strong>{theme === "dark" ? "Dark" : "Light"} theme</strong>
                </button>
                <button className="header-profile-menu-action account-action" type="button" onClick={handleAccountAction}>
                  {user ? "Sign out" : "Continue with Google"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <aside className="sidebar">
        <a href={appRoutePath("/")} title="Home" className={`nav-item ${view === "home" ? "active" : ""}`} aria-current={view === "home" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/")}>
          <span className="nav-icon">⌂</span> Home
        </a>
        {user && <>
          <a href={appRoutePath("/scanner")} title="Zone scanner" className={`nav-item ${view === "scanner" ? "active" : ""}`} aria-current={view === "scanner" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/scanner")}>
            <span className="nav-icon">◫</span> Zone scanner {scannerCount != null && <span className="nav-count">{scannerCount}</span>}
          </a>
          <a href={appRoutePath("/journal")} title="Trade journal" className={`nav-item ${view === "journal" ? "active" : ""}`} aria-current={view === "journal" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/journal")}>
            <span className="nav-icon">▤</span> Trade journal
          </a>
          <a href={appRoutePath("/sample-trades")} title="Trade Tracker" className={`nav-item ${view === "sample-trades" ? "active" : ""}`} aria-current={view === "sample-trades" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/sample-trades")}>
            <span className="nav-icon">↗</span> Trade Tracker
          </a>
          <a href={appRoutePath("/watchlist")} title="Watchlist" className={`nav-item ${view === "watchlist" ? "active" : ""}`} aria-current={view === "watchlist" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/watchlist")}>
            <span className="nav-icon">☆</span> Watchlist <span className="nav-count">{watchlistCount}</span>
          </a>
          <a href={appRoutePath("/alerts")} title="Alerts" className={`nav-item ${view === "alerts" ? "active" : ""}`} aria-current={view === "alerts" ? "page" : undefined} onClick={(event) => followRoute(event, navigate, "/alerts")}>
            <span className="nav-icon">◉</span> Alerts <span className="nav-count">{alertCount}</span>
          </a>
        </>}
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
