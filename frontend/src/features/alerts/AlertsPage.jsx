import React, { useState } from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import { money, relativeTime } from "../../lib/format.js";
import useMarketData from "../scanner/useMarketData.js";
import useAlerts from "./useAlerts.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import { deliverAlert } from "../../lib/api.js";

function alertRange(rule) {
  return `${money(Math.min(rule.distal, rule.proximal))}–${money(Math.max(rule.distal, rule.proximal))}`;
}

export default function AlertsPage({ navigate }) {
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);
  const [notice, setNotice] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(alerts.delivery.telegram_enabled);
  const [telegramChatId, setTelegramChatId] = useState(alerts.delivery.telegram_chat_id);

  async function saveDelivery() {
    const delivery = {
      telegram_enabled: telegramEnabled,
      telegram_chat_id: telegramChatId.trim(),
    };
    alerts.saveDelivery(delivery);
    setNotice("Telegram alert settings saved.");
  }

  async function testDelivery() {
    try {
      await deliverAlert({
        telegram_enabled: telegramEnabled,
        telegram_chat_id: telegramChatId.trim(),
        title: "swingTrader test alert",
        message: "This is a test alert from swingTrader.",
      });
      setNotice("Test alert delivered successfully.");
    } catch (error) {
      setNotice(error.message || "Unable to deliver the test alert.");
    }
  }

  async function enableNotifications() {
    const result = await alerts.enableNotifications();
    setNotice(result === "granted"
      ? "Browser notifications are enabled."
      : result === "unsupported"
        ? "This browser does not support notifications."
        : "Notification permission was not granted.");
  }

  return (
    <WorkspaceLayout view="alerts" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={market.stocks}>
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Alerts" />
        <div className="top-actions">
          <div className="market-status"><i style={{ background: market.error ? "var(--red)" : "var(--green)" }} /><span>{market.error ? "FEED UNAVAILABLE" : "ALERT MONITOR"}</span></div>
          <div className="date-label">{market.updatedAt ? relativeTime(market.updatedAt) : "Waiting for quotes"}</div>
        </div>
      </header>

      <section className="page-heading alerts-page-heading flex flex-col items-start gap-3 min-[561px]:flex-row min-[561px]:items-end min-[561px]:justify-between">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />PORTFOLIO MONITORING</div>
          <h1>Price alerts, <span>in one place.</span></h1>
          <p className="page-subtitle">Manage zone-entry rules and review the latest price triggers.</p>
        </div>
        <button className="primary-button" onClick={enableNotifications}>Enable notifications</button>
      </section>

      <section className="alerts-overview grid grid-cols-2 gap-2 min-[561px]:grid-cols-3 min-[561px]:gap-3" aria-label="Alert summary">
        <article className="alerts-stat"><span>ACTIVE RULES</span><strong>{alerts.rules.length}</strong><small>Saved zone-entry alerts</small></article>
        <article className="alerts-stat"><span>RECENT TRIGGERS</span><strong>{alerts.history.length}</strong><small>Latest events on this device</small></article>
        <article className="alerts-stat"><span>QUOTE MONITOR</span><strong className={market.error ? "status-unavailable" : ""}>{market.error ? "Offline" : "Active"}</strong><small>{market.error ? "Check the market-data API" : "Checks refreshed market prices"}</small></article>
      </section>

      {market.error && <div className="error-banner" role="alert">{market.error}</div>}
      {notice && <p className="notification-note alerts-notice" role="status">{notice}</p>}

      <section className="alerts-delivery-panel" aria-labelledby="alert-delivery-title">
        <div className="alerts-section-heading">
          <div><h2 id="alert-delivery-title">Telegram delivery</h2><p>Send triggered zone alerts to your Telegram chat. The bot token is loaded from the server environment.</p></div>
        </div>
        <div className="alerts-delivery-grid telegram-only">
          <label className="alert-channel-card">
            <div><input type="checkbox" checked={telegramEnabled} onChange={(event) => setTelegramEnabled(event.target.checked)} /><strong>Telegram</strong></div>
            <span>Chat or group ID</span>
            <input value={telegramChatId} onChange={(event) => setTelegramChatId(event.target.value)} placeholder="-1001234567890" />
          </label>
        </div>
        <div className="alerts-delivery-actions">
          <button className="secondary-button" type="button" onClick={saveDelivery}>Save delivery settings</button>
          <button className="primary-button" type="button" onClick={testDelivery}>Send test alert</button>
        </div>
      </section>

      <section className="alerts-panel">
        <div className="alerts-section-heading">
          <div><h2>Active rules</h2><p>Rules notify you when a refreshed quote enters its saved zone.</p></div>
          <span className="alerts-total">{alerts.rules.length} total</span>
        </div>
        {!alerts.rules.length
          ? <div className="empty-alerts">No active rules yet. Add one from a demand or supply zone on the scanner.</div>
          : <div className="alert-list">{alerts.rules.map((rule) => (
            <div className="alert-list-row" key={rule.id}>
              <span className={`alert-dot ${rule.type}`} />
              <div><strong>{rule.name} ({rule.symbol})</strong><small>{rule.timeframe} {rule.type} zone · {alertRange(rule)}</small></div>
              <button className="text-button" onClick={() => alerts.removeRule(rule.id)}>Remove</button>
            </div>
          ))}</div>}

        <div className="alerts-section-heading alerts-trigger-heading">
          <div><h2>Recent triggers</h2><p>Price movements that entered an alert zone.</p></div>
          {alerts.history.length > 0 && <button className="text-button" onClick={alerts.clearHistory}>Clear history</button>}
        </div>
        {!alerts.history.length
          ? <div className="empty-alerts">Triggered alerts will appear here.</div>
          : <div className="alert-list">{alerts.history.map((item, index) => (
            <div className="alert-list-row" key={`${item.id}-${item.triggered_at}-${index}`}>
              <span className={`alert-dot ${item.type}`} />
              <div><strong>{item.name} entered a {item.type} zone</strong><small>{money(item.price)} · {new Date(item.triggered_at).toLocaleString()}</small></div>
            </div>
          ))}</div>}
      </section>
    </WorkspaceLayout>
  );
}
