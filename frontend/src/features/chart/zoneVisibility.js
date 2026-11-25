const TIMEFRAME_RANK = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
};

export function isHiddenByHigherTimeframeZone(zone, timeframe, zonesByTimeframe, visibleTimeframes) {
  const timeframeRank = TIMEFRAME_RANK[timeframe];
  if (timeframeRank === undefined) return false;

  return visibleTimeframes.some((higherTimeframe) => {
    const higherTimeframeRank = TIMEFRAME_RANK[higherTimeframe];
    if (higherTimeframeRank === undefined || higherTimeframeRank <= timeframeRank) return false;

    return (zonesByTimeframe?.[higherTimeframe] || []).some((higherZone) => {
      if (higherZone.type !== zone.type) return false;
      if (zone.type === "demand") return zone.proximal < higherZone.distal;
      if (zone.type === "supply") return zone.proximal > higherZone.distal;
      return false;
    });
  });
}
