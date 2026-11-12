# Pivot — Nifty 100 Price Action Scanner

A responsive, browser-only swing-trade research dashboard for scanning Nifty 100 stocks for daily price-action patterns.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static web server. No build step, API key, or backend is needed.

## What it does

- Scans a 100-symbol Nifty-universe watchlist for three daily setups: 20-session resistance breakout with volume confirmation, bullish pullback near a rising 20-day EMA, and inside-bar breakout.
- Estimates an invalidation level from recent lows / ATR and displays a 2R reference target.
- Filters by setup, searches by company or symbol, sorts results, and stores a local watchlist in browser storage.
- Imports OHLCV candles from a CSV file and performs the scan locally in your browser.

### CSV format

Include a header row with these columns (column order may vary):

```csv
date,symbol,open,high,low,close,volume
2026-10-01,RELIANCE,1450.0,1470.0,1440.0,1462.0,1200000
```

Import at least 25 candles per symbol for the scanner to calculate its indicators. Symbols may be provided with or without the `.NS` suffix. The CSV is not uploaded to a server. This starter app does not fetch live market data; use a trusted data provider to prepare your own OHLCV file.

## Important

The default cards use generated **synthetic demo data**, not actual or current stock prices. This tool is for educational research only, not investment advice. Price-action signals can be wrong; verify prices, liquidity, corporate actions, and risk independently. A displayed target is a mechanical 2R reference, not a forecast.
