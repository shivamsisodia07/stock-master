import React, { useMemo, useState } from "react";
import LoadingIndicator from "../../components/LoadingIndicator.jsx";
import useAlerts from "../alerts/useAlerts.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import { relativeTime } from "../../lib/format.js";
import WorkspaceLayout, {
  Breadcrumb,
} from "../../components/WorkspaceLayout.jsx";
import ZoneCard from "./ZoneCard.jsx";
import ZoneTable from "./ZoneTable.jsx";
import useMarketData from "./useMarketData.js";
import { TIMEFRAMES, tradePlanFor, zonesMeetingFilters } from "./zones.js";

const FILTERS = [
  ["all", "Nearby zones"],
  ["demand", "Demand"],
  ["supply", "Supply"],
];
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
const ZONE_DISTANCE_FILTERS = [5, 10, 15, "any"];
const RISK_REWARD_FILTERS = [0, 1, 1.5, 2, 3, "any"];
const ZONE_SCORE_FILTERS = [5, 6, 7];

export default function ScannerPage({ navigate }) {
  const market = useMarketData();
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
  const stocks = market.stocks;
  const updatedAt = market.updatedAt;
  const universe = market.universe;
  const failedBatches = market.failedBatches;
  const loading = market.loading;
  const error = Boolean(market.error);
  const alerts = useAlerts(stocks, true);

  const stocksWithTimeframeZones = stocks.filter((stock) => {
    const zones = zonesMeetingFilters(stock, timeframe, {
      minScore,
      maxDistancePct,
      minRiskReward,
      freshness: zoneFreshness,
    });
    return zones.demand || zones.supply;
  });

  const visibleStocks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const getZones = (stock) =>
      zonesMeetingFilters(stock, timeframe, {
        minScore,
        maxDistancePct,
        minRiskReward,
        zoneType: filter,
        freshness: zoneFreshness,
      });
    const candidates = stocks
      .map((stock) => {
        const zones = getZones(stock);
        const plans = [zones.demand, zones.supply]
          .filter(Boolean)
          .map((zone) => tradePlanFor(stock, timeframe, zone))
          .filter(Boolean);
        return {
          stock,
          score: Math.max(zones.demand?.score || 0, zones.supply?.score || 0),
          distance: plans.reduce(
            (nearest, plan) => Math.min(nearest, plan.entryDistancePct),
            Number.POSITIVE_INFINITY,
          ),
          reward: plans.reduce(
            (highest, plan) => Math.max(highest, plan.riskReward),
            0,
          ),
        };
      })
      .filter(({ stock }) => {
        const zones = getZones(stock);
        if (!zones.demand && !zones.supply) return false;
        return (
          !query ||
          stock.symbol.toLowerCase().includes(query) ||
          stock.name.toLowerCase().includes(query)
        );
      });
    const [primary, secondary] =
      sort === "symbol" ? ["symbol"] : sort.split("-");
    const compareBy = (left, right, criterion) => {
      if (criterion === "symbol")
        return left.stock.symbol.localeCompare(right.stock.symbol);
      if (criterion === "score") return right.score - left.score;
      if (criterion === "reward") return right.reward - left.reward;
      return left.distance - right.distance;
    };
    return candidates
      .sort(
        (left, right) =>
          compareBy(left, right, primary) ||
          (secondary ? compareBy(left, right, secondary) : 0) ||
          left.stock.symbol.localeCompare(right.stock.symbol),
      )
      .map(({ stock }) => stock);
  }, [
    stocks,
    filter,
    timeframe,
    minScore,
    maxDistancePct,
    minRiskReward,
    zoneFreshness,
    search,
    sort,
  ]);

  const nearbyDemand = stocksWithTimeframeZones.filter(
    (stock) =>
      zonesMeetingFilters(stock, timeframe, {
        minScore,
        maxDistancePct,
        minRiskReward,
        freshness: zoneFreshness,
      }).demand,
  ).length;
  const nearbySupply = stocksWithTimeframeZones.filter(
    (stock) =>
      zonesMeetingFilters(stock, timeframe, {
        minScore,
        maxDistancePct,
        minRiskReward,
        freshness: zoneFreshness,
      }).supply,
  ).length;

  return (
    <WorkspaceLayout
      view="scanner"
      navigate={navigate}
      scannerCount={nearbyDemand + nearbySupply}
      watchlistCount={watchlist.symbols.length}
      alertCount={alerts.rules.length}
      stocks={stocks}
    >
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Zone scanner" />
      </header>
      <section className="page-heading flex flex-col items-start gap-3 min-[561px]:flex-row min-[561px]:items-end min-[561px]:justify-between">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            PRICE STRUCTURE · NSE
          </div>
          <h1>
            Find zones that <span>matter.</span>
          </h1>
          <p className="page-subtitle">
            A consistent demand and supply scan across the Nifty 100 universe.
          </p>
        </div>
      </section>

      {market.error && (
        <div className="error-banner" role="alert">
          {market.error}{" "}
          <button className="text-button" onClick={market.refresh}>
            Retry
          </button>
        </div>
      )}
      {!error && universe?.source === "bundled fallback" && (
        <div className="warning-banner" role="status">
          NSE Indices could not be reached. Using the bundled Nifty 100 fallback
          list.
        </div>
      )}
      {!error && failedBatches.length > 0 && (
        <div className="warning-banner" role="status">
          Some timeframe or quote batches failed ({failedBatches.length});
          available data is shown with partial coverage.
        </div>
      )}
      {!error && loading && (
        <div className="loading-banner">
          <LoadingIndicator label="Loading daily, weekly and monthly market structure…" />
        </div>
      )}
      <section className="toolbar flex flex-col items-start min-[821px]:flex-row min-[821px]:items-center min-[821px]:justify-between">
        <div className="toolbar-filters scanner-toolbar-filters">
          <div className="scanner-tab-row">
            <div className="tabs" role="tablist" aria-label="Zone type filter">
              {FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  className={`tab ${filter === value ? "active" : ""}`}
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <span>
                    {value === "demand"
                      ? nearbyDemand
                      : value === "supply"
                        ? nearbySupply
                        : nearbyDemand + nearbySupply}
                  </span>
                </button>
              ))}
            </div>
            <div
              className="tabs timeframe-tabs"
              role="tablist"
              aria-label="Zone timeframe"
            >
              {TIMEFRAMES.map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  className={`tab ${timeframe === value ? "active" : ""}`}
                  aria-selected={timeframe === value}
                  onClick={() => setTimeframe(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar-controls">
            <label className="search-box">
              <span>⌕</span>
              <input
                type="search"
                placeholder="Search stocks..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="filter-control">
              Max entry distance
              <select
                aria-label="Maximum distance from entry"
                value={Number.isFinite(maxDistancePct) ? maxDistancePct : "any"}
                onChange={(event) =>
                  setMaxDistancePct(
                    event.target.value === "any"
                      ? Number.POSITIVE_INFINITY
                      : Number(event.target.value),
                  )
                }
              >
                {ZONE_DISTANCE_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {value === "any" ? "Any" : `${value}%`}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              Min reward/risk
              <select
                aria-label="Minimum reward to risk ratio"
                value={minRiskReward}
                onChange={(event) =>
                  setMinRiskReward(Number(event.target.value))
                }
              >
                {RISK_REWARD_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {value === "any" ? "Any" : `${value}R+`}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              Min score
              <select
                aria-label="Minimum zone score"
                value={minScore}
                onChange={(event) => setMinScore(Number(event.target.value))}
              >
                {ZONE_SCORE_FILTERS.map((value) => (
                    <option key={value} value={value}>
                      {value === 7 ? "7 / 7 only" : `${value}/7 +`}
                    </option>
                  ))
                }
              </select>
            </label>
            <label className="filter-control">
              Zone freshness
              <select
                aria-label="Zone freshness"
                value={zoneFreshness}
                onChange={(event) => setZoneFreshness(event.target.value)}
              >
                {FRESHNESS_FILTERS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              Sort results
              <select
                aria-label="Sort results"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                {SORT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>
      <section className="results-heading">
        <div>
          <h2>
            {filter === "demand"
              ? `${timeframe} demand zones`
              : filter === "supply"
                ? `${timeframe} supply zones`
                : `${timeframe} zone opportunities`}{" "}
            <span className="results-count">{visibleStocks.length} stocks</span>
          </h2>
          <p>
            Distance from entry · score {minScore}/7+ ·{" "}
            {Number.isFinite(maxDistancePct)
              ? `max ${maxDistancePct}% entry distance`
              : "any entry distance"}{" "}
            ·{" "}
            {minRiskReward
              ? `minimum reward/risk ${minRiskReward}R`
              : "any reward/risk"}{" "}
            · zone freshness {zoneFreshness === "all" ? "any" : zoneFreshness}.
          </p>
        </div>
        <div className="results-heading-actions">
          <span className="results-count">
            Quote refresh · {relativeTime(updatedAt)}
          </span>
          <div
            className="view-toggle"
            role="group"
            aria-label="Scanner results view"
          >
            <button
              type="button"
              className={resultsView === "table" ? "active" : ""}
              aria-pressed={resultsView === "table"}
              onClick={() => setResultsView("table")}
            >
              Table
            </button>
            <button
              type="button"
              className={resultsView === "tiles" ? "active" : ""}
              aria-pressed={resultsView === "tiles"}
              onClick={() => setResultsView("tiles")}
            >
              Tiles
            </button>
          </div>
        </div>
      </section>
      {resultsView === "table" ? (
        <ZoneTable
          stocks={visibleStocks}
          timeframe={timeframe}
          filters={{
            minScore,
            maxDistancePct,
            minRiskReward,
            zoneType: filter,
            freshness: zoneFreshness,
          }}
          navigate={navigate}
          watched={watchlist.includes}
          onWatchlist={watchlist.toggle}
          onAlert={alerts.toggleRule}
          hasAlert={alerts.hasRule}
        />
      ) : (
        <section
          className="results-grid grid grid-cols-1 gap-3 min-[561px]:max-[1200px]:grid-cols-2 min-[1201px]:grid-cols-3"
          aria-live="polite"
        >
          {visibleStocks.map((stock) => (
            <ZoneCard
              key={stock.symbol}
              stock={stock}
              timeframe={timeframe}
              minScore={minScore}
              maxDistancePct={maxDistancePct}
              minRiskReward={minRiskReward}
              zoneType={filter}
              zoneFreshness={zoneFreshness}
              watched={watchlist.includes(stock.symbol)}
              onWatchlist={watchlist.toggle}
              onAlert={alerts.toggleRule}
              hasAlert={alerts.hasRule}
              navigate={navigate}
            />
          ))}
        </section>
      )}
      {!visibleStocks.length && (
        <section className="empty-state">
          <div className="empty-icon">⌕</div>
          <h3>
            {loading ? (
              <LoadingIndicator compact label="Loading market data" />
            ) : (
              "No nearby zones"
            )}
          </h3>
          <p>
            {loading
              ? "The scanner will update when candles arrive."
              : "Try relaxing the distance, reward/risk, or freshness filters. Zones are not replaced with demo data."}
          </p>
        </section>
      )}
    </WorkspaceLayout>
  );
}
