import React, { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
} from "lightweight-charts";
import { money } from "../../lib/format.js";
import { isHiddenByHigherTimeframeZone } from "./zoneVisibility.js";

const TIMEFRAME_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const INDICATOR_OPTIONS = [
  ["volume", "Volume"],
  ["sma7", "SMA 7"],
  ["sma20", "SMA 20"],
  ["sma50", "SMA 50"],
  ["ema9", "EMA 9"],
  ["ema20", "EMA 20"],
  ["ema50", "EMA 50"],
  ["bollinger", "Bollinger Bands"],
  ["rsi", "RSI 14"],
  ["macd", "MACD"],
];

const DEFAULT_INDICATORS = {
  volume: true,
  sma7: true,
  sma20: false,
  sma50: false,
  ema9: false,
  ema20: false,
  ema50: false,
  bollinger: false,
  rsi: false,
  macd: false,
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

function bollingerBands(candles, period = 20) {
  const bands = { upper: [], middle: [], lower: [] };
  for (let index = period - 1; index < candles.length; index += 1) {
    const values = candles.slice(index - period + 1, index + 1).map((candle) => candle.close);
    const mean = values.reduce((total, value) => total + value, 0) / period;
    const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance) * 2;
    bands.upper.push({ time: candles[index].date, value: mean + deviation });
    bands.middle.push({ time: candles[index].date, value: mean });
    bands.lower.push({ time: candles[index].date, value: mean - deviation });
  }
  return bands;
}

function relativeStrengthIndex(candles, period = 14) {
  if (candles.length <= period) return [];
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;
  const result = [];
  const valueFor = () => (averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss));
  result.push({ time: candles[period].date, value: valueFor() });

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result.push({ time: candles[index].date, value: valueFor() });
  }
  return result;
}

function emaValues(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  let previous = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  result[period - 1] = previous;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    previous = values[index] * alpha + previous * (1 - alpha);
    result[index] = previous;
  }
  return result;
}

function macdData(candles) {
  const closes = candles.map((candle) => candle.close);
  const fast = emaValues(closes, 12);
  const slow = emaValues(closes, 26);
  const indexes = [];
  const macd = [];
  for (let index = 0; index < candles.length; index += 1) {
    if (fast[index] == null || slow[index] == null) continue;
    indexes.push(index);
    macd.push(fast[index] - slow[index]);
  }
  const signal = emaValues(macd, 9);
  const macdLine = [];
  const signalLine = [];
  const histogram = [];
  for (let index = 0; index < indexes.length; index += 1) {
    const candle = candles[indexes[index]];
    macdLine.push({ time: candle.date, value: macd[index] });
    if (signal[index] == null) continue;
    signalLine.push({ time: candle.date, value: signal[index] });
    histogram.push({
      time: candle.date,
      value: macd[index] - signal[index],
      color: macd[index] >= signal[index] ? "#57d6a0a8" : "#fa7f87a8",
    });
  }
  return { macdLine, signalLine, histogram };
}

function heikinAshiData(candles) {
  let previousOpen = 0;
  let previousClose = 0;
  return candles.map((candle, index) => {
    const close = (candle.open + candle.high + candle.low + candle.close) / 4;
    const open = index === 0
      ? (candle.open + candle.close) / 2
      : (previousOpen + previousClose) / 2;
    previousOpen = open;
    previousClose = close;
    return {
      time: candle.date,
      open,
      high: Math.max(candle.high, open, close),
      low: Math.min(candle.low, open, close),
      close,
    };
  });
}

function isChartType(value) {
  return ["candles", "line", "area", "heikin"].includes(value);
}

function isSavedDrawing(drawing) {
  if (!drawing || typeof drawing.id !== "string") return false;
  if (drawing.type === "horizontal") return Number.isFinite(drawing.price);
  return drawing.type === "trend"
    && Array.isArray(drawing.points)
    && drawing.points.length === 2
    && drawing.points.every((point) => typeof point.time === "string" && Number.isFinite(point.price));
}

function readSavedLayout(storageKey, selectedTimeframe) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null") || {};
    const visibleTimeframes = Array.isArray(saved.visibleTimeframes)
      ? saved.visibleTimeframes.filter((timeframe) => TIMEFRAME_LABELS[timeframe])
      : [selectedTimeframe];
    return {
      chartType: isChartType(saved.chartType) ? saved.chartType : "candles",
      indicators: Object.fromEntries(
        Object.keys(DEFAULT_INDICATORS).map((key) => [
          key,
          typeof saved.indicators?.[key] === "boolean" ? saved.indicators[key] : DEFAULT_INDICATORS[key],
        ]),
      ),
      showZones: typeof saved.showZones === "boolean" ? saved.showZones : true,
      visibleTimeframes,
      drawings: Array.isArray(saved.drawings) ? saved.drawings.filter(isSavedDrawing) : [],
    };
  } catch (error) {
    console.warn(`Unable to load saved chart layout ${storageKey}.`, error);
    return {
      chartType: "candles",
      indicators: { ...DEFAULT_INDICATORS },
      showZones: true,
      visibleTimeframes: [selectedTimeframe],
      drawings: [],
    };
  }
}

function drawingId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addIndicatorLine(chart, data, options, paneIndex = 0) {
  if (!data.length) return null;
  const series = chart.addSeries(LineSeries, {
    ...options,
    lastValueVisible: false,
    priceLineVisible: false,
  }, paneIndex);
  series.setData(data);
  return series;
}

function addPane(chart) {
  chart.addPane();
  return chart.panes().length - 1;
}

export default function PriceChart({
  candles,
  zonesByTimeframe,
  currentPrice,
  selectedTimeframe,
  symbol,
  fullScreen = false,
  fullscreenInModal = false,
  onToggleFullScreen,
  onTimeframeChange,
}) {
  const chartRootRef = useRef(null);
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const mainSeriesRef = useRef(null);
  const currentPriceLineRef = useRef(null);
  const zoneLinesRef = useRef([]);
  const renderedDrawingsRef = useRef([]);
  const drawingToolRef = useRef("pan");
  const pendingPointRef = useRef(null);
  const lastVisibleRangeRef = useRef(null);
  const lastCandleCountRef = useRef(0);
  const lastChartContextRef = useRef(null);
  const [chartRevision, setChartRevision] = useState(0);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [drawingTool, setDrawingTool] = useState("pan");
  const [pendingPoint, setPendingPoint] = useState(null);
  const [layoutStatus, setLayoutStatus] = useState("Auto-save on");

  const storageKey = `swingTrader-chart-layout-${encodeURIComponent(symbol || "stock")}-${selectedTimeframe}`;
  const [savedLayout] = useState(() => readSavedLayout(storageKey, selectedTimeframe));
  const [chartType, setChartType] = useState(savedLayout.chartType);
  const [indicators, setIndicators] = useState(savedLayout.indicators);
  const [showZones, setShowZones] = useState(savedLayout.showZones);
  const [visibleTimeframes, setVisibleTimeframes] = useState(savedLayout.visibleTimeframes);
  const [drawings, setDrawings] = useState(savedLayout.drawings);
  const [drawingMessage, setDrawingMessage] = useState("");

  useEffect(() => {
    const closeOtherMenus = (event) => {
      const root = chartRootRef.current;
      if (!root) return;
      const clickedMenu = event.target instanceof Element
        ? event.target.closest(".chart-menu")
        : null;
      root.querySelectorAll(".chart-menu[open]").forEach((menu) => {
        if (menu !== clickedMenu) menu.open = false;
      });
    };
    document.addEventListener("pointerdown", closeOtherMenus);
    return () => document.removeEventListener("pointerdown", closeOtherMenus);
  }, []);

  useEffect(() => {
    drawingToolRef.current = drawingTool;
  }, [drawingTool]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        chartType,
        indicators,
        showZones,
        visibleTimeframes,
        drawings,
      }));
      setLayoutStatus("Layout saved");
    } catch (error) {
      console.warn(`Unable to save chart layout ${storageKey}.`, error);
      setLayoutStatus("Layout could not be saved");
    }
  }, [storageKey, chartType, indicators, showZones, visibleTimeframes, drawings]);

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

    let mainSeries;
    if (chartType === "line") {
      mainSeries = chart.addSeries(LineSeries, {
        color: "#64a8ff",
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      mainSeries.setData(candles.map((candle) => ({ time: candle.date, value: candle.close })));
    } else if (chartType === "area") {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: "#64a8ff",
        topColor: "#64a8ff55",
        bottomColor: "#64a8ff05",
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      mainSeries.setData(candles.map((candle) => ({ time: candle.date, value: candle.close })));
    } else {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#57d6a0",
        downColor: "#fa7f87",
        borderUpColor: "#57d6a0",
        borderDownColor: "#fa7f87",
        wickUpColor: "#57d6a0",
        wickDownColor: "#fa7f87",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      mainSeries.setData(chartType === "heikin"
        ? heikinAshiData(candles)
        : candles.map((candle) => ({
          time: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })));
    }

    mainSeriesRef.current = mainSeries;
    const lineColors = {
      sma7: "#57d6a0",
      sma20: "#8ba8ff",
      sma50: "#f4bd67",
      ema9: "#f5c451",
      ema20: "#4dc6d0",
      ema50: "#ba8df5",
    };
    for (const [key, period] of [["sma7", 7], ["sma20", 20], ["sma50", 50]]) {
      if (indicators[key]) {
        addIndicatorLine(chart, movingAverageData(candles, period), {
          color: lineColors[key],
          lineWidth: key === "sma7" ? 2 : 1,
          title: `SMA ${period}`,
        });
      }
    }
    for (const [key, period] of [["ema9", 9], ["ema20", 20], ["ema50", 50]]) {
      if (indicators[key]) {
        addIndicatorLine(chart, exponentialMovingAverageData(candles, period), {
          color: lineColors[key],
          lineWidth: 2,
          title: `EMA ${period}`,
        });
      }
    }
    if (indicators.bollinger) {
      const bands = bollingerBands(candles);
      addIndicatorLine(chart, bands.upper, { color: "#b78cff", lineWidth: 1, title: "BB Upper" });
      addIndicatorLine(chart, bands.middle, { color: "#b78cff99", lineWidth: 1, title: "BB Basis" });
      addIndicatorLine(chart, bands.lower, { color: "#b78cff", lineWidth: 1, title: "BB Lower" });
    }

    if (indicators.volume && candles.some((candle) => Number.isFinite(candle.volume))) {
      const paneIndex = addPane(chart);
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false,
        priceLineVisible: false,
      }, paneIndex);
      volumeSeries.setData(candles
        .filter((candle) => Number.isFinite(candle.volume))
        .map((candle) => ({
          time: candle.date,
          value: candle.volume,
          color: candle.close >= candle.open ? "#57d6a066" : "#fa7f8766",
        })));
      chart.priceScale("volume", paneIndex).applyOptions({ scaleMargins: { top: 0.08, bottom: 0 } });
      chart.panes()[0].setStretchFactor(4);
      chart.panes()[paneIndex].setStretchFactor(1);
    }

    if (indicators.rsi) {
      const rsi = relativeStrengthIndex(candles);
      if (rsi.length) {
        const paneIndex = addPane(chart);
        const rsiSeries = addIndicatorLine(chart, rsi, {
          color: "#d19cff",
          lineWidth: 2,
          title: "RSI 14",
        }, paneIndex);
        rsiSeries.createPriceLine({ price: 70, color: "#fa7f8788", lineStyle: LineStyle.Dashed, title: "70" });
        rsiSeries.createPriceLine({ price: 30, color: "#57d6a088", lineStyle: LineStyle.Dashed, title: "30" });
        chart.panes()[paneIndex].setStretchFactor(1);
      }
    }

    if (indicators.macd) {
      const macd = macdData(candles);
      if (macd.histogram.length) {
        const paneIndex = addPane(chart);
        const histogram = chart.addSeries(HistogramSeries, {
          base: 0,
          lastValueVisible: false,
          priceLineVisible: false,
        }, paneIndex);
        histogram.setData(macd.histogram);
        addIndicatorLine(chart, macd.macdLine, { color: "#64a8ff", lineWidth: 1, title: "MACD" }, paneIndex);
        addIndicatorLine(chart, macd.signalLine, { color: "#f4bd67", lineWidth: 1, title: "Signal" }, paneIndex);
        chart.panes()[paneIndex].setStretchFactor(1);
      }
    }

    const zoneLines = [];
    for (const [timeframe, timeframeZones] of Object.entries(zonesByTimeframe || {})) {
      for (const [index, zone] of (timeframeZones || []).entries()) {
        const color = zone.type === "demand" ? "#57d6a0" : "#fa7f87";
        const score = Number.isFinite(zone.score) ? `${zone.score}/${zone.max_score || 7}` : "";
        const title = `${TIMEFRAME_LABELS[timeframe] || timeframe} ${zone.type}${score ? ` ${score}` : ""} #${index + 1}`;
        const visible = showZones
          && visibleTimeframes.includes(timeframe)
          && !isHiddenByHigherTimeframeZone(zone, timeframe, zonesByTimeframe, visibleTimeframes);
        zoneLines.push({ timeframe, zone, line: mainSeries.createPriceLine({
          price: zone.proximal,
          color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: visible,
          lineVisible: visible,
          title: `${title} proximal`,
        }) });
        zoneLines.push({ timeframe, zone, line: mainSeries.createPriceLine({
          price: zone.distal,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: visible,
          lineVisible: visible,
          title: `${title} distal`,
        }) });
      }
    }
    zoneLinesRef.current = zoneLines;

    if (currentPrice > 0) {
      currentPriceLineRef.current = mainSeries.createPriceLine({
        price: currentPrice,
        color: "#f4bd67",
        lineWidth: 1,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: true,
        title: "Current",
      });
    }

    const candleByDate = new Map(candles.map((candle) => [candle.date, candle]));
    const handleCrosshairMove = (param) => {
      if (!param.time) {
        setHoveredCandle(null);
        return;
      }
      setHoveredCandle(candleByDate.get(formatTime(param.time)) || null);
    };
    const handleChartClick = (param) => {
      const tool = drawingToolRef.current;
      if (tool === "pan") return;
      if (!param.point || !param.time) {
        setDrawingMessage("Click inside the price chart to place a drawing.");
        return;
      }
      if (param.paneIndex != null && param.paneIndex !== 0) {
        setDrawingMessage("Place drawings in the main price pane.");
        return;
      }
      const price = mainSeries.coordinateToPrice(param.point.y);
      if (!Number.isFinite(price)) {
        setDrawingMessage("Click inside the main price plot to place a drawing.");
        return;
      }
      const point = { time: formatTime(param.time), price };

      if (tool === "horizontal") {
        setDrawings((current) => [...current, { id: drawingId(), type: "horizontal", price }]);
        setDrawingMessage("Horizontal line added.");
        return;
      }

      const anchor = pendingPointRef.current;
      if (!anchor) {
        pendingPointRef.current = point;
        setPendingPoint(point);
        setDrawingMessage("Click another candle to finish the trend line.");
        return;
      }
      if (anchor.time === point.time) {
        setDrawingMessage("Choose a different candle to finish the trend line.");
        return;
      }
      const points = [anchor, point].sort((first, second) => first.time.localeCompare(second.time));
      setDrawings((current) => [...current, { id: drawingId(), type: "trend", points }]);
      pendingPointRef.current = null;
      setPendingPoint(null);
      setDrawingMessage("Trend line added.");
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleChartClick);

    chartRef.current = chart;
    const previousRange = lastVisibleRangeRef.current;
    const chartContext = `${symbol || "stock"}:${selectedTimeframe}`;
    const addedCandles = candles.length - lastCandleCountRef.current;
    const wasAtLatestCandle = previousRange
      && lastChartContextRef.current === chartContext
      && lastCandleCountRef.current > 0
      && previousRange.to >= lastCandleCountRef.current - 1;
    if (previousRange && wasAtLatestCandle && addedCandles > 0) {
      chart.timeScale().setVisibleLogicalRange({
        from: previousRange.from + addedCandles,
        to: previousRange.to + addedCandles,
      });
    } else if (previousRange) {
      chart.timeScale().setVisibleLogicalRange(previousRange);
    } else {
      chart.timeScale().fitContent();
    }
    lastCandleCountRef.current = candles.length;
    lastChartContextRef.current = chartContext;
    setChartRevision((revision) => revision + 1);

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleChartClick);
      lastVisibleRangeRef.current = chart.timeScale().getVisibleLogicalRange();
      renderedDrawingsRef.current = [];
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      currentPriceLineRef.current = null;
      zoneLinesRef.current = [];
    };
  }, [candles, zonesByTimeframe, selectedTimeframe, chartType, indicators]);

  useEffect(() => {
    zoneLinesRef.current.forEach(({ timeframe, zone, line }) => {
      const visible = showZones
        && visibleTimeframes.includes(timeframe)
        && !isHiddenByHigherTimeframeZone(zone, timeframe, zonesByTimeframe, visibleTimeframes);
      line.applyOptions({ lineVisible: visible, axisLabelVisible: visible });
    });
  }, [showZones, visibleTimeframes, zonesByTimeframe]);

  useEffect(() => {
    if (currentPrice > 0) currentPriceLineRef.current?.applyOptions({ price: currentPrice });
  }, [currentPrice]);

  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = mainSeriesRef.current;
    if (!chart || !mainSeries) return;

    for (const drawing of renderedDrawingsRef.current) {
      if (drawing.type === "horizontal") mainSeries.removePriceLine(drawing.series);
      else chart.removeSeries(drawing.series);
    }
    renderedDrawingsRef.current = [];

    for (const drawing of drawings) {
      if (drawing.type === "horizontal") {
        const series = mainSeries.createPriceLine({
          price: drawing.price,
          color: "#73a9ff",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Horizontal",
        });
        renderedDrawingsRef.current.push({ type: drawing.type, series });
        continue;
      }
      const series = chart.addSeries(LineSeries, {
        color: "#73a9ff",
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData(drawing.points.map((point) => ({ time: point.time, value: point.price })));
      renderedDrawingsRef.current.push({ type: drawing.type, series });
    }
  }, [drawings, chartRevision]);

  if (!candles?.length) return <div className="chart-empty">No candles available for this timeframe.</div>;
  const displayedCandle = hoveredCandle || candles[candles.length - 1];
  const activeIndicatorCount = Object.values(indicators).filter(Boolean).length;

  function changeDrawingTool(event) {
    const nextTool = event.target.value;
    drawingToolRef.current = nextTool;
    setDrawingTool(nextTool);
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
    pendingPointRef.current = null;
    setPendingPoint(null);
    setDrawingMessage(nextTool === "pan" ? "" : "Select a point on the chart.");
  }

  function removeDrawing(id) {
    setDrawings((current) => current.filter((drawing) => drawing.id !== id));
    setDrawingMessage("Drawing removed.");
  }

  function clearDrawings() {
    setDrawings([]);
    pendingPointRef.current = null;
    setPendingPoint(null);
    setDrawingMessage("Drawings cleared.");
  }

  return (
    <div
      ref={chartRootRef}
      className={`interactive-chart ${fullScreen && !fullscreenInModal ? "interactive-chart-fullscreen" : ""}`}
    >
      <div className="chart-interaction-bar">
        <div className="chart-crosshair-data" aria-live="polite">
          <strong>{displayedCandle.date}</strong>
          <span>O {money(displayedCandle.open)}</span>
          <span>H {money(displayedCandle.high)}</span>
          <span>L {money(displayedCandle.low)}</span>
          <span>C {money(displayedCandle.close)}</span>
        </div>
        <div className="chart-tools">
          <select className="chart-compact-select" aria-label="Chart type" value={chartType} onChange={(event) => setChartType(event.target.value)}>
            <option value="candles">Candles</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="heikin">Heikin Ashi</option>
          </select>

          <details className="chart-menu">
            <summary>Indicators <span>{activeIndicatorCount}</span></summary>
            <div className="chart-menu-popover chart-indicator-menu">
              {INDICATOR_OPTIONS.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={indicators[key]}
                    onChange={(event) => setIndicators((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </details>

          <details className="chart-menu">
            <summary>Zones</summary>
            <div className="chart-menu-popover">
              <label>
                <input type="checkbox" checked={showZones} onChange={(event) => setShowZones(event.target.checked)} />
                <span>Show zone lines</span>
              </label>
              {Object.entries(TIMEFRAME_LABELS).map(([timeframe, label]) => (
                <label key={timeframe}>
                  <input
                    type="checkbox"
                    checked={visibleTimeframes.includes(timeframe)}
                    onChange={(event) => setVisibleTimeframes((current) => (
                      event.target.checked
                        ? [...new Set([...current, timeframe])]
                        : current.filter((value) => value !== timeframe)
                    ))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </details>

          <details className="chart-menu">
            <summary>Draw <span>{drawings.length}</span></summary>
            <div className="chart-menu-popover chart-drawing-menu">
              <label className="chart-menu-field">
                <span>Tool</span>
                <select value={drawingTool} onChange={changeDrawingTool}>
                  <option value="pan">Pan / crosshair</option>
                  <option value="trend">Trend line</option>
                  <option value="horizontal">Horizontal line</option>
                </select>
              </label>
              {pendingPoint && <small className="chart-pending-drawing">Trend line start: {pendingPoint.time}</small>}
              <div className="chart-drawing-list">
                {drawings.map((drawing, index) => (
                  <div key={drawing.id}>
                    <span>{drawing.type === "horizontal" ? `Horizontal ${money(drawing.price)}` : `Trend line ${index + 1}`}</span>
                    <button type="button" aria-label={`Delete ${drawing.type} drawing`} onClick={() => removeDrawing(drawing.id)}>×</button>
                  </div>
                ))}
              </div>
              {drawings.length > 0 && <button className="chart-menu-action" type="button" onClick={clearDrawings}>Clear all drawings</button>}
              {drawingMessage && <small className="chart-pending-drawing" role="status">{drawingMessage}</small>}
            </div>
          </details>

          <button className="chart-compact-button" type="button" onClick={() => chartRef.current?.timeScale().fitContent()}>Reset view</button>
          <span className="chart-layout-status" role="status">{layoutStatus}</span>
          {fullScreen && (
            <select
              className="chart-compact-select chart-fullscreen-timeframe"
              aria-label="Fullscreen chart timeframe"
              value={selectedTimeframe}
              onChange={(event) => onTimeframeChange?.(event.target.value)}
            >
              {Object.entries(TIMEFRAME_LABELS).map(([timeframe, label]) => (
                <option key={timeframe} value={timeframe}>{label}</option>
              ))}
            </select>
          )}
          <button
            className="chart-compact-button chart-fullscreen-button"
            type="button"
            aria-label={fullScreen ? "Exit fullscreen chart" : "Expand chart"}
            aria-pressed={fullScreen}
            title={fullScreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onToggleFullScreen}
          >{fullScreen ? "↙" : "⛶"}</button>
        </div>
      </div>
      <div
        className="price-chart-wrap"
        ref={containerRef}
        role="img"
        aria-label={`${chartType} price chart with interactive technical indicators and drawings`}
      />
      {drawingTool !== "pan" && <div className="chart-drawing-hint">{drawingTool === "trend" ? "Click two points in the main price pane to place a trend line." : "Click the main price pane to place a horizontal line."}</div>}
      <div className="chart-help">Drawings and chart settings save automatically for this stock and timeframe. Scroll or pinch to zoom · drag to pan · move the crosshair to inspect OHLC.</div>
    </div>
  );
}
