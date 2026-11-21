import React, { lazy, Suspense } from "react";
import WorkspaceLayout, { Breadcrumb } from "../../components/WorkspaceLayout.jsx";
import useMarketData from "../scanner/useMarketData.js";

const TradeSetupDocument = lazy(() => import("./TradeSetupDocument.jsx"));

const LESSONS = [
  ["foundations", "Price-action basics"],
  ["structure", "Reading market structure"],
  ["zones", "Finding demand & supply zones"],
  ["score", "How the zone score works"],
  ["strategies", "Price-action playbooks"],
  ["trade-plan", "Building a trade plan"],
  ["trading-setup", "Complete trading setup"],
  ["advanced", "Advanced context"],
  ["glossary", "Glossary & checklist"],
];

function LessonHeading({ eyebrow, title, description }) {
  return (
    <div className="learn-section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function ConceptCard({ title, children }) {
  return <article className="learn-concept-card"><h3>{title}</h3><div>{children}</div></article>;
}

function PriceActionChart({ variant }) {
  const isDemand = variant === "demand";
  const candles = isDemand
    ? [
      [70, 76, 91, 118, 130], [120, 115, 129, 145, 159], [170, 140, 151, 149, 163],
      [220, 141, 153, 150, 164], [270, 147, 155, 138, 166], [320, 91, 135, 101, 144],
      [370, 68, 101, 79, 110], [420, 58, 81, 57, 96], [470, 43, 58, 46, 69], [520, 31, 47, 37, 61],
    ]
    : [
      [70, 96, 116, 105, 137], [120, 99, 108, 126, 145], [170, 104, 126, 112, 141],
      [220, 101, 116, 130, 143], [270, 105, 132, 117, 146], [320, 78, 123, 92, 136],
      [370, 57, 93, 67, 109], [420, 62, 72, 99, 137], [470, 54, 100, 64, 117], [520, 38, 67, 45, 91],
    ];
  const title = isDemand ? "Drop–Base–Rally demand example" : "Break and retest example";
  const description = isDemand
    ? "Illustration of price departing from a compact base; the highlighted area is a study zone, not a guaranteed reversal."
    : "Illustration of a close above resistance followed by a retest; the pattern is descriptive and can fail.";

  return (
    <figure className="learn-chart-figure">
      <div className="learn-chart">
        <svg viewBox="0 0 600 210" role="img" aria-label={`${title}. ${description}`}>
          {[45, 90, 135, 180].map((y) => <line key={y} x1="30" x2="575" y1={y} y2={y} className="chart-grid-line" />)}
          {isDemand ? (
            <>
              <rect x="145" y="137" width="145" height="31" rx="3" className="chart-demand-zone" />
              <text x="151" y="160" className="chart-label">DEMAND AREA</text>
            </>
          ) : (
            <>
              <line x1="35" x2="570" y1="132" y2="132" className="chart-level-line" />
              <text x="39" y="124" className="chart-label">PRIOR RESISTANCE</text>
              <path d="M398 137l18 13 18-13" className="chart-retest-mark" />
              <text x="436" y="159" className="chart-label">RETEST</text>
            </>
          )}
          {candles.map(([x, high, open, close, low]) => {
            const up = close < open;
            const bodyY = Math.min(open, close);
            const bodyHeight = Math.max(4, Math.abs(close - open));
            return (
              <g key={x} className={up ? "chart-candle-up" : "chart-candle-down"}>
                <line x1={x} x2={x} y1={high} y2={low} />
                <rect x={x - 7} y={bodyY} width="14" height={bodyHeight} rx="1" />
              </g>
            );
          })}
          <text x="30" y="201" className="chart-axis-label">PRICE ACTION · ILLUSTRATIVE</text>
        </svg>
      </div>
      <figcaption><strong>{title}</strong><span>{description}</span></figcaption>
    </figure>
  );
}

export default function LearnPage({ navigate }) {
  const market = useMarketData();

  return (
    <WorkspaceLayout view="learn" navigate={navigate} stocks={market.stocks}>
      <header className="topbar">
        <Breadcrumb navigate={navigate} current="Learn" />
        <button className="text-button" onClick={() => navigate("/scanner")}>Open zone scanner ↗</button>
      </header>

      <header className="learn-hero">
        <div className="eyebrow"><span className="eyebrow-line" />SWINGTRADER LEARNING CENTER</div>
        <h1>Understand price action, <span>step by step.</span></h1>
        <p>Learn how to read candles and market structure, identify supply and demand zones, interpret swingTrader's score, and think through a trade plan.</p>
        <div className="learn-hero-meta"><span>FOUNDATIONS → ADVANCED</span><span>8 concise lessons + full strategy guide · Not investment advice</span></div>
        <div className="learn-header-actions">
          <a href="#foundations">Start with the basics <span aria-hidden="true">↓</span></a>
          <span>8 concise lessons · Basics to advanced</span>
        </div>
      </header>

      <nav className="learn-toc" aria-label="Learning topics">
        {LESSONS.map(([id, title], index) => <a href={`#${id}`} key={id}><span>{String(index + 1).padStart(2, "0")}</span>{title}</a>)}
      </nav>

      <div className="learn-content">
        <section className="learn-section" id="foundations">
          <LessonHeading eyebrow="01 · THE BASICS" title="What is price action?" description="Price action is the study of how traded prices move over time. It starts with the chart itself—not a prediction about what must happen next." />
          <div className="learn-concept-grid">
            <ConceptCard title="Read a candle">
              <p>A candle summarizes one period. The open and close form the body; the high and low form the full range, including the wicks. A close near the high can show buyers held control into the period's end; a long upper wick can show rejection at higher prices. Neither signal is conclusive by itself.</p>
              <ul><li><b>Body:</b> distance between open and close.</li><li><b>Range:</b> high minus low.</li><li><b>Wick:</b> price reached beyond the body before the period closed.</li></ul>
            </ConceptCard>
            <ConceptCard title="Trend, range, or transition">
              <p>Markets do not move in a straight line. They may trend, rotate in a range, or transition between the two. Start with the sequence of swing highs and lows, then mark the areas where price repeatedly reacted.</p>
              <ul><li><b>Uptrend:</b> generally higher highs and higher lows.</li><li><b>Downtrend:</b> generally lower highs and lower lows.</li><li><b>Range:</b> price oscillates between boundaries without sustained progress.</li></ul>
            </ConceptCard>
          </div>
          <div className="learn-callout"><strong>Start with closes and context.</strong> A wick through a level that quickly reverses is different from repeated closes beyond it. Always consider the candle timeframe and surrounding structure.</div>
          <PriceActionChart variant="demand" />
        </section>

        <section className="learn-section" id="structure">
          <LessonHeading eyebrow="02 · MARKET STRUCTURE" title="Read the swings before the setup" description="Structure gives a setup context. It does not guarantee continuation or reversal." />
          <div className="learn-concept-grid">
            <ConceptCard title="Swing highs and lows">
              <p>A swing high is a local peak with lower highs around it; a swing low is a local trough with higher lows around it. The exact lookback used to label swings is a charting choice, so use consistent rules rather than moving the definition after the fact.</p>
            </ConceptCard>
            <ConceptCard title="Break of structure and failed breaks">
              <p>A break of structure (BOS) is a move through a meaningful prior swing in the direction of the prevailing sequence. A close beyond the swing is often treated as stronger evidence than a wick alone. A false break occurs when price crosses a boundary but cannot hold beyond it. These are descriptive terms, not standalone entries.</p>
            </ConceptCard>
          </div>
        </section>

        <section className="learn-section" id="zones">
          <LessonHeading eyebrow="03 · ZONE IDENTIFICATION" title="How to identify demand and supply" description="A zone is an area of prior price activity associated with a strong departure. It is an area to study, not a promise that price will reverse there again." />
          <div className="learn-steps">
            <article><span>1</span><div><h3>Find the departure</h3><p>Look for a decisive move away from a compact pause or base. In this scanner, an “exciting” candle has a real body greater than half of its high-to-low range; other candles are treated as bases.</p></div></article>
            <article><span>2</span><div><h3>Classify the pattern</h3><p><b>DBR</b> (Drop–Base–Rally) and <b>RBR</b> (Rally–Base–Rally) form demand candidates. <b>RBD</b> (Rally–Base–Drop) and <b>DBD</b> (Drop–Base–Drop) form supply candidates. A direct no-base reversal uses the incoming leg as a proxy for the zone bounds.</p></div></article>
            <article><span>3</span><div><h3>Mark the boundaries</h3><p>The scanner uses base candle bodies for the <b>proximal</b> (near) boundary and the furthest base wick for the <b>distal</b> (far) boundary. Exact boundary conventions can differ between methods; consistency matters when reviewing charts.</p></div></article>
            <article><span>4</span><div><h3>Check confirmation and invalidation</h3><p>The detector requires a close beyond the leg-in extreme within the first three leg-out candles. A close beyond the distal boundary breaks the zone. Two or more retests disqualify it in this scanner.</p></div></article>
          </div>
          <div className="learn-concept-grid">
            <ConceptCard title="Retests and freshness">
              <p>A later candle wick that reaches across the proximal line counts immediately as a test, even when its body does not enter the zone. Consecutive candles overlapping the zone are one visit; a new crossing after price leaves counts again. The scanner distinguishes fresh zones from zones tested once.</p>
            </ConceptCard>
            <ConceptCard title="What “nearby” means here">
              <p>The scanner filters candidate trade plans by entry distance from the proximal line, score, freshness, and reward/risk. Results depend on the selected timeframe and filter settings. Open a stock page to compare its daily, weekly, monthly, and quarterly context.</p>
            </ConceptCard>
          </div>
        </section>

        <section className="learn-section" id="score">
          <LessonHeading eyebrow="04 · THE SCANNER'S MODEL" title="How the zone score works" description="The score is a rule-based quality filter out of seven. It is not a probability, forecast, or measure of expected return." />
          <div className="learn-table-wrap">
            <table className="learn-table">
              <thead><tr><th>Component</th><th>Points</th><th>How swingTrader assigns it</th></tr></thead>
              <tbody>
                <tr><td>Freshness</td><td>3 or 1.5</td><td>3 for a fresh zone; 1.5 for a zone tested once.</td></tr>
                <tr><td>Strength</td><td>0–2</td><td>2 for two exciting legs; 2 for one exciting leg plus a directional gap; 1 for one exciting leg; otherwise 0.</td></tr>
                <tr><td>Base length</td><td>0–2</td><td>2 for 1–3 base candles; 1 for 4–5; 0 for other lengths.</td></tr>
              </tbody>
            </table>
          </div>
          <div className="learn-concept-grid">
            <ConceptCard title="Example calculation">
              <p>A fresh zone with two exciting legs and a 1–3 candle base scores <b>3 + 2 + 2 = 7/7</b>. If that zone is tested once, its freshness points fall to 1.5, making the total <b>5.5/7</b>.</p>
            </ConceptCard>
            <ConceptCard title="Why the minimum is 5/7">
              <p>Zones below 5 are excluded from the scanner and chart overlays. The current detector still requires both incoming and outgoing legs to be exciting, so score paths based on a single exciting leg are part of the scoring rules but are not currently generated by pattern detection.</p>
            </ConceptCard>
          </div>
          <div className="learn-callout"><strong>Use the score as a filter, not a verdict.</strong> It does not include fundamentals, news, liquidity, volatility, slippage, or the probability of a successful trade. A higher score does not eliminate those risks.</div>
        </section>

        <section className="learn-section" id="strategies">
          <LessonHeading eyebrow="05 · PRICE-ACTION PLAYBOOKS" title="Common strategy frameworks" description="These are study frameworks, not buy/sell signals. Define the setup and invalidation before looking for an entry." />
          <div className="learn-strategy-grid">
            <article className="learn-strategy-card"><span>01 · TREND</span><h3>Pullback in trend</h3><p>First identify a sequence of higher highs/lows or lower highs/lows on a chosen context timeframe. Then study whether a pullback reaches a prior reaction area and whether price shows acceptance or rejection there. A trend can end; decide in advance what would invalidate the idea.</p></article>
            <article className="learn-strategy-card"><span>02 · BREAKOUT</span><h3>Break and retest</h3><p>Observe a close beyond a well-defined range or swing level, then study whether a later retest holds on the other side. A wick-only break can fail, and a valid-looking breakout can reverse. Avoid treating the first touch as confirmation.</p></article>
            <article className="learn-strategy-card"><span>03 · RANGE</span><h3>Range rotation</h3><p>When price is clearly rotating between boundaries, compare reactions near the edges and avoid assuming the middle offers the same context. A decisive close outside the range may signal a transition, but false breaks are common.</p></article>
            <article className="learn-strategy-card"><span>04 · CONTEXT</span><h3>Multi-timeframe analysis</h3><p>Use a higher timeframe to describe broad structure, a middle timeframe to locate zones, and a lower timeframe only if it fits your plan. Lower-timeframe detail can conflict with higher-timeframe context; confluence is context, not certainty.</p></article>
          </div>
          <PriceActionChart variant="breakout" />
        </section>

        <section className="learn-section" id="trade-plan">
          <LessonHeading eyebrow="06 · TRADE PLANNING" title="From a zone to a defined plan" description="A repeatable process helps separate a hypothesis from an execution decision." />
          <ol className="learn-checklist">
            <li><b>Write the premise.</b> What structure and reaction make the zone relevant? What evidence would contradict it?</li>
            <li><b>Choose an entry method.</b> A limit entry at a boundary and a wait-for-confirmation entry have different fill rates and risks. The scanner displays the proximal line as a reference; it does not prescribe an entry.</li>
            <li><b>Define invalidation.</b> The scanner uses the distal line as a mechanical stop reference. A gap or fast move can execute beyond a planned level.</li>
            <li><b>Set a target scenario.</b> The displayed target is the nearest opposing zone's proximal edge when it is on the reward side, otherwise a mechanical 2R target.</li>
            <li><b>Check the arithmetic.</b> Risk per share = absolute(entry − stop). Reward/risk = absolute(target − entry) ÷ absolute(entry − stop).</li>
            <li><b>Size for a fixed risk budget.</b> Illustratively, a hypothetical ₹500 risk budget and ₹4 risk per share yields 125 shares before costs, liquidity, and gap risk. This is only arithmetic—not a recommended risk amount or position.</li>
            <li><b>Review after the trade.</b> Log the setup, rules followed, costs, and outcome. Evaluate a series of trades, not one outcome.</li>
          </ol>
        </section>

        <section className="learn-section learn-trade-setup" id="trading-setup" aria-label="Complete trading setup">
          <Suspense fallback={<div className="loading-banner">Loading the full trading setup…</div>}>
            <TradeSetupDocument />
          </Suspense>
        </section>

        <section className="learn-section" id="advanced">
          <LessonHeading eyebrow="07 · ADVANCED CONTEXT" title="Improve the process, not the prediction" description="More chart concepts do not necessarily mean better decisions. Advanced work is about testing assumptions and managing uncertainty." />
          <div className="learn-concept-grid">
            <ConceptCard title="Confluence without double-counting">
              <p>Structure, zones, and a breakout can describe the same underlying price move. Treating every related observation as independent confirmation can create false confidence. Record what each piece of evidence adds and what would disprove it.</p>
            </ConceptCard>
            <ConceptCard title="Freshness, depth, and opposing zones">
              <p>A fresh zone has not had a qualifying retest under this tool's rules; it is not guaranteed to be stronger. Compare zone width, entry distance, opposing areas, and the space to a plausible target. A narrow stop is not automatically safer if price is noisy or liquidity is poor.</p>
            </ConceptCard>
            <ConceptCard title="News, gaps, and execution">
              <p>Scheduled results, corporate actions, and unexpected news can cause gaps through zones and stops. Market orders, limit orders, liquidity, fees, and slippage change real outcomes. The scanner's zone score does not account for these conditions.</p>
            </ConceptCard>
            <ConceptCard title="Backtesting and expectancy">
              <p>Test explicit rules on historical data, then include brokerage, taxes, slippage, missed fills, and survivorship/look-ahead bias. Keep a separate out-of-sample period and compare many trades. Past performance and a high zone score do not assure future results.</p>
            </ConceptCard>
          </div>
        </section>

        <section className="learn-section" id="glossary">
          <LessonHeading eyebrow="08 · QUICK REFERENCE" title="Glossary & pre-trade checklist" />
          <div className="learn-glossary">
            <p><b>Proximal:</b> zone boundary nearest current price in the detector's convention.</p>
            <p><b>Distal:</b> far zone boundary; used as the scanner's mechanical stop reference.</p>
            <p><b>Exciting candle:</b> candle whose body is more than half of its high-to-low range in this app.</p>
            <p><b>Retest:</b> a later qualifying return into the zone; the scanner counts distinct body re-entries.</p>
            <p><b>Directional gap:</b> for demand, leg-out low above prior candle high; for supply, leg-out high below prior candle low.</p>
            <p><b>R multiple:</b> reward or loss expressed as a multiple of the initial risk.</p>
          </div>
          <div className="learn-callout learn-checklist-callout"><strong>Before acting, ask:</strong> Is the timeframe clear? Is the zone intact? What invalidates the idea? Does the target leave enough room after costs? Can the position withstand a gap? Is the decision consistent with your own tested rules?</div>
        </section>

        <section className="learn-disclaimer">
          <strong>Important</strong>
          <p>This page is general educational material, not financial, investment, tax, or legal advice, and is not a recommendation to buy or sell any security. Automated zones can be wrong or incomplete; prices may be delayed. Verify information independently and consider your own circumstances and risk tolerance.</p>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
