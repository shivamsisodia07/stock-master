import React from "react";
import { money } from "../../lib/format.js";

export default function PriceRange({ stock, zone, plan, compact = false }) {
  if (!zone || !plan) return null;
  const isDemand = zone.type === "demand";
  const distal = zone.distal;
  const proximal = zone.proximal;
  const low = Math.min(distal, proximal);
  const high = Math.max(distal, proximal);
  const span = high - low;
  const padding = Math.max(span * 0.3, Math.abs(stock.price) * 0.005, 0.01);
  const axisLow = Math.min(low, stock.price) - padding;
  const axisHigh = Math.max(high, stock.price) + padding;
  const position = (price) => ((price - axisLow) / (axisHigh - axisLow || 1)) * 100;
  const zoneStart = position(low);
  const zoneEnd = position(high);
  const currentPosition = position(stock.price);
  const distalPosition = position(distal);
  const proximalPosition = position(proximal);
  const isInsideZone = stock.price >= low && stock.price <= high;
  const entryDistance = Math.abs(stock.price - proximal);

  return (
    <div className={`price-range zone-price-range ${isDemand ? "demand-range" : "supply-range"} ${compact ? "price-range-compact" : ""}`}>
      <div className="zone-range-head"><span className="zone-range-title">ZONE PRICE RANGE</span></div>
      <div className="zone-range-track" role="img" aria-label={`Zone price range ${money(low)} to ${money(high)}; current price ${money(stock.price)}.`}>
        <span className="zone-range-band" style={{ left: `${zoneStart}%`, width: `${zoneEnd - zoneStart}%` }} />
        <span className="zone-distal-marker" style={{ left: `${distalPosition}%` }} />
        <span className="zone-proximal-marker" style={{ left: `${proximalPosition}%` }} />
        <i className="zone-current-marker" style={{ left: `${currentPosition}%` }} title={`Current price ${money(stock.price)}`} />
      </div>
      <div className="zone-range-legend">
        <span><i className="distal-key" />DISTAL <b>{money(distal)}</b></span>
        <span><i className="proximal-key" />PROXIMAL <b>{money(proximal)}</b></span>
      </div>
      <div className="zone-range-metrics">
        <span className="current-price-value"><i />CURRENT PRICE <b>{money(stock.price)}</b></span>
        <span>ENTRY DISTANCE <b>{isInsideZone ? "Inside zone" : `${money(entryDistance)} · ${plan.entryDistancePct.toFixed(2)}%`}</b></span>
        {!compact && <span className="risk-reward-metric">RISK:REWARD <b>1:{plan.riskReward.toFixed(1)}</b></span>}
      </div>
    </div>
  );
}
