import React, { useEffect, useState } from "react";
import axios from "axios";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import { getStockChart } from "../../lib/api.js";
import { money, relativeTime } from "../../lib/format.js";
import { usePersistentArray } from "../../lib/storage.js";
import useAlerts from "../alerts/useAlerts.js";
import useMarketData from "../scanner/useMarketData.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import PriceChart from "./PriceChart.jsx";

const TIMEFRAMES = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
];

const TIMEFRAME_LABELS = Object.fromEntries(TIMEFRAMES);

function zoneBounds(zone) {
  return `${money(Math.min(zone.proximal, zone.distal))}–${money(Math.max(zone.proximal, zone.distal))}`;
}

function decodeSymbol(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

export default function ChartPage({ navigate, symbol, timeframe = "monthly" }) {
  const chartSymbol = decodeSymbol(symbol);
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = usePersistentArray("pivot-chart-notes");
  const [noteText, setNoteText] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const savedNote = notes.find((note) => note.symbol === chartSymbol);
  const stock = market.stocks.find((item) => item.symbol.toLowerCase() === chartSymbol.toLowerCase());
  const displayName = stock?.name || chartSymbol.toUpperCase();
  const zoneEntries = Object.entries(chart?.zones_by_timeframe || {}).flatMap(([zoneTimeframe, zones]) =>
    (zones || []).map((zone) => ({ timeframe: zoneTimeframe, zone })),
  );

  useEffect(() => {
    if (!chartSymbol) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setChart(null);
    getStockChart(chartSymbol, timeframe, controller.signal)
      .then(setChart)
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) setError(requestError.message || "Unable to load this chart.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [chartSymbol, timeframe]);

  useEffect(() => {
    setNoteText(savedNote?.text || "");
    setNoteMessage("");
  }, [chartSymbol]);

  useEffect(() => {
    if (!chartFullscreen) return undefined;
    const exitOnEscape = (event) => {
      if (event.key === "Escape") setChartFullscreen(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [chartFullscreen]);

  function saveNote() {
    const text = noteText.trim();
    setNotes((current) => [
      ...current.filter((note) => note.symbol !== chartSymbol),
      ...(text ? [{ symbol: chartSymbol, text, updated_at: new Date().toISOString() }] : []),
    ]);
    setNoteMessage(text ? "Note saved on this device." : "Note cleared.");
  }

  return (
    <WorkspaceLayout view="chart" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={market.stocks}>
      <div className="chart-page">
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Chart" />
        <div className="top-actions">
          <div className="market-status"><i style={{ background: error ? "var(--red)" : "var(--green)" }} /><span>{error ? "CHART UNAVAILABLE" : "PRICE STRUCTURE"}</span></div>
          {chart?.updated_at && <div className="date-label">{relativeTime(chart.updated_at)}</div>}
        </div>
      </header>

      <section className="page-heading chart-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />MULTI-TIMEFRAME · NSE</div>
          <h1>{displayName}{stock && <span> {chartSymbol.toUpperCase()}</span>}</h1>
          <p className="page-subtitle">Interactive price charts with technical indicators, drawing tools, and multi-timeframe zones.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => navigate(`/stocks/${encodeURIComponent(chartSymbol)}`)}>Stock details ↗</button>
      </section>

      <div className="chart-page-timeframes" role="tablist" aria-label="Chart timeframe">
        {TIMEFRAMES.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={timeframe === value} className={timeframe === value ? "active" : ""} onClick={() => navigate(`/charts/${encodeURIComponent(chartSymbol)}/${value}`)}>{label}</button>
        ))}
      </div>

      {loading && <div className="chart-loading">Loading {timeframe} chart…</div>}
      {error && <div className="error-banner" role="alert">{error}<button className="text-button" onClick={() => navigate("/scanner")}>Back to scanner</button></div>}

      {chart && !loading && <>
        <div className="chart-legend chart-page-legend">
          <span><i className="demand-swatch" /> Demand</span>
          <span><i className="supply-swatch" /> Supply</span>
          <span><i className="current-swatch" /> Current price</span>
          <span>{chart.candles.length} candles · {TIMEFRAME_LABELS[timeframe]}</span>
        </div>

        <PriceChart
          key={`${chartSymbol}-${timeframe}`}
          candles={chart.candles}
          zonesByTimeframe={chart.zones_by_timeframe}
          currentPrice={chart.current_price}
          selectedTimeframe={timeframe}
          symbol={chartSymbol}
          fullScreen={chartFullscreen}
          onToggleFullScreen={() => setChartFullscreen((expanded) => !expanded)}
        />

        <section className="chart-trends" aria-label="Trend by timeframe">
          <div className="chart-page-section-heading">
            <div><h2>SMA 7 trend</h2><p>Trend follows the 7-candle SMA angle; CMP position marks the curve location.</p></div>
          </div>
          <div className="chart-trend-grid">
            {TIMEFRAMES.map(([trendTimeframe, label]) => {
              const trend = chart.trends?.[trendTimeframe];
              return (
                <article className="chart-trend-card" key={trendTimeframe}>
                  <div><strong>{label}</strong><span className={`trend-badge ${(trend?.trend || "insufficient").toLowerCase()}`}>{trend?.trend || "INSUFFICIENT"}</span></div>
                  <small>CMP: {trend?.cmp_position || "Unknown"}</small>
                  <b>{trend?.action || "WAIT"}</b>
                </article>
              );
            })}
          </div>
        </section>

        <section className="chart-page-zones" aria-label="Chart zone scores">
          <div className="chart-page-section-heading">
            <div><h2>Zones and scores</h2><p>All zones scoring 6/7 or higher, ordered nearest-first. Scores are out of 7.</p></div>
          </div>
          {zoneEntries.length ? (
            <div className="chart-zone-score-grid">
              {zoneEntries.map(({ timeframe: zoneTimeframe, zone }) => (
                <article className={`chart-zone-score-card ${zone.type}`} key={`${zoneTimeframe}-${zone.id || zone.type}`}>
                  <div><strong>{TIMEFRAME_LABELS[zoneTimeframe] || zoneTimeframe}</strong><span>{zone.type} · {zone.freshness || "fresh"}</span></div>
                  <b>{zone.score}/7</b>
                  <small>{zoneBounds(zone)}</small>
                </article>
              ))}
            </div>
          ) : <div className="chart-page-empty">No qualifying zones for this stock.</div>}
        </section>

        <section className="chart-notes chart-page-notes" aria-labelledby="chart-notes-title">
          <div className="chart-notes-heading">
            <div><h3 id="chart-notes-title">Chart notes</h3><p>Private notes saved in this browser for {chartSymbol.toUpperCase()}.</p></div>
            <button className="chart-reset-button" type="button" onClick={saveNote}>{noteText.trim() ? "Save note" : "Clear note"}</button>
          </div>
          <textarea aria-label={`Notes for ${chartSymbol}`} value={noteText} onChange={(event) => { setNoteText(event.target.value); setNoteMessage(""); }} placeholder="Add your observations, levels, or trade plan…" rows={3} />
          {noteMessage && <div className="chart-note-message" role="status">{noteMessage}</div>}
        </section>
      </>}

      <div className="chart-footnote">Zones use completed candles only. Yahoo Finance quotes may be delayed. Charting by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts</a>.</div>
      </div>
    </WorkspaceLayout>
  );
}