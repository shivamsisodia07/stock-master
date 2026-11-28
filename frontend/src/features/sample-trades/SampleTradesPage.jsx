import React, { useEffect, useMemo, useState } from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import LoadingIndicator from "../../components/LoadingIndicator.jsx";
import { getMarketData, getStockQuotes } from "../../lib/api.js";
import { money } from "../../lib/format.js";
import { usePersistentArray } from "../../lib/storage.js";

const POLL_INTERVAL = 60_000;

function tradeResult(trade, price) {
  const direction = trade.side === "LONG" ? 1 : -1;
  return (price - trade.entry) * direction * trade.quantity;
}

function getRewardRisk(entry, target, stop) {
  const risk = Math.abs(entry - stop);
  return risk > 0 ? Math.abs(target - entry) / risk : null;
}

function reachesEntry(trade, price) {
  return trade.side === "LONG" ? price >= trade.entry : price <= trade.entry;
}

function rangeReachesEntry(trade, quote) {
  const high = quote.last_high;
  const low = quote.last_low;
  if (!Number.isFinite(high) || !Number.isFinite(low)) return false;
  return trade.entry >= low && trade.entry <= high;
}

function getExitState(trade, quote) {
  const price = Number(quote.price);
  const high = quote.last_high;
  const low = quote.last_low;
  if (trade.side === "LONG") {
    if (price <= trade.stop || (Number.isFinite(low) && low <= trade.stop)) return "STOP_HIT";
    if (price >= trade.target || (Number.isFinite(high) && high >= trade.target)) return "TARGET_HIT";
  } else {
    if (price >= trade.stop || (Number.isFinite(high) && high >= trade.stop)) return "STOP_HIT";
    if (price <= trade.target || (Number.isFinite(low) && low <= trade.target)) return "TARGET_HIT";
  }
  return null;
}

function TradeCard({ trade, quote, onRemove }) {
  const exitPrice = trade.status === "TARGET_HIT"
    ? trade.target
    : trade.status === "STOP_HIT"
      ? trade.stop
      : null;
  const currentPnl = trade.status === "WAITING_ENTRY"
    ? null
    : tradeResult(trade, exitPrice ?? quote?.price ?? trade.entry);
  const riskReward = getRewardRisk(trade.entry, trade.target, trade.stop);
  const statusLabel = {
    WAITING_ENTRY: "Waiting for entry",
    ACTIVE: "Active",
    TARGET_HIT: "Target hit",
    STOP_HIT: "Stop loss hit",
  }[trade.status];
  const isClosed = trade.status === "TARGET_HIT" || trade.status === "STOP_HIT";

  return (
    <article className={`sample-trade-card ${isClosed ? "closed" : ""}`}>
      <div className="sample-trade-heading">
        <div><h3>{trade.symbol}</h3><span>{trade.side === "LONG" ? "Long" : "Short"} · {trade.quantity} units</span></div>
        <span className={`sample-trade-status ${trade.status.toLowerCase().replace("_", "-")}`}>{statusLabel}</span>
      </div>
      <div className="sample-trade-levels">
        <div><span>Entry</span><strong>{money(trade.entry)}</strong></div>
        <div><span>Target</span><strong>{money(trade.target)}</strong></div>
        <div><span>Stop loss</span><strong>{money(trade.stop)}</strong></div>
        <div><span>Reward / risk</span><strong>{riskReward == null ? "—" : `${riskReward.toFixed(2)}:1`}</strong></div>
      </div>
      <div className="sample-trade-footer">
        <span>{quote?.price ? `Price ${money(quote.price)}` : isClosed ? "Trade complete" : "Waiting for quote"}</span>
        <strong className={currentPnl == null ? "" : currentPnl >= 0 ? "positive-value" : "negative-value"}>
          {currentPnl == null ? "P/L —" : `P/L ${money(currentPnl)}`}
        </strong>
        <button className="text-button sample-trade-remove" type="button" onClick={() => onRemove(trade.id)}>Remove</button>
      </div>
    </article>
  );
}

function TradeSection({ title, description, trades, quotes, onRemove, emptyText }) {
  return (
    <section className="sample-trade-section">
      <div className="sample-trade-section-heading"><div><h2>{title}</h2><p>{description}</p></div><span>{trades.length}</span></div>
      {trades.length
        ? <div className="sample-trade-grid">{trades.map((trade) => <TradeCard key={trade.id} trade={trade} quote={quotes[trade.symbol]} onRemove={onRemove} />)}</div>
        : <div className="sample-trade-empty">{emptyText}</div>}
    </section>
  );
}

export default function SampleTradesPage({ navigate }) {
  const [trades, setTrades] = usePersistentArray("pivot-sample-trades");
  const [quotes, setQuotes] = useState({});
  const [stocks, setStocks] = useState([]);
  const [form, setForm] = useState({ symbol: "", side: "LONG", entry: "", target: "", stop: "", quantity: "1" });
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  const activeTrades = useMemo(
    () => trades.filter((trade) => trade.status === "WAITING_ENTRY" || trade.status === "ACTIVE"),
    [trades],
  );
  const pastTrades = useMemo(
    () => trades.filter((trade) => trade.status === "TARGET_HIT" || trade.status === "STOP_HIT")
      .sort((left, right) => (right.closedAt || "").localeCompare(left.closedAt || "")),
    [trades],
  );
  const realizedPnl = pastTrades.reduce((total, trade) => total + Number(trade.realizedPnl || 0), 0);
  const formRiskReward = getRewardRisk(Number(form.entry), Number(form.target), Number(form.stop));

  useEffect(() => {
    const controller = new AbortController();
    getMarketData(controller.signal)
      .then((payload) => setStocks(payload.stocks || []))
      .catch((requestError) => {
        if (!controller.signal.aborted) console.warn("Unable to load stock names for trade tracker.", requestError);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const symbols = [...new Set(activeTrades.map((trade) => trade.symbol))];
    if (!symbols.length) {
      setLoadingQuotes(false);
      return undefined;
    }

    const controller = new AbortController();
    let refreshing = false;
    const refreshQuotes = async () => {
      if (refreshing) return;
      refreshing = true;
      setLoadingQuotes(true);
      try {
        const payload = await getStockQuotes(symbols, controller.signal);
        if (controller.signal.aborted) return;
        const nextQuotes = Object.fromEntries((payload.stocks || []).map((stock) => [stock.symbol, stock]));
        setQuotes((current) => ({ ...current, ...nextQuotes }));
        const missingQuotes = symbols.filter((symbol) => !nextQuotes[symbol]);
        setQuoteError(missingQuotes.length
          ? `No latest quote is available for ${missingQuotes.join(", ")}.`
          : "");

        setTrades((current) => {
          let changed = false;
          const nextTrades = current.map((trade) => {
            if (trade.status !== "WAITING_ENTRY" && trade.status !== "ACTIVE") return trade;
            const quote = nextQuotes[trade.symbol];
            const price = Number(quote?.price);
            if (!Number.isFinite(price) || price <= 0) return trade;
            const quoteTime = Date.parse(quote.as_of || "");
            const createdAt = Date.parse(trade.createdAt || "");
            if (!Number.isFinite(quoteTime) || (Number.isFinite(createdAt) && quoteTime < createdAt)) return trade;

            const entered = trade.status === "WAITING_ENTRY"
              && (reachesEntry(trade, price) || rangeReachesEntry(trade, quote));
            const updatedTrade = entered
              ? { ...trade, status: "ACTIVE", activatedAt: new Date().toISOString() }
              : trade;
            if (updatedTrade.status !== trade.status) changed = true;
            if (updatedTrade.status !== "ACTIVE") return updatedTrade;

            const exitState = getExitState(updatedTrade, quote);
            if (!exitState) return updatedTrade;
            const exitPrice = exitState === "TARGET_HIT" ? trade.target : trade.stop;
            changed = true;
            return {
              ...updatedTrade,
              status: exitState,
              closedAt: new Date().toISOString(),
              exitPrice,
              realizedPnl: tradeResult(trade, exitPrice),
            };
          });
          return changed ? nextTrades : current;
        });
      } catch (requestError) {
        if (!controller.signal.aborted) setQuoteError(requestError.message || "Unable to refresh trade tracker quotes.");
      } finally {
        refreshing = false;
        if (!controller.signal.aborted) setLoadingQuotes(false);
      }
    };

    refreshQuotes();
    const interval = window.setInterval(refreshQuotes, POLL_INTERVAL);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [activeTrades, setTrades]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function addTrade(event) {
    event.preventDefault();
    setError("");
    const symbol = form.symbol.trim().toUpperCase().replace(/\.NS$/, "");
    const entry = Number(form.entry);
    const target = Number(form.target);
    const stop = Number(form.stop);
    const quantity = Number(form.quantity);

    if (!/^[A-Z0-9&.-]{1,20}$/.test(symbol)) {
      setError("Enter a valid NSE stock symbol.");
      return;
    }
    if (![entry, target, stop, quantity].every(Number.isFinite) || [entry, target, stop, quantity].some((value) => value <= 0)) {
      setError("Entry, target, stop loss, and units must be greater than zero.");
      return;
    }
    if (form.side === "LONG" ? !(stop < entry && entry < target) : !(target < entry && entry < stop)) {
      setError(form.side === "LONG"
        ? "For a long trade, stop loss must be below entry and target above entry."
        : "For a short trade, target must be below entry and stop loss above entry.");
      return;
    }

    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTrades((current) => [{
      id,
      symbol,
      side: form.side,
      entry,
      target,
      stop,
      quantity,
      status: "WAITING_ENTRY",
      createdAt: new Date().toISOString(),
    }, ...current]);
    setForm({ symbol: "", side: "LONG", entry: "", target: "", stop: "", quantity: "1" });
  }

  function removeTrade(id) {
    setTrades((current) => current.filter((trade) => trade.id !== id));
  }

  return (
    <WorkspaceLayout view="sample-trades" navigate={navigate} stocks={stocks}>
      <div className="sample-trades-page">
        <header className="topbar"><Breadcrumb navigate={navigate} current="Trade Tracker" /></header>
        <section className="page-heading sample-trades-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" />TRADE TRACKER</div>
            <h1>Trade <span>tracker.</span></h1>
            <p className="page-subtitle">Track planned entries, targets, stop losses, and price-based outcomes. Quotes refresh every minute when available; if both exits fall within one minute, the stop is counted first.</p>
          </div>
        </section>

        <section className="sample-trade-stats" aria-label="Trade tracker summary">
          <article><span>TOTAL TRADES</span><strong>{trades.length}</strong><small>Active and completed plans</small></article>
          <article><span>ACTIVE</span><strong>{activeTrades.length}</strong><small>Waiting for entry or in progress</small></article>
          <article><span>PAST TRADES</span><strong>{pastTrades.length}</strong><small>Target or stop loss reached</small></article>
          <article><span>REALIZED P&amp;L</span><strong className={realizedPnl >= 0 ? "positive-value" : "negative-value"}>{money(realizedPnl)}</strong><small>Based on planned exit level and units</small></article>
        </section>

        <section className="sample-trade-form-panel">
          <div className="sample-trade-section-heading"><div><h2>Add a trade plan</h2><p>We start tracking the entry as soon as the plan is saved.</p></div></div>
          <form className="sample-trade-form" onSubmit={addTrade}>
            <label><span>Stock symbol</span><input name="symbol" value={form.symbol} onChange={updateField} placeholder="e.g. RELIANCE" maxLength="20" required /></label>
            <label><span>Side</span><select name="side" value={form.side} onChange={updateField}><option value="LONG">Long</option><option value="SHORT">Short</option></select></label>
            <label><span>Entry price (₹)</span><input type="number" name="entry" min="0.01" step="any" value={form.entry} onChange={updateField} required /></label>
            <label><span>Target (₹)</span><input type="number" name="target" min="0.01" step="any" value={form.target} onChange={updateField} required /></label>
            <label><span>Stop loss (₹)</span><input type="number" name="stop" min="0.01" step="any" value={form.stop} onChange={updateField} required /></label>
            <label><span>Units</span><input type="number" name="quantity" min="0.01" step="any" value={form.quantity} onChange={updateField} required /></label>
            <div className="sample-trade-form-footer">
              <span>Expected reward / risk: <strong>{formRiskReward == null ? "—" : `${formRiskReward.toFixed(2)}:1`}</strong></span>
              <button className="primary-button" type="submit">Add trade</button>
            </div>
            {error && <div className="sample-trade-error" role="alert">{error}</div>}
          </form>
        </section>

        {quoteError && <div className="error-banner" role="alert">{quoteError}</div>}
        <TradeSection
          title="Active trades"
          description={loadingQuotes ? "Refreshing current prices…" : "Waiting trades activate when price reaches entry; active trades close at target or stop loss."}
          trades={activeTrades}
          quotes={quotes}
          onRemove={removeTrade}
          emptyText="No active plans. Add a trade above to start tracking."
        />
        <TradeSection
          title="Past trades"
          description="Completed automatically when a tracked quote reaches the target or stop loss."
          trades={pastTrades}
          quotes={quotes}
          onRemove={removeTrade}
          emptyText="Completed trades will appear here."
        />
        {loadingQuotes && !activeTrades.length && <div className="sample-trade-loading"><LoadingIndicator compact label="Loading trade quotes…" /></div>}
      </div>
    </WorkspaceLayout>
  );
}
