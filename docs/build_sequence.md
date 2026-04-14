# NewsTrader AI — Build Sequence for Claude Code

**Runtime:** Bun  
**Language:** TypeScript throughout - no JavaScript files  
**Stack:** SvelteKit · Bun · TypeScript · PostgreSQL · `@mariozechner/pi-ai` + OpenRouter · better-auth · Polar.sh · Exa.ai · Alpaca Market Data · Resend

**Key library choices:**
- **`@mariozechner/pi-ai`** - unified LLM SDK with native OpenRouter support. Uses `getModel('openrouter', 'model-id')` + `complete()` / `stream()`. Structured output via TypeBox-typed tool calling (not text parsing). Async-iterable stream events slot directly into our SSE pipeline. Auth via `OPENROUTER_API_KEY` env var - no client initialisation needed.
- **TypeBox** - re-exported from `@mariozechner/pi-ai` as `Type`, `Static`, `TSchema`. Used for tool parameter schemas and pipeline type definitions.
- **better-auth** - auth library (email/password + Google OAuth)
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

### Prompt

```
Initialize a SvelteKit project with TypeScript. Use Bun as the runtime and package manager
throughout — never use npm or node commands.

Install dependencies with bun add:
  bun add @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
  bun add -d typescript @sveltejs/kit @sveltejs/adapter-node svelte vite
  bun add postgres                         # DB client
  bun add tailwindcss                      # spacing utilities only
  bun add @mariozechner/pi-ai              # unified AI SDK with OpenRouter + TypeBox

Instrument Serif: add to app.html <head> via Google Fonts link tag.

Configure bun as the runtime in package.json:
  "scripts": {
    "dev":    "vite dev",
    "build":  "vite build",
    "test":   "bun test",
    "db:migrate": "bun run src/lib/server/db/migrate.ts",
    "db:seed":    "bun run scripts/seed.ts",
    "seed:polar": "bun run scripts/seed-polar.ts"
  }

Tailwind CSS for spacing utilities only — do NOT use Tailwind color classes anywhere;
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

Create src/routes/+layout.svelte that imports app.css, wraps all pages in
Container, and renders a <slot />.

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
@mariozechner/pi-ai picks up OPENROUTER_API_KEY automatically from the environment.
Changing the model requires only a new env var value -- no code changes.

POLAR_PRODUCT_* values are populated after running `bun run seed:polar` (Step 16).
BETTER_AUTH_SECRET must be at least 32 random characters -- generate with:
  openssl rand -base64 32

Do not build any page content yet -- foundation only.
```

### Definition of Done
- [ ] `bun run dev` starts without errors -- Bun is the runtime, not Node
- [ ] `app.css` contains every CSS variable from Design.md §2 and §3 with the exact hex values above
- [ ] IBM Plex Sans, IBM Plex Mono, and Instrument Serif are all loading (visible in browser DevTools Network tab)
- [ ] `Container.svelte` renders a centered column, visually confirmed at 1100px max-width
- [ ] `.env.example` is present with all 16 keys listed, no values
- [ ] `package.json` scripts use `bun` -- no `npm run` or `node` references anywhere
- [ ] `@mariozechner/pi-ai` is listed in `package.json` dependencies -- no `ai`, `@ai-sdk/openrouter`, or `zod` packages
- [ ] Zero Tailwind color utility classes anywhere -- confirmed by grepping for Tailwind color prefixes

---

## Step 2 — Homepage Input UI (Static)

Build the homepage backtest input form as a fully styled static page with no backend. Get layout, typography, and all interactions right per Design.md §5.1 before any logic is added.

### Prompt

```
Build the homepage at src/routes/+page.svelte as a static UI — no backend calls.

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

Props:
  on:continue — dispatched with the selected values when Continue is clicked

State: selected radio per question tracked in component.
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

After the last line: emit on:complete.

Props:
  on:complete — dispatched after final log line
  on:error    — dispatched if an upstream error occurs (unused in stub)

--- STATE MACHINE: src/routes/backtest/new/+page.svelte ---

States:
  "input"      → textarea + market selector + Run Backtest button
  "clarifying" → ClarifyingQuestions appears below textarea
  "processing" → ProcessingLog replaces the form area
  "done"       → navigate to /backtest/stub

Transitions:
  Run Backtest clicked              → "clarifying"
  ClarifyingQuestions on:continue   → store selected values, → "processing"
  ProcessingLog on:complete         → navigate to /backtest/stub

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

Use hardcoded mock data — no database, no API. Mock scenario:
  query:   "Buy Nvidia every time the US announces AI chip restrictions on China"
  events:  7 historical occurrences
  tickers: NVDA, AMD, INTC, QCOM
  return:  +184%
  trades:  24

Manage a let teaserMode = true state variable. Build all sections for both states.

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

## Step 5 -- AI Pipeline: Query Understanding

Build the first and only AI-powered stage of the event pipeline. Uses `@mariozechner/pi-ai` with OpenRouter. Structured output is achieved by defining a TypeBox-typed tool and forcing the model to call it -- no JSON parsing, no retry logic, validated arguments come back typed.

### Prompt

```
Create a SvelteKit server endpoint that uses @mariozechner/pi-ai with OpenRouter
to parse the user's backtest hypothesis into a structured event spec.

@mariozechner/pi-ai was installed in Step 1. No additional packages needed.
OPENROUTER_API_KEY is read from the environment automatically by the library.

--- AI MODULE: src/lib/server/ai.ts ---
Export a shared model instance used by every AI call in the app.

  import { getModel }                       from "@mariozechner/pi-ai"
  import { OPENROUTER_DEFAULT_MODEL }       from "$env/static/private"

  // All model calls in the app use this single model reference.
  // Swap the model by changing OPENROUTER_DEFAULT_MODEL in .env.
  // OPENROUTER_API_KEY is picked up automatically from the environment.
  export const model = getModel(
    "openrouter",
    (OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-5") as any
  )

--- PIPELINE TYPES: src/lib/types/pipeline.ts ---
Define TypeBox schemas for structured pipeline types.
TypeBox is re-exported directly from @mariozechner/pi-ai.

  import { Type, type Static } from "@mariozechner/pi-ai"

  export const EventSpecSchema = Type.Object({
    event_type:        Type.String({ description: "Short label e.g. chip export restriction" }),
    event_description: Type.String({ description: "1-2 sentences describing the event" }),
    geography:         Type.String({ description: "US, global, or other" }),
    direction_hint:    Type.Union([
      Type.Literal("long"), Type.Literal("short"),
      Type.Literal("neutral"), Type.Literal("unknown")
    ]),
    date_range: Type.Object({
      start: Type.String({ description: "ISO date. Default 2015-01-01 if not specified" }),
      end:   Type.String({ description: "ISO date. Default today if not specified"     })
    })
  })

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
    ambiguity:            Type.Union([
      Type.Literal("LOW"), Type.Literal("MEDIUM"), Type.Literal("HIGH")
    ]),
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
Instruct the model to call this tool to return its analysis.
pi-ai validates the arguments against the TypeBox schema automatically.

  import { complete, type Tool, type Context, validateToolCall }
    from "@mariozechner/pi-ai"
  import { model }                  from "$lib/server/ai"
  import { UnderstandResponseSchema, type UnderstandResponse }
    from "$lib/types/pipeline"

  const SYSTEM_PROMPT = `You are a financial event analyst. The user will describe
  a news-driven trading hypothesis. Analyse it and call the extract_event_spec tool
  with the structured result. Rules:
  - primary_query must be a complete sentence as a journalist would write it -- not keywords
  - additional_queries must use different eras, angles, and journalist vocabulary
  - date_range.start defaults to "2015-01-01" if the user does not specify
  - date_range.end defaults to today's ISO date if the user does not specify
  - clarifying_questions must be empty unless ambiguity is HIGH
  - NEVER put entry/exit timing, direction, or position size in clarifying_questions`

  const extractTool: Tool = {
    name:        "extract_event_spec",
    description: "Extract the structured event specification from the user's hypothesis",
    parameters:  UnderstandResponseSchema
  }

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages:     [{ role: "user", content: query }],
    tools:        [extractTool]
  }

  const response = await complete(model, context)

  // Find the tool call in the response content
  const toolCall = response.content.find(b => b.type === "toolCall")
  if (!toolCall || toolCall.type !== "toolCall") {
    return error(500, { error: "Model did not call the expected tool" })
  }

  // Validate arguments against the TypeBox schema (throws on invalid shape)
  const validated = validateToolCall([extractTool], toolCall) as UnderstandResponse

  return json(validated)

--- ERROR HANDLING ---
Wrap the complete() call in try/catch.
If the model does not call the tool (stopReason !== "toolUse"), return 500.
If validateToolCall throws, return 500 with the validation message.
400 for missing/empty query body.
Never expose raw error objects to the client -- log server-side, return { error: string }.

--- WIRING ---
In /backtest/new, wire the "Run Backtest" button to POST to this endpoint
with the textarea content. Log the response to the browser console.
UI state machine does not change -- stub flow remains intact.
```

### Definition of Done
- [ ] `src/lib/server/ai.ts` exports a `model` using `getModel("openrouter", ...)` -- no other AI client exists in the codebase
- [ ] All pipeline types are TypeBox schemas in `src/lib/types/pipeline.ts` with `Static<>` inferred types -- no hand-written interfaces duplicating the schema
- [ ] `POST /api/pipeline/understand` with "Buy Nvidia every time the US announces new AI chip restrictions on China" returns a valid `UnderstandResponse`
- [ ] `exa_search.primary_query` is a full descriptive sentence, not a keyword string
- [ ] `exa_search.additional_queries` has 3-4 meaningfully different phrasings
- [ ] `date_from` defaults to `"2015-01-01"` and `date_to` to today's date when not specified
- [ ] `clarifying_questions` is empty for the above unambiguous query
- [ ] No JSON.parse, no markdown fence stripping, no custom retry logic -- pi-ai and validateToolCall handle it
- [ ] Swapping `OPENROUTER_DEFAULT_MODEL` to a different OpenRouter model ID and restarting works without code changes
- [ ] No API keys exposed to the browser
- [ ] Clicking "Run Backtest" in the browser calls the endpoint and logs the parsed response to the console

---

## Step 6 -- Event Detection (Exa.ai)

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

type RawExaEvent = {
  event_date:        string,
  description:       string,
  tickers_mentioned: string[],
  confidence:        "HIGH" | "MEDIUM" | "LOW",
  sources: { url: string, title: string, highlight: string | null }[]
}

type RankedTicker = {
  symbol:       string,
  event_count:  number,   // how many events mention this ticker
  total_events: number    // total events in the result set
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
            tickers_mentioned: { type: "array"  },
            confidence:        { type: "string" }
          }
        }
      }
    }
  }
}

Parse response:
  Primary path:
    response.output.content → JSON.parse → events array
    response.output.grounding → map citations to sources[] (url + title per grounding entry)

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
  event_date   → keep earliest date in cluster
  description  → keep from highest-confidence event in cluster
  confidence   → keep highest (HIGH > MEDIUM > LOW)
  sources      → merge, deduplicate by URL
  tickers_mentioned → merge, deduplicate, preserve first-appearance order

== FUNCTION 4: rankTickers ==

function rankTickers(events: RawExaEvent[]): RankedTicker[]

Count how many deduplicated events mention each ticker-like token.
Filter out:
  - Tokens appearing in only 1 event (too rare — likely incidental)
  - All tokens in this blocklist (common false positives):
    ["IT", "US", "AI", "CEO", "IPO", "GDP", "FED", "SEC", "DOJ",
     "API", "EU", "UK", "UN", "IMF", "WHO", "WTO", "ETF", "ESG",
     "EPS", "PE", "VC", "NY", "DC", "LA", "PR", "IR"]
  - Single-letter tokens
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
- [ ] No deprecated Exa parameters used (`useAutoprompt`, `livecrawl`, `numSentences`, `highlightsPerUrl`, top-level `text`/`highlights`/`summary`)
- [ ] No `@mariozechner/pi-ai` or Alpaca API calls exist anywhere in this service
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
- [ ] `POST /api/pipeline/impact-windows` with NVDA and a known event date (e.g. 2023-10-17) returns a complete `ImpactWindow` with `peak_car`, `peak_car_date`, `impact_end`, and `ohlcv` populated
- [ ] `ohlcv` in the window contains the price bars needed for charting
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

function simulateTrades(
  occurrences:   EventOccurrence[],
  impactWindows: ImpactWindow[],
  rule:          EntryExitRule
): SimulatedTrade[]
  For each (occurrence, ticker) pair:
    Find matching ImpactWindow by ticker + event_date
    Resolve entry and exit
    pnl_dollars = (exit - entry) / entry * notional  (long)
                  (entry - exit) / entry * notional  (short)
    pnl_pct     = (exit - entry) / entry             (long), reversed for short
    hold_days   = trading days between entry_date and exit_date
    abnormal_return_vs_benchmark = window.final_car

function buildPortfolioSeries(
  trades:          SimulatedTrade[],
  startingCapital: number
): { date: string, value: number }[]
  Day-by-day portfolio value from earliest entry to latest exit.
  P&L is realised on each trade's exit_date.
  Concurrent trades from the same event contribute simultaneously (PRD §6.4).
  Return one entry per calendar day with no gaps.

function computeSummary(
  trades:          SimulatedTrade[],
  portfolioSeries: { date: string, value: number }[],
  startingCapital: number
): BacktestResult["summary"]
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
Bun's test API is Jest-compatible — import from "bun:test":

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
- [ ] 0.1% slippage applied to both entry and exit in the correct direction for each side
- [ ] `portfolio_series` is continuous — no missing calendar days
- [ ] Concurrent trades from the same event appear simultaneously in the series
- [ ] `max_drawdown` comes from the portfolio series, not from individual trades
- [ ] `best_trade` and `worst_trade` are actual `SimulatedTrade` objects
- [ ] `bun test` exits 0 — all tests pass

---

## Step 9 — Streaming Pipeline Orchestration

Wire all pipeline stages into a single SSE endpoint. ProcessingLog connects to the real stream. The ticker confirmation and rule selection steps are surfaced here between stages.

### Prompt

```
Create the SSE orchestration endpoint and replace the stub log with real data.

--- ENDPOINT: GET /api/pipeline/run ---
File: src/routes/api/pipeline/run/+server.ts

Accepts query param: ?params={URL-encoded JSON string}
{
  query:            string,
  starting_capital: number,
  date_from:        string,
  date_to:          string
}

Returns a Server-Sent Events stream. Each event:
  event: log | ticker_candidates | entry_exit_suggestions | result | error
  data:  JSON string

LOG:                  { type: "log", timestamp: string, message: string }
TICKER_CANDIDATES:    { type: "ticker_candidates", ranked_tickers: RankedTicker[], raw_events: RawExaEvent[] }
ENTRY_EXIT_SUGGESTIONS: { type: "entry_exit_suggestions", suggestions: { aggressive, moderate, conservative } }
RESULT:               { type: "result", backtest_id: string }   // placeholder UUID until Step 10
ERROR:                { type: "error", message: string, stage: string }

--- ORCHESTRATION SEQUENCE ---

Stage 1 — Query Understanding
  log: "Parsing hypothesis..."
  Internal call to POST /api/pipeline/understand
  log: "Event type identified: {event_type}"

Stage 2 — Event Detection
  log: "Searching news corpus ({date_from}–{date_to})..."
  Internal call to POST /api/pipeline/detect-events
  log: "Found {total_found} candidate articles — deduplicating..."
  log: "Confirmed {n} historical event occurrences"

  If raw_events is empty:
    emit error: { stage: "detection", message: "no_events" }
    close stream

  If raw_events.length <= 2:
    emit log: "Only {n} event(s) found — results may not be statistically meaningful"

  emit TICKER_CANDIDATES with ranked_tickers and raw_events
  ← Stream pauses. Wait for POST /api/pipeline/confirm-tickers.

  POST /api/pipeline/confirm-tickers:
    Input: { session_id: string, confirmed_tickers: string[] }
    Store in server-side Map keyed by session_id (TTL: 10 min)
    Return 200 { ok: true }

  SSE endpoint polls the Map every 500ms (timeout: 5 min → emit error if exceeded).

  Once tickers received:
  log: "Confirmed tickers: {symbols}"
  Call buildEventOccurrences(raw_events, confirmed_tickers)

Stage 3 — Impact Windows
  log: "Fetching price data for {symbols}..."
  Internal call to POST /api/pipeline/impact-windows
  log: "Calculating impact windows for {n} event-ticker pairs..."
  emit ENTRY_EXIT_SUGGESTIONS
  ← Stream pauses. Wait for POST /api/pipeline/confirm-rule.

  POST /api/pipeline/confirm-rule:
    Input: { session_id: string, rule: EntryExitRule }
    Store in Map
    Return 200 { ok: true }

  Once rule received:
  log: "Trade parameters confirmed — simulating..."

Stage 4 — Simulation
  Internal call to POST /api/pipeline/simulate
  log: "Simulated {trade_count} trades across {event_count} events"
  log: "Generating report..."
  emit RESULT { type: "result", backtest_id: "placeholder-uuid" }

--- FRONTEND: ProcessingLog.svelte UPDATE ---

Remove the setInterval stub. Replace with a real EventSource.

Props:
  streamUrl: string
  sessionId: string

On "log" event:              append message to log display
On "ticker_candidates" event: emit on:tickerCandidates with payload
On "entry_exit_suggestions":  emit on:entryExitSuggestions with payload
On "result" event:            emit on:complete with backtest_id
On "error" event:             emit on:error with message

--- STATE MACHINE UPDATE: /backtest/new ---

Add two states:
  "confirming_tickers" → TickerConfirmation component
  "confirming_rule"    → RuleSelector component

--- COMPONENT: src/lib/components/backtest/TickerConfirmation.svelte ---

Props: ranked_tickers: RankedTicker[], sessionId: string, on:confirmed

Each ticker as a row with a checkbox (all pre-checked):
  [✓] NVDA  Nvidia Corp              — appeared in 6 of 7 events
  [✓] AMD   Advanced Micro Devices   — appeared in 5 of 7 events
  [✓] INTC  Intel Corp               — appeared in 3 of 7 events
  [ ] QCOM  Qualcomm                 — appeared in 2 of 7 events
IBM Plex Mono for symbols and counts. IBM Plex Sans for company names.

"Confirm tickers →" outlined button:
  POST /api/pipeline/confirm-tickers with sessionId + checked symbols
  On success: emit on:confirmed

--- COMPONENT: src/lib/components/backtest/RuleSelector.svelte ---

Props: suggestions, direction, position_size, sessionId, on:confirmed

Three preset options as radio rows (Design.md §5.2 radio style):
  ● Aggressive    — "Entry: event day open.   Exit: peak return date."
  ○ Moderate      — "Entry: next day open.    Exit: impact end date."
  ○ Conservative  — "Entry: 2 days after.     Exit: 5 days after entry."

Shows the confirmed direction and position size as read-only below.
"Run simulation →" outlined button:
  POST /api/pipeline/confirm-rule with sessionId + EntryExitRule
  On success: emit on:confirmed
```

### Definition of Done
- [ ] `GET /api/pipeline/run` returns a real SSE stream with log lines from each stage
- [ ] After event detection, a `ticker_candidates` event arrives and the UI transitions to `TickerConfirmation`
- [ ] Confirming tickers via `POST /api/pipeline/confirm-tickers` unpauses the stream
- [ ] After impact windows, an `entry_exit_suggestions` event arrives and the UI shows `RuleSelector`
- [ ] Confirming a rule via `POST /api/pipeline/confirm-rule` triggers simulation
- [ ] A `result` event arrives after simulation and the browser navigates to `/backtest/{id}`
- [ ] Zero events found emits an `error` event and the UI transitions back to "input" with an error message
- [ ] Log lines appear in the browser as each stage completes — not all at once at the end
- [ ] A complete end-to-end run for a real query produces real discovered events visible in the browser

---

## Step 10 — Report Persistence & Database Schema

Set up PostgreSQL, persist completed backtest results, and serve real data on the report page.

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
  status            TEXT DEFAULT 'pending',  -- pending | complete | error
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
  amount            INTEGER NOT NULL,   -- positive = credit, negative = deduction
  reason            TEXT NOT NULL,
  backtest_id       UUID REFERENCES backtest_reports(id),
  stripe_payment_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON backtest_reports(slug);
CREATE INDEX ON backtest_reports(user_id);
CREATE INDEX ON backtest_reports(created_at DESC);

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
Update GET /api/pipeline/run:
  Before emitting RESULT: call createReport() with all pipeline output.
  After saving: call generateResearchNarrative(report) using pi-ai:

    import { complete, type Context } from "@mariozechner/pi-ai"
    import { model }                  from "$lib/server/ai"

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
        })
      }]
    }

    const response  = await complete(model, ctx)
    const narrative = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")

  Store via setResearchNarrative(report.id, narrative).
  Emit RESULT with the real slug: { type: "result", slug: "abc123" }
  Frontend navigates to /backtest/abc123.

--- REPORT PAGE WIRING ---
src/routes/backtest/[id]/+page.server.ts:
  Load report by slug from DB. If not found: return 404.
  Pass real report data to the page.

src/routes/backtest/[id]/+page.svelte:
  Replace all hardcoded mock data with data from the loaded report.
  Research narrative shows real AI-generated text.
  All events, trades, sources show real data.

Email gate cookie check (in +page.server.ts):
  If report_access_{slug} cookie is present → isAccessGranted = true → full report
  If absent → teaser mode

--- DATABASE SEED SCRIPT ---
Create scripts/seed.ts — runnable with `bun run db:seed`.

This script populates the database with development fixture data so you can work
on the UI without running the full pipeline every time.

The script must be idempotent — safe to re-run without creating duplicates
(use INSERT ... ON CONFLICT DO NOTHING or check before inserting).

Seed data:

1. TEST USER
   email:         "dev@newsraderai.test"
   password_hash: bcrypt of "password123" (use the same argon2id hashing as auth)
   name:          "Dev User"
   credits:       10
   email_verified: true

2. THREE SAMPLE BACKTEST REPORTS (status = 'complete', user_id = test user)

   Report A — "chip restrictions"
   query:             "Buy Nvidia every time the US announces AI chip restrictions on China"
   confirmed_tickers: ["NVDA", "AMD", "INTC", "QCOM"]
   Populate backtest_result with realistic fixture data:
     7 events, 24 trades, +184% total return, $11,840 final portfolio value
     Win rate: 75%, max drawdown: -8.3%, avg hold: 9 days
     portfolio_series: array of 365 daily values starting at 10000, ending at 11840
     trades: array of 24 SimulatedTrade objects with realistic dates/prices

   Report B — "fed rate hikes"
   query:             "Short bank stocks every time the Fed raises rates unexpectedly"
   confirmed_tickers: ["JPM", "BAC", "WFC"]
   7 events, 14 trades, +42% return, $14,200 final value

   Report C — "earnings miss"
   query:             "Buy Tesla puts after an earnings miss"
   confirmed_tickers: ["TSLA"]
   4 events, 4 trades, -12% return (losing backtest — important to show loss case)

3. EMAIL CAPTURES for Report A:
   email: "viewer@example.com"

4. CREDIT TRANSACTIONS for the test user:
   +3 (signup bonus)
   -1 (Report A deduction)
   -1 (Report B deduction)
   -1 (Report C deduction)

Print a summary on completion:
  "✓ Seeded: 1 user, 3 reports, 1 email capture, 4 credit transactions"
  "  Dev login: dev@newstraderai.test / password123"
  "  Report slugs: {slugA}, {slugB}, {slugC}"
```

### Definition of Done
- [ ] Running the migration against a local dev DB succeeds without errors
- [ ] A complete pipeline run creates a `backtest_reports` row with `status = 'complete'`
- [ ] Navigating to `/backtest/{slug}` loads real report data — not mock data
- [ ] Research narrative shows real AI-generated text, not Lorem Ipsum (SDK call confirmed in server logs)
- [ ] Slug collision handling is present — `createReport` retries on conflict
- [ ] Unknown slug returns a 404 page
- [ ] Email-gate cookie is set on submission; refreshing preserves full report access
- [ ] `bun run db:seed` runs without errors and prints the completion summary
- [ ] After seeding, navigating to `/backtest/{slugA}` shows the chip restrictions report with real fixture data
- [ ] The seed script is idempotent — running it twice does not create duplicate rows
- [ ] Credit transaction history for the dev user shows the correct 4 rows

---

## Step 11 — Per-Event Charts (Lightweight Charts)

Replace per-event chart placeholder divs with real interactive price charts.

### Prompt

```
Integrate TradingView Lightweight Charts for per-event ticker charts.
Install: bun add lightweight-charts

--- COMPONENT: src/lib/components/charts/EventChart.svelte ---

Props:
  ohlcv:             OHLCVBar[]   // ticker bars from ImpactWindow.ohlcv
  spy_ohlcv:         OHLCVBar[]   // SPY benchmark bars for same date range
  entry_date:        string
  entry_price:       number
  exit_date:         string
  exit_price:        number
  impact_window_end: string
  direction:         "long" | "short"

Read all CSS variable values at runtime:
  getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim()
  (etc. for each variable needed)

Chart config (Design.md §6):
  layout.background:       { type: "solid", color: <--bg-surface> }
  layout.textColor:        <--text-muted>
  layout.fontSize:         11
  grid:                    both lines visible: false
  crosshair:               enabled
  rightPriceScale.visible: false  (price via tooltip only)
  timeScale.borderColor:   <--text-muted>

Two line series:
  Ticker line:  color <--chart-line>, lineWidth: 1.5
  SPY line:     color <--chart-bench>, lineWidth: 1, lineStyle: LineStyle.Dashed

Markers on the ticker series:
  Entry: position "belowBar", shape "arrowUp",   color <--chart-entry>
  Exit:  position "aboveBar", shape "arrowDown", color <--chart-exit>

Hold period: shade the period using a background series or equivalent.
  Color: rgba(240, 237, 232, 0.06)  (<--chart-hold>)

Impact window end: vertical dashed line at that date.
  Color: <--accent-amber>, lineStyle: LineStyle.Dashed, lineWidth: 1

Full width of parent, 240px height.
Use ResizeObserver to resize the chart when the container width changes.
Destroy the chart on Svelte onDestroy.

--- WIRING ---
In the report page, replace each "[ Per-event chart ]" placeholder
with <EventChart>, passing real data from report.impact_windows.
```

### Definition of Done
- [ ] Per-event charts render with real OHLCV data from the database
- [ ] Ticker line and SPY dashed benchmark line both visible
- [ ] Entry (▲ green) and exit (▼ red) markers appear at the correct dates
- [ ] Hold period is shaded with the correct subtle background
- [ ] Dashed amber vertical line at `impact_window_end`
- [ ] Y-axis is hidden — price appears only in the crosshair tooltip
- [ ] X-axis shows dates in 11px muted text
- [ ] No grid lines
- [ ] Background color matches `--bg-surface`
- [ ] Charts resize correctly on window resize
- [ ] Chart instances are cleaned up on component destroy

---

## Step 12 — Aggregate Portfolio Chart (Recharts)

Replace the portfolio and teaser chart placeholders with real interactive charts.

### Prompt

```
Integrate Recharts for the aggregate portfolio chart.
Install: bun add recharts

Implementation note: Recharts is a React library. Choose one of:
  A. Svelte action that mounts a React root into a DOM node
  B. Plain SVG with d3-scale (no React dependency)
  C. svelte-recharts if compatible
Document the chosen approach in a comment at the top of the component.
Whichever approach: the chart must render and support a hover tooltip.

--- COMPONENT: src/lib/components/charts/PortfolioChart.svelte ---

Props:
  portfolio_series:   { date: string, value: number }[]
  trade_close_points: { date: string, value: number }[]  // subset — where dots appear

Config (Design.md §6):
  AreaChart type. fillOpacity: 0 — line only, not a filled area.
  Line: color --chart-line (#f0ede8), strokeWidth: 1.5
  Dots: 4px solid circles only at trade_close_points
  X-axis: dates, color --text-muted, fontSize 11
  Y-axis: right-aligned, format values as "$11,840", IBM Plex Mono, 11px, --text-muted
  Tooltip: custom — background --bg-elevated, no border, date + value in monospace
  No CartesianGrid
  Responsive container: full width, 320px height

--- COMPONENT: src/lib/components/charts/TeaserChart.svelte ---

Props: portfolio_series: { date: string, value: number }[]

Simplified PortfolioChart — no dots, no tooltip, no axis labels.
Same line style. 200px height.
Parent div: position relative, overflow hidden.
Gradient overlay: position absolute, width 100%, bottom 0, height 60%:
  background: linear-gradient(to bottom, transparent, var(--bg-base))
  pointer-events: none

--- WIRING ---
Replace "[ Portfolio chart ]" in Section ⑤ with <PortfolioChart>.
Replace "[ Cumulative Chart ]" in the teaser with <TeaserChart>.
Pass real data from report (backtest_result.portfolio_series and trades).

After this step: zero chart placeholder divs remain on the report page.
```

### Definition of Done
- [ ] Portfolio chart renders in Section ⑤ with real portfolio series data
- [ ] Trade close points appear as 4px dots on the line
- [ ] Hover shows custom tooltip: date + portfolio value in monospace, dark background, no border
- [ ] Y-axis values formatted as currency, right-aligned
- [ ] Teaser chart renders the line with gradient overlay on the lower 60%
- [ ] Both charts resize with the browser window
- [ ] Zero placeholder chart divs remain on the report page

---

## Step 13 — Email Gate, Capture & Report Reveal

Implement the real email capture: validate, store, send the report link, reveal the full report.

### Prompt

```
Implement the email capture flow.

--- ENDPOINT: POST /api/reports/[slug]/capture-email ---
File: src/routes/api/reports/[slug]/capture-email/+server.ts

Input: { email: string }

1. Validate email format (regex)
2. Look up report by slug → 404 if not found or is_public = false
3. Check for existing capture for this email + report — skip insert if found
4. INSERT into email_captures: { email, report_id }
5. Upsert into users: INSERT ... ON CONFLICT (email) DO NOTHING
6. Send email via Resend:
     Subject: "Your NewsTrader AI backtest is ready"
     Body: HTML with report URL, query text, headline P&L
     From: reports@{domain from env}
7. Set cookie: report_access_{slug} = "1"
     httpOnly, SameSite=Lax, path=/, maxAge: 30 days
8. Return 200 { success: true }

Resend failure: log server-side, return 200 anyway — don't block the user.

--- FRONTEND UPDATE ---
Email gate:
  On submit: disable button, change text to "Opening report…" — no spinner (Design.md §7)
  Call POST /api/reports/{slug}/capture-email
  On success: teaserMode = false, scroll to top
  On failure: inline label --accent-loss color, no modal

Cookie check in +page.server.ts:
  If report_access_{slug} cookie present → isAccessGranted = true → full report immediately

--- WAITLIST MODAL ---
Create src/lib/components/WaitlistModal.svelte:
  Centered modal, no backdrop animation.
  Title prop (e.g. "Live alerts — coming soon")
  Email input + "Join waitlist →" outlined button
  On submit: POST /api/waitlist { email, interest }
  After submit: button text → "You're on the list"

POST /api/waitlist: INSERT into waitlist { email, interest }, return 200.

Wire all "Coming Soon" / "Join waitlist →" elements in report footer
and market selector to open WaitlistModal with the relevant interest string.
```

### Definition of Done
- [ ] Submitting a valid email reveals the full report without a page reload
- [ ] Button text changes to "Opening report…" while in-flight — no spinner
- [ ] A confirmation email arrives via Resend with the correct URL and P&L
- [ ] Refreshing after email submission immediately shows the full report (cookie present)
- [ ] Re-submitting the same email for the same report creates no duplicate `email_captures` row
- [ ] Invalid email format shows an inline error without a server call
- [ ] `waitlist` table stores submissions correctly
- [ ] WaitlistModal opens from all "Coming Soon" elements and shows "You're on the list" after submit

---

## Step 14 — Authentication (Email/Password + Google OAuth)

Implement auth using better-auth with session management. Protect all dashboard routes.

### Prompt

```
Implement authentication using better-auth.
Install: bun add better-auth

better-auth manages its own schema. Run its CLI to generate the migration:
  bunx @better-auth/cli generate --output src/lib/server/db/migrations/002_auth.sql

This produces the tables better-auth needs: user, session, account, verification.
Our custom columns (credits, etc.) live on the `user` table — better-auth supports
additional fields via the `additionalFields` option.

--- AUTH CONFIG: src/lib/server/auth.ts ---

  import { betterAuth } from "better-auth"
  import { postgresql } from "better-auth/adapters/postgresql"
  import postgres from "postgres"
  import {
    BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    DATABASE_URL
  } from "$env/static/private"
  import { PUBLIC_BASE_URL } from "$env/static/public"

  const sql = postgres(DATABASE_URL)

  export const auth = betterAuth({
    secret:   BETTER_AUTH_SECRET,
    baseURL:  PUBLIC_BASE_URL,
    database: postgresql(sql),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8
    },
    socialProviders: {
      google: {
        clientId:     GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET
      }
    },
    user: {
      additionalFields: {
        credits: {
          type:         "number",
          defaultValue: 3,
          required:     false
        }
      }
    }
  })

  export type Session = typeof auth.$Infer.Session
  export type User    = typeof auth.$Infer.Session.user

--- HOOKS: src/hooks.server.ts ---
Use better-auth's SvelteKit handler. It handles all /api/auth/* routes automatically.

  import { auth } from "$lib/server/auth"
  import { svelteKitHandler } from "better-auth/svelte-kit"
  import type { Handle } from "@sveltejs/kit"
  import { redirect } from "@sveltejs/kit"

  export const handle: Handle = async ({ event, resolve }) => {
    // Let better-auth handle all /api/auth/* routes
    if (event.url.pathname.startsWith("/api/auth")) {
      return svelteKitHandler({ event, resolve, auth })
    }

    // Attach session to locals for all other routes
    const session = await auth.api.getSession({ headers: event.request.headers })
    event.locals.user    = session?.user ?? null
    event.locals.session = session?.session ?? null

    // Guard dashboard routes
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
better-auth requires a client-side client for form submissions and OAuth:

  import { createAuthClient } from "better-auth/svelte"
  export const authClient = createAuthClient()

  // Exports used on the login/register pages:
  // authClient.signIn.email({ email, password, callbackURL: "/dashboard" })
  // authClient.signUp.email({ email, password, name, callbackURL: "/dashboard" })
  // authClient.signOut()
  // authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })

--- PAGES ---

src/routes/auth/login/+page.svelte:
  Uses authClient.signIn.email() on form submit.
  Uses authClient.signIn.social({ provider: "google" }) for the Google button.
  On success: SvelteKit navigates to /dashboard via callbackURL.
  On error: inline error label in --accent-loss, IBM Plex Sans, no modal.
  Elements: email field, password field, "Log in" outlined button,
            "Continue with Google" outlined button, "No account? Create one →" link.
  Styled per Design.md — dark theme, IBM Plex Sans, no decoration.

src/routes/auth/register/+page.svelte:
  Uses authClient.signUp.email() on form submit.
  Elements: name, email, password, "Create account" outlined button,
            "Already have an account? Log in →" link.

--- POST-AUTH CREDIT GRANT ---
better-auth does not have a built-in post-registration hook in the same way Lucia does.
Use better-auth's `databaseHooks` option to set credits on user creation:

  export const auth = betterAuth({
    ...
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // credits column already has defaultValue: 3 — no extra INSERT needed
            // Link any pre-auth reports to this user:
            await sql`
              UPDATE backtest_reports
              SET user_id = ${user.id}
              WHERE email  = ${user.email}
              AND   user_id IS NULL
            `
          }
        }
      }
    }
  })

--- READING SESSION IN SERVER LOAD FUNCTIONS ---
In any +page.server.ts or +layout.server.ts that needs user data:

  export const load = async ({ locals }) => {
    if (!locals.user) throw redirect(302, "/auth/login")
    return { user: locals.user }
  }

Credits are on locals.user.credits — no extra DB query needed on most pages.
```

### Definition of Done
- [ ] `bunx @better-auth/cli generate` produces a valid migration file and it runs without errors
- [ ] New user can register with email/password and is redirected to the dashboard
- [ ] Registered user can log in and out; session is cleared on logout
- [ ] Google OAuth flow completes and creates or links a user account
- [ ] All `/api/auth/*` routes are handled by the better-auth SvelteKit handler — no manual route files needed
- [ ] `event.locals.user` is populated for authenticated requests and `null` otherwise
- [ ] Visiting `/dashboard` without auth redirects to `/auth/login`
- [ ] New users receive 3 credits (via `additionalFields.credits.defaultValue`)
- [ ] The `databaseHooks.user.create.after` hook links pre-auth reports to the new user
- [ ] Auth pages are styled per Design.md — no decorative elements, IBM Plex Sans throughout

---

## Step 15 — Dashboard (Registered Users)

Build the authenticated dashboard: saved backtests list, new backtest input, credit balance in nav.

### Prompt

```
Build the dashboard at src/routes/dashboard/+page.svelte. Auth required (Step 14).

--- LAYOUT: src/routes/dashboard/+layout.svelte ---
Top nav:
  Left:      "NewsTrader AI" wordmark, IBM Plex Sans, --text-primary
  Right:     "⚡ {credits} credits" from event.locals.user.credits, IBM Plex Mono
  Far right: "Account" text link → /dashboard/account (stub)
  Mobile:    wordmark left, credits right, "Account" behind ☰ toggle dropdown
             Dropdown: --bg-elevated background, 1px --bg-border, no animation

--- LOAD: +page.server.ts ---
Query backtest_reports for authenticated user, ordered by created_at DESC.
Per row: id, slug, query (≤80 chars), confirmed_tickers count,
         backtest_result.summary.total_return_pct, date range, created_at.

--- PAGE SECTIONS ---

1. COMING SOON BANNER
   Full width, --bg-surface, border-left: 3px solid --accent-amber
   "Live alerts and trade execution — coming soon. Join waitlist →"
   "Join waitlist →" → open WaitlistModal with interest: "live_alerts"

2. MY BACKTESTS
   Label: "MY BACKTESTS" — 11px uppercase, --text-secondary
   Sort controls (client-side, no reload): "Date ↓  |  Return  |  Ticker" — text links

   Each row (Design.md §5.6 — rows not cards):
     [Query excerpt]  ·  [N tickers]  ·  [P&L%]  ·  [date range]  ·  [↗ View]  [Delete]
     P&L% in gain/loss color. P&L% and date range IBM Plex Mono.
     "Delete" → outlined, --accent-loss on hover
       Click: show inline confirmation BELOW the row (no modal):
         "Delete this report? This cannot be undone.  [Yes, delete]  [Cancel]"
       Confirmed: POST /api/reports/{slug}/delete → soft delete (is_public = false)

   Empty state: "No backtests yet. Run your first one below." centered, --text-secondary

3. RUN NEW BACKTEST
   Label: "RUN NEW BACKTEST"
   Render <BacktestInput /> (shared component from Step 3)
   If user.credits = 0: show inline amber warning instead of navigating:
     "You've used all your credits. Buy more to continue."  [Buy credits →]

--- CREDIT DEDUCTION IN PIPELINE ---
Update GET /api/pipeline/run:
  If authenticated, compute credit cost after simulation:
    1 ticker, ≤5 events  → 1 credit
    1 ticker, 6–20 events → 2 credits
    2–5 tickers           → 3 credits
    6–10 tickers          → 5 credits
  UPDATE users SET credits = credits - {cost}
    WHERE id = $1 AND credits >= {cost}
  If UPDATE affects 0 rows: emit error event, do NOT create report.
  INSERT into credit_transactions: { user_id, amount: -cost, reason, backtest_id }

Credits deducted only on success. Zero events found = 0 credits consumed.
```

### Definition of Done
- [ ] Dashboard inaccessible without auth — redirects to `/auth/login`
- [ ] Top nav shows credit balance in IBM Plex Mono
- [ ] My Backtests shows rows (not cards) with correct data
- [ ] Sort by Date, Return, Ticker works client-side without page reload
- [ ] Delete shows inline confirmation — no modal
- [ ] Soft delete removes the report from the list
- [ ] `BacktestInput` component renders correctly in the dashboard
- [ ] User with 0 credits sees the amber inline warning, not a navigation
- [ ] Successful run deducts the correct credit amount
- [ ] Credits cannot go negative (SQL WHERE guard tested with 1 credit + 3-credit job)

---

## Step 16 — Credit Purchasing (Polar.sh)

Add the credit purchasing flow using Polar.sh as the Merchant of Record. Includes a seed script that creates the products in Polar.sh so product IDs are always in sync with the codebase.

### Prompt

```
Implement credit purchasing via Polar.sh one-time products.
Install: bun add @polar-sh/sdk

Polar.sh acts as the Merchant of Record — it handles tax, VAT, and receipts
automatically. No Stripe integration needed.

--- SEED SCRIPT: scripts/seed-polar.ts ---
Run with: bun run seed:polar

This script creates the 3 credit pack products in your Polar.sh organisation
and writes their product IDs to .env.local so you never have to copy-paste
IDs by hand.

  import { Polar } from "@polar-sh/sdk"

  const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN! })

  const packs = [
    { name: "Starter Pack",  description: "10 backtest credits",  credits: 10,  amountCents: 900  },
    { name: "Pro Pack",      description: "30 backtest credits",  credits: 30,  amountCents: 1900 },
    { name: "Power Pack",    description: "100 backtest credits", credits: 100, amountCents: 4900 }
  ]

  const envLines: string[] = []

  for (const pack of packs) {
    const product = await polar.products.create({
      name:        pack.name,
      description: pack.description,
      prices: [{
        priceAmount:    pack.amountCents,
        priceCurrency:  "usd",
        type:           "one_time"
      }]
    })

    const key = `POLAR_PRODUCT_${pack.name.split(" ")[0].toUpperCase()}`
    envLines.push(`${key}=${product.id}`)
    console.log(`✓ Created ${pack.name}: ${product.id}`)
  }

  // Append to .env.local (create if missing)
  const existing = await Bun.file(".env.local").text().catch(() => "")
  const updated  = existing.trimEnd() + "\n" + envLines.join("\n") + "\n"
  await Bun.write(".env.local", updated)

  console.log("\n✓ Product IDs written to .env.local")
  console.log("  Copy POLAR_PRODUCT_* values to your production environment.")

Run this once per environment (local dev and production). The resulting
POLAR_PRODUCT_STARTER, POLAR_PRODUCT_PRO, POLAR_PRODUCT_POWER env vars
are then used by the checkout endpoint.

--- PAGE: src/routes/dashboard/credits/+page.svelte ---
Load: user.credits, last 20 credit_transactions rows for this user.

Sections:

1. BALANCE
   "⚡ {N} credits remaining" — IBM Plex Mono, --text-2xl

2. CREDIT PACKS (rows, not cards — Design.md row style):
   Starter  ·  10 credits  ·  $9.00   ·  $0.90/credit   [Buy →]
   Pro      ·  30 credits  ·  $19.00  ·  $0.63/credit   [Buy →]
   Power    ·  100 credits ·  $49.00  ·  $0.49/credit   [Buy →]
   All values IBM Plex Mono. [Buy →] outlined button.

3. USAGE HISTORY — label "USAGE HISTORY"
   Rows: [Date]  ·  [Reason]  ·  [Amount]
   Amount: +10 in --accent-gain, −1 in --accent-loss. IBM Plex Mono.

Success banner (when ?success=1 in URL):
  "✓ Credits added to your account." — --accent-gain, inline, no animation

--- POLAR CLIENT: src/lib/server/polar.ts ---

  import { Polar } from "@polar-sh/sdk"
  import { POLAR_ACCESS_TOKEN } from "$env/static/private"

  export const polar = new Polar({ accessToken: POLAR_ACCESS_TOKEN })

--- ENDPOINT: POST /api/credits/checkout ---
File: src/routes/api/credits/checkout/+server.ts

  Input: { pack: "starter" | "pro" | "power" }
  Auth required (check event.locals.user, return 401 if null).

  const productId = {
    starter: POLAR_PRODUCT_STARTER,
    pro:     POLAR_PRODUCT_PRO,
    power:   POLAR_PRODUCT_POWER
  }[pack]

  const creditsByPack = { starter: 10, pro: 30, power: 100 }

  const checkout = await polar.checkouts.create({
    productId,
    successUrl:  `${PUBLIC_BASE_URL}/dashboard/credits?success=1`,
    metadata: {
      user_id: event.locals.user.id,
      pack,
      credits: String(creditsByPack[pack])
    }
  })

  Return { url: checkout.url }
  Frontend: window.location.href = url (redirect to Polar-hosted checkout page)

--- ENDPOINT: POST /api/webhooks/polar ---
File: src/routes/api/webhooks/polar/+server.ts

No session auth. Verify Polar webhook signature using POLAR_WEBHOOK_SECRET.

Polar sends a signature in the `webhook-signature` header.
Use the Polar SDK's built-in webhook verification:

  import { validateEvent } from "@polar-sh/sdk/webhooks"

  const rawBody = await request.text()

  let event: ReturnType<typeof validateEvent>
  try {
    event = validateEvent(rawBody, request.headers, POLAR_WEBHOOK_SECRET)
  } catch {
    return new Response("Invalid signature", { status: 400 })
  }

Handle the `order.created` event type:

  if (event.type === "order.created") {
    const { metadata } = event.data
    const userId  = metadata?.user_id as string
    const credits = parseInt(metadata?.credits as string, 10)
    const pack    = metadata?.pack as string

    await db`UPDATE users SET credits = credits + ${credits} WHERE id = ${userId}`
    await db`
      INSERT INTO credit_transactions (user_id, amount, reason, stripe_payment_id)
      VALUES (${userId}, ${credits}, ${"purchase_" + pack}, ${event.data.id})
    `
  }

  Return 200 immediately. Polar retries on non-2xx.

Note: Polar uses `stripe_payment_id` column for the Polar order ID — rename
this column in a follow-up migration (004_rename_payment_id.sql) if desired,
but keep it as-is for V1 to avoid a blocking migration.
```

### Definition of Done
- [ ] `bun run seed:polar` runs without errors and prints the 3 product IDs
- [ ] After running the seed, `.env.local` contains `POLAR_PRODUCT_STARTER`, `POLAR_PRODUCT_PRO`, and `POLAR_PRODUCT_POWER` with real Polar product UUIDs
- [ ] The seed script is idempotent — does not duplicate products if re-run (add a check: list existing products, skip creation if name matches)
- [ ] `/dashboard/credits` renders balance, 3 pack rows, and usage history
- [ ] Clicking "Buy →" redirects to the Polar-hosted checkout page
- [ ] Completing the Polar checkout redirects to `/dashboard/credits?success=1` with the success banner
- [ ] The Polar webhook updates `users.credits` and inserts a `credit_transactions` row
- [ ] Webhook signature verification rejects requests with an invalid or missing signature (returns 400)
- [ ] Usage history shows additions (+, green) and deductions (−, red) in IBM Plex Mono
- [ ] Credit balance in the top nav reflects the purchase immediately after returning from Polar

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

In the page:
  "owner" or "email_access" → full report, no gate
  "public_link"             → teaser

OWNER CONTROLS (owner only, in report header):
  "Copy share link  ↗" (real URL)
  Visibility toggle: "Public  ·  Private" — text link
    POST /api/reports/{slug}/visibility with { is_public: boolean }
    Toggling to private shows inline amber warning:
    "This report will no longer be accessible via shared link."
  "Delete" → inline confirmation → POST /api/reports/{slug}/delete

For "public_link" context, above the disclaimer banner:
  "Run your own backtest — free →" → homepage
  IBM Plex Sans, 13px, --text-secondary, right-aligned

--- OG META TAGS ---
Build in +page.server.ts:
{
  title:       `"${query.slice(0, 60)}..." — NewsTrader AI`,
  description: `${pct > 0 ? "+" : ""}${pct}% across ${n} events | ${tickerCount} tickers | ${dateRange}`
}

In +page.svelte <svelte:head>:
  <title>{meta.title}</title>
  <meta property="og:title"        content={meta.title} />
  <meta property="og:description"  content={meta.description} />
  <meta property="og:url"          content="{PUBLIC_BASE_URL}/backtest/{slug}" />
  <meta property="og:type"         content="article" />
  <meta name="twitter:card"         content="summary" />
  <meta name="twitter:title"        content={meta.title} />
  <meta name="twitter:description"  content={meta.description} />

OG description uses query + P&L — never the disclaimer text (PRD §5.3).

--- ENDPOINTS ---
POST /api/reports/[slug]/visibility — auth + ownership check, UPDATE is_public
POST /api/reports/[slug]/delete    — auth + ownership check, soft delete

--- VIEW COUNT ---
In +page.server.ts when viewContext = "public_link":
  incrementViewCount(report.id)  (fire and forget)
Teaser social proof: "{view_count} traders have run this backtest"
```

### Definition of Done
- [ ] Visiting without auth or cookie shows the teaser with the email gate
- [ ] Visiting with a valid cookie shows the full report immediately
- [ ] Owner sees visibility toggle and delete controls; other visitors do not
- [ ] Toggling to private and visiting without auth returns a 404
- [ ] OG `<meta>` tags present in `<head>` with P&L in description — verified with `curl -s {url} | grep og:`
- [ ] Twitter Card tags present
- [ ] Public-link view shows "Run your own backtest — free →" header CTA
- [ ] `view_count` increments on non-owner loads
- [ ] Teaser social proof reflects the real `view_count`

---

## Step 18 — Error & Empty States

Implement all error and empty states across the app. No illustrations, no emoji — direct, calm text only (Design.md §10).

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
   UI transitions to "no_results":
     [centered, --text-secondary, IBM Plex Sans]
     "No historical events found matching your hypothesis."
     "Try broadening the date range, adjusting the event description, or checking the ticker."
     "Refine query →"  → resets to "input" state, textarea pre-filled with original query

2. LOW CONFIDENCE (1–2 events)
   SSE emits: { type: "low_confidence", event_count: N }
   UI transitions to "low_confidence":
     [border-left: 3px solid --accent-amber, --bg-surface, padding: 12px 16px]
     "Only {N} event found — results may not be statistically meaningful."
     "Run anyway →"   [Refine query →]
   "Run anyway →" posts confirmed_tickers to unblock the stream
   "Refine query →" resets to input state

3. API ERROR (Exa or Alpaca failure)
   SSE emits: { type: "error", stage: "detection"|"prices", message: string }
     [--accent-loss label]
     "Something went wrong retrieving {news data | price data}. Your credits were not deducted."
     "Try again →"  — re-runs pipeline with same parameters

4. INSUFFICIENT CREDITS (verify Step 15 matches this):
     [--accent-amber inline warning]
     "You've used all your credits. Buy more to continue running backtests."
     "Buy credits →"  → /dashboard/credits

--- REPORT PAGE STATES ---

5. REPORT NOT FOUND
   src/routes/backtest/[id]/+error.svelte:
     [centered, --text-secondary]
     "This report doesn't exist or has been made private."
     "← Run your own backtest"  → homepage

6. REPORT STILL PROCESSING
   If report.status = 'pending': show ProcessingLog connecting to live stream.
   (Requires pipeline params stored in report row at creation time.)

--- GLOBAL ERROR BOUNDARY ---
src/routes/+error.svelte:
  Status code — IBM Plex Mono, --text-secondary
  "Something went wrong." — IBM Plex Sans, --text-primary
  "← Back to homepage"
  No stack traces exposed.

--- DASHBOARD EMPTY STATE ---
Verify Step 15 empty state: "No backtests yet. Run your first one below."
Centered, --text-secondary, IBM Plex Sans.
```

### Definition of Done
- [ ] Query producing 0 events shows the "no events found" message; "Refine query →" pre-fills the textarea
- [ ] Query producing 1–2 events shows the amber low-confidence warning with both action links
- [ ] "Run anyway →" resumes the pipeline from the paused state
- [ ] Forcing an Exa API failure shows the error message and confirms no credits were deducted
- [ ] Insufficient credits shows the amber inline warning — not a modal, not a new page
- [ ] Non-existent slug renders `+error.svelte` with the correct message — not a browser default 404
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
Click expands. Still sticky, still non-dismissible.

--- TOP NAV (Dashboard) ---
Mobile: wordmark left, credits right.
"Account" hidden → ☰ toggle reveals dropdown.
Dropdown: --bg-elevated, 1px --bg-border, no animation. Items: Account, Log out.

--- HOMEPAGE ---
Market selector: horizontal scroll on overflow, do not wrap.
Run Backtest button: verify full width maintained.

--- REPORT PAGE ---
Per-event charts: minimum 280px height on mobile.
Trade log table: wrap in overflow-x: auto.
  All columns remain — do NOT hide any. Table min-width = natural column widths.
Teaser chart: remains full width.

--- DASHBOARD ---
Backtest rows on mobile stack to 2 lines:
  Line 1: query excerpt
  Line 2: {N tickers}  ·  {P&L%}  ·  {date range}  ·  [View] [Delete]
Sort controls: allow wrapping.

--- CLARIFYING QUESTIONS & TICKER CONFIRMATION ---
Radio options and ticker rows: verify they stack vertically (likely already do).
Numeric inputs: full width on mobile.

--- BACKTEST INPUT ---
Textarea: full width at all breakpoints — verify.
Run Backtest button: full width — verify.

Check every page at 375px in DevTools responsive mode.
Look for any horizontal overflow (set body { overflow: visible } and check for scrollbar).
```

### Definition of Done
- [ ] All pages render without horizontal scrollbars at 375px viewport width
- [ ] Disclaimer banner collapses to one line on mobile with a working expand toggle
- [ ] Dashboard top nav hides "Account" behind a ☰ toggle on mobile
- [ ] Trade log table scrolls horizontally on mobile — all columns intact
- [ ] Per-event charts are at least 280px tall on mobile
- [ ] Dashboard backtest rows stack to 2 lines on mobile
- [ ] Textarea and Run Backtest button are full-width on mobile
- [ ] No Tailwind color utility classes introduced — all colors remain CSS variables

---

## Appendix — Dependency Map

```
Step 1  (Foundation — Bun · SvelteKit · TypeScript · CSS variables)
  └── Step 2  (Homepage UI)
        └── Step 3  (Clarifying Questions + Processing State UI)
Step 4  (Report UI — static mock data)
  └── Step 11 (Per-event Charts — Lightweight Charts)
        └── Step 12 (Portfolio Charts — Recharts)

Steps 5–8 can be built in parallel with Steps 2–4:
  Step 5  (pi-ai + OpenRouter — Query Understanding via TypeBox tool call)  ← only AI call in pipeline
  Step 6  (Event Detection — exa-js only)               ← no AI model, no Alpaca
  Step 7  (Impact Windows — Alpaca OHLCV only)           ← no AI model, no Exa
  Step 8  (Trade Simulation — pure TypeScript)           ← no external calls, bun test
    └── Step 9  (Pipeline Orchestration — wires Steps 5–8, adds ticker/rule UI)
          └── Step 10 (Persistence + Research Narrative + bun run db:seed)
                └── Step 13 (Email Gate + Waitlist Modal — Resend)
                      └── Step 14 (better-auth — email/password + Google OAuth)
                            └── Step 15 (Dashboard + credit deduction)
                                  └── Step 16 (Polar.sh credits + bun run seed:polar)

Step 10 + Step 14
  └── Step 17 (Public Share URLs + OG Tags)

Step 18 (Error States)  — after Step 9, can overlap with Steps 10–17
Step 19 (Mobile Pass)   — final pass, after all UI complete
```

---

## Appendix -- Library & Runtime Reference

```
Runtime / package manager
  bun                        bun add / bun run / bun test  (never npm, never node)

AI -- @mariozechner/pi-ai
  import { getModel, complete, stream, streamSimple,
           validateToolCall, type Tool, type Context }  from "@mariozechner/pi-ai"
  import { Type, type Static, type TSchema }            from "@mariozechner/pi-ai"

  // Model initialisation (src/lib/server/ai.ts)
  const model = getModel("openrouter", "anthropic/claude-sonnet-4-5")
  // OPENROUTER_API_KEY picked up automatically from env

  // Structured output via tool calling (Step 5 -- query understanding)
  const tool: Tool = { name: "...", description: "...", parameters: TypeBoxSchema }
  const response   = await complete(model, { messages, tools: [tool] })
  const toolCall   = response.content.find(b => b.type === "toolCall")
  const validated  = validateToolCall([tool], toolCall)  // throws on invalid schema

  // Text generation (Step 10 -- research narrative)
  const response = await complete(model, { systemPrompt, messages })
  const text     = response.content.filter(b => b.type === "text").map(b => b.text).join("")

  // Streaming (Step 9 -- SSE pipeline log)
  const s = stream(model, context)
  for await (const event of s) {
    if (event.type === "text_delta") process.stdout.write(event.delta)
    if (event.type === "done")       break
  }

  // TypeBox schemas (src/lib/types/pipeline.ts)
  const MySchema = Type.Object({ field: Type.String() })
  type MyType    = Static<typeof MySchema>

Auth
  better-auth                Core auth library
  better-auth/svelte-kit     svelteKitHandler() for hooks.server.ts
  better-auth/svelte         createAuthClient() for client-side pages
  bunx @better-auth/cli      generate -- produces migration SQL

Payments
  @polar-sh/sdk              Polar.sh checkout + webhook verification
                             import { Polar }         from "@polar-sh/sdk"
                             import { validateEvent } from "@polar-sh/sdk/webhooks"

News / event discovery
  exa-js                     Exa Search API -- deep + auto search

Price data
  Alpaca Market Data API     Raw fetch (no SDK) -- APCA-API-KEY-ID header

Charts
  lightweight-charts         Per-event price charts (TradingView)
  recharts                   Aggregate portfolio chart

Database
  postgres                   postgres.js singleton -- src/lib/server/db/client.ts

Email
  resend                     Transactional email for report delivery + waitlist

Testing
  bun test                   Native Bun test runner
                             import { describe, test, expect } from "bun:test"

Scripts (bun run ...)
  db:migrate                 bun run src/lib/server/db/migrate.ts
  db:seed                    bun run scripts/seed.ts
  seed:polar                 bun run scripts/seed-polar.ts
```

---

## Appendix — Exa API Quick Reference

```typescript
// Supplementary search — regular auto search for older date ranges
{
  query:              string,        // full descriptive sentence
  type:               "auto",
  category:           "news",
  numResults:         number,
  startPublishedDate: string,        // ISO date
  endPublishedDate:   string,
  contents: {
    highlights: { maxCharacters: number },
    summary:    { query: string }    // for structured ticker extraction
  }
}

// Primary deep search — full date range, structured output
{
  query:              string,
  type:               "deep",
  category:           "news",
  numResults:         number,
  startPublishedDate: string,
  endPublishedDate:   string,
  additionalQueries:  string[],      // 3–4 variant phrasings — deep/deep-reasoning only
  contents: {
    highlights: { maxCharacters: number }
  },
  outputSchema: {                    // triggers structured JSON in response.output.content
    type: "object",
    properties: { events: { type: "array", items: { ... } } }
  }
}
```

**Response fields to use:**
- `results[].publishedDate` — article publish date (use as event_date)
- `results[].highlights` — relevant excerpts (string array)
- `results[].summary` — LLM summary if requested
- `output.content` — parsed structured object when `outputSchema` provided
- `output.grounding` — field-level citations with `url` + `title` per field

**Never use:**
`useAutoprompt`, `livecrawl`, `numSentences`, `highlightsPerUrl`,
top-level `text`/`highlights`/`summary` (must be inside `contents`),
`excludeDomains` with `category: "news"`
