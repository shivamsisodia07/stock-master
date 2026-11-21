export const TIMEFRAMES = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
];

export const MIN_ZONE_SCORE = 5;

const ZONE_FIELDS = {
  daily: ["demand", "supply"],
  weekly: ["weekly_demand", "weekly_supply"],
  monthly: ["monthly_demand", "monthly_supply"],
  quarterly: ["quarterly_demand", "quarterly_supply"],
};

export function zonesFor(stock, timeframe) {
  const [demandField, supplyField] = ZONE_FIELDS[timeframe];
  return {
    demand: stock[demandField]?.score >= MIN_ZONE_SCORE ? stock[demandField] : null,
    supply: stock[supplyField]?.score >= MIN_ZONE_SCORE ? stock[supplyField] : null,
  };
}

export function tradePlanFor(stock, timeframe, zone) {
  const { demand, supply } = zonesFor(stock, timeframe);
  const isDemand = zone.type === "demand";
  const entry = zone.proximal;
  const stop = zone.distal;
  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0 || risk <= 0) return null;

  const direction = isDemand ? 1 : -1;
  const opposingZone = isDemand ? supply : demand;
  const opposingTarget = opposingZone?.proximal;
  const hasOpposingTarget = Number.isFinite(opposingTarget) && (opposingTarget - entry) * direction > 0;
  const target = hasOpposingTarget ? opposingTarget : entry + direction * risk * 2;
  const reward = (target - entry) * direction;
  const low = Math.min(stop, target);
  const high = Math.max(stop, target);
  const zoneLow = Math.min(entry, stop);
  const zoneHigh = Math.max(entry, stop);
  const isInsideZone = stock.price >= zoneLow && stock.price <= zoneHigh;

  return {
    entry,
    stop,
    target,
    riskReward: reward / risk,
    entryDistancePct: isInsideZone ? 0 : Math.abs(stock.price - entry) / entry * 100,
    currentPositionPct: ((stock.price - low) / (high - low || 1)) * 100,
    targetLabel: hasOpposingTarget ? "Opposing zone" : "2R target",
  };
}

export function zonesMeetingFilters(stock, timeframe, {
  minScore,
  maxDistancePct,
  minRiskReward,
  zoneType = "all",
  freshness = "fresh",
}) {
  const zones = zonesFor(stock, timeframe);
  const scoreThreshold = Math.max(MIN_ZONE_SCORE, minScore ?? MIN_ZONE_SCORE);
  return Object.fromEntries(["demand", "supply"].map((type) => {
    const zone = zones[type];
    if (!zone || (zoneType !== "all" && zoneType !== type) || zone.score < scoreThreshold) return [type, null];
    if (freshness !== "all" && zone.freshness !== freshness) return [type, null];
    const plan = tradePlanFor(stock, timeframe, zone);
    if (!plan || plan.entryDistancePct > maxDistancePct || plan.riskReward < minRiskReward) return [type, null];
    return [type, zone];
  }));
}
