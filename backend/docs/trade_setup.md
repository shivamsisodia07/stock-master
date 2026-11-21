# HIT to YIT: Multi-Timeframe Supply and Demand Swing Trading Setup

**Market:** Indian equities (Nifty 100 universe)
**Style:** Swing and positional trading, long only in the cash market
**Version:** 1.1, updated 2026-11-20

---

## Contents

- [HIT to YIT: Multi-Timeframe Supply and Demand Swing Trading Setup](#hit-to-yit-multi-timeframe-supply-and-demand-swing-trading-setup)
  - [Contents](#contents)
  - [1. Core philosophy](#1-core-philosophy)
  - [2. Timeframe hierarchy (hourly to yearly)](#2-timeframe-hierarchy-hourly-to-yearly)
  - [3. The six setups: HIT, DIT, WIT, MIT, QIT, YIT](#3-the-six-setups-hit-dit-wit-mit-qit-yit)
    - [3.1 Summary table](#31-summary-table)
    - [3.2 HIT: Hourly Income Trade](#32-hit-hourly-income-trade)
    - [3.3 DIT: Daily Income Trade](#33-dit-daily-income-trade)
    - [3.4 WIT: Weekly Income Trade](#34-wit-weekly-income-trade)
    - [3.5 MIT: Monthly Income Trade](#35-mit-monthly-income-trade)
    - [3.6 QIT: Quarterly Income Trade](#36-qit-quarterly-income-trade)
    - [3.7 YIT: Yearly Income Trade](#37-yit-yearly-income-trade)
    - [3.8 Choosing a speed](#38-choosing-a-speed)
    - [3.9 Stacking and confluence](#39-stacking-and-confluence)
  - [4. Supply and demand zones](#4-supply-and-demand-zones)
    - [4.1 Concept](#41-concept)
    - [4.2 Patterns](#42-patterns)
    - [4.3 Identification](#43-identification)
    - [4.4 Quality scoring (out of 10)](#44-quality-scoring-out-of-10)
    - [4.5 Freshness and lifecycle](#45-freshness-and-lifecycle)
    - [4.6 Marking workflow](#46-marking-workflow)
    - [4.7 Supply zone approach](#47-supply-zone-approach)
    - [4.8 Zones by timeframe](#48-zones-by-timeframe)
  - [5. Trend filter](#5-trend-filter)
  - [6. Execution trigger](#6-execution-trigger)
  - [7. Trade plan: entry, stop, target](#7-trade-plan-entry-stop-target)
  - [8. Risk and position sizing](#8-risk-and-position-sizing)
  - [9. Quality filters](#9-quality-filters)
  - [10. Short side (futures only)](#10-short-side-futures-only)
  - [11. Scanner and tracker workflow](#11-scanner-and-tracker-workflow)
  - [12. Default parameters](#12-default-parameters)
  - [13. Backtesting and validation](#13-backtesting-and-validation)
  - [14. Common mistakes](#14-common-mistakes)
  - [15. Checklists](#15-checklists)
    - [Pre-trade](#pre-trade)
    - [Post-trade journal](#post-trade-journal)
    - [Weekly review](#weekly-review)
  - [16. Worked examples](#16-worked-examples)
    - [MIT long (hypothetical large-cap bank stock)](#mit-long-hypothetical-large-cap-bank-stock)
    - [WIT long (hypothetical IT stock)](#wit-long-hypothetical-it-stock)
    - [Rejected trade](#rejected-trade)
  - [17. Limitations and future improvements](#17-limitations-and-future-improvements)

---

## 1. Core philosophy

**Top timeframe tells you WHERE to trade, the middle timeframe tells you WHICH DIRECTION, and the lowest timeframe tells you WHEN.**

Principles:

- Trade with the higher timeframe. A lower timeframe signal against the higher trend has low odds.
- Buy at demand, where institutions bought before. Take profit at supply, where they sold before.
- Location first, trigger second. A good trigger at a bad location is a bad trade.
- Risk is defined by the zone. The stop goes just beyond the zone, so the idea is wrong if the zone fails.
- Use only completed higher-timeframe candles. Using a forming candle is lookahead bias and gives false confidence.
- Fewer high-quality trades beat many average ones.
- Capital protection comes before profit.

---

## 2. Timeframe hierarchy (hourly to yearly)

Use roughly a 4x to 6x ratio between the location, trend and execution layers.

| Timeframe | Role | How to use it | Review frequency | Tradable directly |
|---|---|---|---|---|
| **Yearly** | Secular context and major structure | Mark all-time highs, multi-year bases and long-term zones. Decide if the stock is in a long-term uptrend, range or downtrend. Avoid buying directly into yearly supply. | Once or twice a year | No (except YIT) |
| **Quarterly** | Cycle and earnings-season context | Confirm multi-quarter trend. Spot large supply zones that cap rallies. | Once per quarter | No (except QIT) |
| **Monthly** | Location layer for MIT, and the major zone map for all setups | Strongest demand and supply zones live here. A monthly demand zone with a weekly uptrend is the best swing long location. Monthly supply above price defines the ceiling. | After month end | No |
| **Weekly** | Trend layer for MIT, location layer for WIT | Confirm structure with higher highs and higher lows. EMA 20 above EMA 50 is additional support. Mark intermediate zones inside monthly zones. | Weekend, after Friday close | No |
| **Daily** | Location layer for DIT, trend layer for WIT, execution layer for MIT | Entry trigger for MIT. Trend filter for WIT. Manage stops, trailing and exits. | Every day after close | Yes |
| **4-hour** | Optional refinement | Refine entries and stops inside a daily or weekly zone. NSE has no native 4-hour candle, so resample 1-hour data. | As needed | Yes |
| **1-hour** | Location layer for HIT, trend layer for DIT | Confirm the hourly location or 1-hour trend. Yahoo gives only about 2 years of 1-hour data. | End of day or fixed times | Yes |
| **15-minute** | Trend layer for HIT, execution layer for DIT | Confirm the HIT trend or execute DIT entries once price is inside the daily zone. | During market hours | Yes |
| **5-minute** | Execution layer for HIT | Entry trigger inside a valid 1-hour demand zone. | During market hours | Yes |

---

## 3. The six setups: HIT, DIT, WIT, MIT, QIT, YIT

The same engine runs at six speeds. Every setup uses three layers: location, trend and execution. Pick the speed that fits your time, capital, temperament and cost tolerance.

**What stays identical in every setup**

The base trade setup always consists of three parts:

- **Location:** fresh demand zone on the location timeframe. Supply zones provide targets.
- **Trend:** trend direction is confirmed on the trend timeframe.
- **Execution:** a valid entry trigger fires on the execution timeframe after price returns to the zone.

EMA 20 and EMA 50 are additional trend support. They confirm or strengthen the trend, but EMA alignment is not a fourth entry condition. EMA 9 is the default execution trigger on the execution timeframe.

### 3.1 Summary table

| Setup | Full form | Location | Trend | Execution | Holding |
|---|---|---|---|---|---|
| **HIT** | Hourly Income Trade | 1 hour | 15 minute | 5 minute | Minutes to 1 day |
| **DIT** | Daily Income Trade | Daily | 1 hour | 15 minute | 1 to 3 days |
| **WIT** | Weekly Income Trade | Weekly | Daily | 1 hour | 1 to 7 days |
| **MIT** | Monthly Income Trade | Monthly | Weekly | Daily | 1 to 6 weeks |
| **QIT** | Quarterly Income Trade | Quarterly | Monthly | Weekly | 2 to 6 months |
| **YIT** | Yearly Income Trade | Yearly | Quarterly | Monthly | 1 to 3+ years |

### 3.2 HIT: Hourly Income Trade

Fastest setup. Intraday to overnight trades in liquid Nifty 100 names.

**Location:** 1-hour. **Trend:** 15-minute. **Execution:** 5-minute.

**Zone notes**
- Use fresh 1-hour demand zones, and respect the daily and weekly zones around them.
- A 1-hour zone inside a daily or weekly demand zone is far stronger.

**Entry conditions**
- 5-minute low reaches the proximal edge of a fresh 1-hour demand zone.
- The 15-minute trend is up, with higher highs and higher lows.
- A 5-minute execution trigger fires after the dip into the zone.

Additional support: 15-minute EMA 20 above EMA 50; 5-minute close above the 9 EMA.

**Management**
- If held intraday as MIS, square off before the broker cut-off (about 15:15 to 15:20 IST).
- If carried overnight as delivery, accept gap risk and halve size.
- Trail under the last 15-minute swing low.
- Time stop: exit if nothing happens within about 8 to 12 fifteen-minute bars.

**Suitable for:** full-time traders who can monitor the market during the session.

**Cautions**
- Highest cost drag (brokerage, STT, slippage). Tiny edges vanish after costs.
- Most noise and the most over-trading. Cap trades per day (for example 3) and stop after 2 consecutive losses.
- Avoid the first 15 minutes after the open and the last 15 minutes before the close.
- Yahoo gives only about 60 days of 15-minute data, so use a broker API for any real backtest.

**Scan frequency:** every 15 to 60 minutes during market hours.

### 3.3 DIT: Daily Income Trade

Short swing trades lasting a few sessions.

**Location:** daily. **Trend:** 1-hour. **Execution:** 15-minute.

**Zone notes**
- Use fresh daily demand zones, ideally inside a weekly demand zone.
- Daily zones are the nearest tradable supply targets for the longer setups too.

**Entry conditions**
- 15-minute low reaches the proximal edge of a fresh daily demand zone.
- The 1-hour trend is up, with higher highs and higher lows.
- A 15-minute execution trigger fires after the dip into the zone.

Additional support: 1-hour EMA 20 above EMA 50; 15-minute close above the 9 EMA.

**Management**
- Trail under the last 1-hour swing low or the 1-hour 20 EMA.
- Time stop: exit if flat after about 3 to 4 sessions.
- Book a partial at 1R and move the stop to breakeven.

**Suitable for:** part-time traders who can check charts a few times per day.

**Cautions:** overnight gap risk (avoid earnings and major events), and moderate cost drag.

**Scan frequency:** after close and once or twice during the day.

### 3.4 WIT: Weekly Income Trade

Shorter swing trade, holding hours to several days.

**Location:** weekly. **Trend:** daily. **Execution:** 1-hour.

**Entry conditions**
- Hourly low touches the proximal edge of a valid weekly demand zone.
- The daily trend is up, with higher highs and higher lows.
- An hourly execution trigger fires after the dip into the zone.

Additional support: daily EMA 20 above EMA 50; hourly close above the hourly 9 EMA.

**Typical holding:** 1 to 7 trading days, about 4 to 12 trades per stock per year.

**Scan frequency:** end of day, and optionally once or twice intraday.

### 3.5 MIT: Monthly Income Trade

Longer swing trade, holding days to a few weeks.

**Location:** monthly. **Trend:** weekly. **Execution:** daily.

**Entry conditions**
- Daily low touches the proximal edge of a valid monthly demand zone.
- The weekly trend is up, with higher highs and higher lows.
- A daily execution trigger fires after the dip into the zone.

Additional support: weekly EMA 20 above EMA 50; daily close above the daily 9 EMA.

**Typical holding:** 1 to 6 weeks, about 1 to 4 trades per stock per year.

**Scan frequency:** daily after close, with the zone map refreshed monthly.

### 3.6 QIT: Quarterly Income Trade

Slow swing or positional trade riding a multi-month move out of a major zone.

**Location:** quarterly (built from monthly data). **Trend:** monthly. **Execution:** weekly.

**Zone notes**
- Quarterly zones are major structural levels that often coincide with large monthly zones.
- Very few exist per stock, so build them from 15 or more years of data.
- Monthly and quarterly supply provide targets, and they can be far away.

**Entry conditions**
- Weekly low reaches the proximal edge of a fresh quarterly demand zone.
- The monthly trend is up, with higher highs and higher lows.
- A weekly execution trigger fires after the dip into the zone.

Additional support: monthly EMA 20 above EMA 50; weekly close above the weekly 9 EMA.

**Management**
- Trail under the last weekly swing low or the weekly 20 EMA.
- Time stop: review if flat after about 12 to 16 weeks.
- Scale out in thirds at 1R, 2R and the supply zone.
- Exit if the monthly trend flips to a downtrend.

**Suitable for:** positional traders and investors who check weekly.

**Cautions**
- Wide stops mean small position sizes. Size strictly by the risk formula.
- Capital is tied up for months.
- Very few signals per year. Do not force trades.

**Scan frequency:** weekly, after Friday close.

### 3.7 YIT: Yearly Income Trade

Long-term positional or investing setup. Buys major yearly demand in a long-term uptrend.

**Location:** yearly (built from monthly data). **Trend:** quarterly. **Execution:** monthly.

**Zone notes**
- Yearly zones are rare, so many stocks never have one. Quality matters far more than quantity.
- Needs 20 to 30 or more years of history. Stocks with short listing history cannot be analysed reliably.
- Yearly zones often line up with multi-year bases and major crash lows (for example 2008 and 2020).
- Yearly supply zones and all-time highs define long-term targets.

**Entry conditions**
- Monthly low reaches the proximal edge of a fresh yearly demand zone.
- The quarterly trend is up, with higher highs and higher lows.
- A monthly execution trigger fires after the dip into the zone.

Additional support: quarterly EMA 20 above EMA 50; monthly close above the monthly 9 EMA.

**Management**
- Trail under the last monthly swing low or the monthly 20 EMA.
- Scale in across 2 to 3 tranches inside the zone instead of one lump sum.
- Scale out near yearly supply. Keep a runner only if price closes above the supply distal edge.
- Exit if a monthly candle closes below the yearly zone distal edge.
- Review fundamentals yearly: earnings growth, debt, governance and sector outlook.

**Suitable for:** investors with a multi-year horizon who can tolerate deep drawdowns.

**Cautions**
- Very few data points, so statistical validation is weak. Treat it as a framework, not a proven system.
- Deep drawdowns can occur before the thesis plays out. Size small and diversify.
- Long-term capital gains tax applies after 12 months.
- Fundamental risk: a technically valid zone can still fail if the business deteriorates.

**Scan frequency:** monthly, after the last trading day of the month.

### 3.8 Choosing a speed

- Less time and low screen exposure: use MIT, QIT or YIT.
- Some time during the day: use DIT or WIT.
- Full-time with fast execution and low costs: HIT is possible but the hardest to make profitable.
- Capital under about 5 lakh: costs hurt HIT and DIT the most, so prefer WIT and above.
- Start with one speed (MIT or WIT is the usual choice). Add others only after 100 or more trades of record.

### 3.9 Stacking and confluence

A slower setup's zone is the map for every faster one. Fast trades should point in the direction of slower zones.

- **YIT demand zone plus MIT trigger:** long-term floor with swing entry, the highest-conviction swing longs.
- **MIT demand zone plus WIT trigger:** monthly floor with weekly-level entry and a tighter stop.
- **WIT demand zone plus DIT or HIT trigger:** use the fast setup only to improve the entry price.

**Conflicts**
- If a slower setup shows a fresh supply zone directly above, skip fast longs because there is little room.
- If the slower trend is down, take fast longs only as short bounces with reduced size.
- When signals clash, the slower timeframe wins.




## 4. Supply and demand zones

### 4.1 Concept

- **Demand zone:** a price area where buying overwhelmed selling, producing a sharp move up. Unfilled buy orders are assumed to remain, so price often bounces on a retest.
- **Supply zone:** a price area where selling overwhelmed buying, producing a sharp move down. Unfilled sell orders remain, so price often stalls or reverses on a retest.
- **Why it works:** large players cannot fill whole orders at once. Leftover orders sit at the origin of the strong move and act on later retests.

### 4.2 Patterns

| Zone | Pattern | Meaning |
|---|---|---|
| Demand | **Drop-Base-Rally (DBR)** | Price falls, pauses in a tight base, then rallies sharply. Potential trend reversal. |
| Demand | **Rally-Base-Rally (RBR)** | Price rallies, consolidates briefly, then rallies again. Continuation in an uptrend. |
| Supply | **Rally-Base-Drop (RBD)** | Price rises, pauses in a tight base, then drops sharply. |
| Supply | **Drop-Base-Drop (DBD)** | Price falls, consolidates briefly, then falls again. |

For longs, prefer RBR inside an uptrend and DBR at a major low. DBR at a key monthly low is the strongest.

### 4.3 Identification

**Base candle:** a small candle (or a cluster of 3 to 4 small candles) showing indecision. Base range is at most 0.7 x ATR(14) of that timeframe.

**Impulse candle:** the candle after the base that moves away with force. Its body is at least 1.5 x ATR(14), ideally 2 x ATR or more. For demand it must close above the base high. For supply it must close below the base low.

**Zone boundaries**

| Zone | Proximal edge (entry reference) | Distal edge (stop reference) |
|---|---|---|
| Demand | Top of the zone: the higher of the base open and close | Bottom of the zone: the lowest low of the base |
| Supply | Bottom of the zone: the lower of the base open and close | Top of the zone: the highest high of the base |

**Availability rule:** a zone only exists after the impulse candle has completed. Never mark or trade it earlier.

### 4.4 Quality scoring (out of 10)

Trade zones scoring **7 or higher**.

| Factor | Points | Guide |
|---|---|---|
| Strength of departure | 0 to 3 | Bigger and faster move away (2 x ATR or more, few overlapping candles) scores higher. |
| Freshness | 0 to 3 | Untouched scores 3, touched once scores 1, touched twice or more scores 0. |
| Time at base | 0 to 2 | 1 to 2 candles scores 2, 3 to 4 candles scores 1, more scores 0. |
| Higher timeframe alignment | 0 to 2 | Zone inside a higher timeframe demand zone, or higher timeframe uptrend, scores 2. |

Extra checks:
- Volume on the impulse candle above its 20-period average.
- Zone width at most about 1.5 x ATR. Wide zones give poor risk-reward.
- Clear space to the next opposing zone of at least 2 x the risk.

### 4.5 Freshness and lifecycle

- **Fresh:** price has never returned to the zone. In the scanner, a later candle wick reaching across the proximal edge counts as a retest even if the body stays outside the zone.
- **Tested once:** one distinct return across the proximal edge. Consecutive candles overlapping the zone are one visit; price must leave before another crossing counts.
- **Weak:** touched two or more times. Each touch consumes orders, so treat it as exhausted.
- **Invalidated:** a candle closes beyond the distal edge on the zone's own timeframe. Remove it immediately.
- **Flipped:** a broken demand zone often becomes supply on a retest, and a broken supply zone often becomes demand. Treat flips as lower-quality, secondary zones.

### 4.6 Marking workflow

1. Start at the highest relevant timeframe (yearly, then monthly, then weekly) and mark the most obvious zones first.
2. Mark only zones that caused a strong departure. Ignore small, messy or overlapping zones.
3. Drop to the next lower timeframe to refine edges and see how price reacted inside it.
4. Remove invalidated zones and update freshness counts.
5. Keep a clean chart showing only the nearest demand below and nearest supply above current price.

### 4.7 Supply zone approach

**As a target for longs**
- The nearest valid supply zone above entry is the natural profit target.
- Take full or partial profit just below the proximal edge of that supply zone.
- If the nearest supply is closer than 2 x the stop distance, skip the trade.

**To avoid bad buys**
- Do not buy a stock sitting directly under a fresh higher-timeframe supply zone.
- Do not buy when demand and supply zones are very close together (no room).

**For exit management**
- If price enters supply and shows rejection (long upper wicks, bearish engulfing, close back below the proximal edge), exit the remaining position.
- If price closes decisively above the distal edge of supply on that zone's timeframe, the zone is broken. It may become new demand, so you may hold or trail.

**Trading supply as a short** applies only via stock futures. See section 10.

**Supply zone checklist**
- Is the zone fresh, or tested at most once?
- Was the move down from the zone strong (1.5 x ATR or more)?
- Is it on the same or a higher timeframe than your location layer?
- Is there enough room between entry and the zone (at least 2R for longs)?

### 4.8 Zones by timeframe

| Timeframe | How its zones are used |
|---|---|
| Yearly | Anchor zones. Directly tradable only through YIT, but a yearly supply or demand overrides everything below it. |
| Quarterly | Cycle zones. Used for QIT, and to judge if a monthly setup is near a major ceiling or floor. |
| Monthly | Primary location for MIT. Strongest probability. |
| Weekly | Primary location for WIT, and refinement zones for MIT. |
| Daily | Location for DIT. Also used for stop placement, trailing and partial targets. |
| 1-hour | Location for HIT and trend for DIT. |
| 15-minute | Trend for HIT and execution for DIT. |
| 5-minute | Execution for HIT. |

---

## 5. Trend filter

**Primary trend rule:** use market structure on the trend timeframe.
- Uptrend: higher highs and higher lows.
- Downtrend: lower highs and lower lows.

**Optional confirmations**
- EMA 20 above EMA 50 for an uptrend, or below it for a downtrend.
- Price above EMA 50 on the trend timeframe.
- Structure of higher highs and higher lows.
- ADX above 20 to avoid choppy sideways markets.
- Relative strength: stock outperforming Nifty 50 over the last 3 months.

**No-trade conditions**
- Trend-timeframe EMAs are tangled or flat (sideways chop).
- Trend timeframe is clearly down while you are looking for a long.

**Anti-lookahead:** use only completed trend-timeframe candles. The value for the current forming candle must not be used.

---

## 6. Execution trigger

**Primary trigger: 9 EMA reclaim.** The candle closes above the 9 EMA after the previous candle closed at or below it. Apply it on the execution timeframe of the chosen setup.

**Alternative triggers**
- Bullish engulfing candle that closes back above the demand zone proximal edge.
- Break of the most recent minor lower-timeframe swing high after a pullback into the zone.
- Pin bar or hammer with a long lower wick inside the zone, entered above its high.
- Higher low inside the zone followed by a close above the prior candle high.

**Entry execution**
- Enter at the next bar open after the signal bar closes. This avoids acting on an unfinished candle.
- Alternative: a buy-stop just above the signal candle high for stricter confirmation.

**Rejections**
- No trigger means no trade. Price sitting in a zone is only a watchlist item.
- Do not enter if the signal candle itself is huge, because the stop would become too wide.

---

## 7. Trade plan: entry, stop, target

**Entry:** after the trigger, at the next bar open (or a buy-stop above the signal candle).

**Stop-loss:** distal edge of the demand zone minus 0.25 x ATR of the execution timeframe. If price closes through the whole zone, the demand thesis is wrong.
- Never widen the stop after entry.
- If the required stop exceeds the setup's maximum stop distance, skip the trade.

**Targets**
- **Target 1:** 1R. Optionally book 25 to 33% and move the stop to breakeven.
- **Target 2:** minimum 2R, or just below the proximal edge of the nearest supply zone, whichever comes first.
- **Target 3:** next higher-timeframe supply zone for the remaining runner.

**Minimum reward-to-risk:** 2.0

**Trailing methods**
- Below the previous swing low on the execution timeframe.
- Below the 20 EMA on the execution timeframe.
- A 2 x ATR chandelier from the highest close.

**Time stops:** see each setup in section 3. For reference, MIT exits if flat after about 15 to 20 trading days, and WIT after about 5 to 7 trading days.

**Exit triggers**
- Stop-loss hit.
- Target hit.
- Close below the 20 EMA on the execution timeframe after reaching 1R.
- Rejection candle at a supply zone.
- Trend timeframe flips from uptrend to downtrend.

---

## 8. Risk and position sizing

**Risk per trade:** 0.5 to 1% of total trading capital (lower for HIT and DIT, see section 3.1).

**Position size formula**

```
Quantity = (Capital x Risk %) / (Entry price - Stop price)
```

**Example**

| Item | Value |
|---|---|
| Capital | 10,00,000 |
| Risk | 1% (10,000) |
| Entry | 1,000 |
| Stop | 950 |
| Quantity | 200 |
| Position value | 2,00,000 |

**Portfolio limits**
- Max open trades: 5 to 8 at a time.
- Max position size: 20% of capital in one stock.
- Max sector exposure: 30%.
- Max total open risk: 5% of capital across all open trades.

**Drawdown rules**
- After 3 consecutive losses, halve position size until a winner.
- If monthly drawdown reaches 5%, pause new trades for the rest of the week.
- If drawdown reaches 10%, stop and review the whole process.

**Costs to account for**
- Brokerage.
- STT, exchange charges, GST, stamp duty and SEBI fees.
- Slippage, which is higher for HIT, DIT and WIT because of intraday entries.
- Taxes: short-term capital gains tax applies to holdings under 12 months.

---

## 9. Quality filters

**Market regime**
- Take longs mainly when the Nifty 50 weekly trend is up. Reduce size or pause when it is in a downtrend.
- When India VIX spikes sharply, reduce size or wait.

**Stock-specific**
- Relative strength versus Nifty 50 positive over 3 months.
- Volume above the 20-day average on the trigger bar.
- Avoid entries 1 to 2 days before earnings results.
- Avoid stocks with pledging, governance or regulatory red flags.

**Event risk**
- RBI policy dates, Union Budget, US Fed meetings, general elections and major geopolitical events.
- Corporate actions such as ex-dividend, splits and bonus (use adjusted data).

**Liquidity:** Nifty 100 names are liquid, but still keep your size under 1% of average daily volume.

---

## 10. Short side (futures only)

Intraday shorting is possible in cash, but swing shorts in India need stock futures.

**Mirror rules**
- **Location:** fresh supply zone on the location timeframe.
- **Trend:** the middle timeframe is in a downtrend, with lower highs and lower lows.
- **Trigger:** close below the 9 EMA on the execution timeframe.
- **Stop:** distal (top) edge of supply plus 0.25 x ATR.
- **Target:** nearest demand zone below, minimum 2R.

EMA 20 below EMA 50 is additional trend support, not a fourth base condition.

**Cautions**
- Futures carry leverage, margin and rollover cost. Size by risk, not by margin.
- Markets drift up over time, so shorts need stricter filters and smaller size.

---

## 11. Scanner and tracker workflow

**Universe:** Nifty 100. Refresh constituents from NSE periodically.

**Status labels**
- **SIGNAL:** in a valid demand zone, trend is up, trigger fired on the last bar. Candidate for entry on the next bar.
- **WATCH:** in a valid demand zone, trend is up, waiting for the trigger.

**Outputs:** symbol, status, close, zone low, stop, target, risk percent, and a NEW flag for stocks that appeared since the previous scan.

**Schedule**

| Frequency | Tasks |
|---|---|
| During market hours (HIT, DIT) | Scan every 15 to 60 minutes. |
| Daily after close | Run MIT (and WIT if used). Review SIGNAL and WATCH lists. Plan next-day orders and alerts. |
| Weekend | Refresh weekly zones and trend state. Review open trades and trailing stops. Check upcoming events and earnings. Run QIT scan. |
| Monthly | Refresh monthly zone map. Review the monthly performance journal. Run YIT scan. |
| Yearly | Re-map yearly levels for focus stocks. Review overall strategy statistics and parameter drift. |

**Manual review after every scan**
- Open the chart and confirm the zone visually. Automated zones can be messy.
- Check the nearest supply zone and room to target.
- Check news, earnings dates and sector trend.
- Only then place the order.

---

## 12. Default parameters

| Parameter | Value |
|---|---|
| ATR period | 14 |
| Zone impulse (ATR multiple) | 1.5 |
| Zone base max (ATR multiple) | 0.7 |
| Zone max width (ATR multiple) | 1.5 |
| Minimum zone quality score | 7 |
| Trend fast / slow EMA | 20 / 50 |
| Trigger EMA | 9 |
| Stop buffer (ATR multiple) | 0.25 |
| Target reward-to-risk | 2.0 |
| Risk per trade | 1.0% (setup-specific, see section 3.1) |

**Tuning note:** change one parameter at a time, test on many stocks and many years, and prefer settings that work across a broad range (a stable plateau) over a single sharp optimum.

---

## 13. Backtesting and validation

**Data requirements**
- Use adjusted prices for splits, bonuses and dividends.
- Include delisted or removed stocks to limit survivorship bias.
- Use point-in-time Nifty 100 membership if possible.

**Biases to avoid**
- **Lookahead:** use only completed higher-timeframe candles and act on the next bar.
- **Survivorship:** do not test only today's index members across the past.
- **Overfitting:** do not tune parameters to maximise a single stock's result.
- **Unrealistic fills:** assume entry at the next open, and if stop and target both hit in one bar, assume the stop first.

**Metrics to track**
- Win rate, average win, average loss and expectancy per trade in R.
- Profit factor.
- Maximum drawdown and longest drawdown period.
- CAGR and Sharpe or Sortino ratio.
- Number of trades (at least 100 for any statistical meaning).
- Results after costs, by year, by market regime and by stock.

**Validation steps**
1. In-sample versus out-of-sample split.
2. Walk-forward testing.
3. Test on different stocks and different market phases (bull, bear, sideways).
4. Paper trade for at least 2 to 3 months before real capital.
5. Start live with half size.

**Expectancy formula**

```
Expectancy (R) = (win rate x average win in R) - (loss rate x average loss in R)
```

---

## 14. Common mistakes

- Trading zones with no strong departure, or zones tested several times.
- Entering without a trigger just because price touched the zone.
- Buying a demand zone that sits right under a higher-timeframe supply zone.
- Ignoring the middle timeframe trend and catching falling knives.
- Using an unfinished higher-timeframe candle (lookahead).
- Widening or removing the stop after entry.
- Oversizing positions after a winning streak.
- Marking too many zones and cluttering the chart.
- Over-trading HIT, DIT and WIT and losing the edge to costs.
- Skipping the journal, so mistakes repeat.
- Trading through earnings or major events without a plan.

---

## 15. Checklists

### Pre-trade
- [ ] Is the zone valid, fresh or tested at most once, and scoring 7 or higher?
- [ ] Is the location-timeframe zone confirmed and not invalidated?
- [ ] Is the trend timeframe in an uptrend?
- [ ] Did the execution trigger fire on a completed candle?
- [ ] Is the nearest supply zone at least 2R away?
- [ ] Is position size based on the setup's risk percentage?
- [ ] Are there no earnings or major events in the next 1 to 2 days?
- [ ] Is total open risk still within portfolio limits?

### Post-trade journal
- Record each trade in the swingTrader **Trade journal**. Open trades can be logged before exit; add both the exit date and price when closing a position.
- Screenshot of the chart with zones, entry, stop and target.
- Setup type (HIT, DIT, WIT, MIT, QIT or YIT), zone score and trigger used.
- Result in R and reason for exit.
- Did you follow every rule? If not, which rule was broken?
- Emotional state and lessons.
- Review cumulative realized P&L and setup-level results regularly. Journal analytics exclude open positions and subtract recorded fees.

### Weekly review
- Update zones and trend state for all watchlist stocks.
- Review all open positions and trailing stops.
- Compute win rate, average R and drawdown for the week or month.
- Plan the next week's watchlist.

---

## 16. Worked examples

These use illustrative numbers.

### MIT long (hypothetical large-cap bank stock)

| Item | Detail |
|---|---|
| Location | Fresh monthly demand zone, 950 to 1000 (proximal 1000, distal 950) |
| Trend | Weekly EMA 20 above EMA 50 |
| Trigger | Daily close above the 9 EMA after a pullback into the zone, signal close 1010 |
| Entry | 1012 |
| Daily ATR | 20 |
| Stop | 945 (950 minus 0.25 x 20) |
| Risk per share | 67 |
| Target at 2R | 1146 |
| Nearest supply | Monthly supply at 1200 to 1260 |
| Verdict | Valid. Reward-to-risk to supply is about 2.8R. |

### WIT long (hypothetical IT stock)

| Item | Detail |
|---|---|
| Location | Fresh weekly demand zone, 1480 to 1500 |
| Trend | Daily EMA 20 above EMA 50 |
| Trigger | Hourly close above the 9 EMA after a dip into the zone |
| Entry | 1508 |
| Hourly ATR | 8 |
| Stop | 1478 |
| Risk per share | 30 |
| Target at 2R | 1568 |
| Verdict | Valid. The stop is under 2%, within the WIT limit of 4%. |

### Rejected trade

Price is in a monthly demand zone and the trigger fired, but a fresh yearly supply zone sits only 1.2R above entry. **Skip.** Reward-to-risk is below the 2R minimum.

---

## 17. Limitations and future improvements

**Limitations**
- Automated zone detection is a simplification. Always review zones visually.
- Yahoo Finance gives about 60 days of 15-minute data and about 2 years of hourly data, which limits HIT, DIT and WIT backtests.
- Zones are subjective, and different traders mark them differently.
- QIT and YIT produce too few signals for strong statistical validation.
- No strategy works in every market regime.

**Future improvements**
- Add automatic supply zone detection and nearest-supply targets in the scanner.
- Add a zone quality score and freshness filter to the scanner output.
- Add relative strength versus Nifty 50 and volume filters.
- Add a position size column and portfolio risk tracker.
- Add alerts via Telegram or email for new SIGNAL entries.
- Extend the scanner to HIT, DIT, QIT and YIT.
- Add a transaction cost model and walk-forward backtest.