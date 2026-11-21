import React from "react";
import { money } from "../../lib/format.js";
import { appRoutePath } from "../../lib/useAppRouter.js";
import { tradePlanFor, zonesMeetingFilters } from "./zones.js";
import PriceRange from "./PriceRange.jsx";

export default function ZoneTable({ stocks, timeframe, filters, navigate, watched, onWatchlist, onAlert, hasAlert }) {
  const showDemand = filters.zoneType !== "supply";
  const showSupply = filters.zoneType !== "demand";
  return (
    <div className="zone-table-wrap" aria-live="polite">
      <table className="zone-table">
        <thead>
          <tr><th>Stock</th><th>Price</th><th>Price location</th>{showDemand && <th>Demand zone</th>}{showSupply && <th>Supply zone</th>}<th>Change</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const zones = zonesMeetingFilters(stock, timeframe, filters);
            const primaryZone = [zones.demand, zones.supply].filter(Boolean).sort((left, right) => {
              const leftDistance = tradePlanFor(stock, timeframe, left)?.entryDistancePct ?? Number.POSITIVE_INFINITY;
              const rightDistance = tradePlanFor(stock, timeframe, right)?.entryDistancePct ?? Number.POSITIVE_INFINITY;
              return leftDistance - rightDistance || right.score - left.score;
            })[0];
            const primaryPlan = primaryZone ? tradePlanFor(stock, timeframe, primaryZone) : null;
            const zoneLabel = (zone) => zone ? `${money(Math.min(zone.proximal, zone.distal))}–${money(Math.max(zone.proximal, zone.distal))}` : "—";
            return (
              <tr key={stock.symbol}>
                <td><button className="stock-table-link" onClick={() => navigate(`/stocks/${encodeURIComponent(stock.symbol)}`)}><strong>{stock.symbol}</strong><small>{stock.name}</small></button></td>
                <td className="table-price">{money(stock.price)}</td>
                <td className="table-price-location"><PriceRange stock={stock} zone={primaryZone} plan={primaryPlan} compact /></td>
                {showDemand && <td><span className="table-zone demand-table-zone">{zoneLabel(zones.demand)}</span>{zones.demand && <><small className="table-zone-score">{zones.demand.score}/7</small><button className={`table-alert ${hasAlert(stock, zones.demand) ? "alert-active" : ""}`} onClick={() => onAlert(stock, zones.demand)}>{hasAlert(stock, zones.demand) ? "Alert on" : "Alert"}</button></>}</td>}
                {showSupply && <td><span className="table-zone supply-table-zone">{zoneLabel(zones.supply)}</span>{zones.supply && <><small className="table-zone-score">{zones.supply.score}/7</small><button className={`table-alert ${hasAlert(stock, zones.supply) ? "alert-active" : ""}`} onClick={() => onAlert(stock, zones.supply)}>{hasAlert(stock, zones.supply) ? "Alert on" : "Alert"}</button></>}</td>}
                <td className={stock.change_pct < 0 ? "table-change negative" : "table-change"}>{stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}%</td>
                <td><div className="table-actions">
                  <button className={`watch-button ${watched(stock.symbol) ? "watch-active" : ""}`} title={watched(stock.symbol) ? "Remove from watchlist" : "Add to watchlist"} onClick={() => onWatchlist(stock.symbol)}>{watched(stock.symbol) ? "★" : "☆"}</button>
                  <a className="text-button chart-new-tab-link" href={appRoutePath(`/charts/${encodeURIComponent(stock.symbol)}/${timeframe}`)} target="_blank" rel="noreferrer">Chart ↗</a>
                  <button className="text-button" onClick={() => navigate(`/stocks/${encodeURIComponent(stock.symbol)}`)}>Details</button>
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
