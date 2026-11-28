SECTOR_INDEXES = {
    "auto": {"name": "NIFTY Auto", "ticker": "^CNXAUTO", "is_proxy": False},
    "bank": {"name": "NIFTY Bank", "ticker": "^NSEBANK", "is_proxy": False},
    "consumer": {"name": "NIFTY Consumer Durables", "ticker": "^CNXCONSUM", "is_proxy": False},
    "digital": {"name": "NIFTY India Digital ETF proxy", "ticker": "TNIDETF.NS", "is_proxy": True},
    "energy": {"name": "NIFTY Energy", "ticker": "^CNXENERGY", "is_proxy": False},
    "financial": {"name": "NIFTY Financial Services", "ticker": "^CNXFIN", "is_proxy": False},
    "fmcg": {"name": "NIFTY FMCG", "ticker": "^CNXFMCG", "is_proxy": False},
    "healthcare": {"name": "NIFTY Healthcare", "ticker": "NIFTY_HEALTHCARE.NS", "is_proxy": False},
    "infrastructure": {"name": "NIFTY Infrastructure", "ticker": "^CNXINFRA", "is_proxy": False},
    "it": {"name": "NIFTY IT", "ticker": "^CNXIT", "is_proxy": False},
    "media": {"name": "NIFTY Media", "ticker": "^CNXMEDIA", "is_proxy": False},
    "metal": {"name": "NIFTY Metal", "ticker": "^CNXMETAL", "is_proxy": False},
    "pharma": {"name": "NIFTY Pharma", "ticker": "^CNXPHARMA", "is_proxy": False},
    "psu_bank": {"name": "NIFTY PSU Bank", "ticker": "^CNXPSUBANK", "is_proxy": False},
    "realty": {"name": "NIFTY Realty", "ticker": "^CNXREALTY", "is_proxy": False},
}

_STOCKS_BY_SECTOR = {
    "auto": (
        "ASHOKLEY", "BAJAJ-AUTO", "BOSCHLTD", "EICHERMOT", "HEROMOTOCO",
        "MARUTI", "M&M", "MOTHERSON", "TATAMOTORS", "TVSMOTOR",
    ),
    "bank": (
        "AXISBANK", "FEDERALBNK", "HDFCBANK", "ICICIBANK", "INDUSINDBK",
        "KOTAKBANK", "YESBANK",
    ),
    "consumer": (
        "ASIANPAINT", "BERGEPAINT", "DMART", "HAVELLS", "PAGEIND",
        "PIDILITIND", "TITAN", "TRENT",
    ),
    "digital": ("BHARTIARTL", "IDEA", "INDUSTOWER", "PAYTM", "ZOMATO"),
    "energy": ("GAIL", "IOC", "IREDA", "NTPC", "ONGC", "POWERGRID", "RELIANCE", "BPCL"),
    "financial": (
        "BAJAJFINSV", "BAJFINANCE", "BSE", "CHOLAFIN", "HDFCLIFE",
        "ICICIGI", "ICICIPRULI", "JIOFIN", "LICI", "MANAPPURAM",
        "PFC", "POLICYBZR", "RECLTD", "SBILIFE", "SHRIRAMFIN",
    ),
    "fmcg": (
        "BRITANNIA", "COLPAL", "DABUR", "GODREJCP", "HINDUNILVR",
        "ITC", "MARICO", "NESTLEIND", "TATACONSUM", "VBL",
    ),
    "healthcare": ("APOLLOHOSP", "MAXHEALTH"),
    "infrastructure": (
        "ADANIENT", "ADANIPORTS", "AMBUJACEM", "BEL", "CONCOR",
        "GRASIM", "HAL", "INDIGO", "LT", "SIEMENS", "ULTRACEMCO",
    ),
    "it": ("HCLTECH", "INFY", "NAUKRI", "OFSS", "TCS", "TECHM", "WIPRO"),
    "media": (),
    "metal": ("COALINDIA", "HINDALCO", "JSWSTEEL", "TATASTEEL"),
    "pharma": (
        "AUROPHARMA", "CIPLA", "DIVISLAB", "DRREDDY", "LUPIN",
        "SUNPHARMA", "TORNTPHARM", "ZYDUSLIFE",
    ),
    "psu_bank": ("BANKBARODA", "CANBK", "PNB", "SBIN"),
    "realty": ("DLF",),
}

STOCK_SECTOR_INDEX = {
    symbol: SECTOR_INDEXES[sector]
    for sector, symbols in _STOCKS_BY_SECTOR.items()
    for symbol in symbols
}
