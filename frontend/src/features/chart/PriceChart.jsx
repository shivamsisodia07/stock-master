import React, { useEffect, useRef, useState } from "react";
import { CandlestickSeries, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart } from "lightweight-charts";
import { money } from "../../lib/format.js";

const TIMEFRAME_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

function formatTime(time) {
  if (typeof time === "string") return time;
  if (typeof time === "number") return new Date(time * 1000).toISOString().slice(0, 10);
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

function movingAverageData(candles, period) {
  let total = 0;
  return candles.reduce((result, candle, index) => {
    total += candle.close;
    if (index >= period) total -= candles[index - period].close;
    if (index >= period - 1) result.push({ time: candle.date, value: total / period });
    return result;
  }, []);
}

function exponentialMovingAverageData(candles, period) {
  const alpha = 2 / (period + 1);
  let seedTotal = 0;
  let previousEma = null;
  return candles.reduce((result, candle, index) => {
    if (index < period) seedTotal += candle.close;
    if (index === period - 1) previousEma = seedTotal / period;
    else if (index >= period) previousEma = candle.close * alpha + previousEma * (1 - alpha);
    if (index >= period - 1) result.push({ time: candle.date, value: previousEma });
    return result;
  }, []);
}

export default function PriceChart({ candles, zonesByTimeframe, currentPrice, selectedTimeframe }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const currentPriceLineRef = useRef(null);
  const zoneLinesRef = useRef([]);
  const volumeSeriesRef = useRef(null);
  const sma20SeriesRef = useRef(null);
  const sma50SeriesRef = useRef(null);
  const emaSeriesRefs = useRef({});
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [showVolume, setShowVolume] = useState(true);
  const [showSma20, setShowSma20] = useState(false);
  const [showSma50, setShowSma50] = useState(false);
  const [showEma9, setShowEma9] = useState(false);
  const [showEma20, setShowEma20] = useState(false);
  const [showEma50, setShowEma50] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [visibleTimeframes, setVisibleTimeframes] = useState([selectedTimeframe]);

  useEffect(() => {
    setVisibleTimeframes([selectedTimeframe]);
  }, [selectedTimeframe]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !candles?.length) return undefined;

    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 320),
      height: Math.max(container.clientHeight, 280),
      layout: {
        background: { color: "#0e1625" },
        textColor: "#8190a7",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#1d293d" },
        horzLines: { color: "#243148" },
      },
      rightPriceScale: { borderColor: "#29364d" },
      timeScale: { borderColor: "#29364d", timeVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      localization: { priceFormatter: money },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#57d6a0",
      downColor: "#fa7f87",
      borderUpColor: "#57d6a0",
      borderDownColor: "#fa7f87",
      wickUpColor: "#57d6a0",
      wickDownColor: "#fa7f87",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    series.setData(candles.map((candle) => ({
      time: candle.date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })));

    const sma20 = movingAverageData(candles, 20);
    if (sma20.length) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: "#8ba8ff",
        lineWidth: 1,
        title: "SMA 20",
        visible: showSma20,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      smaSeries.setData(sma20);
      sma20SeriesRef.current = smaSeries;
    }

    const sma50 = movingAverageData(candles, 50);
    if (sma50.length) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: "#f4bd67",
        lineWidth: 1,
        title: "SMA 50",
        visible: showSma50,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      smaSeries.setData(sma50);
      sma50SeriesRef.current = smaSeries;
    }

    emaSeriesRefs.current = {};
    const emaConfigs = [
      [9, "#f5c451", showEma9],
      [20, "#4dc6d0", showEma20],
      [50, "#ba8df5", showEma50],
    ];
    for (const [period, color, visible] of emaConfigs) {
      const emaData = exponentialMovingAverageData(candles, period);
      if (!emaData.length) continue;
      const emaSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        title: `EMA ${period}`,
        visible,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      emaSeries.setData(emaData);
      emaSeriesRefs.current[period] = emaSeries;
    }

    const zoneLines = [];
    for (const [timeframe, timeframeZones] of Object.entries(zonesByTimeframe || {})) {
      const zone = timeframeZones?.[0];
      if (!zone) continue;
      const color = zone.type === "demand" ? "#57d6a0" : "#fa7f87";
      const title = `${TIMEFRAME_LABELS[timeframe] || timeframe} ${zone.type}`;
      zoneLines.push({ timeframe, line: series.createPriceLine({
        price: zone.proximal,
        color,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: timeframe === selectedTimeframe,
        lineVisible: timeframe === selectedTimeframe,
        title: `${title} proximal`,
      }) });
      zoneLines.push({ timeframe, line: series.createPriceLine({
        price: zone.distal,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: timeframe === selectedTimeframe,
        lineVisible: timeframe === selectedTimeframe,
        title: `${title} distal`,
      }) });
    }
    zoneLinesRef.current = zoneLines;

    if (currentPrice > 0) {
      currentPriceLineRef.current = series.createPriceLine({
        price: currentPrice,
        color: "#f4bd67",
        lineWidth: 1,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: true,
        title: "Current",
      });
    }

    if (candles.some((candle) => Number.isFinite(candle.volume))) {
      const volumePane = chart.addPane();
      chart.panes()[0].setStretchFactor(4);
      volumePane.setStretchFactor(1);
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false,
        priceLineVisible: false,
        visible: showVolume,
      }, 1);
      volumeSeries.setData(candles
        .filter((candle) => Number.isFinite(candle.volume))
        .map((candle) => ({
          time: candle.date,
          value: candle.volume,
          color: candle.close >= candle.open ? "#57d6a066" : "#fa7f8766",
        })));
      chart.priceScale("volume", 1).applyOptions({ scaleMargins: { top: 0.08, bottom: 0 } });
      volumeSeriesRef.current = volumeSeries;
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;
    const candleByDate = new Map(candles.map((candle) => [candle.date, candle]));
    const handleCrosshairMove = (param) => {
      if (!param.time) {
        setHoveredCandle(null);
        return;
      }
      const date = formatTime(param.time);
      setHoveredCandle(candleByDate.get(date) || null);
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      currentPriceLineRef.current = null;
      zoneLinesRef.current = [];
      volumeSeriesRef.current = null;
      sma20SeriesRef.current = null;
      sma50SeriesRef.current = null;
      emaSeriesRefs.current = {};
    };
  }, [candles, zonesByTimeframe, selectedTimeframe]);

  useEffect(() => {
    zoneLinesRef.current.forEach(({ timeframe, line }) => {
      const visible = showZones && visibleTimeframes.includes(timeframe);
      line.applyOptions({ lineVisible: visible, axisLabelVisible: visible });
    });
  }, [showZones, visibleTimeframes]);

  useEffect(() => {
    if (currentPrice > 0) currentPriceLineRef.current?.applyOptions({ price: currentPrice });
  }, [currentPrice]);

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  useEffect(() => {
    sma20SeriesRef.current?.applyOptions({ visible: showSma20 });
  }, [showSma20]);

  useEffect(() => {
    sma50SeriesRef.current?.applyOptions({ visible: showSma50 });
  }, [showSma50]);

  useEffect(() => {
    emaSeriesRefs.current[9]?.applyOptions({ visible: showEma9 });
  }, [showEma9]);

  useEffect(() => {
    emaSeriesRefs.current[20]?.applyOptions({ visible: showEma20 });
  }, [showEma20]);

  useEffect(() => {
    emaSeriesRefs.current[50]?.applyOptions({ visible: showEma50 });
  }, [showEma50]);

  if (!candles?.length) return <div className="chart-empty">No candles available for this timeframe.</div>;
  const displayedCandle = hoveredCandle || candles[candles.length - 1];

  return (
    <div className="interactive-chart">
      <div className="chart-interaction-bar">
        <div className="chart-crosshair-data" aria-live="polite">
          <strong>{displayedCandle.date}</strong>
          <span>O {money(displayedCandle.open)}</span>
          <span>H {money(displayedCandle.high)}</span>
          <span>L {money(displayedCandle.low)}</span>
          <span>C {money(displayedCandle.close)}</span>
        </div>
        <div className="chart-tools">
          <button className={`chart-toggle ${showZones ? "active" : ""}`} aria-label="Toggle zone lines" aria-pressed={showZones} onClick={() => setShowZones((visible) => !visible)}>Zones</button>
          {Object.entries(TIMEFRAME_LABELS).map(([timeframe, label]) => {
            const selected = visibleTimeframes.includes(timeframe);
            return <button key={timeframe} className={`chart-toggle ${selected ? "active" : ""}`} aria-label={`${selected ? "Hide" : "Show"} ${label.toLowerCase()} zone`} aria-pressed={selected} onClick={() => setVisibleTimeframes((current) => selected ? current.filter((value) => value !== timeframe) : [...current, timeframe])}>{label}</button>;
          })}
          <button className={`chart-toggle ${showVolume ? "active" : ""}`} aria-pressed={showVolume} onClick={() => setShowVolume((visible) => !visible)}>Volume</button>
          <button className={`chart-toggle ${showSma20 ? "active" : ""}`} aria-pressed={showSma20} onClick={() => setShowSma20((visible) => !visible)}>SMA 20</button>
          <button className={`chart-toggle ${showSma50 ? "active" : ""}`} aria-pressed={showSma50} onClick={() => setShowSma50((visible) => !visible)}>SMA 50</button>
          <button className={`chart-toggle ema-9-toggle ${showEma9 ? "active" : ""}`} aria-pressed={showEma9} onClick={() => setShowEma9((visible) => !visible)}>EMA 9</button>
          <button className={`chart-toggle ema-20-toggle ${showEma20 ? "active" : ""}`} aria-pressed={showEma20} onClick={() => setShowEma20((visible) => !visible)}>EMA 20</button>
          <button className={`chart-toggle ema-50-toggle ${showEma50 ? "active" : ""}`} aria-pressed={showEma50} onClick={() => setShowEma50((visible) => !visible)}>EMA 50</button>
          <button className="chart-reset-button" onClick={() => chartRef.current?.timeScale().fitContent()}>Reset zoom</button>
        </div>
      </div>
      <div className="price-chart-wrap" ref={containerRef} role="img" aria-label="Interactive candlestick chart with selectable zone and current-price lines" />
      <div className="chart-help">Only the selected timeframe's nearest zone is shown initially · toggle timeframes or hide all zones · zones score at least 5/7 · drag to pan · scroll or pinch to zoom · move the crosshair to inspect OHLC</div>
    </div>
  );
}
