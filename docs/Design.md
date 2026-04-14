# Design.md — NewsTrader AI Frontend

**Version:** 0.1  
**Scope:** V1 — Web-first, mobile-responsive

---

## 1. Design Philosophy

NewsTrader AI is a tool for people making financial decisions. The UI should feel like it was built by someone who takes data seriously — not a marketing site that happens to show charts.

**Direction: Financial Editorial Minimalism**

- Data is the hero. The UI exists to frame it, not compete with it.
- Every element earns its space. No decorative chrome.
- Dense when the data demands it (report view). Open when it doesn't (homepage, empty states).
- Monospace for numbers. Always. It communicates precision.

**What to avoid:**
- Purple gradients, glowing cards, "AI" aesthetic clichés
- Excessive animation — this is a research tool, not a game
- Rounded-everything, soft shadows, card stacks — too consumer
- Light, airy SaaS look — too generic

---

## 2. Color System

Dark theme only for V1. Light mode is deferred.

```css
:root {
  /* Backgrounds */
  --bg-base:        #0a0a0a;   /* page background */
  --bg-surface:     #111111;   /* cards, panels */
  --bg-elevated:    #1a1a1a;   /* modals, dropdowns, hover states */
  --bg-border:      #242424;   /* dividers, borders */

  /* Text */
  --text-primary:   #f0ede8;   /* main content — warm off-white, not pure white */
  --text-secondary: #7a7672;   /* labels, captions, metadata */
  --text-muted:     #3d3b38;   /* disabled, placeholder */

  /* Accents */
  --accent-gain:    #4ade80;   /* positive P&L, wins — green */
  --accent-loss:    #f87171;   /* negative P&L, losses — red */
  --accent-neutral: #f0ede8;   /* primary interactive — same as text */
  --accent-amber:   #f59e0b;   /* warnings, medium confidence, coming soon */

  /* Charts */
  --chart-line:     #f0ede8;   /* primary ticker line */
  --chart-bench:    #3d3b38;   /* SPY benchmark line */
  --chart-hold:     rgba(240, 237, 232, 0.06); /* hold period shading */
  --chart-entry:    #4ade80;   /* entry marker */
  --chart-exit:     #f87171;   /* exit marker */
  --chart-window:   rgba(245, 158, 11, 0.15);  /* impact window shading */
}
```

**Usage rules:**
- `--bg-base` is the only full-bleed background. Never use gradients behind content.
- Borders use `--bg-border` at 1px. No box shadows.
- Green/red are reserved strictly for financial gain/loss signal. Do not use them decoratively.
- Amber is used sparingly — confidence warnings, coming soon badges, data caveats only.

---

## 3. Typography

**Scale:**

| Role              | Font                   | Notes                                      |
|-------------------|------------------------|--------------------------------------------|
| Display / Hero    | `Instrument Serif`     | Italic variant for the main headline       |
| UI / Body         | `IBM Plex Sans`        | 14px base, 400/500 weights only in UI      |
| Numbers / Data    | `IBM Plex Mono`        | All prices, P&L, percentages, dates in tables |
| Labels / Caps     | `IBM Plex Sans`        | 11px, 0.08em letter-spacing, uppercase     |

Both IBM Plex fonts ship as a matched family — consistent, legible, slightly utilitarian without being cold.

**Type scale:**

```
--text-xs:    11px / 1.4  — metadata labels, table headers (uppercased)
--text-sm:    13px / 1.5  — secondary body, captions
--text-base:  15px / 1.6  — primary body text
--text-lg:    18px / 1.4  — section sub-headers
--text-xl:    24px / 1.2  — section headers
--text-2xl:   36px / 1.1  — report headline figures (final portfolio value, total return)
--text-3xl:   56px / 1.0  — hero display number (homepage teaser result)
```

**Rules:**
- Headlines on the homepage use `Instrument Serif` italic. Everything else is `IBM Plex Sans`.
- All financial figures (prices, P&L, percentages) use `IBM Plex Mono`, tabular nums.
- Positive values are colored `--accent-gain`. Negative values use `--accent-loss`. Zero/neutral uses `--text-primary`.
- Never bold a P&L number — the monospace font and color carry the emphasis.

---

## 4. Spacing & Layout

**Spacing scale (base 4px):**
```
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128
```

**Container:**
- Max content width: `1100px`, centered, `padding: 0 24px`
- Report view: `720px` max for prose/narrative sections; full container for tables and charts
- No sidebar in V1. Single-column layout throughout.

**Layout rules:**
- Sections are separated by a single `1px` border in `--bg-border`, not whitespace alone.
- The report is a long vertical scroll. No tabs, no accordions hiding data.
- Charts are full-width within their parent column. Never shrink a chart to fit beside text.

---

## 5. Core Components

### 5.1 Homepage — Backtest Input

Single centered column, vertically aligned to upper-third of viewport.

```
[Logo wordmark — left aligned, minimal]

[Headline — Instrument Serif italic, ~40px]
"What would you have made?"

[Sub — IBM Plex Sans, --text-secondary]
"Describe a news-driven trade. We'll find every historical instance and run the backtest."

[Textarea — full width, 3 lines tall]
placeholder: "Buy Nvidia every time the US announces new AI chip restrictions on China"

[Market selector row]
  [● US Stocks — active] [Crypto — coming soon] [Forex — coming soon] ...

[Run Backtest button — full width, --text-primary border, no fill]
"Run Backtest  →"
```

**Textarea:**
- Background: `--bg-surface`
- Border: `1px solid --bg-border`, on focus: `1px solid --text-secondary`
- Font: `IBM Plex Sans`, 15px
- No rounded corners — `border-radius: 2px`

**Market selector:**
- Inactive / coming-soon items: `--text-muted`, `cursor: not-allowed`, tooltip on hover
- Active item: `--text-primary`, a subtle `1px` underline or left-border indicator

**Run button:**
- Outlined style: `1px solid --bg-border`, `background: transparent`, `color: --text-primary`
- On hover: `background: --bg-elevated`
- No filled/primary button style anywhere in the app — outlined buttons only

---

### 5.2 Clarifying Questions (inline, below textarea)

Shown as the AI parses the query — not a modal, not a new page. Appears beneath the input.

```
[Thin divider]

[Label — uppercase, --text-secondary, 11px]
"A FEW QUESTIONS BEFORE WE RUN"

[Question 1]
When should the trade open?
  ○ Market open next day   ○ Immediately on news   ○ Custom

[Question 2]
Direction?
  ○ Long   ○ Short   ○ Let AI decide

[Question 3]
Position size per trade?
  [$10,000 — editable input]

[Continue →]
```

Radio options are plain text rows with a minimal `○` / `●` toggle. No pill buttons, no toggles.

---

### 5.3 Processing State

Replaces the form area. No spinner animation — a simple streaming log.

```
[Thin left-border bar — --bg-border]

  Searching Benzinga news corpus (2015–2025)...
  Found 7 candidate events — scoring against hypothesis...
  Confirmed 6 events (High: 4, Medium: 2)
  Fetching price data for NVDA, AMD, INTC, QCOM...
  Calculating impact windows...
  Simulating 24 trades...
  Generating report...

```

Text streams in line by line. Each line prefixed with a dim timestamp (`14:32:07`). This is the one place monospace text appears outside of data — it's intentional, reinforces the "running analysis" feel.

---

### 5.4 Teaser Result (Pre-Email Gate)

```
[Disclaimer banner — full width, --bg-elevated, amber left border]
"This report was generated by AI and is for informational purposes only..."

[Headline P&L — Instrument Serif italic, --text-2xl]
"+184% across 7 events"

[Sub-stats row — monospace]
Date range: Jan 2019 – Mar 2025   ·   24 trades simulated   ·   4 tickers

[Cumulative chart — full width, simplified, no axis labels]
[blurred gradient overlay on lower 60% of chart area]

[Blurred trade log — 2 rows visible, rest masked]

[Email gate — centered]
  [Label] "See the full report — free"
  [Email input + Submit]
  [Social proof] "1,240 traders have run this backtest"
```

The blur on the trade log is a CSS `filter: blur(4px)` with a gradient mask — not a modal overlay.

---

### 5.5 Full Backtest Report

Long scrolling page. Sections divided by `1px` borders and `--text-xs` uppercase section labels.

**① Disclaimer Banner**
```
[Full-width bar]
background: --bg-surface
left border: 3px solid --accent-amber
padding: 12px 16px
font: --text-sm, --text-secondary
```
Non-dismissible. Always rendered first, above report title.

**② Query & Parameters Block**
```
[Section label] "QUERY"
[Verbatim query text in --bg-elevated code-style block]

[Section label] "PARAMETERS"
[2-column grid of label/value pairs — all values in IBM Plex Mono]
  Entry          Market open next day
  Exit           Impact window end date (Moderate)
  Position size  $10,000 per trade
  Tickers        NVDA, AMD, INTC, QCOM
  Date range     Jan 2019 – Mar 2025
  Events found   6 (High: 4, Medium: 2)
```

**③ Research Narrative**
Plain paragraphs. `--text-base`, `--text-primary`. No special styling except a dim `[AI-generated]` badge in `--text-muted` before the first paragraph.

**④ Per-Event Sections**

Each event occurrence gets a block:
```
[Event header row]
  [Date — monospace]   2022-10-07
  [Confidence badge]   HIGH
  [Event description — one sentence]

  [Source — --text-secondary]
  Reuters · "Biden administration announces sweeping..." · [↗ link]

[Impact window summary]
  Duration: 14 days  ·  Peak CAR: +18.4%  ·  Window end: Mean reversion

[Per-ticker: NVDA]
  [Chart — full width, ~240px tall]
    - Clean line chart, minimal axes (dates below, no y-axis label — value shown on hover)
    - Entry ▲ and Exit ▼ markers on the line
    - Hold period: subtle background shading
    - SPY overlay: dashed line, --chart-bench color
    - Impact window end: vertical dashed line, amber, labeled

  [Trade detail row — monospace]
  Entry 2022-10-08 $112.40  ·  Exit 2022-10-21 $128.70  ·  Long  ·  +14.5%  ·  +$1,455

[Per-ticker: AMD]
  ... (same structure)
```

Ticker subsections within an event are separated by a thin rule, not a new card.

**⑤ Aggregate Performance**

```
[Large stat row — Instrument Serif italic for the headline number]
  Final portfolio value: $11,840
  (started at $10,000)

[4-stat grid — monospace values]
  Total return      +184%
  Win rate          75%
  Max drawdown      -8.3%
  Avg hold          9 days

[Best / Worst callout — inline, no card]
  Best:   NVDA — 2023-08-01 event  +$2,240  (+22.4%)
  Worst:  INTC — 2020-03-15 event  −$490    (−4.9%)

[Cumulative portfolio chart — full width, ~320px tall]
  Clean area chart. No fill gradient — just a line with a very subtle area.
  Each event's close plotted as a point.
```

**⑥ Trade Log Table**

```
[Section label] "ALL TRADES"
[Sortable table — IBM Plex Mono throughout, --text-sm]

Headers (uppercase, --text-secondary, 11px):
#  DATE  TICKER  DIR  ENTRY DATE  ENTRY $  EXIT DATE  EXIT $  DAYS  P&L $  P&L %  vs SPY

Rows:
- Alternating row background: base / slightly elevated (1% lighter)
- P&L $ and P&L % colored green/red
- No row borders — rely on alternating backgrounds
- Sticky header on scroll
```

**⑦ Sources**
Plain list. `--text-sm`. Each source: `[Publication] · "[Headline]" · [↗ URL]`

**⑧ Footer CTAs**
```
[Divider]

[Share button — outlined]
"Copy share link  ↗"

[Coming soon block — amber]
"Set a live alert for this event — Coming Soon.  Join the waitlist →"

[For shared/public view only]
"Run your own backtest — free  →"
```

---

### 5.6 Dashboard (Registered)

```
[Top nav]
  NewsTrader AI [wordmark]          ⚡ 8 credits   [Account]

[Coming soon banner — amber, minimal]
"Live alerts and trade execution — coming soon. Join waitlist →"

[Section: My Backtests]
  [Sort controls — text links] Date ↓  |  Return  |  Ticker

  [Backtest row]
  [Query excerpt — truncated]  ·  4 tickers  ·  +184%  ·  Jan 2019–Mar 2025  ·  [↗ View]  [Delete]
  ...

[Section: Run New Backtest]
  [Same textarea input as homepage, inline]
```

The dashboard is a list, not a card grid. Rows not cards.

---

## 6. Chart Guidelines

**Library:** Lightweight Charts (TradingView) for per-event ticker charts. Recharts for the aggregate portfolio chart.

**Per-event ticker chart (Lightweight Charts):**
- Background: `--bg-surface` (matches panel)
- Grid lines: none — the chart area should be clean
- Axes: only the x-axis (dates), displayed below the chart in `--text-xs`, `--text-muted`
- Y-axis: hidden — values on hover via crosshair tooltip only
- Crosshair: enabled, thin `1px --bg-border` lines
- Price line: `--chart-line`, 1.5px
- SPY line: `--chart-bench`, 1px, dashed
- Entry marker: upward triangle `▲`, `--chart-entry` (green)
- Exit marker: downward triangle `▼`, `--chart-exit` (red)
- Hold period: `--chart-hold` background rect
- Impact window end: vertical dashed line, `--accent-amber`, 1px

**Aggregate portfolio chart (Recharts AreaChart):**
- Area fill: none (transparent) — line only, `--chart-line`, 1.5px
- Dots: 4px solid circle at each trade close point
- Axes: x = dates (--text-xs, --text-muted), y = portfolio value in USD (right-aligned, monospace)
- Tooltip: minimal — date + value, dark background, no border

---

## 7. Micro-interactions & Motion

Minimal. One rule: **motion should communicate state change, not delight.**

| Trigger                      | Behavior                                                    |
|------------------------------|-------------------------------------------------------------|
| Page load                    | No animation — content renders immediately                  |
| Processing log               | Lines stream in with no delay between — just text appending |
| Teaser chart blur fade       | Static CSS blur — no animation                              |
| Email gate submit            | Button text changes to "Opening report…" — no spinner       |
| Row hover in trade log       | `background: --bg-elevated`, `transition: background 100ms` |
| Share button click           | Text changes to "Copied!" for 1.5s, then reverts            |
| Coming soon tooltip          | Fades in at 150ms on hover — CSS only                       |

No page transitions. No skeleton loaders — the processing log is the loading state.

---

## 8. Disclaimer Banner

Appears at the very top of every report — both in-app and on public share URLs. It is always the first visible element after the nav.

```css
.disclaimer {
  width: 100%;
  padding: 12px 20px;
  background: var(--bg-surface);
  border-left: 3px solid var(--accent-amber);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-family: 'IBM Plex Sans';
  position: sticky; /* sticks to top of viewport on scroll */
  top: 0;
  z-index: 50;
}
```

It is sticky. It does not collapse. It cannot be dismissed.

---

## 9. Confidence Badges

Used on each event occurrence header.

```
HIGH    — --text-primary, thin border --bg-border
MEDIUM  — --accent-amber, thin border (amber)
LOW     — --text-muted, thin border --bg-border, only shown if low-confidence toggle is on
```

No filled background. Inline, next to the event date. 11px uppercase.

---

## 10. Empty & Error States

**No events found:**
```
[Centered, --text-secondary]
"No historical events found matching your hypothesis."
"Try broadening the date range, adjusting the event description, or checking the ticker."
[Refine query → ]
```

**Below confidence threshold (1–2 events):**
```
[Amber inline warning]
"Only 1 event found — results may not be statistically meaningful."
[Run anyway →]   [Refine query →]
```

**API error:**
```
[--accent-loss colored label]
"Something went wrong retrieving price data. Your credits were not deducted."
[Try again →]
```

No error illustrations. No emoji. Just direct, calm text.

---

## 11. "Coming Soon" Pattern

Used on market selector, dashboard banner, and report CTAs.

- Greyed text: `--text-muted`
- Optional amber pill badge: `SOON` — 10px uppercase, amber border, no fill
- Hover tooltip: `"Crypto markets — coming soon. Join the waitlist."`
- Every coming soon element links to a waitlist email capture — same minimal modal as the email gate

---

## 12. Responsive Behavior

**Breakpoints:**
```
sm:  640px  — mobile
md:  768px  — tablet  
lg:  1024px — desktop
```

**Mobile adjustments:**
- Disclaimer becomes a collapsible strip (still present, not dismissible — just truncated to one line with expand toggle)
- Per-event charts: minimum 280px height, full-width
- Trade log table: horizontal scroll — do not collapse columns
- Dashboard rows: stack to 2 lines (query + stats below)
- Nav: wordmark left, credits right, no other items visible (account in hamburger)

---

## 13. Typography in Practice — Quick Reference

| Content type               | Font             | Size     | Color              |
|----------------------------|------------------|----------|--------------------|
| Hero return figure         | Instrument Serif | 56px     | --text-primary      |
| Section header             | IBM Plex Sans    | 18px     | --text-primary      |
| Section label (caps)       | IBM Plex Sans    | 11px     | --text-secondary    |
| Body / narrative           | IBM Plex Sans    | 15px     | --text-primary      |
| Caption / metadata         | IBM Plex Sans    | 13px     | --text-secondary    |
| All financial figures      | IBM Plex Mono    | varies   | gain/loss/primary   |
| Table headers              | IBM Plex Sans    | 11px     | --text-secondary    |
| Table data rows            | IBM Plex Mono    | 13px     | --text-primary      |
| Streaming log text         | IBM Plex Mono    | 13px     | --text-secondary    |
| Disclaimer text            | IBM Plex Sans    | 13px     | --text-secondary    |
