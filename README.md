# Pivot — Nifty 100 Price Action Scanner

Pivot is a React dashboard backed by a FastAPI service. The backend downloads daily OHLCV candles for the configured NSE stock universe from Yahoo Finance; the frontend refreshes the data every 60 seconds and scans it for price-action setups. Yahoo Finance data can be delayed and is not a guaranteed real-time exchange feed.

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

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API is available at `http://127.0.0.1:8000`; `/api/health` checks that it is running. Set `VITE_API_URL` before starting Vite if the API is hosted elsewhere.

## Features

- Polls the backend for NSE daily candles every 60 seconds; backend responses are cached briefly to reduce provider requests.
- Scans for a 20-session resistance breakout with volume confirmation, a bullish pullback near a rising 20-day EMA, or an inside-bar breakout.
- Shows entry, invalidation, and a mechanical 2R reference target; these are educational estimates, not trade recommendations.
- Filters by setup, searches and sorts results, and stores the watchlist in browser storage.
- Imports OHLCV candles from a local CSV file. Imported CSV data stays in the browser and pauses live polling until you return to live data.

### CSV format

Include a header row with these columns (column order may vary):

```csv
date,symbol,open,high,low,close,volume
2026-10-01,RELIANCE,1450.0,1470.0,1440.0,1462.0,1200000
```

At least 25 candles per symbol are required. Symbols may include or omit the `.NS` suffix.

## Data and risk notes

Market data depends on Yahoo Finance availability, symbol coverage, and rate limits. The scanner surfaces provider errors rather than substituting synthetic prices. A displayed target is a mechanical 2R reference, not a forecast. This tool is for educational research only, not investment advice; verify prices, liquidity, corporate actions, and risk independently.
