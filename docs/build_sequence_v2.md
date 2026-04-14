# NewsTrader AI — Build Sequence v2 (Decisions Applied)

> This document is a revised copy of `build_sequence.md` updated to reflect the actual
> implementation decisions made during the build. Deviations from the original spec are
> called out with **> Decision:** blockquotes.

**Runtime:** Bun  
**Language:** TypeScript throughout - no JavaScript files  
**Stack:** SvelteKit · Bun · TypeScript · PostgreSQL · `@mariozechner/pi-ai` + OpenRouter · better-auth · Polar.sh · Exa.ai · Alpaca Market Data · Resend

**Key library choices:**
- **`@mariozechner/pi-ai`** - unified LLM SDK with native OpenRouter support. Uses `getModel('openrouter', 'model-id')` + `complete()` / `stream()`. Structured output via TypeBox-typed tool calling (not text parsing). Auth via `OPENROUTER_API_KEY` env var — must be explicitly forwarded to `process.env` in `ai.ts` because Vite does not guarantee process.env propagation for all `.env.local` vars.
- **TypeBox** - re-exported from `@mariozechner/pi-ai` as `Type`, `Static`, `TSchema`. Used for tool parameter schemas.
- **better-auth** - auth library (email/password + Google OAuth). Uses raw `pg.Pool` adapter, not the `postgresql()` wrapper. Tables are `"user"`, `"session"`, `"account"`, `"verification"` (quoted, camelCase columns).
- **Polar.sh** - payments and credit pack purchasing (Merchant of Record)
- **Bun** - runtime, package manager (`bun add`), and test runner (`bun test`)

**Data services (V1):**
- **Exa.ai** - all event discovery and news search (Search API + deep search)
- **Alpaca Market Data** - OHLCV price data only (no news, no news client)
- **OpenRouter** - all model calls (~2 per backtest) routed through pi-ai

**Philosophy:** Functionality before polish. Stub UI flows that have no backend yet. Each step has one concern and is independently verifiable.

---

## Step 1 — Project Foundation & Design System

Set up the SvelteKit project with TypeScript, configure all global CSS variables and typography from `Design.md`, and establish the base layout shell that every page will use.

> **Decision:** Instrument Serif is loaded via `@fontsource/instrument-serif` (npm package) rather than a Google Fonts `<link>` tag. This keeps all fonts in the asset bundle and avoids a third-party request. Import it in `app.css` the same way as the other fontsource packages.
>
> **Decision:** tailwindcss v4 is used. No `tailwind.config.js` is needed — configure via `@import "tailwindcss"` in `app.css`. Spacing utilities work as expected.
>
> **Decision:** Both `@sveltejs/adapter-auto` and `@sveltejs/adapter-node` are installed as devDependencies. `adapter-auto` is used in the config.
>
> **Decision:** The project is named `aslan-ai` in `package.json`, not `newstraderai`.
>
> **Decision:** SvelteKit 5 is used throughout. Write all components with Svelte 5 runes syntax: `$state`, `$derived`, `$props()`, `$effect`. Do not use the legacy `export let` component API.

### Prompt

```
Initialize a SvelteKit project with TypeScript. Use Bun as the runtime and package manager
throughout — never use npm or node commands.

Install dependencies with bun add:
  bun add @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono @fontsource/instrument-serif
  bun add -d typescript @sveltejs/kit @sveltejs/adapter-auto @sveltejs/adapter-node svelte vite
  bun add postgres                         # DB client
  bun add pg                               # needed by better-auth adapter
  bun add tailwindcss                      # spacing utilities only
  bun add @mariozechner/pi-ai              # unified AI SDK with OpenRouter + TypeBox

All three fonts are @fontsource packages — do NOT add a Google Fonts link tag.
Load them by importing in app.css:
  @import "@fontsource/ibm-plex-sans/400.css";
  @import "@fontsource/ibm-plex-sans/400-italic.css";
  @import "@fontsource/ibm-plex-mono/400.css";
  @import "@fontsource/instrument-serif/400-italic.css";

Configure bun as the runtime in package.json:
  "scripts": {
    "dev":    "vite dev",
    "build":  "vite build",
    "test":   "bun test",
    "db:migrate": "bun run src/lib/server/db/migrate.ts",
    "db:seed":    "bun run scripts/seed.ts",
    "seed:polar": "bun run scripts/seed-polar.ts"
  }

tailwindcss v4 — no config file needed. In app.css, add at the very top:
  @import "tailwindcss";

Use Tailwind for spacing utilities only — do NOT use Tailwind color classes anywhere;
all colors must come from CSS variables.

In src/app.css, define the complete CSS variable system from Design.md §2:

  --bg-base:        #0a0a0a
  --bg-surface:     #111111
  --bg-elevated:    #1a1a1a
  --bg-border:      #242424
  --text-primary:   #f0ede8
  --text-secondary: #7a7672
  --text-muted:     #3d3b38
  --accent-gain:    #4ade80
  --accent-loss:    #f87171
  --accent-neutral: #f0ede8
  --accent-amber:   #f59e0b
  --chart-line:     #f0ede8
  --chart-bench:    #3d3b38
  --chart-hold:     rgba(240, 237, 232, 0.06)
  --chart-entry:    #4ade80
  --chart-exit:     #f87171
  --chart-window:   rgba(245, 158, 11, 0.15)

Also define the type scale from Design.md §3:
  --text-xs:   11px
  --text-sm:   13px
  --text-base: 15px
  --text-lg:   18px
  --text-xl:   24px
  --text-2xl:  36px
  --text-3xl:  56px

Set html { background: var(--bg-base); color: var(--text-primary); }
Apply IBM Plex Sans as the default body font.

Create src/lib/components/layout/Container.svelte — a centered wrapper:
  max-width: 1100px, margin: 0 auto, padding: 0 24px (Design.md §4).
  Use Svelte 5 syntax with $props().

Create src/routes/+layout.svelte that imports app.css, wraps all pages in
Container, and renders a {@render children()}.

Create .env.example with all required environment variables:
  DATABASE_URL
  OPENROUTER_API_KEY
  OPENROUTER_DEFAULT_MODEL
  ALPACA_API_KEY
  ALPACA_API_SECRET
  EXA_API_KEY
  POLAR_ACCESS_TOKEN
  POLAR_WEBHOOK_SECRET
  POLAR_PRODUCT_STARTER
  POLAR_PRODUCT_PRO
  POLAR_PRODUCT_POWER
  BETTER_AUTH_SECRET
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  RESEND_API_KEY
  PUBLIC_BASE_URL

OPENROUTER_DEFAULT_MODEL sets the OpenRouter model ID used for all AI calls, e.g.:
  anthropic/claude-sonnet-4-5
  anthropic/claude-opus-4
  google/gemini-2.5-pro
  openai/gpt-4o
@mariozechner/pi-ai picks up OPENROUTER_API_KEY from process.env (set explicitly in ai.ts).
Changing the model requires only a new env var value -- no code changes.

POLAR_PRODUCT_* values are populated after running `bun run seed:polar` (Step 16).
BETTER_AUTH_SECRET must be at least 32 random characters -- generate with:
  openssl rand -base64 32

Do not build any page content yet -- foundation only.
```

### Definition of Done
- [ ] `bun run dev` starts without errors — Bun is the runtime, not Node
- [ ] `app.css` contains every CSS variable from Design.md §2 and §3 with the exact hex values above
- [ ] IBM Plex Sans, IBM Plex Mono, and Instrument Serif are all loading from @fontsource (not Google Fonts)
- [ ] `Container.svelte` renders a centered column, visually confirmed at 1100px max-width
- [ ] `.env.example` is present with all 16 keys listed, no values
- [ ] `package.json` scripts use `bun` — no `npm run` or `node` references anywhere
- [ ] `@mariozechner/pi-ai` is listed in `package.json` dependencies — no `ai`, `@ai-sdk/openrouter`, or `zod` packages
- [ ] `recharts` is NOT installed — portfolio charts use plain SVG (Step 12)
- [ ] Zero Tailwind color utility classes anywhere — confirmed by grepping for Tailwind color prefixes

---

## Step 2 — Homepage Input UI (Static)

Build the homepage backtest input form as a fully styled static page with no backend. Get layout, typography, and all interactions right per Design.md §5.1 before any logic is added.

### Prompt

```
Build the homepage at src/routes/+page.svelte as a static UI — no backend calls.
Use Svelte 5 runes syntax throughout ($state, $derived, $props).

Layout: single centered column, content in the upper third of the viewport (Design.md §5.1).

Elements top to bottom:

1. LOGO WORDMARK
   "NewsTrader AI" — IBM Plex Sans, --text-primary, left-aligned, minimal.

2. HEADLINE
   "What would you have made?"
   Instrument Serif italic, ~40px (--text-3xl), --text-primary.

3. SUBHEADLINE
   "Describe a news-driven trade. We'll find every historical instance and run the backtest."
   IBM Plex Sans, --text-secondary, --text-base (15px).

4. TEXTAREA
   Full width, 3 rows.
   placeholder: "Buy Nvidia every time the US announces new AI chip restrictions on China"
   background:    var(--bg-surface)
   border:        1px solid var(--bg-border)
   focus border:  1px solid var(--text-secondary)
   font:          IBM Plex Sans, 15px
   border-radius: 2px  (not zero, not more — exactly 2px)
   resize:        none

5. MARKET SELECTOR ROW
   Inline: "US Stocks" | "Crypto" | "Forex" | "Futures" | "Options" | "International"
   "US Stocks" — active: --text-primary, 1px bottom border --text-primary
   All others  — coming soon: --text-muted, cursor: not-allowed
   Hover on coming-soon items: CSS-only tooltip fading in at 150ms
   e.g. "Crypto markets — coming soon"

6. RUN BACKTEST BUTTON
   Full width, outlined only — no filled variant exists in this app (Design.md §5.1):
   border:     1px solid var(--bg-border)
   background: transparent
   color:      var(--text-primary)
   hover:      background: var(--bg-elevated)
   label:      "Run Backtest  →"
   click:      navigate to /backtest/new (page may be blank)

Spacing: 4px base scale, 24px gaps between sections.
No box shadows. No rounded corners except 2px on textarea.
No green or red used anywhere on this page.
```

### Definition of Done
- [ ] All six elements render in the correct order with correct typography
- [ ] Instrument Serif italic is applied to the headline — confirmed visually
- [ ] Textarea focus border changes from `--bg-border` to `--text-secondary`
- [ ] "US Stocks" shows the active underline; all other markets are muted with `cursor: not-allowed`
- [ ] Coming-soon tooltip appears within 150ms on hover — CSS only, no JS
- [ ] Run Backtest button has no background fill, only an outlined border
- [ ] Button click navigates to `/backtest/new`
- [ ] No green or red (`--accent-gain`, `--accent-loss`) used anywhere on this page
- [ ] No horizontal overflow at 375px viewport width

---

## Step 3 — Clarifying Questions & Processing State UI (Static)

Build the two UI states that follow query submission: the inline clarifying questions form and the streaming processing log. Both are static stubs — no backend yet.

### Prompt

```
Create two Svelte components and wire them into /backtest/new as a state machine.
Use Svelte 5 runes syntax throughout ($state, $derived, $props, createEventDispatcher → callbacks).

--- COMPONENT 1: src/lib/components/backtest/ClarifyingQuestions.svelte ---

Renders inline below the textarea — not a modal, not a new page (Design.md §5.2).

Elements:
1. 1px horizontal rule, --bg-border
2. Label: "A FEW QUESTIONS BEFORE WE RUN"
   IBM Plex Sans, 11px, uppercase, letter-spacing: 0.08em, --text-secondary
3. Three questions with plain ○ / ● radio toggles (not styled <input type="radio"> pills):
   Q1: "When should the trade open?"
       ○ Market open next day   ○ Immediately on news   ○ Custom
   Q2: "Direction?"
       ○ Long   ○ Short   ○ Let AI decide
   Q3: "Position size per trade?"
       Numeric text input, default "10000", IBM Plex Mono font
4. "Continue →" button — same outlined style as Run Backtest

Props (Svelte 5):
  oncontinue: (values: { entry: string, direction: string, position_size: number }) => void

State: selected radio per question tracked with $state.
Selected = ●, --text-primary. Unselected = ○, --text-secondary.

--- COMPONENT 2: src/lib/components/backtest/ProcessingLog.svelte ---

Replaces the form area entirely when running (Design.md §5.3).

Elements:
1. Left border rail: 3px solid --bg-border
2. Log lines: IBM Plex Mono, 13px, --text-secondary
   Each line prefixed with dim timestamp: --text-muted, e.g. "14:32:07"

Stub lines (shown with 400ms delay between each via setInterval in onMount):
  "Parsing hypothesis..."
  "Searching news corpus for matching events (2015–2025)..."
  "Found 9 candidate articles — verifying against hypothesis..."
  "Confirmed 7 events — extracting affected instruments..."
  "Identified tickers: NVDA, AMD, INTC, QCOM"
  "Fetching price data for NVDA, AMD, INTC, QCOM..."
  "Calculating impact windows..."
  "Simulating 24 trades..."
  "Generating report..."

After the last line: call oncomplete prop.

Props (Svelte 5):
  oncomplete: () => void
  onerror: (message: string) => void

--- STATE MACHINE: src/routes/backtest/new/+page.svelte ---

States ($state):
  "input"      → textarea + market selector + Run Backtest button
  "clarifying" → ClarifyingQuestions appears below textarea
  "processing" → ProcessingLog replaces the form area
  "done"       → navigate to /backtest/stub

Transitions:
  Run Backtest clicked              → "clarifying"
  ClarifyingQuestions oncontinue    → store selected values, → "processing"
  ProcessingLog oncomplete          → navigate to /backtest/stub

Extract the textarea + market selector + button into a shared component:
  src/lib/components/backtest/BacktestInput.svelte
  (Reused on the dashboard in Step 15.)
```

### Definition of Done
- [ ] `/backtest/new` begins in "input" state with the BacktestInput component
- [ ] Clicking "Run Backtest" transitions to "clarifying" — questions appear inline, textarea still visible above
- [ ] Radio clicks update ○/● and shift text color to `--text-primary`
- [ ] Clicking "Continue →" transitions to "processing" — the form area is replaced by the log
- [ ] Log lines appear one at a time with 400ms delay, each with a real timestamp prefix in IBM Plex Mono
- [ ] After the final line the page navigates to `/backtest/stub`
- [ ] `BacktestInput.svelte` is a standalone component, not inline in the page
- [ ] No spinners, no fade transitions, no animations — text appends only

---

## Step 4 — Teaser & Full Report UI (Static Mock Data)

Build the complete report page using hardcoded mock data. This is the visual target for the whole product. Chart areas are placeholder divs — real charts come in Steps 11 and 12.

### Prompt

```
Create the report page at src/routes/backtest/[id]/+page.svelte.
Use Svelte 5 runes syntax ($state, $props, etc.).

Use hardcoded mock data — no database, no API. Mock scenario:
  query:   "Buy Nvidia every time the US announces AI chip restrictions on China"
  events:  7 historical occurrences
  tickers: NVDA, AMD, INTC, QCOM
  return:  +184%
  trades:  24

Manage a let teaserMode = $state(true). Build all sections for both states.

===== TEASER STATE (teaserMode = true) =====

① DISCLAIMER BANNER (Design.md §8)
  position: sticky, top: 0, z-index: 50
  background: var(--bg-surface)
  border-left: 3px solid var(--accent-amber)
  padding: 12px 20px
  font: IBM Plex Sans, 13px, --text-secondary
  text: "This report was generated by AI and is for informational purposes only.
         It does not constitute financial advice. AI-identified events and simulated
         trades may be inaccurate or incomplete. Past hypothetical performance does
         not guarantee future results. Always do your own research."
  No close/dismiss button. Non-negotiable.

② HEADLINE P&L
  "+184% across 7 events"
  Instrument Serif italic, --text-2xl (36px), --accent-gain color

③ SUB-STATS ROW
  IBM Plex Mono, --text-sm:
  "Date range: Jan 2019 – Mar 2025  ·  24 trades simulated  ·  4 tickers"

④ CHART PLACEHOLDER
  Full-width div, 240px tall, background: --bg-surface, border: 1px solid --bg-border
  Centered label: "[ Cumulative Chart — wired in Step 12 ]" in --text-muted
  Gradient overlay div positioned absolutely over the lower 60% of the chart area:
    background: linear-gradient(to bottom, transparent, var(--bg-base))
    pointer-events: none

⑤ BLURRED TRADE LOG
  Show 2 mock trade rows with this structure:
    # | Date | Ticker | Dir | Entry Date | Entry $ | Exit Date | Exit $ | Days | P&L $ | P&L %
  Remaining rows rendered but wrapped in a div with filter: blur(4px)

⑥ EMAIL GATE (centered, below blurred rows)
  Label: "See the full report — free" — IBM Plex Sans, --text-secondary
  Email <input> field + "Unlock Report →" outlined button
  Social proof: "1,240 traders have run this backtest" — --text-muted, 13px
  On submit: set teaserMode = false — no API call yet

===== FULL REPORT STATE (teaserMode = false) =====

SECTION ① — Disclaimer Banner (identical to teaser, always present)

SECTION ② — Query & Parameters
  Label: "QUERY & PARAMETERS" — IBM Plex Sans, 11px, uppercase, --text-secondary
  Query verbatim in a block: --bg-surface background, border-left: 2px solid --bg-border,
  padding: 12px 16px
  Below: list of parameters (Entry rule, Exit rule, Direction, Position size,
  Date range, Confidence filter, Tickers with one-line rationale each)

SECTION ③ — Research Narrative
  Label: "AI-GENERATED RESEARCH NARRATIVE"
  Badge next to label: "AI GENERATED"
    10px uppercase, --accent-amber border 1px, no background fill (Design.md §9 style)
  Body: 3 × Lorem Ipsum paragraphs
  IBM Plex Sans, 15px, --text-primary, max-width: 720px

SECTION ④ — Historical Occurrences
  Render 2 mock events. Per event:
  - Event date (IBM Plex Mono) + 1–2 sentence description (IBM Plex Sans)
  - Confidence badge (Design.md §9):
      HIGH   → border: 1px solid --bg-border, color: --text-primary
      MEDIUM → border: 1px solid --accent-amber, color: --accent-amber
      11px uppercase, no background, inline next to date
  - Source line: "Reuters  ·  "US announces chip restrictions"  ·  ↗ https://..."
    IBM Plex Sans, --text-sm, --text-secondary
  Per-ticker subsection (one per ticker):
  - Chart placeholder div: 240px tall, --bg-surface, 1px --bg-border
    Label: "[ Per-event chart — wired in Step 11 ]"
  - Trade detail row IBM Plex Mono:
    "Entry 2022-10-08  $112.40  ·  Exit 2022-10-21  $128.70  ·  Long  ·  +14.5%  ·  +$1,455"
    P&L values: --accent-gain for positive, --accent-loss for negative
  Ticker subsections separated by thin 1px --bg-border rule — no cards

SECTION ⑤ — Aggregate Performance
  "Final portfolio value: $11,840" — Instrument Serif italic, --text-2xl
  "(started at $10,000)" — IBM Plex Sans, --text-secondary
  4-stat grid, IBM Plex Mono values:
    Total return: +184%  |  Win rate: 75%  |  Max drawdown: -8.3%  |  Avg hold: 9 days
  Best/Worst inline (no card):
    "Best:  NVDA — 2023-08-01  +$2,240  (+22.4%)"  — --accent-gain
    "Worst: INTC — 2020-03-15  −$490    (−4.9%)"   — --accent-loss
  Chart placeholder: 320px tall, labeled "[ Portfolio chart — wired in Step 12 ]"

SECTION ⑥ — Trade Log Table
  Section label: "ALL TRADES"
  Sticky header. IBM Plex Mono throughout, --text-sm.
  Columns: # | DATE | TICKER | DIR | ENTRY DATE | ENTRY $ | EXIT DATE | EXIT $ |
            DAYS | P&L $ | P&L % | vs SPY
  Headers: IBM Plex Sans, 11px, uppercase, --text-secondary. Click → sort that column.
  Rows: alternating --bg-base / --bg-surface, no row borders.
  Row hover: background: --bg-elevated, transition: background 100ms.
  P&L $ and P&L % colored --accent-gain or --accent-loss.
  Populate with 6 hardcoded mock rows. Sort logic is client-side only.

SECTION ⑦ — Sources
  Label: "SOURCES"
  Plain list, --text-sm:
  "Reuters  ·  "US announces chip export controls"  ·  ↗ https://reuters.com/..."

SECTION ⑧ — Footer CTAs
  1px --bg-border divider
  "Copy share link  ↗" — outlined button
    On click: copy window.location.href, change button text to "Copied!" for 1.5s then revert
  "Set a live alert for this event — Coming Soon. Join the waitlist →" — --accent-amber
  "Run your own backtest — free →" — shown only in public-link context (stub: always show)

All sections separated by 1px solid --bg-border horizontal rules.
Section labels: IBM Plex Sans, 11px, uppercase, letter-spacing 0.08em, --text-secondary.
```

### Definition of Done
- [ ] `/backtest/stub` renders the teaser: gradient overlay on chart, 2 unblurred rows, remaining rows blurred, email gate
- [ ] Submitting the email form sets `teaserMode = false` and reveals all 8 sections — no page reload
- [ ] Disclaimer banner is sticky at top, no dismiss button exists
- [ ] All 8 sections render in correct order with correct typography per Design.md §13
- [ ] HIGH confidence badge has `--bg-border` border; MEDIUM has `--accent-amber` border
- [ ] Trade log: sticky headers, alternating row backgrounds, no row borders
- [ ] Row hover background transition is exactly 100ms
- [ ] All financial figures are IBM Plex Mono, not bold
- [ ] Client-side column sort works on the trade log table
- [ ] "Copy share link" shows "Copied!" for 1.5s, then reverts
- [ ] All chart areas are labeled placeholder divs — no chart library imported yet

---

## Step 5 — AI Pipeline: Query Understanding

Build the first and only AI-powered stage of the event pipeline. Uses `@mariozechner/pi-ai` with OpenRouter. Structured output is achieved by defining a TypeBox-typed tool and forcing the model to call it — no JSON parsing, no retry logic, validated arguments come back typed.

> **Decision:** `direction_hint` and `ambiguity` in the TypeBox schemas use `Type.String()` with a description instead of `Type.Union([Type.Literal(...)])`. Strict literal enums in tool schemas cause some OpenRouter models to fail validation; plain strings with description are equally effective and more robust across model providers.
>
> **Decision:** `ai.ts` explicitly assigns `process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY` before calling `getModel()`. Vite's env system does not guarantee that `$env/static/private` variables are reflected in `process.env`, and pi-ai reads the key from `process.env` at runtime.
>
> **Decision:** `complete()` is called with `{ toolChoice: "required" }` as the third options argument to force the model to use the tool rather than responding with text.

### Prompt

```
Create a SvelteKit server endpoint that uses @mariozechner/pi-ai with OpenRouter
to parse the user's backtest hypothesis into a structured event spec.

@mariozechner/pi-ai was installed in Step 1. No additional packages needed.

--- AI MODULE: src/lib/server/ai.ts ---
Export a shared model instance used by every AI call in the app.

  import { getModel }                 from "@mariozechner/pi-ai"
  import { OPENROUTER_API_KEY,
           OPENROUTER_DEFAULT_MODEL } from "$env/static/private"

  // pi-ai reads OPENROUTER_API_KEY from process.env. Vite does not guarantee
  // that $env/static/private vars propagate to process.env, so set it explicitly.
  process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY

  const modelId = OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-5"
  export const model = getModel("openrouter", modelId as any)

  if (!model) {
    throw new Error(
      `[ai] Unknown model "${modelId}". Check OPENROUTER_DEFAULT_MODEL in .env.local — ` +
      `use dot notation (e.g. anthropic/claude-sonnet-4-5), not dashes.`
    )
  }

--- PIPELINE TYPES: src/lib/types/pipeline.ts ---
Define TypeBox schemas for structured pipeline types.
TypeBox is re-exported directly from @mariozechner/pi-ai.

  import { Type, type Static } from "@mariozechner/pi-ai"

  export const EventSpecSchema = Type.Object({
    event_type:        Type.String({ description: "Short label e.g. chip export restriction" }),
    event_description: Type.String({ description: "1-2 sentences describing the event" }),
    geography:         Type.String({ description: "US, global, or other" }),
    direction_hint:    Type.String({
      description: "Expected price direction: long, short, neutral, or unknown"
    }),
    date_range: Type.Object({
      start: Type.String({ description: "ISO date. Default 2015-01-01 if not specified" }),
      end:   Type.String({ description: "ISO date. Default today if not specified"     })
    })
  })

  // NOTE: direction_hint and ambiguity use Type.String() not Type.Union(Type.Literal())
  // Strict literal unions cause some models to fail tool schema validation.
  // Plain strings with a description field are equally effective and more robust.

  export const ExaSearchSchema = Type.Object({
    primary_query: Type.String({
      description: "One complete descriptive sentence for Exa neural search. " +
                   "Write it as a journalist would write a headline. NOT keywords."
    }),
    additional_queries: Type.Array(Type.String(), {
      minItems: 3, maxItems: 4,
      description: "3-4 alternative phrasings covering different eras, angles, " +
                   "and journalist vocabulary for the same event type."
    }),
    date_from: Type.String({ description: "Mirrors event_spec.date_range.start" }),
    date_to:   Type.String({ description: "Mirrors event_spec.date_range.end"   })
  })

  export const UnderstandResponseSchema = Type.Object({
    event_spec:           EventSpecSchema,
    exa_search:           ExaSearchSchema,
    ambiguity:            Type.String({
      description: "Ambiguity level of the query: LOW, MEDIUM, or HIGH"
    }),
    clarifying_questions: Type.Array(Type.String(), {
      maxItems: 2,
      description: "0-2 items only when ambiguity is HIGH. " +
                   "NEVER include entry/exit timing, direction, or position size -- " +
                   "those are always shown separately in the UI."
    })
  })

  // Inferred TypeScript types from schemas -- use these everywhere
  export type EventSpec          = Static<typeof EventSpecSchema>
  export type ExaSearch          = Static<typeof ExaSearchSchema>
  export type UnderstandResponse = Static<typeof UnderstandResponseSchema>

--- ENDPOINT: POST /api/pipeline/understand ---
File: src/routes/api/pipeline/understand/+server.ts

Input (JSON body): { query: string }

Strategy: define a tool whose parameters are the UnderstandResponseSchema.
Pass { toolChoice: "required" } as the third arg to complete() — forces the model
to call the tool rather than respond with text.

  import { complete, type Tool, type Context, validateToolCall }
    from "@mariozechner/pi-ai"
  import { model }                  from "$lib/server/ai"
  import { UnderstandResponseSchema, type UnderstandResponse }
    from "$lib/types/pipeline"

  const TODAY = new Date().toISOString().split("T")[0]

  const SYSTEM_PROMPT = `You are a financial event analyst. The user will describe
  a news-driven trading hypothesis. Analyse it and call the extract_event_spec tool
  with the structured result. Rules:
  - primary_query must be a complete sentence as a journalist would write it -- not keywords
  - additional_queries must use different eras, angles, and journalist vocabulary
  - date_range.start defaults to "2015-01-01" if the user does not specify
  - date_range.end defaults to "${TODAY}" if the user does not specify
  - clarifying_questions must be empty unless ambiguity is HIGH
  - NEVER put entry/exit timing, direction, or position size in clarifying_questions`

  const extractTool: Tool = {
    name:        "extract_event_spec",
    description: "Extract the structured event specification from the user's hypothesis",
    parameters:  UnderstandResponseSchema
  }

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages:     [{ role: "user", content: query, timestamp: Date.now() }],
    tools:        [extractTool]
  }

  // Pass { toolChoice: "required" } to force tool use
  const response = await complete(model, context, { toolChoice: "required" })

  if (response.stopReason !== "toolUse") {
    return error(500, { error: "model_no_tool_call" })
  }

  const toolCall = response.content.find(b => b.type === "toolCall")
  if (!toolCall || toolCall.type !== "toolCall") {
    return error(500, { error: "no_tool_call" })
  }

  const validated = validateToolCall([extractTool], toolCall) as UnderstandResponse
  return json(validated)

--- ERROR HANDLING ---
Wrap the complete() call in try/catch.
If stopReason is "error", log the errorMessage and return 500.
If validateToolCall throws, return 500 with the validation message.
400 for missing/empty query body.
Never expose raw error objects to the client -- log server-side, return { error: string }.

--- WIRING ---
In /backtest/new, wire the "Run Backtest" button to POST to this endpoint
with the textarea content. Log the response to the browser console.
UI state machine does not change -- stub flow remains intact.
```

### Definition of Done
- [ ] `src/lib/server/ai.ts` exports a `model` using `getModel("openrouter", ...)` — no other AI client exists
- [ ] `ai.ts` explicitly sets `process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY`
- [ ] `ai.ts` throws if `model` is null (invalid model ID)
- [ ] All pipeline types are TypeBox schemas in `src/lib/types/pipeline.ts` — `direction_hint` and `ambiguity` are `Type.String()`, not literal unions
- [ ] `POST /api/pipeline/understand` with "Buy Nvidia every time the US announces new AI chip restrictions on China" returns a valid `UnderstandResponse`
- [ ] `exa_search.primary_query` is a full descriptive sentence, not a keyword string
- [ ] `exa_search.additional_queries` has 3-4 meaningfully different phrasings
- [ ] `date_from` defaults to `"2015-01-01"` and `date_to` to today's date when not specified
- [ ] `complete()` is called with `{ toolChoice: "required" }` as the third argument
- [ ] No API keys exposed to the browser

---

## Step 6 — Event Detection (Exa.ai)

Build the event detection service using Exa.ai exclusively. A single deep search call finds all historical event instances and extracts affected tickers from what journalists actually wrote. No AI model calls. No Alpaca calls.

### Prompt

```
Create the event detection service. Exa.ai only.
Install: bun add exa-js

Do NOT call Anthropic or Alpaca APIs in this step.

--- CRITICAL: Exa API rules — do not deviate ---
  ✗ Do NOT use `useAutoprompt` — deprecated, does nothing
  ✗ Do NOT use `livecrawl` — use `contents.maxAgeHours` if needed
  ✗ Do NOT use `numSentences` or `highlightsPerUrl` — use `maxCharacters`
  ✗ `text`, `highlights`, `summary` must be nested INSIDE `contents` — never top-level
  ✗ `additionalQueries` and `outputSchema` only work with type "deep" or "deep-reasoning"
  ✗ `category: "news"` does not support `excludeDomains` — do not include it
  ✓ All content params go inside `contents: { highlights: {...}, summary: {...} }`

--- TYPES (add to src/lib/types/pipeline.ts) ---
Use plain TypeScript type aliases (not TypeBox schemas) for Exa output types:

  type RawExaEvent = {
    event_date:        string,
    description:       string,
    tickers_mentioned: string[],
    confidence:        "HIGH" | "MEDIUM" | "LOW",
    sources: { url: string, title: string, highlight: string | null }[]
  }

  type RankedTicker = {
    symbol:       string,
    event_count:  number,
    total_events: number
  }

  type EventOccurrence = {
    event_date:  string,
    description: string,
    confidence:  "HIGH" | "MEDIUM" | "LOW",
    tickers:     string[],
    sources: { url: string, title: string, highlight: string | null }[]
  }

--- SERVICE: src/lib/server/exa-events.ts ---
Import Exa from "exa-js". Initialise with EXA_API_KEY from $env/static/private.

== FUNCTION 1: deepSearchEvents ==

async function deepSearchEvents(
  exaSearch: ExaSearch,
  numResults = 30
): Promise<RawExaEvent[]>

Primary search — covers full date range with structured output.

Call Exa Search API:
{
  query:              exaSearch.primary_query,
  type:               "deep",
  category:           "news",
  numResults:         numResults,
  startPublishedDate: exaSearch.date_from,
  endPublishedDate:   exaSearch.date_to,
  additionalQueries:  exaSearch.additional_queries,
  contents: {
    highlights: { maxCharacters: 2000 }
  },
  outputSchema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            event_date:        { type: "string" },
            description:       { type: "string" },
            tickers_mentioned: { type: "array", items: { type: "string" } },
            confidence:        { type: "string" }
          }
        }
      }
    }
  }
}

Parse response:
  Primary path:
    response.output.content → JSON.parse if string, or use directly if object
    response.output.grounding → flatten citations → sources[] (deduplicate by URL)
    Map each event in the events array to RawExaEvent

  Fallback (if output.content is null, empty, or unparseable):
    For each result in response.results:
      event_date        = result.publishedDate ?? result.crawlDate
      description       = result.title
      confidence        = "MEDIUM"
      tickers_mentioned = scan result.highlights?.[0] for /\b[A-Z]{2,5}\b/g tokens
      sources           = [{ url: result.url, title: result.title, highlight: result.highlights?.[0] ?? null }]

Return RawExaEvent[].

== FUNCTION 2: supplementarySearchEvents ==

async function supplementarySearchEvents(
  exaSearch: ExaSearch
): Promise<RawExaEvent[]>

Catches older events (pre-2019) where deep search has lower recall.
Skip entirely if exaSearch.date_from >= "2019-01-01".

Call Exa Search API:
{
  query:              exaSearch.primary_query,
  type:               "auto",
  category:           "news",
  numResults:         20,
  startPublishedDate: exaSearch.date_from,
  endPublishedDate:   "2019-01-01",
  contents: {
    highlights: { maxCharacters: 1500 },
    summary: {
      query: "What US-listed stock ticker symbols are directly affected by this event?"
    }
  }
}

For each result:
  event_date        = result.publishedDate
  description       = result.title
  confidence        = "MEDIUM"
  tickers_mentioned = scan result.summary and result.highlights?.[0] for /\b[A-Z]{2,5}\b/g

Return RawExaEvent[].

== FUNCTION 3: deduplicateEvents ==

function deduplicateEvents(events: RawExaEvent[]): RawExaEvent[]

Group events whose event_date values fall within 3 calendar days of each other:
  Compute daysDiff using milliseconds: |eventTime - clusterStart| / 86_400_000
  event_date   → keep earliest date in cluster
  description  → keep from highest-confidence event in cluster
  confidence   → keep highest (HIGH > MEDIUM > LOW) using CONFIDENCE_RANK map
  sources      → merge, deduplicate by URL
  tickers_mentioned → merge, deduplicate, preserve first-appearance order

== FUNCTION 4: rankTickers ==

function rankTickers(events: RawExaEvent[]): RankedTicker[]

Count how many deduplicated events mention each ticker-like token.
Count each ticker at most once per event (use a Set per event).
Filter out:
  - Tokens appearing in only 1 event (too rare — likely incidental)
  - Single-letter tokens (length < 2)
  - All tokens in this blocklist:
    ["IT", "US", "AI", "CEO", "IPO", "GDP", "FED", "SEC", "DOJ",
     "API", "EU", "UK", "UN", "IMF", "WHO", "WTO", "ETF", "ESG",
     "EPS", "PE", "VC", "NY", "DC", "LA", "PR", "IR"]
Cap at 10 (PRD §6.2).
Return sorted descending by event_count.

== FUNCTION 5: buildEventOccurrences ==

function buildEventOccurrences(
  events:           RawExaEvent[],
  confirmedTickers: string[]
): EventOccurrence[]

For each event, filter tickers_mentioned to only those in confirmedTickers.
Drop events where zero confirmedTickers remain.
Return EventOccurrence[].

Called in Step 9 after the user confirms tickers — not in this step.

--- ENDPOINT: POST /api/pipeline/detect-events ---
File: src/routes/api/pipeline/detect-events/+server.ts

Input: { exa_search: ExaSearch, event_spec: EventSpec }

Steps:
  1. Run deepSearchEvents and supplementarySearchEvents concurrently (Promise.all)
     Skip supplementarySearchEvents if date_from >= "2019-01-01"
  2. Merge both result arrays
  3. deduplicateEvents
  4. rankTickers on the deduplicated set

Return:
{
  raw_events:        RawExaEvent[],
  ranked_tickers:    RankedTicker[],
  total_found:       number,
  high_confidence:   number,
  medium_confidence: number,
  low_confidence:    number
}

Error handling:
  Exa non-2xx → 502 { error: "exa_search_failed", detail: string }
  Zero results → 200 with raw_events: [], ranked_tickers: []  (not an error)
```

### Definition of Done
- [ ] `POST /api/pipeline/detect-events` with the chip restrictions `ExaSearch` returns ≥ 4 `raw_events` each with populated `event_date`, `description`, and `sources`
- [ ] `ranked_tickers` includes NVDA and at least 2 other semiconductor tickers, sorted by `event_count` descending
- [ ] Tickers appearing in only 1 event are absent from `ranked_tickers`
- [ ] All blocklist tokens (AI, US, IT, etc.) are absent from `ranked_tickers`
- [ ] Events within 3 calendar days of each other are collapsed into a single occurrence
- [ ] If `date_from` is before 2019, the supplementary search runs and its results are merged in
- [ ] Deep search `outputSchema` structured output is used when available; fallback to `results` parsing works when `output.content` is null
- [ ] No deprecated Exa parameters used
- [ ] Zero results returns HTTP 200 with empty arrays — not a 4xx or 5xx

---

## Step 7 — Impact Window Calculation Engine

Fetch OHLCV price data from Alpaca Market Data and compute how long each event actually moved the price. Pure price maths — no news, no Claude, no Exa.

### Prompt

```
Create the impact window calculation service.
Alpaca Market Data API — OHLCV only. No Exa, no Anthropic.

--- SERVICE: src/lib/server/alpaca-market-data.ts ---

function fetchOHLCV(
  symbol:   string,
  dateFrom: string,
  dateTo:   string
): Promise<OHLCVBar[]>

  GET https://data.alpaca.markets/v2/stocks/{symbol}/bars
  Headers: APCA-API-KEY-ID, APCA-API-SECRET-KEY from $env/static/private
  Query params: start, end, timeframe: "1Day", adjustment: "all", feed: "iex"
  Handle pagination: follow next_page_token until null
  Return OHLCVBar[] sorted ascending:
    { date: string, open: number, high: number, low: number, close: number, volume: number }

--- SERVICE: src/lib/server/impact-window.ts ---

type ImpactWindow = {
  ticker:               string,
  event_date:           string,
  impact_start:         string,
  impact_end:           string,
  impact_duration_days: number,
  peak_car:             number,  // decimal e.g. 0.145 = +14.5%
  peak_car_date:        string,
  final_car:            number,
  override_event:       null,    // always null in V1
  ohlcv:                OHLCVBar[]
}

function computeCAR(
  tickerBars:    OHLCVBar[],
  benchmarkBars: OHLCVBar[]
): { date: string, car: number }[]
  - Inner-join on date (only days present in both series)
  - daily_abnormal_return = (ticker_close/ticker_prev_close)
                          - (benchmark_close/benchmark_prev_close)
  - CAR = running sum of daily_abnormal_return from event_date forward
  - Return one entry per aligned trading day

function detectImpactWindowEnd(
  carSeries: { date: string, car: number }[],
  eventDate: string
): { end_date: string, reason: "car_decay" | "max_cap" }
  Rules — whichever fires first:
  1. CAR decay:      CAR drops below 20% of its peak value → end on that day
  2. Full reversion: CAR crosses back through zero          → end on that day
  3. Max cap:        30 trading days from eventDate         → end regardless

function calculateImpactWindow(
  ticker:    string,
  eventDate: string,
  ohlcv:     OHLCVBar[],   // pre-fetched for the full date range
  spyOHLCV:  OHLCVBar[]    // pre-fetched SPY for the same range
): ImpactWindow
  Slice both series from eventDate. Call computeCAR, then detectImpactWindowEnd.
  Return the complete ImpactWindow, including the ohlcv slice for charting.

--- ENDPOINT: POST /api/pipeline/impact-windows ---
File: src/routes/api/pipeline/impact-windows/+server.ts

Input: { occurrences: EventOccurrence[], tickers: string[] }

Steps:
1. Date range: earliest event_date − 5 days  →  latest event_date + 35 days
2. Fetch OHLCV for every ticker + "SPY" concurrently (Promise.all, one call per symbol)
3. For each (occurrence, ticker) pair, call calculateImpactWindow
4. Generate 3 entry/exit preset suggestions from the computed windows (PRD §6.3b):
   Aggressive:   entry = event_date (open),       exit = peak_car_date (close)
   Moderate:     entry = event_date + 1 day (open), exit = impact_end (close)
   Conservative: entry = event_date + 2 days (open), exit = event_date + 5 days (close)

Return:
{
  impact_windows: ImpactWindow[],
  entry_exit_suggestions: {
    aggressive:   { label, entry_rule, exit_rule, description },
    moderate:     { label, entry_rule, exit_rule, description },
    conservative: { label, entry_rule, exit_rule, description }
  }
}

Add ImpactWindow and OHLCVBar to src/lib/types/pipeline.ts.
```

### Definition of Done
- [ ] `POST /api/pipeline/impact-windows` with NVDA and a known event date returns a complete `ImpactWindow` with `peak_car`, `peak_car_date`, `impact_end`, and `ohlcv` populated
- [ ] CAR series has one entry per aligned trading day — no gaps
- [ ] `impact_end` is set when CAR drops below 20% of its peak, not arbitrarily
- [ ] No window exceeds 30 trading days
- [ ] All 3 presets are returned with correct date arithmetic
- [ ] SPY is fetched from Alpaca as the benchmark
- [ ] `override_event` is always `null`
- [ ] No Exa or Anthropic API calls in this service

---

## Step 8 — Trade Simulation Engine

Convert events + impact windows + an entry/exit rule into a complete trade log with P&L. Pure TypeScript computation — no external API calls.

### Prompt

```
Create a pure TypeScript trade simulation module. No external API calls.

--- TYPES (add to src/lib/types/pipeline.ts) ---

type EntryExitRule = {
  entry:         "event_day" | "next_day" | "two_days_after",
  exit:          "peak_car_date" | "impact_end" | "fixed_5_days",
  direction:     "long" | "short",
  position_size: number   // notional USD per trade e.g. 10000
}

type SimulatedTrade = {
  trade_index:                  number,
  event_date:                   string,
  ticker:                       string,
  direction:                    "long" | "short",
  entry_date:                   string,
  entry_price:                  number,
  exit_date:                    string,
  exit_price:                   number,
  hold_days:                    number,
  impact_window_end:            string,
  override_event:               null,
  pnl_dollars:                  number,
  pnl_pct:                      number,
  abnormal_return_vs_benchmark: number,
  notional:                     number
}

type BacktestResult = {
  trades:           SimulatedTrade[],
  portfolio_series: { date: string, value: number }[],
  summary: {
    total_return_pct:      number,
    total_return_dollars:  number,
    win_rate:              number,
    max_drawdown:          number,
    avg_hold_days:         number,
    best_trade:            SimulatedTrade,
    worst_trade:           SimulatedTrade,
    final_portfolio_value: number,
    starting_capital:      number,
    trade_count:           number,
    event_count:           number,
    ticker_count:          number
  }
}

--- SERVICE: src/lib/server/trade-simulation.ts ---

function resolveEntryDate(
  eventDate: string,
  rule:      EntryExitRule,
  ohlcv:     OHLCVBar[]
): { date: string, price: number }
  "event_day"      → open price on eventDate (next trading day if not a market day)
  "next_day"       → open price on the next trading day after eventDate
  "two_days_after" → open price 2 trading days after eventDate
  Slippage: multiply by 1.001 (long entry) or 0.999 (short entry)

function resolveExitDate(
  window:    ImpactWindow,
  rule:      EntryExitRule,
  entryDate: string,
  ohlcv:     OHLCVBar[]
): { date: string, price: number }
  "peak_car_date" → close price on window.peak_car_date
  "impact_end"    → close price on window.impact_end
  "fixed_5_days"  → close price 5 trading days after entryDate
  Slippage: multiply by 0.999 (long exit) or 1.001 (short exit)

function runSimulation(    // exported as runSimulation, not simulateTrades
  occurrences:     EventOccurrence[],
  impactWindows:   ImpactWindow[],
  rule:            EntryExitRule,
  startingCapital: number
): BacktestResult
  For each (occurrence, ticker) pair:
    Find matching ImpactWindow by ticker + event_date
    Resolve entry and exit
    pnl_dollars = (exit - entry) / entry * notional  (long)
                  (entry - exit) / entry * notional  (short)
    pnl_pct     = (exit - entry) / entry             (long), reversed for short
    hold_days   = trading days between entry_date and exit_date
    abnormal_return_vs_benchmark = window.final_car

Portfolio series:
  Day-by-day portfolio value from earliest entry to latest exit.
  P&L is realised on each trade's exit_date.
  Concurrent trades from the same event contribute simultaneously.
  Return one entry per calendar day with no gaps.

Summary:
  max_drawdown = largest peak-to-trough decline in portfolioSeries

--- ENDPOINT: POST /api/pipeline/simulate ---
File: src/routes/api/pipeline/simulate/+server.ts

Input:
{
  occurrences:      EventOccurrence[],
  impact_windows:   ImpactWindow[],
  rule:             EntryExitRule,
  starting_capital: number   // default 10000
}

Output: BacktestResult

--- TESTS ---
Write tests in src/lib/server/trade-simulation.test.ts using Bun's native test runner.

  import { describe, test, expect } from "bun:test"

Fixture: 5 trades, 2 tickers, 3 events.
Cover:
  - pnl_dollars correct for a long trade (manual verification)
  - pnl_dollars correct for a short trade (correctly signed)
  - 0.1% slippage applied correctly on both entry and exit
  - max_drawdown derived from portfolioSeries, not from trades directly
  - portfolioSeries has no date gaps between earliest entry and latest exit
  - best_trade and worst_trade are actual SimulatedTrade objects from the set
```

### Definition of Done
- [ ] `POST /api/pipeline/simulate` returns a valid `BacktestResult` for the fixture data
- [ ] Long trade P&L matches manual calculation with slippage applied
- [ ] Short trade P&L is correctly signed (positive when price falls)
- [ ] 0.1% slippage applied to both entry and exit in the correct direction
- [ ] `portfolio_series` is continuous — no missing calendar days
- [ ] Concurrent trades from the same event appear simultaneously in the series
- [ ] `max_drawdown` comes from the portfolio series, not from individual trades
- [ ] `best_trade` and `worst_trade` are actual `SimulatedTrade` objects
- [ ] `bun test` exits 0 — all tests pass

---

## Step 9 — Streaming Pipeline Orchestration

Wire all pipeline stages into a single SSE endpoint. ProcessingLog connects to the real stream. The ticker confirmation and rule selection steps are surfaced here between stages.

> **Decision:** Pipeline sessions use a Promise-resolve pattern rather than polling. `waitForTickers(sessionId)` and `waitForRule(sessionId)` return Promises that resolve when the corresponding `confirmTickers()` / `confirmRule()` calls arrive. The SSE handler simply `await`s these promises — no 500ms polling loop needed.
>
> **Decision:** The SSE handler (`GET /api/pipeline/run`) contains all pipeline stages directly — it does not make internal HTTP calls to `/api/pipeline/understand`, `/api/pipeline/detect-events`, etc. All stage logic is called as TypeScript functions. The individual stage endpoints remain available for standalone testing.
>
> **Decision:** `waitForTickers(sessionId)` is registered BEFORE emitting `ticker_candidates`, and `waitForRule(sessionId)` is registered BEFORE emitting `entry_exit_suggestions`. This prevents a race condition where the client confirms before the resolve handler is installed.

### Prompt

```
Create the SSE orchestration endpoint and replace the stub log with real data.

--- PIPELINE SESSIONS: src/lib/server/pipeline-sessions.ts ---

Use a Promise-resolve pattern (not polling).

  type PendingSession = {
    tickerResolve?: (tickers: string[]) => void
    ruleResolve?:   (rule: EntryExitRule) => void
    createdAt:      number
  }

  const sessions = new Map<string, PendingSession>()
  const TIMEOUT_MS = 5 * 60 * 1000   // 5 minutes
  const TTL_MS     = 10 * 60 * 1000  // 10 minutes

  export function waitForTickers(sessionId: string): Promise<string[]>
    Stores a resolve callback in sessions[sessionId].tickerResolve.
    Rejects after TIMEOUT_MS.
    Purges expired sessions on each call.

  export function waitForRule(sessionId: string): Promise<EntryExitRule>
    Same pattern for the rule step.

  export function confirmTickers(sessionId: string, tickers: string[]): boolean
    Calls sessions[sessionId].tickerResolve(tickers). Returns false if not found.

  export function confirmRule(sessionId: string, rule: EntryExitRule): boolean
    Calls sessions[sessionId].ruleResolve(rule). Returns false if not found.

--- ENDPOINT: GET /api/pipeline/run ---
File: src/routes/api/pipeline/run/+server.ts

Accepts query param: ?params={URL-encoded JSON string}
{
  query:            string,
  session_id:       string,
  starting_capital: number,
  date_from?:       string,
  date_to?:         string
}

Returns a Server-Sent Events stream. Each event:
  event: log | ticker_candidates | entry_exit_suggestions | low_confidence | result | error
  data:  JSON string

LOG:                    { type: "log", timestamp: string, message: string }
TICKER_CANDIDATES:      { type: "ticker_candidates", ranked_tickers: RankedTicker[], raw_events: RawExaEvent[] }
LOW_CONFIDENCE:         { type: "low_confidence", event_count: number }
ENTRY_EXIT_SUGGESTIONS: { type: "entry_exit_suggestions", suggestions: { aggressive, moderate, conservative } }
RESULT:                 { type: "result", slug: string }
ERROR:                  { type: "error", message: string, stage: string }

--- ORCHESTRATION SEQUENCE ---

All stages called directly as TypeScript imports — no internal HTTP calls.

Stage 1 — Query Understanding
  log: "Parsing hypothesis..."
  Call complete(model, context, { toolChoice: "required" }) + validateToolCall
  log: "Event type identified: {event_type}"

Stage 2 — Event Detection
  log: "Searching news corpus ({dateFrom}–{dateTo})..."
  Call deepSearchEvents + supplementarySearchEvents concurrently
  deduplicateEvents, rankTickers
  log: "Found {n} candidate articles — deduplicating..."
  log: "Confirmed {n} historical event occurrences"

  If raw_events is empty:
    emit error: { stage: "detection", message: "no_events" }
    close stream

  If raw_events.length <= 2:
    emit: { type: "low_confidence", event_count: N }

  // Register BEFORE emitting to prevent race condition
  const tickersPromise = waitForTickers(session_id)
  emit TICKER_CANDIDATES
  ← Stream awaits tickersPromise

  confirmed_tickers = await tickersPromise
  log: "Confirmed tickers: {symbols}"
  call buildEventOccurrences(raw_events, confirmed_tickers)

Stage 3 — Impact Windows
  log: "Fetching price data for {symbols}..."
  Fetch OHLCV for all confirmed_tickers + "SPY" concurrently
  Calculate impact windows
  log: "Calculating impact windows for {n} event-ticker pairs..."

  Build entry_exit_suggestions object with aggressive/moderate/conservative presets.

  // Register BEFORE emitting to prevent race condition
  const rulePromise = waitForRule(session_id)
  emit ENTRY_EXIT_SUGGESTIONS
  ← Stream awaits rulePromise

  rule = await rulePromise
  log: "Trade parameters confirmed — simulating..."

Stage 4 — Simulation
  Call runSimulation(occurrences, impact_windows, rule, starting_capital)
  log: "Simulated {trade_count} trades across {event_count} events"

  Credit deduction (authenticated users only):
    Cost formula:
      6–10 tickers  → 5 credits
      2–5 tickers   → 3 credits
      1 ticker, >5 events → 2 credits
      1 ticker, ≤5 events → 1 credit
    UPDATE "user" SET credits = credits - {cost}
      WHERE id = $1 AND credits >= {cost}
    If UPDATE affects 0 rows: emit insufficient_credits error, close stream.
    INSERT into credit_transactions: { user_id, amount: -cost, reason: 'backtest', backtest_id }

  Persist report via createReport(). Generate research narrative via complete().
  log: "Generating research narrative..."
  emit RESULT { type: "result", slug: report.slug }

--- CONFIRM ENDPOINTS ---

POST /api/pipeline/confirm-tickers:
  Input: { session_id: string, confirmed_tickers: string[] }
  Call confirmTickers(session_id, confirmed_tickers)
  Return 200 { ok: true }

POST /api/pipeline/confirm-rule:
  Input: { session_id: string, rule: EntryExitRule }
  Call confirmRule(session_id, rule)
  Return 200 { ok: true }

--- FRONTEND: ProcessingLog.svelte UPDATE ---

Remove the setInterval stub. Replace with a real EventSource.

Props (Svelte 5):
  streamUrl: string
  sessionId: string
  ontickercandidates: (payload: { ranked_tickers, raw_events }) => void
  onentryexitsuggestions: (payload: { suggestions }) => void
  oncomplete: (slug: string) => void
  onerror: (message: string) => void

On "log" event:              append message to log display
On "ticker_candidates":      call ontickercandidates with payload
On "entry_exit_suggestions": call onentryexitsuggestions with payload
On "result":                 call oncomplete with slug
On "error":                  call onerror with message
On "low_confidence":         show inline amber warning in log

--- STATE MACHINE UPDATE: /backtest/new ---

Add two states:
  "confirming_tickers" → TickerConfirmation component
  "confirming_rule"    → RuleSelector component

--- COMPONENT: src/lib/components/backtest/TickerConfirmation.svelte ---

Props (Svelte 5): ranked_tickers: RankedTicker[], sessionId: string, onconfirmed: () => void

Each ticker as a row with a checkbox (all pre-checked):
  [✓] NVDA  Nvidia Corp              — appeared in 6 of 7 events
  [✓] AMD   Advanced Micro Devices   — appeared in 5 of 7 events
IBM Plex Mono for symbols and counts. IBM Plex Sans for company names.

"Confirm tickers →" outlined button:
  POST /api/pipeline/confirm-tickers with sessionId + checked symbols
  On success: call onconfirmed

--- COMPONENT: src/lib/components/backtest/RuleSelector.svelte ---

Props (Svelte 5): suggestions, direction, position_size, sessionId, onconfirmed: () => void

Three preset options as radio rows:
  ● Aggressive    — "Entry: event day open.   Exit: peak return date."
  ○ Moderate      — "Entry: next day open.    Exit: impact end date."
  ○ Conservative  — "Entry: 2 days after.     Exit: 5 days after entry."

"Run simulation →" outlined button:
  POST /api/pipeline/confirm-rule with sessionId + EntryExitRule
  On success: call onconfirmed
```

### Definition of Done
- [ ] `GET /api/pipeline/run` returns a real SSE stream with log lines from each stage
- [ ] `waitForTickers` is registered before `ticker_candidates` is emitted (no race condition)
- [ ] `waitForRule` is registered before `entry_exit_suggestions` is emitted
- [ ] Confirming tickers via `POST /api/pipeline/confirm-tickers` resolves the awaited promise
- [ ] Confirming a rule via `POST /api/pipeline/confirm-rule` triggers simulation
- [ ] A `result` event arrives with the real slug and the browser navigates to `/backtest/{slug}`
- [ ] Zero events found emits an `error` event and the UI shows the error state
- [ ] No internal HTTP calls between pipeline stages — all called as TypeScript imports
- [ ] Credit deduction table is `"user"` (quoted), not `users`

---

## Step 10 — Report Persistence & Database Schema

Set up PostgreSQL, persist completed backtest results, and serve real data on the report page.

> **Decision:** Migration `001_initial.sql` creates hand-rolled `users` and `sessions` tables. Migration `002_auth.sql` (Step 14) replaces these with better-auth's `"user"`, `"session"`, `"account"`, `"verification"` tables and migrates `user_id` FK columns from UUID → text. The `001` schema is the starting point; `002` is required before auth works.

### Prompt

```
Set up the database schema and persistence layer.

--- MIGRATION: src/lib/server/db/migrations/001_initial.sql ---

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  password_hash  TEXT,
  google_id      TEXT UNIQUE,
  name           TEXT,
  credits        INTEGER DEFAULT 3,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE backtest_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  user_id           UUID REFERENCES users(id),
  email             TEXT,
  query             TEXT NOT NULL,
  event_spec        JSONB NOT NULL,
  exa_search        JSONB NOT NULL,
  rule              JSONB NOT NULL,
  confirmed_tickers TEXT[] NOT NULL,
  occurrences       JSONB NOT NULL,
  impact_windows    JSONB NOT NULL,
  backtest_result   JSONB NOT NULL,
  research_narrative TEXT,
  status            TEXT DEFAULT 'pending',
  is_public         BOOLEAN DEFAULT true,
  view_count        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE email_captures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  report_id   UUID REFERENCES backtest_reports(id),
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  interest   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  amount            INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  backtest_id       UUID REFERENCES backtest_reports(id),
  stripe_payment_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON backtest_reports(slug);
CREATE INDEX ON backtest_reports(user_id);
CREATE INDEX ON backtest_reports(created_at DESC);

NOTE: 002_auth.sql (Step 14) drops users/sessions and replaces them with better-auth's
tables. Run migrations in order: 001 first, then 002 after installing better-auth.

--- DATABASE CLIENT: src/lib/server/db/client.ts ---
Initialise postgres.js with DATABASE_URL from $env/static/private. Export singleton `db`.

--- REPOSITORY: src/lib/server/db/reports.ts ---
function createReport(data): Promise<BacktestReport>
  Generate unique 6-char alphanumeric slug. Retry up to 5 times on collision.
function getReportBySlug(slug: string): Promise<BacktestReport | null>
function updateReportStatus(id: string, status: string): Promise<void>
function setResearchNarrative(id: string, narrative: string): Promise<void>
function incrementViewCount(id: string): Promise<void>

--- PIPELINE WIRING ---
Update GET /api/pipeline/run (already updated in Step 9):
  After simulation: call createReport() with all pipeline output.
  Generate research narrative using complete(model, ctx):

    const ctx: Context = {
      systemPrompt: "You are a financial research analyst. Write a clear, factual
                     2-4 paragraph narrative explaining: what this type of event is,
                     why these specific tickers were chosen, and what the historical
                     price pattern shows. Label it as AI-generated analysis.",
      messages: [{
        role: "user",
        content: JSON.stringify({
          query:        report.query,
          tickers:      report.confirmed_tickers,
          event_count:  report.occurrences.length,
          total_return: report.backtest_result.summary.total_return_pct
        }),
        timestamp: Date.now()
      }]
    }

    const response  = await complete(model, ctx)
    const narrative = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map(b => b.text)
      .join("")

  Store via setResearchNarrative(report.id, narrative).
  Emit RESULT with the real slug: { type: "result", slug: "abc123" }

--- REPORT PAGE WIRING ---
src/routes/backtest/[id]/+page.server.ts:
  Load report by slug from DB. If not found: return 404.
  Pass real report data to the page.

src/routes/backtest/[id]/+page.svelte:
  Replace all hardcoded mock data with data from the loaded report.

Email gate cookie check (in +page.server.ts):
  If report_access_{slug} cookie is present → isAccessGranted = true → full report
  If absent → teaser mode

Add BacktestReportRow type to src/lib/types/pipeline.ts:
  Captures the full DB row shape including JSONB fields typed as their pipeline types.
  created_at / updated_at are string | Date (SvelteKit's devalue serialises Dates to strings).

--- DATABASE SEED SCRIPT ---
Create scripts/seed.ts — runnable with `bun run db:seed`.
Idempotent — safe to re-run (use INSERT ... ON CONFLICT DO NOTHING).

NOTE: After running 002_auth.sql, seed the dev user into the "user" table (not users).
The seed script must detect which schema is active (check if "user" table exists).
```

### Definition of Done
- [ ] Running the migration against a local dev DB succeeds without errors
- [ ] A complete pipeline run creates a `backtest_reports` row with `status = 'complete'`
- [ ] Navigating to `/backtest/{slug}` loads real report data — not mock data
- [ ] Research narrative shows real AI-generated text (SDK call confirmed in server logs)
- [ ] Slug collision handling is present — `createReport` retries on conflict
- [ ] Unknown slug returns a 404 page
- [ ] Email-gate cookie is set on submission; refreshing preserves full report access
- [ ] `bun run db:seed` runs without errors and prints the completion summary
- [ ] `BacktestReportRow` type is in `pipeline.ts` and covers all JSONB columns

---

## Step 11 — Per-Event Charts (Lightweight Charts)

Replace per-event chart placeholder divs with real interactive price charts.

### Prompt

```
Integrate TradingView Lightweight Charts for per-event ticker charts.
Install: bun add lightweight-charts

--- COMPONENT: src/lib/components/charts/EventChart.svelte ---

Props (Svelte 5 $props()):
  ohlcv:             OHLCVBar[]
  spy_ohlcv:         OHLCVBar[]
  entry_date:        string
  entry_price:       number
  exit_date:         string
  exit_price:        number
  impact_window_end: string
  direction:         "long" | "short"

Read all CSS variable values at runtime:
  getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim()

Chart config (Design.md §6):
  layout.background:       { type: "solid", color: <--bg-surface> }
  layout.textColor:        <--text-muted>
  layout.fontSize:         11
  grid:                    both lines visible: false
  crosshair:               enabled
  rightPriceScale.visible: false
  timeScale.borderColor:   <--text-muted>

Two line series:
  Ticker line:  color <--chart-line>, lineWidth: 1.5
  SPY line:     color <--chart-bench>, lineWidth: 1, lineStyle: LineStyle.Dashed

Markers on the ticker series:
  Entry: position "belowBar", shape "arrowUp",   color <--chart-entry>
  Exit:  position "aboveBar", shape "arrowDown", color <--chart-exit>

Hold period: shade using a background series or equivalent. Color: rgba(240, 237, 232, 0.06)
Impact window end: vertical dashed line at that date. Color: <--accent-amber>, LineStyle.Dashed

Full width of parent, 240px height.
Use ResizeObserver to resize the chart when the container width changes.
Destroy the chart on Svelte onDestroy.
```

### Definition of Done
- [ ] Per-event charts render with real OHLCV data from the database
- [ ] Ticker line and SPY dashed benchmark line both visible
- [ ] Entry (▲ green) and exit (▼ red) markers appear at the correct dates
- [ ] Hold period is shaded with the correct subtle background
- [ ] Dashed amber vertical line at `impact_window_end`
- [ ] Y-axis is hidden — price appears only in the crosshair tooltip
- [ ] No grid lines. Background matches `--bg-surface`.
- [ ] Charts resize correctly on window resize. Instances cleaned up on destroy.

---

## Step 12 — Aggregate Portfolio Chart (Plain SVG)

Replace the portfolio and teaser chart placeholders with real interactive charts.

> **Decision:** `recharts` is NOT installed. Recharts is a React library — mounting a React root into Svelte adds ~150 kB of framework overhead and two reconcilers. Both `PortfolioChart.svelte` and `TeaserChart.svelte` use Approach B: plain SVG with manual linear scaling and Svelte 5 `$state`/`$derived` for reactive dimensions. This gives full CSS variable control with zero extra runtime.

### Prompt

```
Build the aggregate portfolio chart using plain SVG — do NOT install recharts or d3.

Approach B: plain SVG + Svelte 5 $derived scales. Document this decision in a comment
at the top of each chart component.

--- COMPONENT: src/lib/components/charts/PortfolioChart.svelte ---

Props (Svelte 5 $props()):
  portfolio_series:   { date: string; value: number }[]
  trade_close_points: { date: string; value: number }[]

Layout:
  const H  = 320
  const MT = 16, MR = 72, MB = 32, ML = 4
  let cw = $state(600)   // bound to container width via bind:clientWidth
  const IW = $derived(cw - ML - MR)
  const IH = $derived(H - MT - MB)

Use $derived to compute xScale and yScale functions mapping data to SVG coordinates.
Render: <svg>, <polyline> for the line, <circle> elements for trade_close_points,
X-axis ticks, Y-axis labels formatted as "$11,840" in IBM Plex Mono 11px --text-muted.

Tooltip: a $state-tracked hovered point; render as a custom overlay
  background: --bg-elevated, no border, date + value in monospace
  Show on mousemove over the chart SVG, hide on mouseleave.

No CartesianGrid lines. Full width via bind:clientWidth. 320px height.

--- COMPONENT: src/lib/components/charts/TeaserChart.svelte ---

Props: portfolio_series: { date: string; value: number }[]

Simplified PortfolioChart — no dots, no tooltip, no axis labels.
Same SVG/scaling approach. 200px height.
Parent div: position relative, overflow hidden.
Gradient overlay: position absolute, bottom 0, height 60%:
  background: linear-gradient(to bottom, transparent, var(--bg-base))
  pointer-events: none

--- WIRING ---
Replace "[ Portfolio chart ]" in Section ⑤ with <PortfolioChart>.
Replace "[ Cumulative Chart ]" in the teaser with <TeaserChart>.
Pass real data from report.
After this step: zero chart placeholder divs remain on the report page.
```

### Definition of Done
- [ ] Portfolio chart renders with real portfolio series data — no placeholder divs remain
- [ ] `recharts` is NOT in `package.json` — confirmed
- [ ] Trade close points appear as 4px dots on the line
- [ ] Hover shows custom tooltip: date + portfolio value in monospace, dark background, no border
- [ ] Y-axis values formatted as currency, right-aligned
- [ ] Teaser chart renders the line with gradient overlay on the lower 60%
- [ ] Both charts resize with the browser window via `bind:clientWidth`

---

## Step 13 — Email Gate, Capture & Report Reveal

Implement the real email capture: validate, store, send the report link, reveal the full report.

### Prompt

```
Implement the email capture flow.
Install: bun add resend

--- ENDPOINT: POST /api/reports/[slug]/capture-email ---

1. Validate email format (regex)
2. Look up report by slug → 404 if not found or is_public = false
3. Check for existing capture for this email + report — skip insert if found
4. INSERT into email_captures: { email, report_id }
5. Upsert into users: INSERT ... ON CONFLICT (email) DO NOTHING
   (After 002_auth.sql, this is the "user" table — check which schema is active)
6. Send email via Resend:
     Subject: "Your NewsTrader AI backtest is ready"
     Body: HTML with report URL, query text, headline P&L
     From: reports@{domain from PUBLIC_BASE_URL}
7. Set cookie: report_access_{slug} = "1"
     httpOnly, SameSite=Lax, path=/, maxAge: 30 days
8. Return 200 { success: true }

Resend failure: log server-side, return 200 anyway — don't block the user.

--- FRONTEND UPDATE ---
On submit: disable button, change text to "Opening report…" — no spinner (Design.md §7)
On success: teaserMode = false, scroll to top
On failure: inline label --accent-loss color, no modal

--- WAITLIST MODAL ---
Create src/lib/components/WaitlistModal.svelte:
  Centered modal, no backdrop animation.
  Title prop (e.g. "Live alerts — coming soon")
  Email input + "Join waitlist →" outlined button
  On submit: POST /api/waitlist { email, interest }
  After submit: button text → "You're on the list"

POST /api/waitlist: INSERT into waitlist { email, interest }, return 200.

Wire all "Coming Soon" / "Join waitlist →" elements to open WaitlistModal.
```

### Definition of Done
- [ ] Submitting a valid email reveals the full report without a page reload
- [ ] Button text changes to "Opening report…" while in-flight — no spinner
- [ ] A confirmation email arrives via Resend with the correct URL and P&L
- [ ] Refreshing after email submission immediately shows the full report (cookie present)
- [ ] Re-submitting the same email creates no duplicate `email_captures` row
- [ ] Invalid email format shows an inline error without a server call
- [ ] `waitlist` table stores submissions correctly
- [ ] WaitlistModal shows "You're on the list" after submit

---

## Step 14 — Authentication (Email/Password + Google OAuth)

Implement auth using better-auth with session management. Protect all dashboard routes.

> **Decision:** better-auth uses a raw `pg.Pool` (from the `pg` package) as the database adapter, not `better-auth/adapters/postgresql`. Install `pg` and `@types/pg` as dependencies.
>
> **Decision:** better-auth generates `"user"`, `"session"`, `"account"`, `"verification"` tables (quoted, camelCase columns like `"emailVerified"`, `"createdAt"`). Migration `002_auth.sql` replaces the hand-rolled `users`/`sessions` from `001_initial.sql` and migrates `user_id` FK columns from UUID → text across all dependent tables.
>
> **Decision:** `svelteKitHandler` requires `{ event, resolve, auth, building }` — import `building` from `$app/environment`.
>
> **Decision:** Google OAuth is conditionally applied — spread `{}` if env vars are absent to avoid runtime errors in dev environments without Google credentials.
>
> **Decision:** `export type Session = typeof auth.$Infer.Session["session"]` and `export type User = typeof auth.$Infer.Session["user"]` (index into the Session type, not use it directly).

### Prompt

```
Implement authentication using better-auth.
Install: bun add better-auth pg
Install dev: bun add -d @types/pg

better-auth uses pg.Pool (NOT better-auth/adapters/postgresql).

--- MIGRATION: src/lib/server/db/migrations/002_auth.sql ---

-- Drop FK constraints referencing old users table
ALTER TABLE backtest_reports    DROP CONSTRAINT IF EXISTS backtest_reports_user_id_fkey;
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

-- Drop old hand-rolled auth tables
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users    CASCADE;

-- Create better-auth managed tables
create table "user" (
  "id"            text        not null primary key,
  "name"          text        not null,
  "email"         text        not null unique,
  "emailVerified" boolean     not null,
  "image"         text,
  "createdAt"     timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt"     timestamptz default CURRENT_TIMESTAMP not null,
  "credits"       integer
);

create table "session" (
  "id"        text        not null primary key,
  "expiresAt" timestamptz not null,
  "token"     text        not null unique,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text        not null references "user" ("id") on delete cascade
);

create table "account" (
  "id"                   text        not null primary key,
  "accountId"            text        not null,
  "providerId"           text        not null,
  "userId"               text        not null references "user" ("id") on delete cascade,
  "accessToken"          text,
  "refreshToken"         text,
  "idToken"              text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                text,
  "password"             text,
  "createdAt"            timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt"            timestamptz not null
);

create table "verification" (
  "id"         text        not null primary key,
  "identifier" text        not null,
  "value"      text        not null,
  "expiresAt"  timestamptz not null,
  "createdAt"  timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt"  timestamptz default CURRENT_TIMESTAMP not null
);

create index "session_userId_idx"          on "session"      ("userId");
create index "account_userId_idx"          on "account"      ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- Migrate user_id FK columns from uuid → text
UPDATE backtest_reports SET user_id = NULL;
ALTER TABLE backtest_reports ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE backtest_reports
  ADD CONSTRAINT backtest_reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE SET NULL;

DELETE FROM credit_transactions;
ALTER TABLE credit_transactions ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE;

--- AUTH CONFIG: src/lib/server/auth.ts ---

  import { betterAuth } from "better-auth"
  import { Pool }       from "pg"
  import postgres       from "postgres"
  import {
    BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL
  } from "$env/static/private"
  import { PUBLIC_BASE_URL } from "$env/static/public"

  // pg.Pool for better-auth (Kysely-based adapter)
  const pool = new Pool({ connectionString: DATABASE_URL })
  // postgres.js for databaseHooks SQL
  const sql  = postgres(DATABASE_URL)

  export const auth = betterAuth({
    secret:   BETTER_AUTH_SECRET,
    baseURL:  PUBLIC_BASE_URL,
    database: pool,   // NOT postgresql() from better-auth/adapters/postgresql
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8
    },
    socialProviders: {
      // Conditionally include Google OAuth only when credentials are configured
      ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET ? {
        google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET }
      } : {})
    },
    user: {
      additionalFields: {
        credits: { type: "number", defaultValue: 3, required: false }
      }
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Link any pre-auth reports to this user
            await sql`
              UPDATE backtest_reports
              SET user_id = ${user.id}
              WHERE email   = ${user.email}
              AND   user_id IS NULL
            `
          }
        }
      }
    }
  })

  // Index into the Session type to get session/user sub-types
  export type Session = typeof auth.$Infer.Session["session"]
  export type User    = typeof auth.$Infer.Session["user"]

--- HOOKS: src/hooks.server.ts ---

  import { auth }              from "$lib/server/auth"
  import { svelteKitHandler }  from "better-auth/svelte-kit"
  import { building }          from "$app/environment"
  import type { Handle }       from "@sveltejs/kit"
  import { redirect }          from "@sveltejs/kit"

  export const handle: Handle = async ({ event, resolve }) => {
    if (event.url.pathname.startsWith("/api/auth")) {
      return svelteKitHandler({ event, resolve, auth, building })
    }

    const session            = await auth.api.getSession({ headers: event.request.headers })
    event.locals.user        = session?.user    ?? null
    event.locals.session     = session?.session ?? null

    if (event.url.pathname.startsWith("/dashboard") && !event.locals.user) {
      throw redirect(302, "/auth/login")
    }

    return resolve(event)
  }

--- TYPE AUGMENTATION: src/app.d.ts ---
  import type { User, Session } from "$lib/server/auth"

  declare global {
    namespace App {
      interface Locals {
        user:    User | null
        session: Session | null
      }
    }
  }

--- AUTH CLIENT: src/lib/auth-client.ts ---
  import { createAuthClient } from "better-auth/svelte"
  export const authClient = createAuthClient()

--- PAGES ---
src/routes/auth/login/+page.svelte and src/routes/auth/register/+page.svelte:
  Use authClient.signIn.email() / signUp.email() / signIn.social().
  Styled per Design.md — dark theme, IBM Plex Sans, no decoration.
```

### Definition of Done
- [ ] `002_auth.sql` runs without errors — better-auth tables created, user_id columns migrated
- [ ] New user can register and is redirected to the dashboard
- [ ] Login/logout works; session cleared on logout
- [ ] Google OAuth conditionally enabled — works when env vars present, no error when absent
- [ ] `event.locals.user` is populated for authenticated requests
- [ ] `/dashboard` without auth redirects to `/auth/login`
- [ ] `hooks.server.ts` imports `building` from `$app/environment`
- [ ] Credit deduction in pipeline uses `UPDATE "user"` (quoted), not `UPDATE users`

---

## Step 15 — Dashboard (Registered Users)

Build the authenticated dashboard: saved backtests list, new backtest input, credit balance in nav.

> **Decision:** Credit deduction in the pipeline runs against `"user"` table (quoted): `UPDATE "user" SET credits = credits - ${cost} WHERE id = ${userId} AND credits >= ${cost}`. The `count` of affected rows determines success; zero rows means insufficient credits.

### Prompt

```
Build the dashboard at src/routes/dashboard/+page.svelte. Auth required (Step 14).
Use Svelte 5 runes syntax throughout.

--- LAYOUT: src/routes/dashboard/+layout.svelte ---
Top nav:
  Left:      "NewsTrader AI" wordmark, IBM Plex Sans, --text-primary
  Right:     "⚡ {credits} credits" from event.locals.user.credits, IBM Plex Mono
  Far right: "Account" text link → /dashboard/account
  Mobile:    ☰ toggle reveals dropdown (--bg-elevated, 1px --bg-border, no animation)

--- LOAD: +page.server.ts ---
Query backtest_reports for authenticated user, ordered by created_at DESC.

--- PAGE SECTIONS ---

1. COMING SOON BANNER — full width, --bg-surface, border-left: 3px solid --accent-amber
   "Live alerts and trade execution — coming soon. Join waitlist →"

2. MY BACKTESTS — rows (not cards), client-side sort by Date / Return / Ticker
   Delete: inline confirmation below row (no modal)
   POST /api/reports/{slug}/delete → soft delete (is_public = false)

3. RUN NEW BACKTEST — BacktestInput component
   If user.credits = 0: show inline amber warning
     "You've used all your credits. Buy more to continue."  [Buy credits →]

--- CREDIT DEDUCTION IN PIPELINE ---
Already handled in Step 9 pipeline/run. Key detail:
  UPDATE "user" SET credits = credits - {cost}   -- note: quoted "user" table
  WHERE  id      = ${locals.user.id}
    AND  credits >= {cost}
  If deducted.count === 0: emit error, return.
```

### Definition of Done
- [ ] Dashboard inaccessible without auth
- [ ] Top nav shows credit balance in IBM Plex Mono
- [ ] My Backtests shows rows with correct data; sort works client-side
- [ ] Delete shows inline confirmation — no modal
- [ ] User with 0 credits sees the amber inline warning
- [ ] Credits cannot go negative (SQL WHERE guard)
- [ ] `BacktestInput` component renders correctly in the dashboard

---

## Step 16 — Credit Purchasing (Polar.sh)

Add the credit purchasing flow using Polar.sh as the Merchant of Record.

### Prompt

```
Implement credit purchasing via Polar.sh one-time products.
Install: bun add @polar-sh/sdk

--- SEED SCRIPT: scripts/seed-polar.ts ---
Run with: bun run seed:polar

Creates 3 credit pack products in Polar.sh and writes product IDs to .env.local.
Make it idempotent: list existing products, skip creation if name already exists.

  import { Polar } from "@polar-sh/sdk"

  const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN! })

  const packs = [
    { name: "Starter Pack",  credits: 10,  amountCents: 900  },
    { name: "Pro Pack",      credits: 30,  amountCents: 1900 },
    { name: "Power Pack",    credits: 100, amountCents: 4900 }
  ]

  // List existing products — skip creation if name matches (idempotency)
  // Write POLAR_PRODUCT_STARTER, POLAR_PRODUCT_PRO, POLAR_PRODUCT_POWER to .env.local

--- POLAR CLIENT: src/lib/server/polar.ts ---
  import { Polar } from "@polar-sh/sdk"
  import { POLAR_ACCESS_TOKEN } from "$env/static/private"
  export const polar = new Polar({ accessToken: POLAR_ACCESS_TOKEN })

--- ENDPOINT: POST /api/credits/checkout ---
Auth required (401 if null).
  const checkout = await polar.checkouts.create({
    productId,
    successUrl: `${PUBLIC_BASE_URL}/dashboard/credits?success=1`,
    metadata: { user_id, pack, credits: String(creditsByPack[pack]) }
  })
  Return { url: checkout.url }
  Frontend: window.location.href = url

--- ENDPOINT: POST /api/webhooks/polar ---
No session auth. Verify with validateEvent from "@polar-sh/sdk/webhooks".
Handle "order.created":
  UPDATE "user" SET credits = credits + ${credits} WHERE id = ${userId}
  INSERT INTO credit_transactions (user_id, amount, reason, stripe_payment_id) VALUES (...)
  Note: stripe_payment_id column stores the Polar order ID in V1.

--- PAGE: src/routes/dashboard/credits/+page.svelte ---
Balance, 3 credit pack rows, usage history.
Success banner when ?success=1 in URL.
```

### Definition of Done
- [ ] `bun run seed:polar` runs without errors and prints the 3 product IDs
- [ ] Seed script is idempotent — does not duplicate products if re-run
- [ ] `/dashboard/credits` renders balance, 3 pack rows, and usage history
- [ ] Clicking "Buy →" redirects to the Polar-hosted checkout page
- [ ] Polar webhook updates `"user"`.credits and inserts a `credit_transactions` row
- [ ] Webhook signature verification rejects invalid signatures (returns 400)

---

## Step 17 — Public Share URLs & Open Graph Meta Tags

Make reports publicly accessible by slug with rich link previews.

### Prompt

```
Implement the public share feature and OG meta tags.

--- VIEW CONTEXT ---
Update /backtest/[id]/+page.server.ts:
  "owner"        → authenticated user owns this report
  "email_access" → report_access_{slug} cookie present
  "public_link"  → no cookie, no auth → teaser

Return 404 if is_public = false AND viewer is not the owner.

OWNER CONTROLS (owner only):
  "Copy share link  ↗" (real URL)
  Visibility toggle: POST /api/reports/{slug}/visibility with { is_public: boolean }
    Toggling to private shows inline amber warning.
  "Delete" → inline confirmation → POST /api/reports/{slug}/delete

For "public_link" context, above the disclaimer banner:
  "Run your own backtest — free →" → homepage

--- OG META TAGS ---
Build in +page.server.ts:
{
  title:       `"${query.slice(0, 60)}..." — NewsTrader AI`,
  description: `${pct > 0 ? "+" : ""}${pct}% across ${n} events | ${tickerCount} tickers | ${dateRange}`
}

In +page.svelte <svelte:head>:
  <title>, og:title, og:description, og:url, og:type, twitter:card, twitter:title, twitter:description

OG description uses query + P&L — never the disclaimer text (PRD §5.3).

--- VIEW COUNT ---
In +page.server.ts when viewContext = "public_link": incrementViewCount(report.id)
Teaser social proof: "{view_count} traders have run this backtest"
```

### Definition of Done
- [ ] Visiting without auth or cookie shows teaser with email gate
- [ ] Visiting with a valid cookie shows the full report immediately
- [ ] Owner sees visibility toggle and delete controls; others do not
- [ ] Toggling to private + visiting without auth returns 404
- [ ] OG `<meta>` tags present in `<head>` with P&L in description
- [ ] `view_count` increments on non-owner loads

---

## Step 18 — Error & Empty States

Implement all error and empty states across the app. No illustrations, no emoji.

### Prompt

```
Implement every error and empty state.

Rules (Design.md §10):
  No illustrations. No emoji. Direct, calm text.
  Inline placement — no modals for errors.
  Colors: --accent-amber for warnings, --accent-loss for errors, --text-secondary for empty.

--- PIPELINE ERROR STATES ---

1. ZERO EVENTS FOUND
   SSE emits: { type: "error", stage: "detection", message: "no_events" }
   UI: "No historical events found matching your hypothesis."
       "Refine query →" resets to "input" state, textarea pre-filled with original query

2. LOW CONFIDENCE (1–2 events)
   SSE emits: { type: "low_confidence", event_count: N }
   UI: amber border-left warning
       "Only {N} event found — results may not be statistically meaningful."
       "Run anyway →"   [Refine query →]
   "Run anyway →" posts confirmed_tickers to unblock the stream

3. API ERROR
   { type: "error", stage: "detection"|"prices", message: string }
   "Something went wrong retrieving {news data | price data}. Your credits were not deducted."
   "Try again →" — re-runs pipeline with same parameters

4. INSUFFICIENT CREDITS
   { type: "error", message: "insufficient_credits", stage: "credits" }
   "You've used all your credits. Buy more to continue running backtests."
   "Buy credits →" → /dashboard/credits

--- REPORT PAGE STATES ---

5. REPORT NOT FOUND
   src/routes/backtest/[id]/+error.svelte:
   "This report doesn't exist or has been made private."
   "← Run your own backtest" → homepage

6. REPORT STILL PROCESSING
   If report.status = 'pending': show ProcessingLog connecting to live stream.

--- GLOBAL ERROR BOUNDARY ---
src/routes/+error.svelte:
  Status code — IBM Plex Mono, --text-secondary
  "Something went wrong." — IBM Plex Sans, --text-primary
  "← Back to homepage"
  No stack traces exposed.
```

### Definition of Done
- [ ] Query producing 0 events shows "no events found"; "Refine query →" pre-fills the textarea
- [ ] Query producing 1–2 events shows the amber low-confidence warning with both action links
- [ ] "Run anyway →" resumes the pipeline from the paused state
- [ ] Insufficient credits shows the amber inline warning — not a modal, not a new page
- [ ] Non-existent slug renders `+error.svelte` with the correct message
- [ ] Global `+error.svelte` shows no stack traces
- [ ] All error text uses IBM Plex Sans, no emoji, no illustrations

---

## Step 19 — Mobile Responsive Pass

Apply all mobile adjustments from Design.md §12. Dedicated pass across the entire application.

### Prompt

```
Audit and fix mobile responsiveness across all pages.
Breakpoints (Design.md §12): sm: 640px, md: 768px, lg: 1024px
Use CSS media queries only — no JS breakpoint detection.
Test at 375px (iPhone SE) and 768px (iPad) in DevTools.

--- DISCLAIMER BANNER ---
Mobile (< 640px): truncate to one line with "… Show more ▼" toggle.

--- TOP NAV (Dashboard) ---
Mobile: wordmark left, credits right.
"Account" hidden → ☰ toggle reveals dropdown.

--- REPORT PAGE ---
Per-event charts: minimum 280px height on mobile.
Trade log table: wrap in overflow-x: auto. All columns remain.
SVG portfolio/teaser charts: bind:clientWidth already handles responsive resizing.

--- DASHBOARD ---
Backtest rows on mobile stack to 2 lines.

Check every page at 375px in DevTools responsive mode.
```

### Definition of Done
- [ ] All pages render without horizontal scrollbars at 375px viewport width
- [ ] Disclaimer banner collapses to one line on mobile with a working expand toggle
- [ ] Dashboard top nav hides "Account" behind ☰ on mobile
- [ ] Trade log table scrolls horizontally on mobile — all columns intact
- [ ] SVG charts resize correctly via `bind:clientWidth`
- [ ] No Tailwind color utility classes introduced — all colors remain CSS variables

---

## Appendix — Dependency Map

```
Step 1  (Foundation — Bun · SvelteKit 5 · TypeScript · CSS variables)
  └── Step 2  (Homepage UI)
        └── Step 3  (Clarifying Questions + Processing State UI)
Step 4  (Report UI — static mock data)
  └── Step 11 (Per-event Charts — lightweight-charts)
        └── Step 12 (Portfolio Charts — plain SVG, no recharts)

Steps 5–8 can be built in parallel with Steps 2–4:
  Step 5  (pi-ai + OpenRouter — Query Understanding via TypeBox tool call)
  Step 6  (Event Detection — exa-js only)
  Step 7  (Impact Windows — Alpaca OHLCV only)
  Step 8  (Trade Simulation — pure TypeScript, bun test)
    └── Step 9  (Pipeline Orchestration — Promise-resolve sessions, single SSE handler)
          └── Step 10 (Persistence + Research Narrative + bun run db:seed)
                └── Step 13 (Email Gate + Waitlist Modal — resend)
                      └── Step 14 (better-auth — pg.Pool adapter, 002_auth.sql migration)
                            └── Step 15 (Dashboard + credit deduction on "user" table)
                                  └── Step 16 (Polar.sh credits + bun run seed:polar)

Step 10 + Step 14
  └── Step 17 (Public Share URLs + OG Tags)

Step 18 (Error States)  — after Step 9, can overlap with Steps 10–17
Step 19 (Mobile Pass)   — final pass, after all UI complete
```

---

## Appendix — Library & Runtime Reference

```
Runtime / package manager
  bun                        bun add / bun run / bun test  (never npm, never node)

AI — @mariozechner/pi-ai
  import { getModel, complete, stream, validateToolCall,
           type Tool, type Context }               from "@mariozechner/pi-ai"
  import { Type, type Static, type TSchema }       from "@mariozechner/pi-ai"

  // Model initialisation (src/lib/server/ai.ts)
  process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY  // must set explicitly
  const model = getModel("openrouter", "anthropic/claude-sonnet-4-5")
  if (!model) throw new Error(...)

  // Structured output via tool calling (Step 5)
  const response  = await complete(model, context, { toolChoice: "required" })
  const toolCall  = response.content.find(b => b.type === "toolCall")
  const validated = validateToolCall([tool], toolCall)

  // Text generation (Step 10 — research narrative)
  const response = await complete(model, { systemPrompt, messages })
  const text     = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map(b => b.text).join("")

Auth
  better-auth                Core auth library
  better-auth/svelte-kit     svelteKitHandler({ event, resolve, auth, building })
  better-auth/svelte         createAuthClient() for client-side pages
  pg                         pg.Pool passed as database: to betterAuth()
  Tables: "user", "session", "account", "verification" (quoted, camelCase cols)
  export type Session = typeof auth.$Infer.Session["session"]
  export type User    = typeof auth.$Infer.Session["user"]

Payments
  @polar-sh/sdk              Polar.sh checkout + webhook verification
                             import { Polar }         from "@polar-sh/sdk"
                             import { validateEvent } from "@polar-sh/sdk/webhooks"

News / event discovery
  exa-js                     Exa Search API — deep + auto search

Price data
  Alpaca Market Data API     Raw fetch (no SDK) — APCA-API-KEY-ID header

Charts
  lightweight-charts         Per-event price charts (Step 11)
  Plain SVG                  Portfolio + teaser charts (Step 12) — NO recharts

Database
  postgres                   postgres.js singleton — src/lib/server/db/client.ts
  pg                         pg.Pool for better-auth adapter

Email
  resend                     Transactional email

Testing
  bun test                   import { describe, test, expect } from "bun:test"

Scripts (bun run ...)
  db:migrate                 bun run src/lib/server/db/migrate.ts
  db:seed                    bun run scripts/seed.ts
  seed:polar                 bun run scripts/seed-polar.ts
```

---

## Appendix — Key Decision Log

| # | Decision | Reason |
|---|----------|--------|
| 1 | `@fontsource/instrument-serif` instead of Google Fonts `<link>` | Keeps all fonts in the asset bundle, no third-party request |
| 2 | `direction_hint` and `ambiguity` use `Type.String()` not `Type.Union(Literal)` | Strict literal enums in tool schemas cause some OpenRouter models to fail validation |
| 3 | `process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY` in `ai.ts` | Vite does not guarantee `$env/static/private` propagates to `process.env`; pi-ai reads from `process.env` |
| 4 | `complete()` called with `{ toolChoice: "required" }` | Forces tool use; without it some models respond with text instead of calling the tool |
| 5 | Pipeline sessions use Promise-resolve pattern | Cleaner than polling; SSE handler simply `await`s the resolve; no 500ms loop |
| 6 | All pipeline stages consolidated in single `GET /api/pipeline/run` handler | No internal HTTP round-trips; all functions imported directly |
| 7 | Register `waitForTickers` / `waitForRule` BEFORE emitting events | Prevents race condition where client confirms before resolve handler is installed |
| 8 | Portfolio charts use plain SVG (Approach B), not recharts | Recharts is React-only; ~150 kB overhead + two reconcilers for a line chart is unreasonable |
| 9 | better-auth uses `pg.Pool`, not `postgresql()` adapter | `better-auth/adapters/postgresql` is not the correct import; raw `pg.Pool` works with the Kysely-based adapter |
| 10 | better-auth table names are `"user"` / `"session"` (quoted, camelCase) | Generated by better-auth; requires quoting in SQL and migrating user_id from UUID → text |
| 11 | Google OAuth conditionally spread only when env vars present | Avoids runtime errors in dev environments without Google credentials |
| 12 | `svelteKitHandler` requires `building` from `$app/environment` | Required parameter in the better-auth SvelteKit adapter |
| 13 | `export type Session/User = typeof auth.$Infer.Session["session"/"user"]` | `auth.$Infer.Session` is the full session object; index to get sub-types |
| 14 | Credit deduction: `UPDATE "user"` (quoted) | better-auth table is `"user"`, not `users` |
