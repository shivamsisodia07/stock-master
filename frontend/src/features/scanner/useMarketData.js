import { useSyncExternalStore } from "react";
import { getMarketData } from "../../lib/api.js";
import { isNseMarketActive, millisecondsUntilNextNseOpen, nseClock } from "../../lib/marketHours.js";

const CACHE_KEY = "swingTrader-market-data-v1";
const MARKET_OPEN_POLL_INTERVAL = 5 * 60_000;
const MARKET_OPEN_MINUTE = 9 * 60 + 15;

function readCache() {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (
      !cached
      || !Number.isFinite(cached.savedAt)
      || !Array.isArray(cached.payload?.stocks)
      || typeof cached.payload?.updated_at !== "string"
    ) {
      return null;
    }
    return cached;
  } catch (error) {
    console.warn("Unable to read cached market data.", error);
    return null;
  }
}

const savedCache = readCache();

function snapshotFromPayload(payload) {
  return {
    stocks: payload.stocks,
    updatedAt: payload.updated_at,
    universe: payload.universe,
    failedBatches: payload.failed_batches || [],
    marketStatus: payload.market_status || "closed",
    error: "",
    loading: false,
  };
}

let marketSnapshot = savedCache
  ? snapshotFromPayload(savedCache.payload)
  : {
    stocks: [],
    updatedAt: null,
    universe: null,
    failedBatches: [],
    marketStatus: null,
    error: "",
    loading: true,
  };
let lastFetchedAt = savedCache?.savedAt || 0;
let activeRequest = null;
let pollTimer = null;
const subscribers = new Set();

function publish(snapshot) {
  marketSnapshot = snapshot;
  for (const subscriber of subscribers) subscriber();
}

function shouldRefreshOnSubscribe() {
  if (!lastFetchedAt || !marketSnapshot.updatedAt) return true;
  if (!isNseMarketActive()) return false;

  if (marketSnapshot.marketStatus === "closed") {
    const now = nseClock();
    const lastFetch = nseClock(lastFetchedAt);
    return lastFetch.date !== now.date || lastFetch.minutes < MARKET_OPEN_MINUTE;
  }
  return Date.now() - lastFetchedAt >= MARKET_OPEN_POLL_INTERVAL;
}

function scheduleNextRefresh() {
  if (!subscribers.size || typeof window === "undefined") return;
  window.clearTimeout(pollTimer);
  const delay = isNseMarketActive()
    && (marketSnapshot.marketStatus !== "closed" || marketSnapshot.error)
    ? MARKET_OPEN_POLL_INTERVAL
    : millisecondsUntilNextNseOpen();
  pollTimer = window.setTimeout(async () => {
    await refreshMarketData();
    scheduleNextRefresh();
  }, delay);
}

function refreshMarketData() {
  if (activeRequest) return activeRequest;

  publish({ ...marketSnapshot, loading: !marketSnapshot.stocks.length, error: "" });
  activeRequest = getMarketData()
    .then((payload) => {
      lastFetchedAt = Date.now();
      publish(snapshotFromPayload(payload));
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({
          savedAt: lastFetchedAt,
          payload,
        }));
      } catch (error) {
        console.warn("Unable to cache market data in this browser.", error);
      }
    })
    .catch((error) => {
      console.warn("Unable to refresh market data.", error);
      publish({
        ...marketSnapshot,
        error: error.message || "Unable to load market data. Check that the Python API is running.",
        loading: false,
      });
    })
    .finally(() => {
      activeRequest = null;
      scheduleNextRefresh();
    });
  return activeRequest;
}

function subscribe(subscriber) {
  subscribers.add(subscriber);
  if (subscribers.size === 1) {
    if (shouldRefreshOnSubscribe()) void refreshMarketData();
    scheduleNextRefresh();
  }
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size && typeof window !== "undefined") {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  };
}

function getSnapshot() {
  return marketSnapshot;
}

export default function useMarketData() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snapshot, refresh: refreshMarketData };
}
