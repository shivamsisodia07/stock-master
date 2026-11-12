import csv
import io
import logging
import threading
from datetime import datetime, timedelta, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen


STOCKS = [
    ("RELIANCE", "Reliance Industries"), ("HDFCBANK", "HDFC Bank"),
    ("ICICIBANK", "ICICI Bank"), ("BHARTIARTL", "Bharti Airtel"),
    ("INFY", "Infosys"), ("SBIN", "State Bank of India"),
    ("LICI", "Life Insurance Corp"), ("ITC", "ITC"),
    ("HINDUNILVR", "Hindustan Unilever"), ("LT", "Larsen & Toubro"),
    ("BAJFINANCE", "Bajaj Finance"), ("HCLTECH", "HCL Technologies"),
    ("SUNPHARMA", "Sun Pharmaceutical"), ("MARUTI", "Maruti Suzuki"),
    ("TCS", "Tata Consultancy Services"), ("KOTAKBANK", "Kotak Mahindra Bank"),
    ("AXISBANK", "Axis Bank"), ("M&M", "Mahindra & Mahindra"), ("NTPC", "NTPC"),
    ("TATAMOTORS", "Tata Motors"), ("ULTRACEMCO", "UltraTech Cement"),
    ("ONGC", "Oil & Natural Gas Corp"), ("TITAN", "Titan Company"),
    ("ADANIPORTS", "Adani Ports"), ("POWERGRID", "Power Grid Corp"),
    ("ASIANPAINT", "Asian Paints"), ("COALINDIA", "Coal India"),
    ("ADANIENT", "Adani Enterprises"), ("BAJAJFINSV", "Bajaj Finserv"),
    ("WIPRO", "Wipro"), ("NESTLEIND", "Nestle India"), ("JSWSTEEL", "JSW Steel"),
    ("TATASTEEL", "Tata Steel"), ("GRASIM", "Grasim Industries"), ("TRENT", "Trent"),
    ("HINDALCO", "Hindalco Industries"), ("TECHM", "Tech Mahindra"),
    ("INDUSINDBK", "IndusInd Bank"), ("SBILIFE", "SBI Life Insurance"),
    ("CIPLA", "Cipla"), ("DRREDDY", "Dr. Reddy's Laboratories"),
    ("EICHERMOT", "Eicher Motors"), ("APOLLOHOSP", "Apollo Hospitals"),
    ("DIVISLAB", "Divi's Laboratories"), ("BPCL", "Bharat Petroleum"),
    ("BRITANNIA", "Britannia Industries"), ("TATACONSUM", "Tata Consumer Products"),
    ("HEROMOTOCO", "Hero MotoCorp"), ("BAJAJ-AUTO", "Bajaj Auto"),
    ("HDFCLIFE", "HDFC Life Insurance"), ("SHRIRAMFIN", "Shriram Finance"),
    ("BEL", "Bharat Electronics"), ("PFC", "Power Finance Corp"),
    ("RECLTD", "REC Limited"), ("IOC", "Indian Oil Corp"), ("DABUR", "Dabur India"),
    ("GAIL", "GAIL India"), ("PIDILITIND", "Pidilite Industries"),
    ("AMBUJACEM", "Ambuja Cements"), ("GODREJCP", "Godrej Consumer Products"),
    ("ICICIPRULI", "ICICI Prudential Life"), ("INDIGO", "InterGlobe Aviation"),
    ("MOTHERSON", "Samvardhana Motherson"), ("CANBK", "Canara Bank"),
    ("CHOLAFIN", "Cholamandalam Investment"), ("JIOFIN", "Jio Financial Services"),
    ("TORNTPHARM", "Torrent Pharmaceuticals"), ("TVSMOTOR", "TVS Motor Company"),
    ("HAL", "Hindustan Aeronautics"), ("VBL", "Varun Beverages"),
    ("ZOMATO", "Eternal"), ("DLF", "DLF"), ("NAUKRI", "Info Edge"),
    ("SIEMENS", "Siemens"), ("MAXHEALTH", "Max Healthcare Institute"),
    ("POLICYBZR", "PB Fintech"), ("BOSCHLTD", "Bosch"), ("HAVELLS", "Havells India"),
    ("ICICIGI", "ICICI Lombard"), ("ZYDUSLIFE", "Zydus Lifesciences"),
    ("INDUSTOWER", "Indus Towers"), ("AUROPHARMA", "Aurobindo Pharma"),
    ("MARICO", "Marico"), ("COLPAL", "Colgate-Palmolive India"), ("LUPIN", "Lupin"),
    ("OFSS", "Oracle Financial Services"), ("BERGEPAINT", "Berger Paints India"),
    ("BSE", "BSE"), ("IREDA", "Indian Renewable Energy Dev"),
    ("PAYTM", "One 97 Communications"), ("DMART", "Avenue Supermarts"),
    ("PAGEIND", "Page Industries"), ("CONCOR", "Container Corporation"),
    ("ASHOKLEY", "Ashok Leyland"), ("MANAPPURAM", "Manappuram Finance"),
    ("FEDERALBNK", "Federal Bank"), ("BANKBARODA", "Bank of Baroda"),
    ("PNB", "Punjab National Bank"), ("YESBANK", "Yes Bank"), ("IDEA", "Vodafone Idea"),
]

NIFTY_100_CSV = "https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv"
REFRESH_INTERVAL = timedelta(days=7)
_logger = logging.getLogger(__name__)
_cache: list[tuple[str, str]] | None = None
_cache_refreshed_at: datetime | None = None
_cache_source = "bundled fallback"
_cache_lock = threading.Lock()


def _download_universe() -> list[tuple[str, str]]:
    request = Request(
        NIFTY_100_CSV,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; PivotMarketResearch/1.0)",
            "Referer": "https://www.niftyindices.com/",
        },
    )
    with urlopen(request, timeout=15) as response:
        contents = response.read().decode("utf-8-sig")
    rows = csv.DictReader(io.StringIO(contents))
    universe = []
    for row in rows:
        normalized = {str(key).strip().lower(): value for key, value in row.items() if key}
        symbol = str(normalized.get("symbol", "")).strip().upper()
        name = str(normalized.get("company name", "")).strip()
        if symbol and name and symbol.replace("&", "").replace("-", "").isalnum():
            universe.append((symbol, name))
    if not universe:
        raise ValueError("The NSE Indices constituent file contained no valid Nifty 100 rows.")
    return universe


def get_universe(now: datetime | None = None) -> tuple[list[tuple[str, str]], dict]:
    global _cache, _cache_refreshed_at, _cache_source
    current_time = now or datetime.now(timezone.utc)
    with _cache_lock:
        if _cache is not None and _cache_refreshed_at is not None:
            if current_time - _cache_refreshed_at < REFRESH_INTERVAL:
                return _cache, {
                    "source": _cache_source,
                    "refreshed_at": _cache_refreshed_at.isoformat(),
                }

        try:
            _cache = _download_universe()
            _cache_source = "NSE Indices"
        except (OSError, URLError, ValueError) as error:
            _logger.warning("Could not refresh the Nifty 100 universe; using bundled list: %s", error)
            if _cache is None:
                _cache = STOCKS
            _cache_source = "bundled fallback"

        _cache_refreshed_at = current_time
        return _cache, {
            "source": _cache_source,
            "refreshed_at": _cache_refreshed_at.isoformat(),
        }
