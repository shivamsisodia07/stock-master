import React, { useEffect, useRef } from "react";

const WIDGETS = {
  technical: {
    script: "technical-analysis",
    config: (symbol) => ({
      interval: "1D",
      isTransparent: true,
      width: "100%",
      height: "280",
      symbol,
      showIntervalTabs: true,
      displayMode: "single",
      locale: "en",
      colorTheme: "dark",
    }),
  },
  fundamentals: {
    script: "financials",
    config: (symbol) => ({
      symbol,
      colorTheme: "dark",
      displayMode: "regular",
      isTransparent: true,
      locale: "en",
      width: "100%",
      height: "360",
    }),
  },
  profile: {
    script: "symbol-profile",
    config: (symbol) => ({
      width: "100%",
      height: "220",
      colorTheme: "dark",
      isTransparent: true,
      symbol,
      locale: "en",
    }),
  },
  heatmap: {
    script: "stock-heatmap",
    config: () => ({
      dataSource: "SENSEX",
      blockSize: "market_cap_basic",
      blockColor: "change",
      grouping: "sector",
      locale: "en",
      symbolUrl: "",
      colorTheme: "dark",
      exchanges: [],
      hasTopBar: false,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      isMonoSize: false,
      width: "100%",
      height: "600",
    }),
  },
  symbolOverview: {
    script: "symbol-overview",
    config: (symbol) => ({
      symbol,
      colorTheme: "dark",
      isTransparent: true,
      locale: "en",
      width: "100%",
      height: "450",
    }),
  },
};

function tradingViewSymbol(symbol) {
  const ticker = String(symbol || "").replace(/\.NS$/i, "").toUpperCase();
  return ticker.includes(":") ? ticker : `NSE:${ticker}`;
}

export default function TradingViewWidget({ type, symbol }) {
  const containerRef = useRef(null);
  const widget = WIDGETS[type];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !widget) return undefined;

    const widgetContent = document.createElement("div");
    widgetContent.className = "tradingview-widget-container__widget";

    const script = document.createElement("script");
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget.script}.js`;
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify(widget.config(symbol ? tradingViewSymbol(symbol) : undefined));

    container.append(widgetContent, script);
    return () => container.replaceChildren();
  }, [symbol, widget]);

  if (!widget) return null;

  return <div ref={containerRef} className="tradingview-widget-container" />;
}
