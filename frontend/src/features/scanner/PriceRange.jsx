import React from "react";
import { money } from "../../lib/format.js";

export default function PriceRange({ stock, zone, plan, compact = false }) {
  if (!zone || !plan) return null;
  const isDemand = zone.type === "demand";
  const low = Math.min(plan.stop, plan.target);
  const high = Math.max(plan.stop, plan.target);
  const currentPosition = Math.max(0, Math.min(100, plan.currentPositionPct));
  const entryPosition = Math.max(0, Math.min(100, ((plan.entry - low) / (high - low || 1)) * 100));
  const location = stock.price < low ? "Below target range" : stock.price > high ? "Above target range" : "In stop-to-target range";
  const targetLabel = plan.targetLabel === "Opposing zone" ? "ZONE TARGET" : "2R TARGET";
  const leftLabel = isDemand ? "STOP" : targetLabel;
  const rightLabel = isDemand ? targetLabel : "STOP";

  return (
    <div className={`price-range ${isDemand ? "demand-range" : "supply-range"} ${compact ? "price-range-compact" : ""}`}>
      <div className="range-head"><span>{compact ? "PRICE LOCATION" : `PRICE LOCATION · ${location}`}</span><strong>{Math.round(plan.currentPositionPct)}%</strong></div>
      <div className="range-track" aria-label={`Current price ${money(stock.price)}; entry ${money(plan.entry)}`}>
        <span className="range-entry-marker" style={{ left: `${entryPosition}%` }} title={`Entry ${money(plan.entry)}`} />
        <i className="range-current-marker" style={{ left: `${currentPosition}%` }} title={`Current ${money(stock.price)}`} />
      </div>
      <div className="range-labels">
        <span>{compact ? money(low) : `${leftLabel} ${money(low)}`}</span>
        <span>{compact ? money(high) : `${rightLabel} ${money(high)}`}</span>
      </div>
      {!compact && <div className="range-metrics"><span>CURRENT {money(stock.price)}</span><span>ENTRY DISTANCE {plan.entryDistancePct.toFixed(2)}%</span><strong>RISK:REWARD 1:{plan.riskReward.toFixed(1)}</strong></div>}
    </div>
  );
}
