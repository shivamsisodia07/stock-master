import React from "react";
import { money } from "../../lib/format.js";
import { appRoutePath } from "../../lib/useAppRouter.js";
import { tradePlanFor, zonesMeetingFilters } from "./zones.js";
import PriceRange from "./PriceRange.jsx";

const SCORE_COMPONENTS = [
  ["freshness", "Freshness", (points) => points === 3 ? "Untested" : "Tested once"],
  ["strength", "Leg strength", (points) => points === 2 ? "Two strong legs or gap" : points === 1 ? "One strong leg" : "No strong legs"],
  ["base_candles", "Base length", (points) => points === 2 ? "1–3 candles" : points === 1 ? "4–5 candles" : "No base or 6+ candles"],
];

export default function ZoneCard({ stock, timeframe, minScore, maxDistancePct, minRiskReward, zoneType, zoneFreshness, watched, onWatchlist, onAlert, hasAlert, navigate }) {
  const zones = zonesMeetingFilters(stock, timeframe, { minScore, maxDistancePct, minRiskReward, zoneType, freshness: zoneFreshness });
  const primaryZone = [zones.demand, zones.supply]
    .filter(Boolean)
    .sort((left, right) => {
      const leftDistance = tradePlanFor(stock, timeframe, left)?.entryDistancePct ?? Number.POSITIVE_INFINITY;
      const rightDistance = tradePlanFor(stock, timeframe, right)?.entryDistancePct ?? Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || right.score - left.score;
    })[0];
  const primaryPlan = primaryZone ? tradePlanFor(stock, timeframe, primaryZone) : null;
  const scoreBreakdown = primaryZone?.score_breakdown;
  const isDemand = primaryZone?.type === "demand";
  return (
    <article className={`stock-card zone-card min-w-0 ${primaryZone ? (isDemand ? "demand-card" : "supply-card") : ""}`}>
      <div className="card-top">
        <div className="stock-identity" onClick={() => navigate(`/stocks/${encodeURIComponent(stock.symbol)}`)}>
          <div className="stock-title"><div className="stock-name">{stock.name}</div><div className="stock-symbol">{stock.symbol} · NSE</div></div>
        </div>
        <div className="card-actions">
          <button className={`watch-button ${watched ? "watch-active" : ""}`} title={watched ? "Remove from watchlist" : "Add to watchlist"} onClick={() => onWatchlist(stock.symbol)}>{watched ? "★" : "☆"}</button>
          <a className="text-button full-chart-button chart-new-tab-link" href={appRoutePath(`/charts/${encodeURIComponent(stock.symbol)}/${timeframe}`)} target="_blank" rel="noreferrer">Full chart ↗</a>
          <span className="score-badge">{primaryZone ? `${primaryZone.score}/7` : "No zone"}</span>
        </div>
      </div>
      <div className="price-row"><span className="last-price">{money(stock.price)}</span><span className={`price-change ${stock.change_pct < 0 ? "negative" : ""}`}>{stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%</span></div>
      {primaryZone && <div className="zone-highlights">
        <span className={`zone-type-pill ${isDemand ? "demand-pill" : "supply-pill"}`}>{primaryZone.type} zone</span>
        <span className="zone-pattern-pill">{primaryZone.pattern}</span>
        <span className={`zone-freshness-pill ${primaryZone.freshness === "fresh" ? "fresh-pill" : "tested-pill"}`}>{primaryZone.freshness}</span>
      </div>}
      <PriceRange stock={stock} zone={primaryZone} plan={primaryPlan} />
      <div className="zone-card-alerts" aria-label="Zone alerts">
        <span>ZONE ALERTS</span>
        {[zones.demand, zones.supply].filter(Boolean).map((zone) => {
          const active = hasAlert(stock, zone);
          return <button className={`table-alert ${active ? "alert-active" : ""}`} type="button" key={zone.id || zone.type} aria-pressed={active} aria-label={`${active ? "Remove" : "Add"} ${zone.type} alert for ${stock.symbol}`} onClick={() => onAlert(stock, zone)}>{active ? `${zone.type} alert on` : `Alert ${zone.type}`}</button>;
        })}
      </div>
      {primaryZone && <details className="zone-more-info">
        <summary>More info</summary>
        <section className="score-reasons" aria-label="Score breakdown">
          <div className="score-reasons-title">Why this score <span>{primaryZone.score}/7</span></div>
          {scoreBreakdown ? <div className="score-reasons-list">{SCORE_COMPONENTS.map(([key, label, describe]) => {
            const points = scoreBreakdown[key];
            return Number.isFinite(points) ? <span className="score-reason" key={key} title={describe(points)}><b>+{points}</b>{label}<small>{describe(points)}</small></span> : null;
          })}</div> : <p className="score-reasons-unavailable">Score details unavailable</p>}
        </section>
      </details>}
    </article>
  );
}
