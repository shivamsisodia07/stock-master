# swingTrader — Multi-Timeframe Zone Scanner

swingTrader is a React dashboard backed by a modular FastAPI service. It scans Nifty 100 price structure for demand and supply zones across daily, weekly, and monthly candles. Yahoo Finance intraday quotes are polled every 60 seconds and may be delayed; they are not a guaranteed real-time exchange feed.

## Requirements

- Node.js 18+
- Python 3.10+

## Run locally (Windows)

Install Python 3.10 or newer from [python.org](https://www.python.org/downloads/windows/). In the installer, enable **Add python.exe to PATH**. Close and reopen your terminal, then verify Python is available:

```powershell
python --version
```

The `python` command should print a version number, not open the Microsoft Store. If Windows still resolves it to `WindowsApps`, turn off the `python.exe` and `python3.exe` App execution aliases in **Settings → Apps → Advanced app settings → App execution aliases**, then reopen the terminal.

From the project directory, create the ignored `.venv` environment and install the backend dependencies. In PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

In Git Bash, use:

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, install and start the React frontend from its separate folder:

```powershell
cd frontend
npm install
npm run dev
```

The frontend uses Tailwind CSS utilities for responsive layouts and Axios for API requests. The existing stylesheet retains specialized chart and component visuals.

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API is available at `http://127.0.0.1:8000`; `/api/health` checks that it is running. API documentation is available at `/docs` and `/api/docs`.

For a backend-only deployment, build the frontend from its folder before starting FastAPI:

```powershell
cd frontend
npm install
npm run build
cd ..
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The production build is written to `backend/static`; FastAPI serves the app and its client-side routes from `/`, and serves the API on `/api`. Production API calls use the same origin by default. Set `VITE_API_BASE_URL` before building only if the API is hosted on a different origin.

## Features

- Refreshes intraday quotes every 60 seconds and displays quote age and latest daily candle date.
- Refreshes the Nifty 100 constituents from the NSE Indices CSV weekly; if unavailable, the UI marks that it is using the bundled fallback list.
- Downloads about two years of daily candles, ten years of weekly candles, and the maximum monthly history available from Yahoo Finance.
- Classifies candles by the 50% body/range rule; detects DBR, RBR, RBD, DBD, and direct no-base reversals. Still-forming candles are excluded from zone detection.
- Discards broken zones, zones with two or more retests, and zones without a closing move beyond the leg-in extreme within the first three leg-out candles. A body crossing the proximal line counts as a retest; a wick-only touch counts only if followed by a later exciting leg-out in the zone's direction. Closes beyond the distal line break the zone.
- Shows the selected timeframe's nearby demand and supply zones, a weighted zone score out of 7, and the current quote's location between the distal-line stop and target. Monthly is the default timeframe; other timeframe context is shown on each stock's detail page. Zones below 5/7 are excluded throughout the scanner and chart overlays.
- Filters scanner and watchlist results by timeframe, demand/supply, score (5 to 7 in half-point increments), zone freshness (fresh or tested once), entry distance, and reward-to-risk.
- Measures entry distance from the proximal line, shows the stop-to-target range and current-price location, and filters by entry distance and minimum reward-to-risk (default 2R).
- Provides a home page, learning center, scanner, watchlist, alerts, and per-stock detail pages with browser back/forward navigation. The learning center covers price action, zone identification, scoring, strategy frameworks, trade planning, and risk. Stock detail pages show trade plans for every available timeframe plus recent Yahoo Finance news and company calendar dates.
- Offers compact table and tile layouts for scanner results.
- Imports OHLC CSV files with date, symbol, open, high, low, close, and volume columns; imported prices remain static, while weekly and monthly candles are aggregated from the provided daily data.
- Saves watchlist symbols, alert rules, and recent alert history in browser storage. Optional browser notifications trigger when a refreshed quote enters a saved zone.
- Provides full-page interactive candlestick charts with one nearest zone per timeframe. The selected timeframe is shown by default; overlays for other timeframes can be toggled individually or hidden together. Charts also support daily/weekly/monthly/quarterly views, volume, SMA 20/50 overlays, crosshair OHLC details, pan/zoom, and per-stock notes.

### Zone score

The score has three weighted parts: freshness is 3 points when fresh and 1.5 when tested once; strength is 2 points for two exciting legs, 2 for one exciting leg plus a directional gap, 1 for one exciting leg, and 0 otherwise; base length is 2 points for 1–3 candles, 1 for 4–5 candles, and 0 otherwise. A demand gap means the leg-out low is above the previous candle high; a supply gap means the leg-out high is below the previous candle low. Current candidate detection still requires both incoming and outgoing legs to be exciting, so the one-exciting strength cases are not currently generated. Base runs of any length are measured. Only zones scoring at least 5/7 are retained.

For a direct no-base reversal, the incoming leg's body and wick are used as proxy zone bounds. Entry is the proximal line and stop is the distal line. The target uses the nearest opposing zone's proximal edge when it is on the reward side; otherwise it falls back to 2R. Entry distance is measured from the proximal line, and the reward/risk filter uses this target. Quarterly candles are aggregated from monthly history; chart overlays show only the nearest zone for each timeframe. Alerts are evaluated from the 60-second quote refresh and trigger on a transition into the saved zone; they are not server-side or guaranteed delivery.

## Project layout

```text
backend/
  data/          # Nifty 100 universe
  services/      # Market-data retrieval, CSV import, and zone rules
  tests/         # Zone-engine and CSV-import tests
  main.py        # FastAPI routes
frontend/
  src/components/ # Shared workspace layout
  src/features/  # Scanner, charts, alerts, watchlist
  src/lib/       # API, browser storage, and route helpers
  src/styles/    # Global styles
```

CSV imports accept common header aliases such as `timestamp`, `ticker`, `o`, `h`, `l`, `c`, and `vol`. Each included symbol needs at least 25 valid daily candles. Weekly, monthly, and quarterly candles are aggregated from the imported daily data. Imported CSV prices do not update live; return to live data to resume Yahoo Finance quotes and alert evaluation.

## Data and risk notes

Market data depends on Yahoo Finance and NSE Indices availability, symbol coverage, and rate limits. If the official Nifty 100 constituent list cannot be refreshed, the API reports use of its bundled fallback list; partial candle-download failures are also surfaced. Zones and scores are automated readings that can miss context. A displayed 2R level is a mechanical reference, not a forecast. This tool is for educational research only, not investment advice; verify prices, liquidity, corporate actions, and risk independently.
