import { useCallback } from "react";
import { usePersistentArray } from "../../lib/storage.js";

export default function useWatchlist() {
  const [symbols, setSymbols] = usePersistentArray("pivot-watchlist");
  const toggle = useCallback((symbol) => {
    setSymbols((current) => current.includes(symbol)
      ? current.filter((item) => item !== symbol)
      : [...current, symbol]);
  }, [setSymbols]);

  return { symbols, toggle, includes: (symbol) => symbols.includes(symbol) };
}
