import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const POLL_INTERVAL = 60_000;
const SETUPS = {
  breakout: { label: "Resistance breakout", color: "#57d6a0" },
  pullback: { label: "EMA pullback", color: "#8ba8ff" },
  inside: { label: "Inside-bar break", color: "#f4bd67" },
};

function ema(values, period) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  return values.reduce((result, value, index) => {
    result.push(index === 0 ? value : value * multiplier + result[index - 1] * (1 - multiplier));
    return result;
  }, []);
}

function atr(candles, period = 14) {
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  }).slice(-period);
  return ranges.reduce((sum, range) => sum + range, 0) / Math.max(1, ranges.length);
}

function detect(stock) {
  const { symbol, name, candles } = stock;
  if (!candles || candles.length < 25) return null;
  const closes = candles.map((candle) => candle.close);
  const averages = ema(closes, 20);
  const last = candles.length - 1;
  const current = candles[last];
  const previous = candles[last - 1];
  const older = candles[last - 2];
  const averageVolume = candles.slice(-21, -1).reduce((sum, candle) => sum + candle.volume, 0) / 20;
  const priorHigh = Math.max(...candles.slice(-21, -1).map((candle) => candle.high));
  const volatility = atr(candles);
  let type = null;
  let score = 58;
  let reason = "";

  if (current.close > priorHigh && current.close > averages[last] && current.volume >= averageVolume * 1.2) {
    type = "breakout";
    score = 72 + Math.min(18, Math.round((current.volume / averageVolume - 1) * 15));
    reason = `Closed above the prior 20-session high with ${(current.volume / averageVolume).toFixed(1)}× average volume.`;
  } else if (current.low <= averages[last] * 1.012 && current.close > averages[last] && current.close > current.open && averages[last] > averages[Math.max(0, last - 4)]) {
    type = "pullback";
    score = 70 + Math.min(18, Math.round(((current.close - current.low) / Math.max(volatility, 0.01)) * 7));
    reason = "Bullish rejection near a rising 20-day EMA; trend structure remains constructive.";
  } else if (previous.high < older.high && previous.low > older.low && current.close > previous.high && current.close > averages[last]) {
    type = "inside";
    score = 71 + Math.min(17, Math.round(((current.close - previous.high) / Math.max(volatility, 0.01)) * 45));
    reason = "Price closed above the inside bar after a volatility contraction.";
  }
  if (!type || !averageVolume) return null;

  const recentLow = Math.min(...candles.slice(-6, -1).map((candle) => candle.low));
  let stop = type === "pullback" ? Math.min(recentLow, current.low - volatility * 0.15) : Math.min(recentLow, current.close - volatility * 1.15);
  if (stop >= current.close) stop = current.close - volatility;
  const risk = current.close - stop;
  if (risk <= 0) return null;

  return {
    symbol, name, type, candles, reason, date: current.date, entry: current.close, stop,
    target: current.close + risk * 2, rr: 2, score,
    change: ((current.close - current.open) / current.open) * 100,
    volumeRatio: current.volume / averageVolume,
    riskPct: (risk / current.close) * 100,
  };
}

function money(value) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MiniChart({ candles, color }) {
  const data = candles.slice(-28);
  const minimum = Math.min(...data.map((candle) => candle.low));
  const maximum = Math.max(...data.map((candle) => candle.high));
  const range = maximum - minimum || 1;
  const points = data.map((candle, index) => `${(index / Math.max(1, data.length - 1)) * 250},${58 - ((candle.close - minimum) / range) * 50 - 4}`).join(" ");
  return (
    <svg viewBox="0 0 250 58" preserveAspectRatio="none" aria-hidden="true">
      <path className="chart-grid" d="M0 16H250 M0 39H250" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StockCard({ stock, favorite, onFavorite, onDetails }) {
  const setup = SETUPS[stock.type];
  return (
    <article className="stock-card" data-symbol={stock.symbol} tabIndex="0" aria-label={`${stock.name} ${setup.label} setup`} onClick={() => onDetails(stock)}>
      <div className="card-top">
        <div className="stock-identity">
          <div className="stock-avatar">{stock.symbol.slice(0, 2)}</div>
          <div><div className="stock-name">{stock.name}</div><div className="stock-symbol">{stock.symbol} · NSE</div></div>
        </div>
        <button className="score-badge favorite-button" type="button" title={favorite ? "Remove from watchlist" : "Add to watchlist"} onClick={(event) => { event.stopPropagation(); onFavorite(stock.symbol); }}>
          {favorite ? "★" : "✦"} {stock.score}
        </button>
      </div>
      <div className="setup-label"><i className="legend-dot" style={{ background: setup.color }} />{setup.label}<span className="setup-type">DAILY</span></div>
      <div className="price-row"><span className="last-price">{money(stock.entry)}</span><span className="price-change">{stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%</span></div>
      <div className="chart-wrap"><MiniChart candles={stock.candles} color={setup.color} /></div>
      <div className="levels">
        <div className="level-entry"><span className="level-label">ENTRY</span><span className="level-value">{money(stock.entry)}</span></div>
        <div className="level-stop"><span className="level-label">INVALIDATION</span><span className="level-value">{money(stock.stop)}</span></div>
        <div className="level-target"><span className="level-label">2R TARGET</span><span className="level-value">{money(stock.target)}</span></div>
      </div>
      <div className="card-foot"><span>Risk <strong>{stock.riskPct.toFixed(1)}%</strong> · R/R <strong>1:2</strong></span><span>{new Date(`${stock.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} <span className="card-arrow">↗</span></span></div>
    </article>
  );
}

function DetailDialog({ stock, onClose }) {
  if (!stock) return null;
  const setup = SETUPS[stock.type];
  return (
    <dialog className="detail-dialog" open onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <button className="dialog-close" aria-label="Close" onClick={onClose}>×</button>
      <div className="eyebrow"><span className="eyebrow-line" style={{ background: setup.color }} />{setup.label.toUpperCase()} · NSE</div>
      <h2>{stock.name}</h2>
      <div className="dialog-subtitle">{stock.symbol} · Daily swing setup · Signal date {stock.date}</div>
      <div className="detail-levels">
        <div className="detail-level"><span>ENTRY</span><strong style={{ color: "#b8caff" }}>{money(stock.entry)}</strong></div>
        <div className="detail-level"><span>INVALIDATION</span><strong style={{ color: "#ff989d" }}>{money(stock.stop)}</strong></div>
        <div className="detail-level"><span>2R REFERENCE</span><strong style={{ color: "#8de1b5" }}>{money(stock.target)}</strong></div>
      </div>
      <div className="detail-notes"><strong>Why it appeared</strong><br />{stock.reason}<br />Estimated risk: {stock.riskPct.toFixed(2)}% · Relative volume: {stock.volumeRatio.toFixed(2)}× · Setup score: {stock.score}/100</div>
      <p>Data is provided by Yahoo Finance and may be delayed. Levels are illustrative calculations from daily candles, not trade instructions.</p>
    </dialog>
  );
}

function InfoDialog({ onClose }) {
  return (
    <dialog className="detail-dialog info-dialog" open onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <button className="dialog-close" aria-label="Close" onClick={onClose}>×</button>
      <div className="eyebrow"><span className="eyebrow-line" />SCANNER NOTES</div>
      <h2>How Pivot finds setups</h2>
      <p>Pivot checks daily OHLCV candles for a close above the prior 20-session high with volume confirmation, a bullish pullback near a rising 20-day EMA, or a breakout above an inside bar. It estimates invalidation from recent lows / ATR and shows a 2R reference target.</p>
      <p>Live data is polled from Yahoo Finance every 60 seconds during use. Yahoo Finance data can be delayed and is not a guaranteed real-time exchange feed.</p>
      <div className="info-callout">Trading involves risk. Verify prices, liquidity, corporate actions, and your own risk limits before making any decision.</div>
    </dialog>
  );
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV needs a header and at least one candle.");
  const headers = lines[0].split(",").map((value) => value.trim().toLowerCase().replace(/^"|"$/g, ""));
  const find = (names) => headers.findIndex((header) => names.includes(header));
  const indexes = {
    date: find(["date", "datetime", "timestamp"]), symbol: find(["symbol", "ticker", "stock"]),
    open: find(["open", "o"]), high: find(["high", "h"]), low: find(["low", "l"]),
    close: find(["close", "adj close", "c"]), volume: find(["volume", "vol", "v"]),
  };
  if (Object.values(indexes).some((index) => index < 0)) throw new Error("Required columns: date, symbol, open, high, low, close, volume.");
  const grouped = {};
  lines.slice(1).forEach((line, index) => {
    const columns = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    if (columns.length < headers.length) return;
    const symbol = columns[indexes.symbol].toUpperCase().replace(/\.NS$/, "").replace(/\s/g, "");
    const candle = {
      date: columns[indexes.date].slice(0, 10), open: Number(columns[indexes.open]), high: Number(columns[indexes.high]),
      low: Number(columns[indexes.low]), close: Number(columns[indexes.close]), volume: Number(columns[indexes.volume]),
    };
    if (!symbol || Object.values(candle).some((value) => typeof value === "number" && !Number.isFinite(value))) throw new Error(`Invalid numeric data on row ${index + 2}.`);
    if (candle.low > candle.high || candle.low > Math.min(candle.open, candle.close) || candle.high < Math.max(candle.open, candle.close)) throw new Error(`Invalid OHLC range on row ${index + 2}.`);
    (grouped[symbol] ||= []).push(candle);
  });
  Object.values(grouped).forEach((candles) => candles.sort((left, right) => left.date.localeCompare(right.date)));
  const enough = Object.fromEntries(Object.entries(grouped).filter(([, candles]) => candles.length >= 25));
  if (!Object.keys(enough).length) throw new Error("No symbols have at least 25 valid candles.");
  return Object.entries(enough).map(([symbol, candles]) => ({ symbol, name: symbol, candles }));
}

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [customData, setCustomData] = useState(false);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("scanner");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("score");
  const [favorites, setFavorites] = useState(() => new Set(JSON.parse(localStorage.getItem("pivot-watchlist") || "[]")));
  const [selectedStock, setSelectedStock] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState("");
  const [refreshTime, setRefreshTime] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/market-data`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Market data request failed (${response.status}).`);
      }
      const payload = await response.json();
      setStocks(payload.stocks);
      setLastUpdated(payload.updated_at);
      setRefreshTime(new Date(payload.updated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Unable to load market data. Check that the Python API is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customData) return undefined;
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL);
    return () => window.clearInterval(interval);
  }, [customData, refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const signals = useMemo(() => stocks.map(detect).filter(Boolean), [stocks]);
  const visibleSignals = useMemo(() => {
    const term = search.trim().toLowerCase();
    return signals.filter((stock) =>
      (filter === "all" || stock.type === filter)
      && (view !== "watchlist" || favorites.has(stock.symbol))
      && (!term || stock.symbol.toLowerCase().includes(term) || stock.name.toLowerCase().includes(term)),
    ).sort((left, right) => sort === "symbol" ? left.symbol.localeCompare(right.symbol) : sort === "rr" ? right.rr - left.rr : right.score - left.score);
  }, [signals, filter, view, favorites, search, sort]);
  const averageRiskReward = signals.length ? `${(signals.reduce((sum, signal) => sum + signal.rr, 0) / signals.length).toFixed(1)}R` : "—";

  function toggleFavorite(symbol) {
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      localStorage.setItem("pivot-watchlist", JSON.stringify([...next]));
      return next;
    });
  }

  function handleCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setStocks(parseCsv(text));
      setCustomData(true);
      setView("scanner");
      setToast(`Loaded OHLC data from ${file.name}.`);
    }).catch((readError) => setToast(readError.message)).finally(() => { event.target.value = ""; });
  }

  function restoreLiveData() {
    setCustomData(false);
    setError("");
    setLoading(true);
    setToast("Refreshing market data…");
    refresh();
  }

  function clearFilters() {
    setFilter("all");
    setView("scanner");
    setSearch("");
  }

  const formattedDate = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Pivot home"><span className="brand-mark">P<span>·</span></span><span>pivot<span className="brand-sub">MARKET INTELLIGENCE</span></span></a>
        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${view === "scanner" ? "active" : ""}`} onClick={() => setView("scanner")}><span className="nav-icon">◫</span> Market scanner <span className="nav-count">{signals.length}</span></button>
        <button className={`nav-item ${view === "watchlist" ? "active" : ""}`} onClick={() => setView("watchlist")}><span className="nav-icon">☆</span> Watchlist <span className="nav-count">{favorites.size}</span></button>
        <div className="side-label strategy-label">STRATEGY</div>
        <div className="strategy-card"><span className="strategy-dot" /><div><strong>Price action</strong><small>Daily · Swing (3–15 days)</small></div><span className="chevron">⌄</span></div>
        <div className="side-label">SETUPS IN FOCUS</div>
        {Object.entries(SETUPS).map(([type, setup]) => <div className="legend-row" key={type}><i className="legend-dot" style={{ background: setup.color }} /><span>{setup.label}</span></div>)}
        <div className="sidebar-bottom"><div className="disclaimer-mini">Research tool only<br /><span>Not investment advice</span></div><div className="profile"><div className="avatar">N</div><div><strong>Nifty 100</strong><small>India · NSE</small></div><span className="online-dot" /></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Markets <span>/</span> <strong>Opportunity scanner</strong></div><div className="top-actions"><div className="market-status"><i style={{ background: error ? "var(--red)" : customData ? "var(--amber)" : "var(--green)" }} /><span>{error ? "DATA UNAVAILABLE" : customData ? "LOCAL CSV" : "LIVE · YAHOO"}</span></div><button className="icon-button" aria-label="About this scanner" onClick={() => setShowInfo(true)}>?</button><div className="date-label">{formattedDate}</div></div></header>
        <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />PRICE ACTION · NSE</div><h1>Find your next <span>setup.</span></h1><p className="page-subtitle">A clear view of swing opportunities across the Nifty 100.</p></div><div><button className="primary-button" onClick={() => document.getElementById("csv-file").click()}><span>↑</span> Import OHLC data</button><input id="csv-file" type="file" accept=".csv,text/csv" hidden onChange={handleCsv} /></div></section>

        <section className="market-strip" aria-label="Market summary"><div className="market-main"><div className="market-icon">N</div><div><div className="market-name">NIFTY 100 <span className="live-pill"><i />{customData ? "CSV" : "POLLING"}</span></div><div className="market-desc">{customData ? "Imported OHLC data · Daily timeframe" : "Yahoo Finance · Daily timeframe · May be delayed"}</div></div></div><div className="strip-divider" /><div className="metric"><span className="metric-label">STOCKS SCANNED</span><strong>{stocks.length || (loading ? "…" : "0")}</strong></div><div className="metric"><span className="metric-label">ACTIVE SETUPS</span><strong>{signals.length}</strong></div><div className="metric"><span className="metric-label">AVG. RISK / REWARD</span><strong>{averageRiskReward}</strong></div><div className="strip-note"><span className="pulse" />{error ? "Refresh failed" : "Updated"} <b>{refreshTime || "waiting…"}</b></div></section>

        {error && <div className="error-banner" role="alert">{error} <button className="text-button" onClick={restoreLiveData}>Retry</button></div>}
        {!error && loading && <div className="loading-banner">Connecting to live market data…</div>}
        <section className="toolbar"><div className="tabs" role="tablist" aria-label="Setup filter">{[["all", "All setups"], ["breakout", "Breakouts"], ["pullback", "Pullbacks"], ["inside", "Inside bar"]].map(([value, label]) => <button key={value} className={`tab ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{label} <span>{value === "all" ? signals.length : signals.filter((signal) => signal.type === value).length}</span></button>)}</div><div className="toolbar-controls"><label className="search-box"><span>⌕</span><input type="search" placeholder="Search stocks..." autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Sort results" value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">Top ranked</option><option value="rr">Best risk / reward</option><option value="symbol">Symbol A–Z</option></select></div></section>

        <section className="results-heading"><div><h2>{view === "watchlist" ? "Your watchlist" : "Today's opportunities"} <span className="results-count">{visibleSignals.length} {visibleSignals.length === 1 ? "stock" : "stocks"}</span></h2><p>Price-action signals with entry, invalidation, and target levels.</p></div><button className="text-button" onClick={customData ? restoreLiveData : refresh}>{customData ? "↺ Return to live data" : "↺ Refresh now"}</button></section>
        <section className="results-grid" aria-live="polite">{visibleSignals.map((stock) => <StockCard key={stock.symbol} stock={stock} favorite={favorites.has(stock.symbol)} onFavorite={toggleFavorite} onDetails={setSelectedStock} />)}</section>
        {!visibleSignals.length && <section className="empty-state"><div className="empty-icon">{error ? "!" : "⌕"}</div><h3>{error ? "Market data is unavailable" : loading ? "Loading market data" : "No matching setups"}</h3><p>{error ? "Start the Python API and retry. Data is never replaced with synthetic prices." : loading ? "The scanner will update when candles arrive." : "Try another filter or search term, or import a different OHLC CSV."}</p>{!error && !loading && <button className="text-button" onClick={clearFilters}>Clear filters</button>}</section>}
        <footer className="page-footer"><span><b>Pivot</b> · Built for thoughtful trading.</span><span>Educational research only. Signals are rule-based and may be incorrect. <a href="#methodology" onClick={(event) => { event.preventDefault(); setShowInfo(true); }}>How it works ↗</a></span></footer>
      </main>
      <DetailDialog stock={selectedStock} onClose={() => setSelectedStock(null)} />
      {showInfo && <InfoDialog onClose={() => setShowInfo(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
