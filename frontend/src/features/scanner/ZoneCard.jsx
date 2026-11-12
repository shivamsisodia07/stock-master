import React from "react";
import { money, relativeTime } from "../../lib/format.js";
import { TIMEFRAMES, tradePlanFor, zonesFor, zonesMeetingFilters } from "./zones.js";

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

function PriceRange({ stock, timeframe, zone, plan }) {
  if (!zone || !plan) return null;
  const isDemand = zone.type === "demand";
  const low = Math.min(plan.stop, plan.target);
  const high = Math.max(plan.stop, plan.target);
  const position = plan.currentPositionPct;
  const currentPosition = Math.max(0, Math.min(100, position));
  const entryPosition = Math.max(0, Math.min(100, ((plan.entry - low) / (high - low || 1)) * 100));
  const location = stock.price < low ? "Below target range" : stock.price > high ? "Above target range" : "In stop-to-target range";
  const targetLabel = plan.targetLabel === "Opposing zone" ? "ZONE TARGET" : "2R TARGET";
  const leftLabel = isDemand ? "STOP" : targetLabel;
  const rightLabel = isDemand ? targetLabel : "STOP";
  return (
    <div className={`price-range ${isDemand ? "demand-range" : "supply-range"}`}>
      <div className="range-head"><span>PRICE LOCATION · {location}</span><strong>{Math.round(position)}%</strong></div>
      <div className="range-track" aria-label={`Current price ${money(stock.price)}; entry ${money(plan.entry)}`}>
        <span className="range-entry-marker" style={{ left: `${entryPosition}%` }} title={`Entry ${money(plan.entry)}`} />
        <i className="range-current-marker" style={{ left: `${currentPosition}%` }} title={`Current ${money(stock.price)}`} />
      </div>
      <div className="range-labels"><span>{leftLabel} {money(low)}</span><span>{rightLabel} {money(high)}</span></div>
      <div className="range-metrics"><span>CURRENT {money(stock.price)}</span><span>ENTRY DISTANCE {plan.entryDistancePct.toFixed(2)}%</span><strong>RISK:REWARD 1:{plan.riskReward.toFixed(1)}</strong></div>
    </div>
  );
}

export default function ZoneCard({ stock, timeframe, minScore, maxDistancePct, minRiskReward, zoneType, zoneFreshness, watched, onWatchlist, onChart, onAlert, hasAlert }) {
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
  const contextTimeframes = TIMEFRAMES.filter(([value]) => value !== timeframe);
  return (
    <article className="stock-card zone-card">
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
      <PriceRange stock={stock} timeframe={timeframe} zone={primaryZone} plan={primaryPlan} />
      <div className="zones-section">
        <div className="zones-section-title"><span>{timeframe.toUpperCase()} ZONES</span><span>BODY → WICK</span></div>
        <ZoneRow title="Demand" zone={zones.demand} stock={stock} onAlert={onAlert} hasAlert={zones.demand ? hasAlert(stock, zones.demand) : false} emptyText={rawZones.demand ? "Does not meet active filters" : "No nearby zone"} />
        <ZoneRow title="Supply" zone={zones.supply} stock={stock} onAlert={onAlert} hasAlert={zones.supply ? hasAlert(stock, zones.supply) : false} emptyText={rawZones.supply ? "Does not meet active filters" : "No nearby zone"} />
        <div className="zones-section-title timeframe-zones-title"><span>OTHER TIMEFRAME CONTEXT</span><span>{contextTimeframes.map(([, label]) => label.toUpperCase()).join(" / ")}</span></div>
        <div className="timeframe-grid">
          {contextTimeframes.flatMap(([value, label]) => {
            const contextZones = zonesFor(stock, value);
            return [
              <ZoneRow key={`${value}-demand`} title={`${label} demand`} zone={contextZones.demand} />,
              <ZoneRow key={`${value}-supply`} title={`${label} supply`} zone={contextZones.supply} />,
            ];
          })}
        </div>
      </div>
      <div className="card-foot"><span>Intraday quote · {stock.freshness.quote_source.replace("_", " ")}</span><button className="text-button" onClick={() => onChart(stock, timeframe, minScore)}>Full chart ↗</button></div>
    </article>
  );
}
