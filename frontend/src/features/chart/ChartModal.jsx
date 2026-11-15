import React, { useEffect, useState } from "react";
import axios from "axios";
import { getStockChart } from "../../lib/api.js";
import { usePersistentArray } from "../../lib/storage.js";
import PriceChart from "./PriceChart.jsx";

const TIMEFRAMES = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
];

export default function ChartModal({ stock, initialTimeframe = "monthly", onClose }) {
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fullPage, setFullPage] = useState(false);
  const [notes, setNotes] = usePersistentArray("pivot-chart-notes");
  const [noteText, setNoteText] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const savedNote = notes.find((note) => note.symbol === stock?.symbol);

  useEffect(() => {
    if (!stock) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setChart(null);
    getStockChart(stock.symbol, timeframe, controller.signal)
      .then(setChart)
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [stock?.symbol, timeframe]);

  useEffect(() => {
    setNoteText(savedNote?.text || "");
    setNoteMessage("");
    setFullPage(false);
  }, [stock?.symbol]);

  useEffect(() => {
    if (!stock) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [stock, onClose]);

  if (!stock) return null;
  function saveNote() {
    const text = noteText.trim();
    setNotes((current) => [
      ...current.filter((note) => note.symbol !== stock.symbol),
      ...(text ? [{ symbol: stock.symbol, text, updated_at: new Date().toISOString() }] : []),
    ]);
    setNoteMessage(text ? "Note saved on this device." : "Note cleared.");
  }

  return (
    <div className={`chart-modal-backdrop ${fullPage ? "chart-modal-backdrop-fullscreen" : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`chart-modal ${fullPage ? "chart-modal-fullscreen" : ""}`} role="dialog" aria-modal="true" aria-labelledby="chart-title">
        <header className="chart-modal-header">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" />PRICE STRUCTURE · NSE</div>
            <h2 id="chart-title">{stock.name} <span>{stock.symbol}</span></h2>
          </div>
          <div className="chart-modal-actions">
            <div className="chart-timeframes" role="tablist" aria-label="Chart timeframe">
              {TIMEFRAMES.map(([item, label]) => <button key={item} role="tab" aria-selected={timeframe === item} className={timeframe === item ? "active" : ""} onClick={() => setTimeframe(item)}>{label}</button>)}
            </div>
            <button className="chart-expand-button" aria-label={fullPage ? "Exit full page chart" : "Expand chart to full page"} aria-pressed={fullPage} onClick={() => setFullPage((expanded) => !expanded)}>{fullPage ? "↙" : "⛶"}</button>
            <button className="dialog-close" aria-label="Close chart" onClick={onClose}>×</button>
          </div>
        </header>
        <div className="chart-legend"><span><i className="demand-swatch" /> Demand zone</span><span><i className="supply-swatch" /> Supply zone</span><span><i className="current-swatch" /> Current price</span><span>Nearest zone per timeframe · score 5/7+ · {chart?.candles?.length || 0} candles · {timeframe}</span></div>
        {loading && <div className="chart-loading">Loading {timeframe} chart…</div>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        {chart && !loading && <PriceChart candles={chart.candles} zonesByTimeframe={chart.zones_by_timeframe} currentPrice={stock.price} selectedTimeframe={timeframe} />}
        <section className="chart-notes" aria-labelledby="chart-notes-title">
          <div className="chart-notes-heading">
            <div><h3 id="chart-notes-title">Chart notes</h3><p>Private notes saved in this browser for {stock.symbol}.</p></div>
            <button className="chart-reset-button" onClick={saveNote}>{noteText.trim() ? "Save note" : "Clear note"}</button>
          </div>
          <textarea aria-label={`Notes for ${stock.symbol}`} value={noteText} onChange={(event) => { setNoteText(event.target.value); setNoteMessage(""); }} placeholder="Add your observations, levels, or trade plan…" rows={3} />
          {noteMessage && <div className="chart-note-message" role="status">{noteMessage}</div>}
        </section>
        <div className="chart-footnote">Zones are calculated from completed candles only. Yahoo Finance quotes may be delayed. Charting by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts</a>.</div>
      </section>
    </div>
  );
}
