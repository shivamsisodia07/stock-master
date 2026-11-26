import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import LoadingIndicator from "../../components/LoadingIndicator.jsx";
import { getStockNews } from "../../lib/api.js";
import { money, relativeTime } from "../../lib/format.js";
import { appRoutePath } from "../../lib/useAppRouter.js";
import useAlerts from "../alerts/useAlerts.js";
import useMarketData from "../scanner/useMarketData.js";
import { TIMEFRAMES, tradePlanFor, zonesFor } from "../scanner/zones.js";
import useWatchlist from "../watchlist/useWatchlist.js";
import TradingViewWidget from "../../components/TradingViewWidget.jsx";

function StockNews({ symbol }) {
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getStockNews(symbol, controller.signal)
      .then(setFeed)
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) setError(requestError.message || "Unable to load news and events.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [symbol]);

  if (loading) return <div className="empty-alerts"><LoadingIndicator label="Loading company news and important dates…" /></div>;
  if (error) return <div className="error-banner" role="alert">{error}</div>;

  return (
    <div className="stock-feed-grid">
      <section className="stock-feed-panel">
        <div className="stock-section-heading"><div><h2>Latest news</h2><p>Recent headlines reported for this company.</p></div><span>{feed.news.length} items</span></div>
        {!feed.news.length
          ? <div className="empty-alerts">{feed.news_error || "No recent company news is available from Yahoo Finance."}</div>
          : <ul className="stock-news-list">{feed.news.map((item, index) => (
            <li key={`${item.url || item.title}-${index}`}>
              <a href={item.url || undefined} target="_blank" rel="noreferrer">{item.title}</a>
              <small>{[item.publisher, item.published_at ? relativeTime(item.published_at) : ""].filter(Boolean).join(" · ")}</small>
              {item.summary && <p>{item.summary}</p>}
            </li>
          ))}</ul>}
      </section>
      <section className="stock-feed-panel">
        <div className="stock-section-heading"><div><h2>Important events</h2><p>Company dates published in the market data calendar.</p></div><span>{feed.events.length} dates</span></div>
        {!feed.events.length
          ? <div className="empty-alerts">{feed.events_error || "No upcoming company dates are available from Yahoo Finance."}</div>
          : <ul className="stock-events-list">{feed.events.map((event, index) => <li key={`${event.date}-${event.title}-${index}`}><span>{event.title}</span><strong>{event.date}</strong></li>)}</ul>}
      </section>
    </div>
  );
}

export default function StockPage({ navigate, symbol }) {
  const market = useMarketData();
  const watchlist = useWatchlist();
  const alerts = useAlerts(market.stocks, !market.loading && !market.error);
  const stock = useMemo(() => market.stocks.find((item) => item.symbol.toLowerCase() === symbol?.toLowerCase()), [market.stocks, symbol]);

  if (!market.loading && !market.error && !stock) {
    return (
      <WorkspaceLayout view="stock" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={market.stocks}>
        <header className="topbar"><Breadcrumb navigate={navigate} current="Stock details" /></header>
        <section className="empty-state"><div className="empty-icon">⌕</div><h3>Stock not found</h3><p>This symbol is not in the current market data.</p><button className="primary-button" onClick={() => navigate("/scanner")}>Return to scanner</button></section>
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout view="stock" navigate={navigate} watchlistCount={watchlist.symbols.length} alertCount={alerts.rules.length} stocks={market.stocks}>
      <header className="topbar">
        <Breadcrumb navigate={navigate} current={stock?.symbol || symbol?.toUpperCase()} />
        <div className="top-actions"><div className="market-status"><i style={{ background: market.error ? "var(--red)" : "var(--green)" }} /><span>{market.error ? "FEED UNAVAILABLE" : "STOCK RESEARCH"}</span></div></div>
      </header>

      {market.error && <div className="error-banner" role="alert">{market.error} <button className="text-button" onClick={market.refresh}>Retry</button></div>}
      {!stock && market.loading && <div className="loading-banner"><LoadingIndicator label="Loading stock data…" /></div>}
      {stock && <>
        <section className="stock-detail-heading">
          <div className="stock-heading-main">
            <div className="eyebrow"><span className="eyebrow-line" />NSE · MULTI-TIMEFRAME RESEARCH</div>
            <div className="stock-heading-title-row">
              <h1>{stock.name} <span>{stock.symbol}</span></h1>
              <div className="stock-heading-price">
                <strong>{money(stock.price)}</strong>
                <small className={stock.change_pct < 0 ? "negative" : ""}>{stock.change_pct >= 0 ? "+" : ""}{stock.change_pct.toFixed(2)}% today</small>
              </div>
            </div>
            <p className="page-subtitle">Price, trade plans, company news, and important dates in one view.</p>
          </div>
          <div className="stock-detail-actions">
            <button className={`watch-button ${watchlist.includes(stock.symbol) ? "watch-active" : ""}`} onClick={() => watchlist.toggle(stock.symbol)}>{watchlist.includes(stock.symbol) ? "★ Saved" : "☆ Save stock"}</button>
            <a className="primary-button chart-new-tab-primary" href={appRoutePath(`/charts/${encodeURIComponent(stock.symbol)}/monthly`)} target="_blank" rel="noreferrer">Open chart ↗</a>
          </div>
        </section>

        <section className="stock-trades-section">
          <div className="stock-section-heading"><div><h2>Trade plans by timeframe</h2><p>All available demand and supply zone setups; levels are mechanical references, not recommendations.</p></div><span>{TIMEFRAMES.length} timeframes</span></div>
          <div className="stock-trades-grid">
            {TIMEFRAMES.map(([timeframe, label]) => {
              const zones = zonesFor(stock, timeframe);
              const trades = ["demand", "supply"].flatMap((type) => {
                const zone = zones[type];
                const plan = zone ? tradePlanFor(stock, timeframe, zone) : null;
                return zone && plan ? [{ zone, plan, type }] : [];
              });
              return (
                <article className="stock-timeframe-card" key={timeframe}>
                  <div className="stock-timeframe-heading">
                    <strong>{label}</strong>
                    {stock.trends?.[timeframe] && (
                      <span className={`trend-badge ${stock.trends[timeframe].trend.toLowerCase()}`}>
                        {stock.trends[timeframe].trend}
                      </span>
                    )}
                    <a className="text-button chart-new-tab-link" href={appRoutePath(`/charts/${encodeURIComponent(stock.symbol)}/${timeframe}`)} target="_blank" rel="noreferrer">Chart ↗</a>
                  </div>
                  {stock.trends?.[timeframe] && (
                    <div className="stock-trend-detail">
                      <span>CMP {stock.trends[timeframe].cmp_position}</span>
                      <strong>{stock.trends[timeframe].action}</strong>
                    </div>
                  )}
                  {!trades.length ? <div className="empty-alerts">No qualifying nearby trade setup.</div> : trades.map(({ zone, plan, type }) => (
                    <div className={`stock-trade-row ${type}`} key={zone.id || type}>
                      <div className="stock-trade-type">
                        <strong>{type} setup</strong>
                        <span>{zone.pattern} · {zone.freshness} · {zone.score}/7</span>
                        <button className={`table-alert stock-trade-alert ${alerts.hasRule(stock, zone) ? "alert-active" : ""}`} type="button" aria-pressed={alerts.hasRule(stock, zone)} onClick={() => alerts.toggleRule(stock, zone)}>{alerts.hasRule(stock, zone) ? "Alert on" : "Add alert"}</button>
                      </div>
                      <dl><div><dt>Entry</dt><dd>{money(plan.entry)}</dd></div><div><dt>Stop</dt><dd>{money(plan.stop)}</dd></div><div><dt>Target</dt><dd>{money(plan.target)}</dd></div><div><dt>Reward / risk</dt><dd>{plan.riskReward.toFixed(1)}R</dd></div></dl>
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>

        <section className="stock-tradingview-section" aria-label="Fundamental analysis">
          <article className="tradingview-panel">
            <h3>Fundamental analysis</h3>
            <TradingViewWidget type="fundamentals" symbol={stock.symbol} />
          </article>
        </section>
        <section className="stock-news-section"><StockNews symbol={stock.symbol} /></section>
      </>}
    </WorkspaceLayout>
  );
}
