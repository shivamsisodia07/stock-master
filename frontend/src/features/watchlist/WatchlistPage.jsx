import React, { useMemo, useState } from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import LoadingIndicator from "../../components/LoadingIndicator.jsx";
import useAlerts from "../alerts/useAlerts.js";
import useMarketData from "../scanner/useMarketData.js";
import ZoneCard from "../scanner/ZoneCard.jsx";
import { tradePlanFor, TIMEFRAMES, zonesMeetingFilters } from "../scanner/zones.js";
import useWatchlist from "./useWatchlist.js";
import { relativeTime } from "../../lib/format.js";

const ZONE_TYPES = [["all", "All zones"], ["demand", "Demand"], ["supply", "Supply"]];

export default function WatchlistPage({ navigate }) {
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);
  const [filter, setFilter] = useState("all");
  const [timeframe, setTimeframe] = useState("monthly");
  const [minScore, setMinScore] = useState(5);
  const [maxDistancePct, setMaxDistancePct] = useState(3);
  const [minRiskReward, setMinRiskReward] = useState(2);
  const [search, setSearch] = useState("");
  const stocks = market.stocks;

  const trackedStocks = useMemo(
    () => stocks.filter((stock) => watchlist.includes(stock.symbol)),
    [stocks, watchlist.symbols],
  );
  const visibleStocks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return trackedStocks.filter((stock) => {
      if (query && !stock.symbol.toLowerCase().includes(query) && !stock.name.toLowerCase().includes(query)) return false;
      const zones = zonesMeetingFilters(stock, timeframe, { minScore, maxDistancePct, minRiskReward, zoneType: filter });
      return zones.demand || zones.supply;
    }).sort((left, right) => {
      const leftZones = zonesMeetingFilters(left, timeframe, { minScore, maxDistancePct, minRiskReward, zoneType: filter });
      const rightZones = zonesMeetingFilters(right, timeframe, { minScore, maxDistancePct, minRiskReward, zoneType: filter });
      const distance = (stock, zones) => [zones.demand, zones.supply]
        .filter(Boolean)
        .reduce((nearest, zone) => Math.min(nearest, tradePlanFor(stock, timeframe, zone)?.entryDistancePct ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
      return distance(left, leftZones) - distance(right, rightZones);
    });
  }, [trackedStocks, search, timeframe, minScore, maxDistancePct, minRiskReward, filter]);

  const matchingCount = visibleStocks.length;
  const freshCount = trackedStocks.filter((stock) => ["fresh", "session close"].includes(stock.freshness.status)).length;

  return (
    <WorkspaceLayout view="watchlist" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={stocks}>
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Watchlist" />
        <div className="top-actions">
          <div className="market-status"><i style={{ background: market.error ? "var(--red)" : "var(--green)" }} /><span>{market.error ? "FEED UNAVAILABLE" : "SAVED STOCKS"}</span></div>
          <div className="date-label">{market.updatedAt ? relativeTime(market.updatedAt) : market.loading ? <LoadingIndicator compact label="Waiting for quotes" /> : "No quotes yet"}</div>
        </div>
      </header>

      <section className="page-heading watchlist-page-heading flex flex-col items-start gap-3 min-[561px]:flex-row min-[561px]:items-end min-[561px]:justify-between">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />YOUR MARKET SHORTLIST</div>
          <h1>Your watchlist<span>.</span></h1>
          <p className="page-subtitle">A focused view of the stocks you chose to follow.</p>
        </div>
        <button className="primary-button" onClick={() => navigate("/scanner")}>Explore the scanner</button>
      </section>

      <section className="watchlist-overview grid grid-cols-2 gap-2 min-[561px]:grid-cols-3 min-[561px]:gap-3" aria-label="Watchlist summary">
        <article className="watchlist-stat"><span>SAVED STOCKS</span><strong>{watchlist.symbols.length}</strong><small>Kept on this device</small></article>
        <article className="watchlist-stat"><span>IN MARKET DATA</span><strong>{market.loading ? <LoadingIndicator compact label="Loading…" /> : trackedStocks.length}</strong><small>Current Nifty 100 coverage</small></article>
        <article className="watchlist-stat"><span>FRESH QUOTES</span><strong>{market.loading ? <LoadingIndicator compact label="Loading…" /> : `${freshCount}/${trackedStocks.length}`}</strong><small>Latest status from the feed</small></article>
      </section>

      {market.error && <div className="error-banner" role="alert">{market.error} <button className="text-button" onClick={market.refresh}>Retry</button></div>}
      {market.loading && <div className="loading-banner"><LoadingIndicator label="Loading your saved stocks…" /></div>}

      <section className="watchlist-controls" aria-label="Watchlist filters">
        <div className="tabs timeframe-tabs" role="tablist" aria-label="Watchlist timeframe">
          {TIMEFRAMES.map(([value, label]) => <button key={value} role="tab" className={`tab ${timeframe === value ? "active" : ""}`} aria-selected={timeframe === value} onClick={() => setTimeframe(value)}>{label}</button>)}
        </div>
        <div className="tabs" role="tablist" aria-label="Watchlist zone type">
          {ZONE_TYPES.map(([value, label]) => <button key={value} role="tab" className={`tab ${filter === value ? "active" : ""}`} aria-selected={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <label className="search-box"><span>⌕</span><input type="search" aria-label="Search watchlist" placeholder="Search saved stocks..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="filter-control">Max entry distance<select aria-label="Maximum distance from entry" value={Number.isFinite(maxDistancePct) ? maxDistancePct : "any"} onChange={(event) => setMaxDistancePct(event.target.value === "any" ? Number.POSITIVE_INFINITY : Number(event.target.value))}><option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option><option value="any">Any</option></select></label>
        <label className="filter-control">Min score<select aria-label="Minimum zone score" value={minScore} onChange={(event) => setMinScore(Number(event.target.value))}><option value={5}>5 / 7+</option><option value={5.5}>5.5 / 7+</option><option value={6}>6 / 7+</option><option value={6.5}>6.5 / 7+</option><option value={7}>7 / 7 only</option></select></label>
        <label className="filter-control">Min reward/risk<select aria-label="Minimum reward to risk ratio" value={minRiskReward} onChange={(event) => setMinRiskReward(Number(event.target.value))}><option value={0}>Any</option><option value={1}>1R+</option><option value={1.5}>1.5R+</option><option value={2}>2R+</option><option value={3}>3R+</option></select></label>
      </section>

      <section className="watchlist-results-heading">
        <div><h2>Saved opportunities <span className="results-count">{matchingCount} stocks</span></h2><p>Filtered by {timeframe} zones · {Number.isFinite(maxDistancePct) ? `entry distance up to ${maxDistancePct}%` : "any entry distance"} · score {minScore}/7 or higher.</p></div>
        <span className="results-count">{market.updatedAt ? `Updated ${relativeTime(market.updatedAt)}` : "Waiting for market data"}</span>
      </section>

      <section className="results-grid grid grid-cols-1 gap-3 min-[561px]:max-[1200px]:grid-cols-2 min-[1201px]:grid-cols-3" aria-live="polite">
        {visibleStocks.map((stock) => (
          <ZoneCard
            key={stock.symbol}
            stock={stock}
            timeframe={timeframe}
            minScore={minScore}
            maxDistancePct={maxDistancePct}
            minRiskReward={minRiskReward}
            zoneType={filter}
            watched={watchlist.includes(stock.symbol)}
            onWatchlist={watchlist.toggle}
            onAlert={alerts.toggleRule}
            hasAlert={alerts.hasRule}
            navigate={navigate}
          />
        ))}
      </section>

      {!visibleStocks.length && !market.loading && (
        <section className="empty-state">
          <div className="empty-icon">☆</div>
          <h3>{!watchlist.symbols.length ? "Your watchlist is empty" : !trackedStocks.length ? "No saved stocks in current market coverage" : "No saved stocks match these filters"}</h3>
          <p>{!watchlist.symbols.length ? "Use the star button on a scanner card to save stocks here." : !trackedStocks.length ? "Saved symbols remain on this device; the current market feed does not include them." : "Adjust the timeframe, score, or reward/risk filters to see more results."}</p>
        </section>
      )}

    </WorkspaceLayout>
  );
}
