import React, { useEffect, useMemo, useState } from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import LoadingIndicator from "../../components/LoadingIndicator.jsx";
import { deleteJournalTrade, getJournalTrades, saveJournalTrade } from "../../lib/api.js";
import useMarketData from "../scanner/useMarketData.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import useAlerts from "../alerts/useAlerts.js";

const SETUPS = ["HIT", "DIT", "WIT", "MIT", "QIT", "YIT"];

function localDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function blankTrade() {
  return {
    symbol: "",
    setup: "MIT",
    side: "LONG",
    entry_date: localDate(),
    exit_date: "",
    entry_price: "",
    exit_price: "",
    quantity: "",
    stop_price: "",
    target_price: "",
    fees: "0",
    zone_score: "",
    trigger: "",
    exit_reason: "",
    followed_rules: true,
    emotions: "",
    lessons: "",
    screenshot_url: "",
    notes: "",
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatQuantity(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(value);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function FormField({ label, children, className = "" }) {
  return <label className={`journal-field ${className}`}><span>{label}</span>{children}</label>;
}

function EquityCurve({ trades }) {
  const points = [];
  let runningPnl = 0;
  [...trades]
    .filter((trade) => trade.status === "CLOSED")
    .sort((left, right) => (left.exit_date || "").localeCompare(right.exit_date || ""))
    .forEach((trade) => {
      runningPnl += trade.pnl;
      points.push({ date: trade.exit_date, value: runningPnl });
    });

  if (!points.length) {
    return <div className="journal-chart-empty">Close a trade to start your realized P&amp;L curve.</div>;
  }

  const width = 640;
  const height = 190;
  const pad = 18;
  const values = [0, ...points.map((point) => point.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotPoints = [{ date: points[0].date, value: 0 }, ...points].map((point, index, all) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(all.length - 1, 1);
    const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  const finalValue = points[points.length - 1].value;

  return (
    <div className="journal-equity-chart">
      <div className="journal-chart-summary">
        <strong className={finalValue >= 0 ? "positive-value" : "negative-value"}>{formatMoney(finalValue)}</strong>
        <span>cumulative realized P&amp;L</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative realized profit and loss by exit date">
        <line x1={pad} x2={width - pad} y1={height / 2} y2={height / 2} className="journal-chart-grid" />
        <polyline points={plotPoints.join(" ")} fill="none" className={finalValue >= 0 ? "journal-equity-line" : "journal-equity-line loss"} />
      </svg>
      <div className="journal-chart-dates"><span>{formatDate(points[0].date)}</span><span>{formatDate(points[points.length - 1].date)}</span></div>
    </div>
  );
}

function SetupBreakdown({ trades }) {
  const totals = SETUPS.map((setup) => ({
    setup,
    pnl: trades.filter((trade) => trade.status === "CLOSED" && trade.setup === setup)
      .reduce((sum, trade) => sum + trade.pnl, 0),
  })).filter((item) => item.pnl !== 0 || trades.some((trade) => trade.status === "CLOSED" && trade.setup === item.setup));
  const max = Math.max(1, ...totals.map((item) => Math.abs(item.pnl)));

  if (!totals.length) return <div className="journal-chart-empty">Setup results appear after you close trades.</div>;

  return (
    <div className="journal-setup-breakdown">
      {totals.map((item) => (
        <div className="journal-setup-row" key={item.setup}>
          <strong>{item.setup}</strong>
          <div className="journal-setup-track"><i className={item.pnl >= 0 ? "positive-bar" : "negative-bar"} style={{ width: `${Math.max(3, Math.abs(item.pnl) / max * 100)}%` }} /></div>
          <span className={item.pnl >= 0 ? "positive-value" : "negative-value"}>{formatMoney(item.pnl)}</span>
        </div>
      ))}
    </div>
  );
}

export default function TradeJournalPage({ navigate }) {
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(blankTrade);
  const [filter, setFilter] = useState("ALL");
  const [accountValue, setAccountValue] = useState("");
  const [riskPercent, setRiskPercent] = useState("1");

  useEffect(() => {
    const controller = new AbortController();
    getJournalTrades(controller.signal)
      .then((payload) => setTrades(payload.trades || []))
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message || "Unable to load your trade journal.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const closedTrades = useMemo(() => trades.filter((trade) => trade.status === "CLOSED"), [trades]);
  const stats = useMemo(() => {
    const wins = closedTrades.filter((trade) => trade.pnl > 0).length;
    const totalPnl = closedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const rTrades = closedTrades.filter((trade) => trade.r_multiple != null);
    return {
      totalPnl,
      winRate: closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : 0,
      averageR: rTrades.length ? rTrades.reduce((sum, trade) => sum + trade.r_multiple, 0) / rTrades.length : null,
    };
  }, [closedTrades]);
  const positionSize = useMemo(() => {
    const account = Number(accountValue);
    const risk = Number(riskPercent);
    const entry = Number(form.entry_price);
    const stop = Number(form.stop_price);
    if (![account, risk, entry, stop].every(Number.isFinite) || account <= 0 || risk <= 0 || entry <= 0 || stop <= 0) {
      return null;
    }

    const riskPerUnit = form.side === "SHORT" ? stop - entry : entry - stop;
    if (riskPerUnit <= 0) return null;

    const riskAmount = account * risk / 100;
    const quantity = riskAmount / riskPerUnit;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return { riskAmount, riskPerUnit, quantity };
  }, [accountValue, riskPercent, form.entry_price, form.stop_price, form.side]);
  const visibleTrades = trades.filter((trade) => filter === "ALL" || trade.status === filter);

  function startNewTrade() {
    setEditingId("");
    setForm(blankTrade());
    setError("");
    setFormOpen(true);
  }

  function startEdit(trade) {
    setEditingId(trade.id);
    const editableTrade = blankTrade();
    Object.keys(editableTrade).forEach((key) => {
      if (trade[key] !== undefined) {
        editableTrade[key] = trade[key] == null
          ? ""
          : key === "followed_rules" ? trade[key] : String(trade[key]);
      }
    });
    setForm(editableTrade);
    setError("");
    setFormOpen(true);
  }

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function submitTrade(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      symbol: form.symbol.trim().toUpperCase(),
      entry_price: Number(form.entry_price),
      exit_price: form.exit_price === "" ? null : Number(form.exit_price),
      quantity: Number(form.quantity),
      stop_price: form.stop_price === "" ? null : Number(form.stop_price),
      target_price: form.target_price === "" ? null : Number(form.target_price),
      fees: Number(form.fees || 0),
      zone_score: form.zone_score === "" ? null : Number(form.zone_score),
      exit_date: form.exit_date || null,
    };
    try {
      const result = await saveJournalTrade(payload, editingId);
      setTrades((current) => {
        const updated = editingId
          ? current.map((trade) => trade.id === editingId ? result.trade : trade)
          : [...current, result.trade];
        return updated.sort((left, right) => right.entry_date.localeCompare(left.entry_date)
          || right.created_at.localeCompare(left.created_at));
      });
      setFormOpen(false);
      setEditingId("");
    } catch (requestError) {
      setError(requestError.message || "Unable to save this trade.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTrade(trade) {
    if (!window.confirm(`Delete the ${trade.symbol} journal entry? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteJournalTrade(trade.id);
      setTrades((current) => current.filter((item) => item.id !== trade.id));
    } catch (requestError) {
      setError(requestError.message || "Unable to delete this trade.");
    }
  }

  return (
    <WorkspaceLayout view="journal" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={market.stocks}>
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Trade journal" />
        <div className="top-actions"><div className="market-status"><i style={{ background: error ? "var(--red)" : "var(--green)" }} /><span>{loading ? <LoadingIndicator compact label="LOADING JOURNAL" /> : "PRIVATE TRADE LOG"}</span></div></div>
      </header>

      <section className="page-heading journal-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />REVIEW · LEARN · IMPROVE</div>
          <h1>Trade <span>journal.</span></h1>
          <p className="page-subtitle">Record your decisions, review realized results, and learn from every setup.</p>
        </div>
        <button className="primary-button" type="button" onClick={startNewTrade}>＋ Log a trade</button>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="journal-stats" aria-label="Trade performance summary">
        <article className="journal-stat-card"><span>REALIZED P&amp;L</span><strong className={stats.totalPnl >= 0 ? "positive-value" : "negative-value"}>{formatMoney(stats.totalPnl)}</strong><small>{closedTrades.length} closed trades</small></article>
        <article className="journal-stat-card"><span>WIN RATE</span><strong>{stats.winRate}%</strong><small>Profitable closed trades</small></article>
        <article className="journal-stat-card"><span>AVERAGE R</span><strong>{stats.averageR == null ? "—" : `${stats.averageR.toFixed(2)}R`}</strong><small>Closed trades with a stop recorded</small></article>
        <article className="journal-stat-card"><span>OPEN TRADES</span><strong>{trades.filter((trade) => trade.status === "OPEN").length}</strong><small>Unrealized trades excluded</small></article>
      </section>

      <section className="journal-visuals" aria-label="Trade visualizations">
        <article className="journal-panel">
          <div className="journal-panel-heading"><div><h2>Equity curve</h2><p>Cumulative realized P&amp;L by exit date</p></div></div>
          <EquityCurve trades={closedTrades} />
        </article>
        <article className="journal-panel">
          <div className="journal-panel-heading"><div><h2>Results by setup</h2><p>Net realized P&amp;L for each setup type</p></div></div>
          <SetupBreakdown trades={closedTrades} />
        </article>
      </section>

      {formOpen && (
        <section className="journal-panel journal-form-panel">
          <div className="journal-panel-heading">
            <div><h2>{editingId ? "Edit trade" : "Log a trade"}</h2><p>Exit details are optional until the position is closed.</p></div>
            <button type="button" className="text-button" onClick={() => setFormOpen(false)}>Cancel</button>
          </div>
          <form className="journal-form" onSubmit={submitTrade}>
            <div className="journal-form-grid">
              <FormField label="Stock symbol"><input className="journal-input" name="symbol" value={form.symbol} onChange={(event) => updateField(event)} placeholder="RELIANCE" maxLength="20" required /></FormField>
              <FormField label="Setup"><select className="journal-input" name="setup" value={form.setup} onChange={updateField}>{SETUPS.map((setup) => <option key={setup} value={setup}>{setup}</option>)}</select></FormField>
              <FormField label="Side"><select className="journal-input" name="side" value={form.side} onChange={updateField}><option value="LONG">Long</option><option value="SHORT">Short</option></select></FormField>
              <FormField label="Entry date"><input className="journal-input" type="date" name="entry_date" value={form.entry_date} onChange={updateField} required /></FormField>
              <FormField label="Entry price (₹)"><input className="journal-input" type="number" step="any" min="0.01" name="entry_price" value={form.entry_price} onChange={updateField} required /></FormField>
              <FormField label="Quantity"><input className="journal-input" type="number" step="any" min="0.01" name="quantity" value={form.quantity} onChange={updateField} required /></FormField>
              <FormField label="Stop price (₹)"><input className="journal-input" type="number" step="any" min="0.01" name="stop_price" value={form.stop_price} onChange={updateField} /></FormField>
              <FormField label="Target price (₹)"><input className="journal-input" type="number" step="any" min="0.01" name="target_price" value={form.target_price} onChange={updateField} /></FormField>
              <FormField label="Zone score (0–10)"><input className="journal-input" type="number" min="0" max="10" step="1" name="zone_score" value={form.zone_score} onChange={updateField} /></FormField>
              <FormField label="Trigger used"><input className="journal-input" name="trigger" value={form.trigger} onChange={updateField} placeholder="e.g. Daily EMA 9 reclaim" maxLength="200" /></FormField>
              <FormField label="Exit date"><input className="journal-input" type="date" name="exit_date" value={form.exit_date} onChange={updateField} /></FormField>
              <FormField label="Exit price (₹)"><input className="journal-input" type="number" step="any" min="0.01" name="exit_price" value={form.exit_price} onChange={updateField} /></FormField>
              <FormField label="Fees (₹)"><input className="journal-input" type="number" step="any" min="0" name="fees" value={form.fees} onChange={updateField} /></FormField>
              <FormField label="Reason for exit"><input className="journal-input" name="exit_reason" value={form.exit_reason} onChange={updateField} placeholder="Target, stop, time exit…" maxLength="200" /></FormField>
              <FormField label="Emotional state"><input className="journal-input" name="emotions" value={form.emotions} onChange={updateField} placeholder="Calm, hesitant, rushed…" maxLength="1000" /></FormField>
              <FormField label="Chart screenshot URL"><input className="journal-input" type="url" name="screenshot_url" value={form.screenshot_url} onChange={updateField} placeholder="https://…" maxLength="1000" /></FormField>
              <FormField label="Lessons learned" className="journal-wide"><textarea className="journal-input journal-textarea" name="lessons" value={form.lessons} onChange={updateField} rows="2" maxLength="2000" /></FormField>
              <FormField label="Notes" className="journal-wide"><textarea className="journal-input journal-textarea" name="notes" value={form.notes} onChange={updateField} rows="2" maxLength="4000" /></FormField>
            </div>
            <section className="journal-sizing-panel" aria-labelledby="journal-sizing-title">
              <div className="journal-sizing-heading">
                <div><h3 id="journal-sizing-title">Recommended quantity</h3><p>Estimate size from your account value and the amount you are willing to risk.</p></div>
              </div>
              <div className="journal-sizing-controls">
                <FormField label="Total account value (₹)">
                  <input className="journal-input" type="number" min="0.01" step="any" value={accountValue} onChange={(event) => setAccountValue(event.target.value)} placeholder="e.g. 500000" />
                </FormField>
                <FormField label="Risk per trade (%)">
                  <input className="journal-input" type="number" min="0.01" step="any" value={riskPercent} onChange={(event) => setRiskPercent(event.target.value)} />
                </FormField>
              </div>
              <div className="journal-sizing-result" aria-live="polite">
                {positionSize ? (
                  <>
                    <div><span>Risk amount</span><strong>{formatMoney(positionSize.riskAmount)}</strong></div>
                    <div><span>Risk per unit</span><strong>{formatMoney(positionSize.riskPerUnit)}</strong></div>
                    <div><span>Suggested quantity</span><strong>{formatQuantity(positionSize.quantity)}</strong></div>
                    <button className="text-button" type="button" onClick={() => setForm((current) => ({ ...current, quantity: String(positionSize.quantity) }))}>Use quantity</button>
                  </>
                ) : <p>Enter your account value, entry price, and a stop on the risk side of entry to calculate.</p>}
              </div>
              <small className="journal-sizing-note">Estimate only; adjust for contract lot size, fees, and execution slippage.</small>
            </section>
            <label className="journal-checkbox"><input type="checkbox" name="followed_rules" checked={form.followed_rules} onChange={updateField} /><span>I followed my trade plan and rules</span></label>
            <div className="journal-form-actions">
              <button type="submit" className="primary-button" disabled={saving}>{saving ? <LoadingIndicator compact label="Saving…" /> : editingId ? "Save changes" : "Save trade"}</button>
              {error && <span className="journal-form-error" role="alert">{error}</span>}
            </div>
          </form>
        </section>
      )}

      <section className="journal-panel journal-trades-panel">
        <div className="journal-panel-heading journal-trades-heading">
          <div><h2>Trade history</h2><p>Your journal entries are stored in the application backend.</p></div>
          <label className="journal-filter"><span>Show</span><select className="journal-input" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All trades</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select></label>
        </div>
        {loading ? <div className="loading-banner"><LoadingIndicator label="Loading journal entries…" /></div> : visibleTrades.length ? (
          <div className="journal-table-wrap">
            <table className="journal-table">
              <thead><tr><th>Trade</th><th>Dates</th><th>Setup</th><th>Entry → Exit</th><th>Quantity</th><th>Status</th><th>Net P&amp;L</th><th>R</th><th>Review</th><th /></tr></thead>
              <tbody>{visibleTrades.map((trade) => (
                <tr key={trade.id}>
                  <td><strong>{trade.symbol}</strong><small>{trade.side} · {trade.trigger || "No trigger recorded"}</small></td>
                  <td>{formatDate(trade.entry_date)}<small>{trade.exit_date ? formatDate(trade.exit_date) : "No exit yet"}</small></td>
                  <td>{trade.setup}{trade.zone_score == null ? "" : ` · ${trade.zone_score}/10`}</td>
                  <td>{formatMoney(trade.entry_price)}<small>{trade.exit_price == null ? "—" : formatMoney(trade.exit_price)}</small></td>
                  <td>{trade.quantity}</td>
                  <td><span className={`journal-status ${trade.status.toLowerCase()}`}>{trade.status}</span></td>
                  <td className={trade.pnl == null ? "" : trade.pnl >= 0 ? "positive-value" : "negative-value"}>{trade.pnl == null ? "—" : formatMoney(trade.pnl)}</td>
                  <td>{trade.r_multiple == null ? "—" : `${trade.r_multiple.toFixed(2)}R`}</td>
                  <td><details className="journal-review"><summary>View</summary><div><strong>Exit</strong><p>{trade.exit_reason || "Not recorded"}</p><strong>Rules</strong><p>{trade.followed_rules ? "Followed" : "Broken"}</p><strong>Emotions</strong><p>{trade.emotions || "Not recorded"}</p><strong>Lessons</strong><p>{trade.lessons || "Not recorded"}</p>{trade.screenshot_url && <a href={trade.screenshot_url} target="_blank" rel="noreferrer">Open chart screenshot ↗</a>}{trade.notes && <p>{trade.notes}</p>}</div></details></td>
                  <td className="journal-row-actions"><button type="button" className="text-button" onClick={() => startEdit(trade)}>Edit</button><button type="button" className="text-button journal-delete" onClick={() => removeTrade(trade)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="journal-empty-state"><div className="empty-icon">▤</div><h3>{trades.length ? "No trades in this view" : "Your journal starts here"}</h3><p>{trades.length ? "Change the filter to see other entries." : "Log your first trade to track performance and build a useful review history."}</p>{!trades.length && <button className="primary-button" type="button" onClick={startNewTrade}>Log your first trade</button>}</div>
        )}
      </section>
    </WorkspaceLayout>
  );
}
