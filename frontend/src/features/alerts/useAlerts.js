import { useCallback, useEffect, useRef } from "react";
import { usePersistentArray } from "../../lib/storage.js";

function isInsideZone(price, zone) {
  if (!zone) return false;
  return price >= Math.min(zone.proximal, zone.distal) && price <= Math.max(zone.proximal, zone.distal);
}

function alertId(stock, zone) {
  return `${stock.symbol}:${zone.timeframe}:${zone.type}:${zone.formed_at}`;
}

export default function useAlerts(stocks, enabled = true) {
  const [rules, setRules] = usePersistentArray("pivot-zone-alerts");
  const [history, setHistory] = usePersistentArray("pivot-alert-history");
  const previousPrices = useRef(new Map());

  const toggleRule = useCallback((stock, zone) => {
    const id = alertId(stock, zone);
    setRules((current) => current.some((rule) => rule.id === id)
      ? current.filter((rule) => rule.id !== id)
      : [...current, {
        id,
        symbol: stock.symbol,
        name: stock.name,
        timeframe: zone.timeframe,
        type: zone.type,
        proximal: zone.proximal,
        distal: zone.distal,
        formed_at: zone.formed_at,
        created_at: new Date().toISOString(),
      }]);
  }, [setRules]);

  const removeRule = useCallback((id) => {
    setRules((current) => current.filter((rule) => rule.id !== id));
  }, [setRules]);

  const clearHistory = useCallback(() => setHistory([]), [setHistory]);

  const enableNotifications = useCallback(async () => {
    if (!("Notification" in window)) return "unsupported";
    return Notification.requestPermission();
  }, []);

  useEffect(() => {
    if (!enabled) {
      previousPrices.current.clear();
      return;
    }
    if (!stocks.length) return;
    const stockBySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const newEvents = [];
    for (const rule of rules) {
      const stock = stockBySymbol.get(rule.symbol);
      if (!stock) continue;
      const price = stock.price;
      const previous = previousPrices.current.get(rule.symbol);
      if (previous !== undefined && !isInsideZone(previous, rule) && isInsideZone(price, rule)) {
        const event = {
          ...rule,
          price,
          triggered_at: new Date().toISOString(),
        };
        newEvents.push(event);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`${stock.symbol} entered ${rule.type} zone`, {
            body: `Price ${price.toFixed(2)} · Zone ${Math.min(rule.distal, rule.proximal).toFixed(2)}–${Math.max(rule.distal, rule.proximal).toFixed(2)}`,
          });
        }
      }
    }
    for (const stock of stocks) previousPrices.current.set(stock.symbol, stock.price);
    if (newEvents.length) setHistory((current) => [...newEvents, ...current].slice(0, 100));
  }, [stocks, rules, setHistory, enabled]);

  return {
    rules,
    history,
    toggleRule,
    removeRule,
    clearHistory,
    enableNotifications,
    hasRule: (stock, zone) => rules.some((rule) => rule.id === alertId(stock, zone)),
  };
}

