import React, { useMemo, useState } from "react";
import useAlerts from "../alerts/useAlerts.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import { importCsv } from "../../lib/api.js";
import { relativeTime } from "../../lib/format.js";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import ZoneCard from "./ZoneCard.jsx";
import ZoneTable from "./ZoneTable.jsx";
import useMarketData from "./useMarketData.js";
import { TIMEFRAMES, tradePlanFor, zonesMeetingFilters } from "./zones.js";

const FILTERS = [["all", "Nearby zones"], ["demand", "Demand"], ["supply", "Supply"]];
const FRESHNESS_FILTERS = [
  ["all", "Any"],
  ["fresh", "Fresh"],
  ["tested once", "Tested once only"],
];
const SORT_OPTIONS = [
  ["score-distance", "Highest score → nearest entry"],
  ["distance-score", "Nearest entry → highest score"],
  ["reward-distance", "Highest reward/risk → nearest entry"],
  ["distance-reward", "Nearest entry → highest reward/risk"],
  ["symbol", "Symbol A–Z"],
];

function Methodology({ onClose }) {
  return (
    <div className="chart-modal-backdrop methodology-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-dialog methodology-dialog" role="dialog" aria-modal="true" aria-labelledby="methodology-title">
        <button className="dialog-close" aria-label="Close" onClick={onClose}>×</button>
        <div className="eyebrow"><span className="eyebrow-line" />ZONE SCANNER</div>
        <h2 id="methodology-title">How is this scan built?</h2>
        <p>Each candle is an exciting candle when its body is more than half of its range; otherwise it is a base. The detector marks DBR, RBR, RBD, DBD and direct no-base reversals using base bodies for the proximal line and the furthest base wick for the distal line.</p>
        <p>It ignores a still-forming latest candle, then removes broken zones, zones with two or more retests, zones with no close beyond the leg-in extreme within the first three leg-out candles, and every zone scoring below 5/7. Any later candle whose wick reaches across the proximal line counts immediately as a retest, even if its body does not enter the zone and there is no follow-through. Consecutive overlapping candles are one visit; price must leave the zone before a new crossing counts again. The original leg-out never counts as a test. Any close beyond the distal line breaks the zone. The score is freshness (3 when fresh, 1.5 when tested once), strength (2 for two exciting legs; one exciting leg plus a directional gap also scores 2; one exciting leg scores 1), and base length (2 for 1–3 candles, 1 for 4–5, 0 otherwise). A demand gap is when the leg-out low is above the previous candle high; a supply gap is when its high is below the previous candle low. Current pattern detection still requires both incoming and outgoing legs to be exciting.</p>
        <p>The scanner lists a stock when a zone on the selected timeframe meets the active entry-distance, reward/risk, score, and freshness filters. Entry distance is measured from the proximal line; the stop is the distal line. The target is the nearest opposing zone's proximal edge when available, otherwise a mechanical 2R target. The zone freshness filter shows either untested zones or zones tested once; quote freshness remains visible in tile view. Daily (2 years), weekly (10 years), and monthly (maximum available) candles come from Yahoo Finance; quarterly candles are aggregated from monthly history. CSV imports aggregate weekly, monthly, and quarterly candles from the supplied daily data.</p>
        <div className="info-callout">Yahoo Finance data can be delayed. Automated zones can miss context; this is educational research, not investment advice.</div>
      </section>
    </div>
  );
}

export default function ScannerPage({ navigate }) {
  const market = useMarketData();
  const [importedData, setImportedData] = useState(null);
  const [csvError, setCsvError] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);
  const watchlist = useWatchlist();
  const [filter, setFilter] = useState("all");
  const [timeframe, setTimeframe] = useState("monthly");
  const [resultsView, setResultsView] = useState("tiles");
  const [minScore, setMinScore] = useState(5);
  const [maxDistancePct, setMaxDistancePct] = useState(5);
  const [minRiskReward, setMinRiskReward] = useState(2);
  const [zoneFreshness, setZoneFreshness] = useState("fresh");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("score-distance");
  const [showMethodology, setShowMethodology] = useState(false);
  const stocks = importedData?.stocks ?? market.stocks;
  const updatedAt = importedData?.updated_at ?? market.updatedAt;
  const universe = importedData?.universe ?? market.universe;
  const failedBatches = importedData ? [] : market.failedBatches;
  const loading = !importedData && market.loading;
  const error = Boolean(csvError || (!importedData && market.error));
  const alerts = useAlerts(stocks, !importedData);

  const stocksWithTimeframeZones = stocks.filter((stock) => {
    const zones = zonesMeetingFilters(stock, timeframe, { minScore, maxDistancePct, minRiskReward, freshness: zoneFreshness });
    return zones.demand || zones.supply;
  });

  async function handleCsv(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setCsvLoading(true);
    setCsvError("");
    try {
      setImportedData(await importCsv(await file.text()));
      navigate("/scanner");
    } catch (requestError) {
      setCsvError(requestError.message || "Unable to import this OHLC CSV.");
    } finally {
      setCsvLoading(false);
      input.value = "";
    }
  }

  const visibleStocks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const getZones = (stock) => zonesMeetingFilters(stock, timeframe, {
      minScore,
      maxDistancePct,
      minRiskReward,
      zoneType: filter,
      freshness: zoneFreshness,
    });
    const candidates = stocks.map((stock) => {
      const zones = getZones(stock);
      const plans = [zones.demand, zones.supply]
        .filter(Boolean)
        .map((zone) => tradePlanFor(stock, timeframe, zone))
        .filter(Boolean);
      return {
        stock,
        score: Math.max(zones.demand?.score || 0, zones.supply?.score || 0),
        distance: plans.reduce((nearest, plan) => Math.min(nearest, plan.entryDistancePct), Number.POSITIVE_INFINITY),
        reward: plans.reduce((highest, plan) => Math.max(highest, plan.riskReward), 0),
      };
    }).filter(({ stock }) => {
      const zones = getZones(stock);
      if (!zones.demand && !zones.supply) return false;
      return !query || stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query);
    });
    const [primary, secondary] = sort === "symbol" ? ["symbol"] : sort.split("-");
    const compareBy = (left, right, criterion) => {
      if (criterion === "symbol") return left.stock.symbol.localeCompare(right.stock.symbol);
      if (criterion === "score") return right.score - left.score;
      if (criterion === "reward") return right.reward - left.reward;
      return left.distance - right.distance;
    };
    return candidates.sort((left, right) => compareBy(left, right, primary)
      || (secondary ? compareBy(left, right, secondary) : 0)
      || left.stock.symbol.localeCompare(right.stock.symbol)).map(({ stock }) => stock);
  }, [stocks, filter, timeframe, minScore, maxDistancePct, minRiskReward, zoneFreshness, search, sort]);

  const nearbyDemand = stocksWithTimeframeZones.filter((stock) => zonesMeetingFilters(stock, timeframe, { minScore, maxDistancePct, minRiskReward, freshness: zoneFreshness }).demand).length;
  const nearbySupply = stocksWithTimeframeZones.filter((stock) => zonesMeetingFilters(stock, timeframe, { minScore, maxDistancePct, minRiskReward, freshness: zoneFreshness }).supply).length;
  const freshnessSummary = stocks.length ? `${stocks.filter((stock) => ["fresh", "session close"].includes(stock.freshness.status)).length}/${stocks.length} fresh` : "Waiting for feed";

  return (
    <WorkspaceLayout view="scanner" navigate={navigate} scannerCount={nearbyDemand + nearbySupply} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={stocks}>
        <header className="topbar"><Breadcrumb navigate={navigate} current="Zone scanner" /><div className="top-actions"><div className="market-status"><i style={{ background: error ? "var(--red)" : "var(--green)" }} /><span>{error ? "DATA UNAVAILABLE" : importedData ? "CSV · STATIC" : "INTRADAY · YAHOO"}</span></div><button className="icon-button" aria-label="How the scan works" onClick={() => setShowMethodology(true)}>?</button><div className="date-label">{updatedAt ? new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</div></div></header>
        <section className="page-heading flex flex-col items-start gap-3 min-[561px]:flex-row min-[561px]:items-end min-[561px]:justify-between"><div><div className="eyebrow"><span className="eyebrow-line" />PRICE STRUCTURE · NSE</div><h1>Find zones that <span>matter.</span></h1><p className="page-subtitle">A consistent demand and supply scan across the Nifty 100 universe.</p></div><div className="heading-actions"><button className="text-button" onClick={() => setShowMethodology(true)}>How is this scan built?</button><input id="csv-import" type="file" accept=".csv,text/csv" hidden onChange={handleCsv} /><button className="text-button" disabled={csvLoading} onClick={() => document.getElementById("csv-import").click()}>{csvLoading ? "Importing…" : "↑ Import OHLC CSV"}</button><button className="primary-button" onClick={() => { if (importedData) { setImportedData(null); market.refresh(); } else market.refresh(); }}>{importedData ? "↻ Return to live data" : "↻ Refresh data"}</button></div></section>

        <section className="market-strip flex items-center max-[820px]:flex-wrap" aria-label="Market summary"><div className="market-main"><div className="market-icon">N</div><div><div className="market-name">{importedData ? "CSV DATA" : "NIFTY 100"} <span className="live-pill"><i />{stocks.length ? importedData ? "IMPORTED" : "SCANNED" : "CONNECTING"}</span></div><div className="market-desc">{importedData ? "Daily OHLC imported · Weekly/monthly aggregated" : `Intraday quote may be delayed · Universe: ${universe?.source || "NSE Indices"}`}</div></div></div><div className="strip-divider" /><div className="metric"><span className="metric-label">STOCKS LOADED</span><strong>{stocks.length || (loading ? "…" : "0")}</strong></div><div className="metric"><span className="metric-label">DEMAND ZONES</span><strong>{nearbyDemand}</strong></div><div className="metric"><span className="metric-label">SUPPLY ZONES</span><strong>{nearbySupply}</strong></div><div className="strip-note"><span className="pulse" />{freshnessSummary} <b>{updatedAt ? relativeTime(updatedAt) : ""}</b></div></section>

        {market.error && !importedData && !csvError && <div className="error-banner" role="alert">{market.error} <button className="text-button" onClick={market.refresh}>Retry</button></div>}
        {csvError && <div className="error-banner" role="alert">{csvError} <button className="text-button" onClick={() => setCsvError("")}>Dismiss</button></div>}
        {!error && universe?.source === "bundled fallback" && <div className="warning-banner" role="status">NSE Indices could not be reached. Using the bundled Nifty 100 fallback list.</div>}
        {!error && failedBatches.length > 0 && <div className="warning-banner" role="status">Some timeframe or quote batches failed ({failedBatches.length}); available data is shown with partial coverage.</div>}
        {!error && loading && <div className="loading-banner">Loading daily, weekly and monthly market structure…</div>}
            <section className="toolbar flex flex-col items-start min-[821px]:flex-row min-[821px]:items-center min-[821px]:justify-between">
              <div className="toolbar-filters">
                <div className="tabs timeframe-tabs" role="tablist" aria-label="Zone timeframe">{TIMEFRAMES.map(([value, label]) => <button key={value} role="tab" className={`tab ${timeframe === value ? "active" : ""}`} aria-selected={timeframe === value} onClick={() => setTimeframe(value)}>{label}</button>)}</div>
                <div className="tabs" role="tablist" aria-label="Zone type filter">{FILTERS.map(([value, label]) => <button key={value} role="tab" className={`tab ${filter === value ? "active" : ""}`} aria-selected={filter === value} onClick={() => setFilter(value)}>{label}<span>{value === "demand" ? nearbyDemand : value === "supply" ? nearbySupply : nearbyDemand + nearbySupply}</span></button>)}</div>
              </div>
              <div className="toolbar-controls">
                <label className="search-box"><span>⌕</span><input type="search" placeholder="Search stocks..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                <label className="filter-control">Max entry distance<select aria-label="Maximum distance from entry" value={Number.isFinite(maxDistancePct) ? maxDistancePct : "any"} onChange={(event) => setMaxDistancePct(event.target.value === "any" ? Number.POSITIVE_INFINITY : Number(event.target.value))}><option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option><option value="any">Any</option></select></label>
                <label className="filter-control">Min reward/risk<select aria-label="Minimum reward to risk ratio" value={minRiskReward} onChange={(event) => setMinRiskReward(Number(event.target.value))}><option value={0}>Any</option><option value={1}>1R+</option><option value={1.5}>1.5R+</option><option value={2}>2R+</option><option value={3}>3R+</option></select></label>
                <label className="filter-control">Min score<select aria-label="Minimum zone score" value={minScore} onChange={(event) => setMinScore(Number(event.target.value))}><option value={5}>5 / 7+</option><option value={5.5}>5.5 / 7+</option><option value={6}>6 / 7+</option><option value={6.5}>6.5 / 7+</option><option value={7}>7 / 7 only</option></select></label>
                <label className="filter-control">Zone freshness<select aria-label="Zone freshness" value={zoneFreshness} onChange={(event) => setZoneFreshness(event.target.value)}>{FRESHNESS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="filter-control">Sort results<select aria-label="Sort results" value={sort} onChange={(event) => setSort(event.target.value)}>{SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
            </section>
            <section className="results-heading">
              <div><h2>{filter === "demand" ? `${timeframe} demand zones` : filter === "supply" ? `${timeframe} supply zones` : `${timeframe} zone opportunities`} <span className="results-count">{visibleStocks.length} stocks</span></h2><p>Distance from entry · score {minScore}/7+ · {Number.isFinite(maxDistancePct) ? `max ${maxDistancePct}% entry distance` : "any entry distance"} · {minRiskReward ? `minimum reward/risk ${minRiskReward}R` : "any reward/risk"} · zone freshness {zoneFreshness === "all" ? "any" : zoneFreshness}.</p></div>
              <div className="results-heading-actions">
                <span className="results-count">{importedData ? "CSV imported" : "Quote refresh"} · {relativeTime(updatedAt)}</span>
                <div className="view-toggle" role="group" aria-label="Scanner results view">
                  <button type="button" className={resultsView === "table" ? "active" : ""} aria-pressed={resultsView === "table"} onClick={() => setResultsView("table")}>Table</button>
                  <button type="button" className={resultsView === "tiles" ? "active" : ""} aria-pressed={resultsView === "tiles"} onClick={() => setResultsView("tiles")}>Tiles</button>
                </div>
              </div>
            </section>
            {resultsView === "table" ? (
              <ZoneTable stocks={visibleStocks} timeframe={timeframe} filters={{ minScore, maxDistancePct, minRiskReward, zoneType: filter, freshness: zoneFreshness }} navigate={navigate} watched={watchlist.includes} onWatchlist={watchlist.toggle} onAlert={alerts.toggleRule} hasAlert={alerts.hasRule} />
            ) : (
              <section className="results-grid grid grid-cols-1 gap-3 min-[561px]:max-[1200px]:grid-cols-2 min-[1201px]:grid-cols-3" aria-live="polite">{visibleStocks.map((stock) => <ZoneCard key={stock.symbol} stock={stock} timeframe={timeframe} minScore={minScore} maxDistancePct={maxDistancePct} minRiskReward={minRiskReward} zoneType={filter} zoneFreshness={zoneFreshness} watched={watchlist.includes(stock.symbol)} onWatchlist={watchlist.toggle} onAlert={alerts.toggleRule} hasAlert={alerts.hasRule} navigate={navigate} />)}</section>
            )}
            {!visibleStocks.length && <section className="empty-state"><div className="empty-icon">⌕</div><h3>{loading ? "Loading market data" : "No nearby zones"}</h3><p>{loading ? "The scanner will update when candles arrive." : "Try relaxing the distance, reward/risk, or freshness filters. Zones are not replaced with demo data."}</p></section>}
      {showMethodology && <Methodology onClose={() => setShowMethodology(false)} />}
    </WorkspaceLayout>
  );
}
