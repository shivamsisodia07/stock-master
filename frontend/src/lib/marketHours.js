const NSE_OFFSET_MS = 330 * 60_000;
const MARKET_OPEN_MINUTE = 9 * 60 + 15;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;

export function nseClock(timestamp = Date.now()) {
  const localTime = new Date(timestamp + NSE_OFFSET_MS);
  return {
    date: `${localTime.getUTCFullYear()}-${String(localTime.getUTCMonth() + 1).padStart(2, "0")}-${String(localTime.getUTCDate()).padStart(2, "0")}`,
    weekday: localTime.getUTCDay(),
    minutes: localTime.getUTCHours() * 60 + localTime.getUTCMinutes(),
  };
}

export function isNseMarketActive(timestamp = Date.now()) {
  const { weekday, minutes } = nseClock(timestamp);
  return weekday > 0 && weekday < 6 && minutes >= MARKET_OPEN_MINUTE && minutes <= MARKET_CLOSE_MINUTE;
}

export function isNsePostMarketUpdateWindow(timestamp = Date.now()) {
  const { weekday, minutes } = nseClock(timestamp);
  return weekday > 0 && weekday < 6 && minutes > MARKET_CLOSE_MINUTE && minutes <= MARKET_CLOSE_MINUTE + 30;
}

export function millisecondsUntilNextNseOpen(timestamp = Date.now()) {
  const now = new Date(timestamp + NSE_OFFSET_MS);
  const nextOpen = new Date(now);
  nextOpen.setUTCHours(9, 15, 0, 0);
  while (nextOpen <= now || nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
    nextOpen.setUTCHours(9, 15, 0, 0);
  }
  return Math.max(1000, nextOpen.getTime() - now.getTime());
}
