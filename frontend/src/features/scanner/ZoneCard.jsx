import React from "react";
import { money, relativeTime } from "../../lib/format.js";
import { tradePlanFor, zonesFor, zonesMeetingFilters } from "./zones.js";
import PriceRange from "./PriceRange.jsx";

function ZoneRow({ title, zone, stock, onAlert, hasAlert, emptyText = "No nearby zone" }) {
  if (!zone) return <div className="zone-row zone-empty"><span>{title}</span><span>{emptyText}</span></div>;
  const isDemand = zone.type === "demand";
  return (
    <div className={`zone-row ${isDemand ? "demand-row" : "supply-row"}`}>
      <div className="zone-row-label">
        <span className="zone-kind">{title}</span>
        <span className="zone-pattern">{zone.pattern} · {zone.freshness}</span>
      </div>
      <div className="zone-row-price">{money(Math.min(zone.proximal, zone.distal))}–{money(Math.max(zone.proximal, zone.distal))}</div>
      <div className="zone-row-meta"><strong>{zone.score}/7</strong><span>{zone.tests} tests</span></div>
      {onAlert && <button className={`alert-toggle ${hasAlert ? "alert-active" : ""}`} title={hasAlert ? "Remove price alert" : "Alert when price enters this zone"} onClick={() => onAlert(stock, zone)}>{hasAlert ? "◉ Alert on" : "◉ Alert"}</button>}
    </div>
  );
}

export default function ZoneCard({ stock, timeframe, minScore, maxDistancePct, minRiskReward, zoneType, zoneFreshness, watched, onWatchlist, onChart, onAlert, hasAlert, navigate }) {
  const rawZones = zonesFor(stock, timeframe);
  const zones = zonesMeetingFilters(stock, timeframe, { minScore, maxDistancePct, minRiskReward, zoneType, freshness: zoneFreshness });
  const primaryZone = [zones.demand, zones.supply]
    .filter(Boolean)
    .sort((left, right) => {
      const leftDistance = tradePlanFor(stock, timeframe, left)?.entryDistancePct ?? Number.POSITIVE_INFINITY;
      const rightDistance = tradePlanFor(stock, timeframe, right)?.entryDistancePct ?? Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance || right.score - left.score;
    })[0];
  const primaryPlan = primaryZone ? tradePlanFor(stock, timeframe, primaryZone) : null;
  const showDemand = zoneType !== "supply";
  const showSupply = zoneType !== "demand";
  return (
    <article className="stock-card zone-card min-w-0">
      <div className="card-top">
        <div className="stock-identity">
          <div className="stock-avatar">{stock.symbol.slice(0, 2)}</div>
          <div><div className="stock-name">{stock.name}</div><div className="stock-symbol">{stock.symbol} · NSE</div></div>
        </div>
        <div className="card-actions">
          <button className={`watch-button ${watched ? "watch-active" : ""}`} title={watched ? "Remove from watchlist" : "Add to watchlist"} onClick={() => onWatchlist(stock.symbol)}>{watched ? "★" : "☆"}</button>
          <span className="score-badge">{primaryZone ? `${primaryZone.score}/7` : "No zone"}</span>
        </div>
      </div>
      <div className="price-row"><span className="last-price">{money(stock.price)}</span><span className={`price-change ${stock.change_pct < 0 ? "negative" : ""}`}>{stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%</span></div>
      <div className="freshness-row"><span className={`freshness-dot freshness-${stock.freshness.status.replace(/\s+/g, "-")}`} />{stock.freshness.status} · {relativeTime(stock.freshness.as_of)}<span className="freshness-candle">Daily candle {stock.latest_candle_date}</span></div>
      <PriceRange stock={stock} zone={primaryZone} plan={primaryPlan} />
      <div className="zones-section">
        <div className="zones-section-title"><span>{timeframe.toUpperCase()} ZONES</span><span>BODY → WICK</span></div>
        {showDemand && <ZoneRow title="Demand" zone={zones.demand} stock={stock} onAlert={onAlert} hasAlert={zones.demand ? hasAlert(stock, zones.demand) : false} emptyText={rawZones.demand ? "Does not meet active filters" : "No nearby zone"} />}
        {showSupply && <ZoneRow title="Supply" zone={zones.supply} stock={stock} onAlert={onAlert} hasAlert={zones.supply ? hasAlert(stock, zones.supply) : false} emptyText={rawZones.supply ? "Does not meet active filters" : "No nearby zone"} />}
      </div>
      <div className="card-foot"><span>Intraday quote · {stock.freshness.quote_source.replace("_", " ")}</span><div><button className="text-button" onClick={() => navigate(`/stocks/${encodeURIComponent(stock.symbol)}`)}>Stock details</button><button className="text-button" onClick={() => onChart(stock, timeframe, minScore)}>Full chart ↗</button></div></div>
    </article>
  );
}
