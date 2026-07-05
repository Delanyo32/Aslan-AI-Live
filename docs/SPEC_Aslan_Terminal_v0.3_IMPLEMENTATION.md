# Aslan Terminal — Implementation Spec v0.3

**Status:** Ready for agent implementation
**Supersedes for build purposes:** `docs/SPEC_Aslan_Terminal_v0.2.md` (v0.2 remains the product-rationale source; §4.2 of v0.2 is the canonical rubric content transcribed by WP0.2)
**Audience:** An orchestrator agent (Fable) dispatching implementation sub-agents (Opus). Each work package (WP) in §3 is written to be handed to one sub-agent as a self-contained brief.

---

## 0. How to use this document

- **Orchestrator (Fable):** follow the playbook in §4. Land Phase 0 (contracts) first, then dispatch parallel WPs per the dependency graph. Verify each phase gate before proceeding.
- **Sub-agents (Opus):** you will be given one WP from §3. Before writing code, read: (a) your WP section, (b) §1 house rules, (c) §2 contracts, (d) the existing files your WP names as templates. Do not modify contract files (§2.1 marks them) — if a contract is wrong, stop and report to the orchestrator instead of changing it.
- **Product invariants** (§5) are non-negotiable. They come from interview-resolved decisions; do not relitigate them in code review.

What the product is, in two sentences: enter any global ticker → multi-step AI research run → a report grading the company A–F on nine evidence-cited "health frameworks" with adversarial false-signal screening, composited into a Value Reality Score, reconciled against the US market price where available. Plus a watchlist ("the Board") where monitored companies re-grade as new evidence arrives and users get delta alerts.

---

## 1. Grounding: the existing codebase

Stack: SvelteKit 2 + Svelte 5 (runes) on Cloudflare **Workers**, one Durable Object, D1 via Drizzle, better-auth, Polar credits, Resend, `exa-js`, Alpaca (raw fetch), LLM via `@mariozechner/pi-ai` over OpenRouter. Tests: `bun test`. Type check: `bun run check`.

### 1.1 Files to reuse (read these before building)

| Existing file | What it gives you |
|---|---|
| `src/lib/server/durable-objects/PipelineRunner.ts` | **The DO template.** Alarm-driven stage machine, storage-backed checkpoints, append-only event log (`evt:`-prefixed keys, buffer 500), SSE + WebSocket fan-out with `Last-Event-ID` replay, 30-min stall watchdog, atomic credit debit with refund-on-failure (`persistReportAndDebit`), D1 cross-DO index (`pipeline_runs`). `TerminalReportRunner` and `CompanyMonitor` copy this shape. |
| `src/routes/api/pipeline/run/+server.ts` | POST starts the DO (202), GET proxies the DO's `/stream` SSE with `Last-Event-ID` passthrough. Copy for terminal run routes. |
| `src/routes/api/pipeline/research/+server.ts` (lines ~41–77) | The reference `emit`/`log`/`safeClose` SSE helpers (guarded `controller.close()` in `finally`). |
| `src/lib/server/exa-events.ts` | The Exa agentic loop: LLM drives `exa_search` + `submit_findings` tool calls via pi-ai `Type.Object` schemas. Also `loadUSEquityUniverse` (Alpaca asset list, 24h cache) and the exa-js client init pattern. |
| `src/lib/server/ai.ts` | `getAiModel()` — lazy pi-ai model over OpenRouter. All terminal LLM calls use it as-is (§2.7). |
| `src/lib/server/alpaca-market-data.ts` | `fetchOHLCV` (daily bars, SPY benchmark fetching), `loadUSEquityUniverse`. Add a snapshot (latest price) helper here. |
| `src/lib/server/impact-window.ts` | `computeCAR` / `calculateImpactWindow` — event-attribution machinery reused verbatim for the report's event-attribution timeline. |
| `src/lib/server/db/client.ts`, `src/lib/server/db/schema/*` | `createDb(d1)` + Drizzle schema house style (snake_case columns, `text(mode:"json")`, `integer(mode:"timestamp")` Unix seconds, `integer(mode:"boolean")`). |
| `src/lib/server/db/reports.ts` | Slug generation (random 6-char), `getReportBySlug`, view counts — copy the pattern for `terminal_reports`. |
| `src/routes/backtest/[slug]/+page.server.ts` / `+page.svelte` | Public share page: `is_public`/owner enforcement, anon view-count, OG meta. `BacktestReport.svelte` lines ~417–443 hold the AI-disclaimer banner markup to replicate. |
| `src/routes/api/reports/[slug]/visibility/+server.ts`, `…/delete/+server.ts` | Owner-only visibility toggle + soft delete. Mirror for terminal reports. |
| `src/lib/components/backtest/ProcessingLog.svelte` | SSE consumer with 45s liveness watchdog + cancel. Template for the terminal progress UI. |
| `src/routes/dashboard/+page.svelte` | The `ViewState` machine pattern for multi-step run UX. |
| `src/lib/server/auth.ts` | better-auth setup; `sendVerificationEmail` shows the Resend dynamic-import + swallow-failures pattern for alert emails. |
| `src/routes/api/webhooks/polar/+server.ts` | Webhook verification + credit grant pattern. |
| `scripts/patch-worker-durable-objects.mjs` | Appends `export { PipelineRunner }` to the built worker. **Must be extended for every new DO class.** |

### 1.2 House rules (binding on every sub-agent)

1. **Env access:** read `$env/dynamic/private` **at call time, never at module load** (adapter-cloudflare evaluates `hooks.server.ts` before `server.init({env})` — documented in `ai.ts` and `auth.ts`). pi-ai needs `process.env.OPENROUTER_API_KEY` set explicitly (see `ai.ts`).
2. **No new npm dependencies.** `exa-js`, `pi-ai`, `drizzle-orm`, `resend`, `@polar-sh/sdk`, `bits-ui`, `layerchart` cover everything. If you believe you need one, stop and ask the orchestrator.
3. **Style:** tabs; DB columns snake_case; TS property names mirror SQL column names in schema files; comments explain constraints, not narration.
4. **Adding a DO class** requires all three: (a) `wrangler.toml` — new `[[durable_objects.bindings]]` + a new `[[migrations]]` block (`tag = "v2"`, `new_classes = [...]`); (b) re-export from `src/hooks.server.ts`; (c) add the class name to `scripts/patch-worker-durable-objects.mjs`.
5. **DO invocation** is `stub.fetch()` with pathname routing (`/start`, `/stream`, …) — match `PipelineRunner`, not RPC.
6. **Migrations:** define tables in `src/lib/server/db/schema/terminal.ts`, run `bun run db:generate`, never hand-edit an applied migration. Apply locally with `bun run db:migrate:local`.
7. **Definition of done for every WP:** `bun run check` passes, `bun test` passes, your WP's acceptance items demonstrably hold (paste command output in your final report). Non-trivial logic ships with one colocated `*.test.ts` (bun test, like `trade-simulation.test.ts`) — the smallest test that fails if the logic breaks.
8. **Don't touch** the backtest pipeline files except at integration points a WP names. Don't fix the known dead code (dead tables `pipeline_sessions`/`email_captures`, stale `ticker_candidates` listeners, Pages-vs-Workers README wording) unless it blocks you — flag it instead.

---

## 2. Contracts (frozen after Phase 0)

### 2.1 File layout

Contract files — frozen after WP0.1; changes require orchestrator sign-off:

```
src/lib/types/terminal.ts                    — all shared types (§2.3)
src/lib/server/db/schema/terminal.ts         — new tables (§2.2)
src/lib/server/terminal/rubrics/schema.ts    — rubric JSON validation + RubricFramework type (§2.4)
src/lib/server/terminal/index.ts             — module interfaces (typed signatures; stubs until built)
```

Implementation files (owned by their WPs):

```
src/lib/server/terminal/
  rubrics/F1.json … F9.json      — framework data (WP0.2)
  rubrics/index.ts               — loader, validation, RUBRIC_VERSION export
  rulebook.md                    — evidence-language editorial standard, versioned data (WP1.5)
  exa.ts                         — Exa REST helpers: agent runs, websets, monitors, typed search/contents (WP1.1)
  research.ts                    — per-dimension evidence gathering (WP1.2)
  scoring.ts                     — pure grading/composite/veto/confidence logic (WP1.3)
  screens.ts                     — false-signal screen execution (WP1.3)
  extraction.ts                  — FundamentalsProvider interface + ExaFilingsProvider (WP1.4)
  synthesis.ts                   — narrative, bear/bull, verdict prose, language enforcement (WP1.5)
  reconcile.ts                   — reverse-DCF, multiples, verdict bucket (WP3.1)
  triage.ts                      — evidence triage + evidence-delta gating (WP5.3)
  ledger.ts                      — commitment extraction + follow-up checks (WP6.1)
  config.ts                      — credit costs, cadences, thresholds (all tunables in one place)
src/lib/server/durable-objects/TerminalReportRunner.ts   (WP2.1)
src/lib/server/durable-objects/CompanyMonitor.ts         (WP5.1)
src/routes/api/terminal/…        — API routes (WP2.2, WP5.2)
src/routes/api/webhooks/exa/[token]/+server.ts           (WP5.2)
src/routes/terminal/…            — input + progress + report pages (WP4.1, WP4.2)
src/routes/board/…               — watchlist UI (WP5.4)
src/lib/components/terminal/…    — report + board components
scripts/eval/…                   — eval harness (WP7.1)
scripts/exa-smoke.ts             — live API-behavior checks (WP7.2)
```

### 2.2 D1 schema (`src/lib/server/db/schema/terminal.ts`)

Drizzle, house style. Re-export from `schema/index.ts`.

```ts
export const companies = sqliteTable("companies", {
	id:            text("id").primaryKey(),                    // crypto.randomUUID()
	ticker:        text("ticker").notNull(),                   // as user-facing symbol, e.g. "TSM", "005930.KS"
	name:          text("name").notNull(),
	exa_entity:    text("exa_entity", { mode: "json" }).$type<object>(),   // raw Exa company-entity result
	is_us:         integer("is_us", { mode: "boolean" }).notNull().default(false), // in Alpaca US-equity universe
	alpaca_symbol: text("alpaca_symbol"),                      // set when is_us
	sector:        text("sector"),
	competitor_webset_id: text("competitor_webset_id"),
	monitor_state: text("monitor_state", { mode: "json" }).$type<object>(), // { news_monitor_id, policy_monitor_id, competitor_monitor_id }
	created_at:    integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
	updated_at:    integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})
// unique index on ticker

export const terminalReports = sqliteTable("terminal_reports", {
	id:             text("id").primaryKey(),
	slug:           text("slug").unique().notNull(),           // random 6-char, reports.ts pattern
	user_id:        text("user_id").references(() => authUser.id, { onDelete: "set null" }),
	company_id:     text("company_id").notNull().references(() => companies.id),
	status:         text("status").notNull().default("pending"), // pending | running | complete | failed
	rubric_version: text("rubric_version").notNull(),
	composite:      text("composite", { mode: "json" }).$type<object>(),      // CompositeScore
	dimensions:     text("dimensions", { mode: "json" }).$type<object[]>(),   // DimensionGrade[]
	extraction:     text("extraction", { mode: "json" }).$type<object>(),     // ExtractionResult
	verdict:        text("verdict", { mode: "json" }).$type<object>(),        // ReconciliationVerdict | null (non-US)
	bear_bull:      text("bear_bull", { mode: "json" }).$type<object>(),      // { bear: string, bull: string }
	narrative:      text("narrative"),
	citations:      text("citations", { mode: "json" }).$type<object[]>(),    // full appendix
	evidence_snapshot_hash: text("evidence_snapshot_hash"),
	credit_cost:    integer("credit_cost").notNull().default(0),
	is_public:      integer("is_public", { mode: "boolean" }).notNull().default(true),
	view_count:     integer("view_count").notNull().default(0),
	created_at:     integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
	updated_at:     integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

// Append-only. Trend arrows and "most deteriorating" sorting need the time series.
export const dimensionScores = sqliteTable("dimension_scores", {
	id:             text("id").primaryKey(),
	company_id:     text("company_id").notNull().references(() => companies.id),
	dimension:      text("dimension").notNull(),               // "F1"…"F9" | "composite"
	grade:          text("grade").notNull(),                   // "A"…"F" with optional +/- ("B+", "C-")
	score:          integer("score").notNull(),                // 0–100
	confidence:     text("confidence").notNull(),              // high | medium | low
	flags:          text("flags", { mode: "json" }).$type<object[]>().notNull().default([]), // ScreenHit[]
	citations:      text("citations", { mode: "json" }).$type<object[]>().notNull().default([]), // top Citation[]
	evidence_hash:  text("evidence_hash").notNull(),
	rubric_version: text("rubric_version").notNull(),
	report_id:      text("report_id").references(() => terminalReports.id), // null when produced by a watchlist rescore
	created_at:     integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})
// index on (company_id, dimension, created_at)

export const evidenceItems = sqliteTable("evidence_items", {
	id:            text("id").primaryKey(),
	company_id:    text("company_id").notNull().references(() => companies.id),
	url:           text("url").notNull(),
	title:         text("title"),
	source_domain: text("source_domain").notNull(),
	published_at:  integer("published_at", { mode: "timestamp" }),
	snippet:       text("snippet"),
	content_hash:  text("content_hash").notNull(),             // §2.5.5
	origin:        text("origin").notNull(),                   // report_run | monitor | ledger_check
	dimensions:    text("dimensions", { mode: "json" }).$type<string[]>().notNull().default([]),
	triage:        text("triage", { mode: "json" }).$type<object>(), // TriageResult | null (report-run evidence skips triage)
	created_at:    integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})
// unique index on (company_id, content_hash) — dedup; index on (company_id, created_at)

export const commitments = sqliteTable("commitments", {
	id:            text("id").primaryKey(),
	company_id:    text("company_id").notNull().references(() => companies.id),
	what:          text("what").notNull(),
	promised_date: integer("promised_date", { mode: "timestamp" }),
	source_url:    text("source_url").notNull(),
	status:        text("status").notNull().default("pending"), // pending | delivered_on_time | delivered_late | missed | redefined | unaccounted
	next_check_at: integer("next_check_at", { mode: "timestamp" }),
	checked_at:    integer("checked_at", { mode: "timestamp" }),
	check_evidence: text("check_evidence", { mode: "json" }).$type<object[]>().notNull().default([]),
	created_at:    integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})
// index on (company_id), index on (next_check_at)

export const watchlistEntries = sqliteTable("watchlist_entries", {
	id:              text("id").primaryKey(),
	user_id:         text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
	company_id:      text("company_id").notNull().references(() => companies.id),
	active:          integer("active", { mode: "boolean" }).notNull().default(true),
	next_billing_at: integer("next_billing_at", { mode: "timestamp" }).notNull(),
	created_at:      integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})
// unique index on (user_id, company_id)

export const terminalAlerts = sqliteTable("terminal_alerts", {
	id:          text("id").primaryKey(),
	user_id:     text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
	company_id:  text("company_id").notNull().references(() => companies.id),
	dimension:   text("dimension").notNull(),
	old_grade:   text("old_grade"),
	new_grade:   text("new_grade").notNull(),
	reason:      text("reason").notNull(),                      // one-line, evidence-language compliant
	citations:   text("citations", { mode: "json" }).$type<object[]>().notNull().default([]),
	read:        integer("read", { mode: "boolean" }).notNull().default(false),
	emailed:     integer("emailed", { mode: "boolean" }).notNull().default(false),
	created_at:  integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})
// index on (user_id, read, created_at)

// Cross-DO index for terminal report runs, mirroring pipeline_runs.
export const terminalRuns = sqliteTable("terminal_runs", {
	session_id: text("session_id").primaryKey(),
	user_id:    text("user_id").notNull(),
	company_id: text("company_id").notNull(),
	status:     text("status").notNull(),   // pending | running | complete | failed | cancelled
	stage:      text("stage").notNull(),    // TerminalStage union, §2.3
	error:      text("error"),
	result_slug: text("result_slug"),
	created_at: integer("created_at").notNull(),
	updated_at: integer("updated_at").notNull(),
})
```

### 2.3 Shared types (`src/lib/types/terminal.ts`)

```ts
export type DimensionId = "F1"|"F2"|"F3"|"F4"|"F5"|"F6"|"F7"|"F8"|"F9"
export type Letter = "A"|"B"|"C"|"D"|"F"
export type Grade = string            // Letter plus optional +/-; "F" never carries a modifier
export type Confidence = "high"|"medium"|"low"

export type Citation = {
	url: string
	title: string | null
	source_domain: string
	published_at: string | null       // ISO date
	snippet: string | null
}

export type EvidenceItem = Citation & {
	id: string
	content_hash: string
	origin: "report_run"|"monitor"|"ledger_check"
	dimensions: DimensionId[]
	company_controlled: boolean       // §2.5.4
}

export type SignalFinding = {
	signal_id: string                 // matches rubric signal id
	direction: "supports"|"undermines"|"neutral"
	strength: 1|2|3                   // weak / clear / strong
	summary: string                   // one sentence, evidence-language
	citations: Citation[]             // ≥1 or the finding is discarded
}

export type ScreenHit = {
	pattern_id: string                // matches rubric false-signal id
	status: "confirmed"|"suspected"
	summary: string                   // evidence-language (observation, never accusation)
	detail: string                    // owner-only narrative
	citations: Citation[]
	action: "cap:C"|"cap:D"|"discount"|"composite_cap:C"
}

export type DimensionEvidence = {
	dimension: DimensionId
	findings: SignalFinding[]
	screen_hits: ScreenHit[]
	evidence_items: EvidenceItem[]
	searches_run: number
}

export type DimensionGrade = {
	dimension: DimensionId
	grade: Grade
	score: number                     // 0–100
	confidence: Confidence
	trend: "up"|"down"|"flat"|"new"   // vs previous dimension_scores row
	flags: ScreenHit[]
	top_citations: Citation[]         // ≤3
	summary: string
	evidence_hash: string
	rubric_version: string
}

export type CompositeScore = {
	grade: Grade
	score: number
	confidence: Confidence
	veto_applied: null | "f9_cap"|"red_flag_cap"
	red_banner: boolean
	weights_used: Record<DimensionId, number>
}

export type ExtractedFigure = {
	name: string                      // "revenue" | "gross_margin" | "operating_margin" | "fcf" | "ocf" | "net_income" | "net_debt" | "share_count" | "sbc"
	value: number
	unit: string                      // "USD" | "%" | "shares"
	period: string                    // "FY2025" | "Q1-2026"
	source_url: string
	filing_date: string | null
	passes_agree: boolean             // double-extraction agreement (§5.3)
}

export type ExtractionResult = {
	figures: ExtractedFigure[]
	disagreements: { name: string, period: string, values: number[], sources: string[] }[]
	dropped_unsourced?: number        // figures returned without a resolvable source page (dropped, never published)
	confidence: Confidence            // low if any core figure disagrees or is missing
}

export type ReconciliationVerdict = {
	bucket: "priced_for_more"|"roughly_priced"|"priced_for_less"
	beta: boolean                     // §5.2 accuracy gate
	implied: { revenue_growth_10y: number, fcf_margin_scenario: number, discount_rate: number } | null
	multiples: { name: string, value: number|null, peer_median: number|null }[]
	sentence: string                  // names the specific dimension gaps; states confidence inline when low
	confidence: Confidence
	timeline?: { date: string, move_pct: number, car: number|null, evidence: Citation[] }[]  // event attribution, US only
}

export type TriageResult = {
	relevant: boolean
	dimensions: DimensionId[]
	materiality: "red_flag"|"material"|"minor"|"none"
	commitment: { what: string, promised_date: string|null } | null   // feeds the ledger
	reason: string
}

export type TerminalStage =
	| "pending" | "resolving" | "competitor_set" | "researching"      // researching checkpoints per dimension
	| "extracting" | "grading" | "reconciling" | "synthesizing"
	| "persisting" | "complete" | "failed" | "cancelled"
```

Module interfaces (in `src/lib/server/terminal/index.ts`, stubbed in WP0.1):

```ts
runDimensionResearch(company, framework, opts): Promise<DimensionEvidence>       // research.ts
gradeDimension(evidence, framework, prior: DimensionGrade|null): Promise<DimensionGrade>  // scoring.ts (LLM anchors + deterministic caps)
computeComposite(grades: DimensionGrade[], sector: string|null): CompositeScore  // scoring.ts, pure
extractFundamentals(company): Promise<ExtractionResult>                          // extraction.ts, behind FundamentalsProvider interface
reconcilePrice(company, extraction, composite, grades): Promise<ReconciliationVerdict|null>  // reconcile.ts; null for non-US
synthesize(company, grades, composite, verdict, ledgerStats): Promise<{narrative, bear, bull}> // synthesis.ts
triageEvidence(company, item): Promise<TriageResult>                             // triage.ts
```

### 2.4 Rubric JSON format

Frameworks are **data, not prose in prompts** (versioned; reports record the version that graded them). One file per dimension. Schema validated at load by `rubrics/index.ts`; `RUBRIC_VERSION` is the max of the files' versions.

```jsonc
{
	"version": "1.0.0",
	"id": "F1",
	"name": "Investor Sentiment & Relationship Health",
	"question": "Do the investors who own this company understand it, trust management, and hold for the stated thesis — or is the register churning, hostile, or promotional?",
	"weight": 1.0,                          // F9: 2.0, F3/F5: 1.5, others 1.0
	"signals": [
		{
			"id": "f1_press_tone",
			"description": "Tone and consistency of coverage in financial press",
			"polarity": "both",                 // "supports" | "undermines" | "both"
			"weight": 0.15,                     // signal weights sum to 1.0 per framework
			"recipe": {
				"primitive": "search",            // search | contents | agent_run | monitor_feed
				"query_template": "{company} investors OR shareholders",
				"category": "news",
				"days": 90,
				"contents": "highlights"
			}
		}
	],
	"grade_anchors": {
		"A": "Stable, informed base; guidance historically reliable; no live activist/short campaigns; independent coverage tone matches company narrative.",
		"C": "Mixed: churning narrative, guidance credibility questioned at least once in 4 quarters, or one unresolved activist/short thesis with partial merit.",
		"F": "Open hostility: credible short reports unanswered, serial guidance misses reframed as beats, mass institutional exit, or evidence of coordinated promotion."
	},
	"false_signals": [
		{
			"id": "promotional_cadence_spike",
			"description": "Abnormal press-release volume in the 60 days before a share offering, lockup expiry, or reported insider sales.",
			"recipe": { "primitive": "search", "query_template": "…", "category": "news", "days": 120 },
			"action": "cap:C"                   // cap:C | cap:D | discount | composite_cap:C
		}
	],
	"evidence_policy": {
		"min_sources": 5,
		"min_independent": 2,
		"recency_days": 365,
		"notes": "evidence gaps to disclose, e.g. no social firehose in v1"
	}
}
```

**Source of truth for content:** v0.2 §4.2 defines all nine frameworks' questions, signal tables (with polarity and detection recipes), grade anchors, and false-signal screens. WP0.2 transcribes them into this format — transcription, not invention. F9 additionally carries `"veto": true`. The two composite-capping patterns are F9's auditor-event screen and **F8's** round-trip-deals screen (v0.2 places round-tripping in F8) — both carry `"action": "composite_cap:C"`; §2.5.3's cap propagates to the composite regardless of which dimension the hit lives in.

### 2.5 Deterministic rules (implement in `scoring.ts`, pure functions, unit-tested)

1. **Grade bands** (score → letter): A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F < 40. Modifier: upper third of band → `+`, lower third → `−`, middle → none. F takes no modifier.
2. **Dimension score:** start at 55 (a C — "no evidence either way is a C, not a B"). Each finding moves it: `direction(±) × strength(1..3) × signal.weight × 15`, clamped 0–100. Findings with zero citations are discarded before scoring.
3. **Screen caps are asymmetric and post-hoc:** after the score is computed, a `confirmed` hit applies its action — `cap:C` → min(score, 69); `cap:D` → min(score, 54); `discount` → score − 10; `composite_cap:C` propagates to the composite. `suspected` hits never cap; they render as flags only.
4. **Independence rule:** an evidence item is `company_controlled` when its domain is the company's own domain(s) or a PR wire (`prnewswire.com`, `businesswire.com`, `globenewswire.com`, `newswire.ca`, `accesswire.com`). Findings whose citations are *all* company-controlled cannot contribute positive movement (direction "supports" is downgraded to neutral); they can still undermine or raise flags.
5. **Content hash:** `content_hash = sha256hex(url + "|" + (published_at ?? "") + "|" + normalizedSnippet)` where normalizedSnippet is lowercased, whitespace-collapsed, first 500 chars. **Evidence hash** (pins a grade to its evidence): `sha256hex(dimension + "|" + rubric_version + "|" + sortedContentHashes.join(","))`. Same evidence + same rubric ⇒ same hash; a grade may never change without the hash changing (§5.4).
6. **Confidence (deterministic, not LLM-set):** high = ≥8 evidence items AND ≥3 independent sources AND ≥50% of items within `recency_days`; medium = ≥4 items AND ≥2 independent; else low.
7. **Composite:** weighted mean of dimension scores using rubric weights → same bands. Veto rules: F9 score < 55 ⇒ composite = min(composite, 84) (`veto_applied: "f9_cap"`); any confirmed `composite_cap:C` hit ⇒ composite = min(composite, 69) and `red_banner: true`. Composite confidence = the median dimension confidence, and never higher than F9's confidence.
8. **Trend:** vs the most recent prior `dimension_scores` row for (company, dimension): score delta ≥ +3 → "up", ≤ −3 → "down", else "flat"; no prior row → "new".

Clarifications resolved during WP1.3 (binding, implemented in `scoring.ts`): modifier thirds are at band-min+5/+10 (e.g. C: 55–59 `C-`, 60–64 `C`, 65–69 `C+`); scores are `Math.round`ed (integer DB column); with multiple confirmed hits, discounts (−10 each) apply first, then the strictest cap as a ceiling; "independent sources" = distinct non-company-controlled **domains**, not citation count; when both f9_cap and red_flag_cap would fire, `veto_applied = "red_flag_cap"` (stricter) and `red_banner` set; composite median confidence uses lower-median for even counts and F9's cap is ordinal-min; `sector` weighting is reserved (unused v1). `scoring.ts` exports `COMPANY_CONTROLLED_DOMAINS` and `DIMENSION_WEIGHTS` for other modules — evidence items' own `company_controlled` marks are the source of truth, the static list is the safety net.

### 2.6 Credit costs & cadences (`src/lib/server/terminal/config.ts`)

All tunables in one exported const object. v1 defaults (placeholder economics from v0.2 §8 — deep report ≈ $2 cost, watchlist ≈ $3.50/mo):

```ts
export const TERMINAL_CONFIG = {
	CREDITS_DEEP_REPORT: 5,
	CREDITS_RERUN: 2,
	CREDITS_WATCHLIST_MONTHLY: 10,          // per company per user, debited monthly
	AGENT_EFFORT_DIMENSION: "medium",       // Exa agent run effort per dimension ($0.10)
	MONITOR_CADENCE_NEWS: "6h",
	MONITOR_CADENCE_POLICY: "1d",
	MONITOR_CADENCE_COMPETITOR: "7d",
	RESCORE_BATCH_HOURS: 12,                // ordinary material evidence batches; red_flag bypasses
	LEDGER_CHECK_OFFSETS_MONTHS: [0, 6, 12],
	VERDICT_BETA: true,                     // flipped manually after WP7.1 extraction eval ≥ 98%
	MAX_SEARCHES_PER_DIMENSION: 12,
	EXTRACTION_FILING_PAGES: 20,
}
```

Debit pattern: atomic `UPDATE user SET credits = credits - ? WHERE id = ? AND credits >= ?` + `credit_transactions` insert + refund on downstream failure — copy `persistReportAndDebit` in `PipelineRunner.ts`. Extend `credit_transactions.reason` values: `terminal_report`, `terminal_rerun`, `watchlist_monthly`.

### 2.7 Env & models

- New secrets: `EXA_WEBHOOK_TOKEN` (random URL token for the webhook route). Everything else exists (`EXA_API_KEY`, `ALPACA_*`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, Polar). Add to the `wrangler.toml` secrets comment and `.env.example`.
- No new model var. All terminal LLM calls (triage, grading prose, synthesis, verdict) use the existing `getAiModel()` — `OPENROUTER_DEFAULT_MODEL = openai/gpt-5.4-mini` in `wrangler.toml`. Changing the model later is a one-var change, no code.

### 2.8 API surface

| Route | Method | Behavior |
|---|---|---|
| `/api/terminal/resolve` | POST `{query}` | Ticker/name → candidate companies (Exa `category:"company"` + Alpaca universe check for `is_us`). Returns candidates; client confirms one. Upserts `companies` row on confirm. |
| `/api/terminal/run` | POST `{company_id}` | Auth + credit check → create `terminal_runs` row + DO `idFromName(session_id)` `/start` → 202 `{session_id}` |
| `/api/terminal/run/[session]/stream` | GET | SSE proxy to DO `/stream` with `Last-Event-ID` passthrough (copy pipeline/run pattern) |
| `/api/terminal/run/[session]/status` | GET | Reads `terminal_runs` |
| `/api/terminal/report/[slug]/rerun` | POST | Owner-only; new run for same company at `CREDITS_RERUN` |
| `/api/terminal/report/[slug]/visibility` | POST | Mirror backtest visibility route |
| `/api/terminal/watch` | POST/DELETE `{company_id}` | Add/remove watchlist entry; first watcher bootstraps monitors, last unwatch tears them down (via CompanyMonitor DO `/watch` `/unwatch`) |
| `/api/board` | GET | Grid data: watched companies × latest dimension_scores + trends, sorted by deterioration |
| `/api/terminal/alerts` | GET/POST | List / mark-read |
| `/api/webhooks/exa/[token]` | POST | Monitor webhook ingest; 403 unless `token === EXA_WEBHOOK_TOKEN`; forwards payload to the company's CompanyMonitor DO `/ingest` |

SSE event names reuse the PipelineRunner vocabulary: `stage_started`, `stage_done`, `log`, `error`, `result` (payload: `{slug}`).

### 2.9 Public redaction contract

`redactForPublic(report)` in `src/lib/types/terminal.ts` (pure): public/shared payloads keep grades, scores, confidence, trends, composite, verdict bucket + sentence, bear/bull, top citations; they **drop** `ScreenHit.detail`, all `suspected` hits, ledger miss narratives (`check_evidence`), and the disagreement list. Owner-rendered pages get the full object. (§5.6)

---

## 3. Work packages

Legend per WP: **Deps** · **Files** · **Build** · **Accept**. "Template:" names the existing file to imitate.

### Phase 0 — Foundations

#### WP0.1 Contracts
- **Deps:** none.
- **Files:** the four contract files (§2.1), Drizzle migration, `schema/index.ts` re-export, `config.ts`, `.env.example` additions.
- **Build:** implement §2.2–§2.7 exactly. `terminal/index.ts` exports typed stubs that `throw new Error("not implemented: <fn>")`. Run `bun run db:generate` and apply locally.
- **Accept:** `bun run check` passes; `bun run db:migrate:local` applies cleanly; a bun test asserts the rubric schema validator rejects a malformed framework and accepts the §2.4 example.

#### WP0.2 Rubric data (parallel with nothing; immediately after WP0.1)
- **Deps:** WP0.1.
- **Files:** `rubrics/F1.json`…`F9.json`, `rubrics/index.ts` (loader + validation + `RUBRIC_VERSION`).
- **Build:** transcribe v0.2 §4.2 verbatim into the §2.4 format — every signal row (polarity, recipe: primitive/query template/category/domains/cadence), every grade anchor, every false-signal pattern with its action. Weights: within a framework, distribute signal weights by judgment (baseline/backbone signals heaviest), summing to 1.0. F9 gets `"veto": true`; its auditor-event and round-trip patterns get `"action": "composite_cap:C"`. Domain lists (regulators etc.) go in the recipes as written in v0.2.
- **Accept:** loader validates all nine; a test asserts 9 frameworks load, weights sum to ~1.0 each, F9 has veto and ≥6 false-signal patterns.

### Phase 1 — Engine (WP1.1, WP1.3 parallel; then WP1.2, WP1.4, WP1.5 parallel)

#### WP1.1 Exa terminal client (`exa.ts`)
- **Deps:** WP0.1. Template: `exa-events.ts` for client init.
- **Build:**
  - Typed wrappers over exa-js for `/search` and `/contents` used by recipes (categories, `includeDomains`, date windows, `highlights`, `summary` with JSON schema, `subpages`, `maxAgeHours`).
  - **Agent API** (`POST https://api.exa.ai/agent/runs`, async — create, poll status, fetch result with `output.grounding` citations; 1h max runtime). Check whether the installed exa-js exposes this; if not, raw `fetch` with `x-api-key` — do not upgrade the dependency.
  - **Websets + Monitors** REST helpers: create/delete webset (company entity + criteria + enrichments), create/delete monitor (query, cadence, webhook URL), parse webhook payloads. Raw fetch; keep the surface minimal (only what WP2.1/WP5.x call).
  - Honor §6 gotchas (this section is included in your brief).
- **Accept:** unit tests for request-shaping (no live calls): given a rubric recipe, the built request body nests `contents` correctly for `/search` vs `/contents`, uses `maxAgeHours` not `livecrawl`, never emits deprecated params.

#### WP1.2 Dimension research runner (`research.ts`)
- **Deps:** WP0.2, WP1.1. Template: `runResearchAgentForTicker` in `exa-events.ts` for the agentic-loop shape.
- **Build:** `runDimensionResearch(company, framework, opts)`:
  - Primary path: one Exa **agent run** per dimension, `effort` from config, `outputSchema` = `{findings: SignalFinding[], screen_hits: ScreenHit[]}` derived from the framework's signals/false-signals (schema field descriptions name the signal). Map `output.grounding` into `EvidenceItem`s.
  - Fallback path (agent run fails/times out): direct recipe execution — run each signal's search recipe via WP1.1, then one `getAiModel()` pass to classify results into findings. Cap at `MAX_SEARCHES_PER_DIMENSION`.
  - Every finding keeps ≥1 citation or is dropped. Mark `company_controlled` per §2.5.4. Compute `content_hash` per item.
- **Accept:** test with mocked Exa responses: findings without citations dropped; company-controlled-only positives downgraded (delegated to scoring but the flag must be set); evidence items deduped by content_hash.

#### WP1.3 Scoring + screens (`scoring.ts`, `screens.ts`)
- **Deps:** WP0.1 (not WP0.2 — test against inline fixture frameworks).
- **Build:** implement §2.5 exactly as pure functions: score/band/modifier math, independence downgrade, screen-cap application, confidence formula, composite + veto, evidence hash, trend computation. `gradeDimension` additionally calls `getAiModel()` once to write the dimension `summary` against the grade anchors (LLM writes prose; **numbers and caps are code**). `screens.ts` executes false-signal recipes not already covered by the agent run and classifies hits confirmed/suspected (confirmed requires ≥2 independent citations).
- **Accept:** the core test suite of the product. Bun tests cover: band edges (84/85, 69/70…), modifier thirds, F9 veto cap, composite_cap + red_banner, independence downgrade, confidence thresholds, evidence-hash determinism (same items any order ⇒ same hash), trend deltas. This suite is the Phase-1 gate.

#### WP1.4 Fundamentals extraction (`extraction.ts`)
- **Deps:** WP1.1.
- **Build:** `FundamentalsProvider` interface (so a structured provider can replace Exa later — v0.2 §9); `ExaFilingsProvider` implements it: `category:"financial report"` search targeting the latest ANNUAL filing (junk-URL filtered), `EXTRACTION_FILING_PAGES` cap. **Mechanism (ratified WP1.4b, 2026-07-05):** extract the §2.3 figure set from Exa `contents.text` (large char cap) via a structured `getAiModel()` call per pass — NOT Exa's `contents.summary`, whose summarizer measurably fabricates figures on large inline-XBRL filings (probe-verified 0% accuracy; text+LLM measures 92.31%). Zero values = not-found; periods normalize to a fiscal year (quarterly labels dropped); only the newest FY across passes publishes; net debt pinned to total debt − cash & equivalents. **Run extraction twice with independently-worded prompts; figures agree if within 1% — disagreements go to `disagreements[]`, never averaged** (§5.3). Every figure carries source URL + filing date. Missing/disagreeing core figures ⇒ `confidence: "low"`.
- **Accept:** tests with fixture filing texts: agreement within 1% passes; a seeded disagreement lands in `disagreements` and drops confidence; every figure in output has a `source_url`.

#### WP1.5 Synthesis + rulebook (`synthesis.ts`, `rulebook.md`)
- **Deps:** WP0.1.
- **Build:** `rulebook.md` = the evidence-language editorial standard (v0.2 §4.5): every flag worded as cited observation, never accusation; the two canonical examples; a short banned-framing list ("misleading accounting", "fake deal", "fraud", "scheme", accusatory verbs). Versioned header comment. `synthesize()` builds narrative + "Bear case from the evidence" + "Bull case from the evidence" from the citation pool via `getAiModel()`, with the rulebook injected into every synthesis system prompt. Include a `checkLanguageCompliance(text): string[]` helper (banned-phrase scan) used by tests and the eval harness; synthesis retries once on violation.
- **Accept:** test: a synthetic flag description containing banned framings is caught by `checkLanguageCompliance`; prompts include rulebook content (assert on the built prompt string).

### Phase 2 — Deep report pipeline

#### WP2.1 `TerminalReportRunner` DO
- **Deps:** WP1.2, WP1.3, WP1.4, WP1.5 (WP3.1 may be stubbed: if `reconcile` throws not-implemented, emit verdict `null` and continue). Template: `PipelineRunner.ts` — copy its skeleton deliberately (storage keys, event log, alarm loop, watchdog, SSE/WS fan-out, credit debit with refund).
- **Build:** stages (each checkpointed in DO storage; `researching` checkpoints per dimension so evictions resume mid-run): `resolving → competitor_set → researching (9×) → extracting → grading → reconciling → synthesizing → persisting → complete`. Emits the §2.8 SSE vocabulary with per-dimension `log` lines. `competitor_set`: create/reuse the company's competitor Webset (store id on `companies`). `persisting`: write `terminal_reports` + append 10 `dimension_scores` rows (9 + composite) + insert `evidence_items` (origin `report_run`) + extract commitments into `commitments` (call `ledger.ts` if built, else skip — forward-compatible) + debit credits atomically with refund-on-failure. Update `terminal_runs` on every stage change. Wire the DO per house rule 4 (wrangler migration tag v2, hooks re-export, patch script).
- **Accept:** `bun run check`; local run via `bun run dev` + curl: POST `/api/terminal/run` (stub route acceptable if WP2.2 not merged; else the real one), stream shows stage progression through `complete` for a US mega-cap; `terminal_reports` + `dimension_scores` rows exist; credits debited once; a mid-run DO restart (kill dev server between dimensions) resumes rather than restarts.

#### WP2.2 Run + resolve routes
- **Deps:** WP0.1 (contracts define everything it needs); integrates with WP2.1. Template: `api/pipeline/run/+server.ts`.
- **Build:** §2.8 rows 1–6: resolve (Exa company search + `loadUSEquityUniverse` membership → `is_us`/`alpaca_symbol`; upsert `companies`), run (auth via `locals.user`, credit pre-check, create `terminal_runs`, DO start), stream proxy, status, rerun, visibility. Non-US candidates are labeled "research only — no price verdict" in the resolve response (`is_us: false` is enough; UI copy is WP4.2).
- **Accept:** curl transcript in report: resolve → run → stream reaches `complete`; rerun debits `CREDITS_RERUN`; visibility toggle flips `is_public`; unauthenticated run → 401; insufficient credits → 402.

### Phase 3 — Price reconciliation

#### WP3.1 Reverse-DCF + verdict (`reconcile.ts`, Alpaca snapshot)
- **Deps:** WP1.4 (uses `ExtractionResult`), WP0.1.
- **Build:**
  - Add `fetchSnapshot(symbol)` (latest trade/close) to `alpaca-market-data.ts`.
  - Market cap = price × extracted share count; EV = mcap + extracted net debt.
  - `impliedGrowth(ev, revenue, fcfMargin, {discountRate: 0.10, years: 10, terminalGrowth: 0.025})` — bisection solve for the revenue-growth rate whose DCF equals EV; run for three margin scenarios (current, +200bps, +500bps). Pure, tested.
  - Multiples cross-check: EV/Revenue and P/FCF vs competitor-set figures where cached in prior extractions; null-safe (gaps render as gaps, never invented).
  - Verdict: deterministic inputs (implied assumptions, multiples, composite + dimension grades) → `getAiModel()` picks the bucket enum + writes the sentence naming specific dimension gaps (v0.2 §5 step 5 style). `beta: VERDICT_BETA`. Non-US or extraction confidence low + disagreements on core figures ⇒ verdict may still ship but its `confidence` is low and the sentence must say so inline (§5.3); non-US companies return `null` (callers render "available for US listings").
  - Event-attribution timeline: reuse `fetchOHLCV` + `computeCAR` from `impact-window.ts` to align major price moves against `evidence_items` dates; attach as `verdict.timeline` (field now in the contract).
- **Accept:** bisection unit tests (known closed-form-ish fixtures, monotonicity, degenerate inputs: zero revenue, negative FCF ⇒ null implied + low confidence); non-US returns null; a US fixture produces a bucket ∈ enum.

### Phase 4 — UI (parallel with Phase 3)

#### WP4.1 Report page
- **Deps:** WP2.1 persist shape (contracts suffice). Templates: `backtest/[slug]/*`, `BacktestReport.svelte` (disclaimer banner + layout conventions).
- **Files:** `src/routes/terminal/[slug]/+page.server.ts` + `+page.svelte`; `src/lib/components/terminal/`: `TerminalReport.svelte`, `ReportHeader` (composite + confidence + red banner), `VerdictCard` (Beta chip when `beta`; "available for US listings" empty state), `FrameworkCard` (grade, trend arrow, confidence, top-3 citations, flags), `LedgerStats` ("tracking started {date}, {n} commitments logged" empty state — never a hollow stat), `BearBull`, `CitationAppendix`.
- **Build:** `+page.server.ts` mirrors backtest slug page (status=complete, `is_public`/owner, view count, OG meta) and applies `redactForPublic` for non-owners (§2.9). AI-disclaimer banner replicated. Owner sees flags detail + disagreements; public does not.
- **Accept:** `bun run check`; manual: owner view shows flag detail, logged-out view of the same slug hides it; non-US report renders without a verdict section error.

#### WP4.2 Run/progress UX
- **Deps:** WP2.2. Templates: `dashboard/+page.svelte` ViewState machine, `ProcessingLog.svelte`.
- **Files:** `src/routes/terminal/+page.svelte` (ticker input → resolve candidates → confirm → run), `src/lib/components/terminal/TerminalProgress.svelte` (SSE consumer, 45s liveness watchdog, cancel, stage list: *Resolving company → Building competitor set → Researching 9 dimensions → Extracting fundamentals → Screening for false signals → Reconciling price → Writing report*).
- **Build:** on `result` event navigate to `/terminal/[slug]`. Non-US confirm dialog states "research only — price verdict is available for US listings". Show credit cost before run; 402 → link to `/dashboard/credits`.
- **Accept:** manual end-to-end in `bun run dev`: enter ticker → report page. **This closes Milestone A.**

### Phase 5 — Watchlist

#### WP5.1 `CompanyMonitor` DO
- **Deps:** WP1.3, contracts. Template: `PipelineRunner.ts` skeleton again (storage, alarm, D1 access).
- **Build:** one instance per company (`idFromName(company_id)`). Fetch routes: `/watch` (adds user: create Websets/monitors via WP1.1 on first watcher — news@6h broad query incl. deal/exec/recall/investigation terms, policy@1d regulator domains, competitor@7d webset search behavior; persist ids in `companies.monitor_state`), `/unwatch` (last watcher tears monitors down), `/ingest` (webhook evidence in), `/rescore` (force, used by earnings re-runs later), `/status`. State: watcher list, evidence inbox queue, per-dimension pending-rescore flags, ledger check queue. **Daily housekeeping alarm:** monthly billing (debit `CREDITS_WATCHLIST_MONTHLY` per due watcher via `next_billing_at`; on insufficient credits set entry `active=false` + alert), due ledger checks (delegate to `ledger.ts` when built), batched rescores every `RESCORE_BATCH_HOURS`.
- **Ingest flow:** dedupe by `content_hash` → `triageEvidence` (WP5.3; until merged, store un-triaged) → insert `evidence_items` (origin `monitor`) → materiality `red_flag` ⇒ immediate rescore of flagged dimensions; `material` ⇒ queue; else store only.
- **Rescore:** for each queued dimension, evaluate **only with the evidence-delta gate** (§5.4): recompute evidence hash over the dimension's current evidence set; unchanged hash ⇒ skip (grade stands). Changed ⇒ `runDimensionResearch` incremental (agent run seeded with the new items via `input.data`) → `gradeDimension` → append `dimension_scores` → recompute composite row → on grade or confidence change, insert `terminal_alerts` for every active watcher and send email via Resend (auth.ts pattern, failures swallowed, `emailed` flag).
- **Accept:** DO wired (rule 4); tests for the pure parts (billing due-date math, batch gating); manual: watch a company with a fake `/ingest` payload → evidence row + queued rescore → forced alarm run produces a `dimension_scores` append + alert row. Re-ingesting the same payload is a no-op (hash dedup).

#### WP5.2 Webhook + watch routes
- **Deps:** WP5.1, WP1.1.
- **Build:** §2.8 rows: `/api/webhooks/exa/[token]` (403 on token mismatch; map payload → company via monitor id in `companies.monitor_state`; forward to DO `/ingest`; 200 fast — do heavy work in the DO), `/api/terminal/watch` POST/DELETE, `/api/terminal/alerts`.
- **Accept:** curl: bad token → 403; good token + fixture payload → evidence row exists; watch/unwatch round-trip creates and clears `watchlist_entries` and calls the DO.

#### WP5.3 Triage (`triage.ts`)
- **Deps:** WP0.1.
- **Build:** `triageEvidence` via `getAiModel()`: structured output = `TriageResult` (pi-ai tool-call pattern from `exa-events.ts`). Classifies relevance, dimensions, materiality (red_flag reserved for the F9 screen classes: auditor events, round-trip revenue, restatements — plus recalls/investigations), and extracts dated commitments for the ledger. Prompt includes the company context + the nine dimension one-liners (from rubric files).
- **Accept:** tests with mocked LLM responses validating schema handling; a fixture "auditor resigns" item classifies `red_flag` + F9 (assert on prompt/schema plumbing, not model behavior — mark the live-model check for the eval harness).

#### WP5.4 Board UI
- **Deps:** WP5.1 data shapes (contracts suffice); `/api/board` from WP5.2 or built here (orchestrator picks — default: here).
- **Files:** `src/routes/board/+page.server.ts` + `+page.svelte`, `src/lib/components/terminal/BoardGrid.svelte`, alert feed component.
- **Build:** grid companies × F1–F9 + composite (grade + trend arrow per cell), sortable by "most deteriorating" (sum of negative score deltas over trailing 30d from `dimension_scores`), cell drill-down → evidence trail (owner-scoped, so flags visible), add-company flow reusing WP4.2 resolve/confirm, "Refresh now" button per company (calls rerun), alert feed with mark-read.
- **Accept:** `bun run check`; manual with seeded rows: sorting orders by deterioration; drill-down lists evidence; watch/unwatch updates grid. **Closes Milestone B.**

### Phase 6 — Announcement Ledger

#### WP6.1 Ledger (`ledger.ts` + UI stat wiring)
- **Deps:** WP5.1 (alarm host), WP1.1, triage extraction already landing commitments.
- **Build:** `extractCommitments(evidence|reportRun)` (LLM, `{what, promised_date, source}`) called from report runs and triage; `runDueChecks(company)`: for commitments with `next_check_at` due — targeted searches ("did {what} ship/open/complete?") → LLM classifies status enum → update row, schedule next offset from `LEDGER_CHECK_OFFSETS_MONTHS`, store `check_evidence`. `followThroughRate(company)`: `delivered_on_time / (resolved + unaccounted_past_due)`, plus the display counts ("Announced N dated commitments in M months; X on time, Y late, Z unaccounted"). Feed FTR into F7/F8 grading as a synthetic `SignalFinding` (signal ids `f7_followthrough`, `f8_followthrough` — add these signals to the rubric JSONs via orchestrator-approved rubric bump). **Forward-only: no backfill** (§5.5).
- **Accept:** FTR math unit-tested (empty ledger ⇒ null, not 0 — UI renders "tracking started"); due-check scheduling math tested; manual: seeded commitment past promise date gets checked and transitions status.

### Phase 7 — Quality gates (WP7.2 can run any time after WP1.1)

#### WP7.1 Eval harness (`scripts/eval/`)
- **Deps:** Milestone A.
- **Build:** `companies.json` — default frozen set, editable: 12 operators (AAPL, MSFT, COST, ASML, JNJ, JPM, TSM, DE, ADBE, UNP, TXN, WM) + 6 historical deception cases for language/screen testing (Wirecard, Nikola, Luckin, Theranos-era coverage, WeWork 2019, Valeant). Three checks, each a bun-runnable script with a summary table: (a) **extraction accuracy** — hand-verified `truth.json` for ~20 US companies' §2.3 figures; report % within rounding; **≥98% flips `VERDICT_BETA`** (manual config change, per §2.6); (b) **grade stability** — run grading twice on identical evidence fixtures; identical evidence hash ⇒ identical grade (asserts §5.4 mechanically); (c) **language compliance** — `checkLanguageCompliance` over all synthesized narratives/flags; zero banned framings.
- **Accept:** `bun scripts/eval/run-eval.ts` produces the three-section report; truth.json may start partial (structure + ≥3 companies filled; filling the rest is analyst work, flagged as such).

#### WP7.2 Exa API-behavior suite (`scripts/exa-smoke.ts`)
- **Deps:** WP1.1.
- **Build:** live, manually-run assertions of every Exa behavior we depend on (v0.2 §9 "doc drift is real"): categories accepted (`company`, `news`, `financial report`, `people`), `maxAgeHours` accepted / `livecrawl` param rejected or ignored, contents nesting on `/search` vs `/contents`, agent-run create/poll/result shape + `output.grounding` present, monitors create/delete + webhook registration, Websets create/delete. Cheap efforts/small numResults; prints PASS/FAIL per assumption. Not in CI; run before any Exa-touching deploy.
- **Accept:** script runs green against the live API with `EXA_API_KEY` (paste output).

---

## 4. Orchestration playbook (Fable)

### 4.1 Dependency graph

```
WP0.1 ──► WP0.2 ─────────────► WP1.2 ─┐
   │  ├─► WP1.1 ─┬───────────► WP1.4 ─┼─► WP2.1 ─► WP2.2 ─► WP4.2 ─┐
   │  ├─► WP1.3 ─┘ (parallel)  WP1.5 ─┘      │                     ├─ Milestone A
   │  └─► WP4.1 (contracts only) ────────────┴─────────────────────┘
   │
   ├─► WP3.1 (needs WP1.4; merge before or after Milestone A — verdict null-safe either way)
   │
   └─► Phase 5: WP5.1 ─► WP5.2 ─► WP5.4   (WP5.3 parallel with WP5.1)  ─ Milestone B
        └─► WP6.1 ─ Milestone C
   WP7.2 any time after WP1.1 · WP7.1 after Milestone A
```

Parallel waves: **W1** = {WP0.2, WP1.1, WP1.3} · **W2** = {WP1.2, WP1.4, WP1.5, WP4.1, WP7.2} · **W3** = {WP2.1, WP3.1} · **W4** = {WP2.2, WP4.2} · **W5** = {WP5.1, WP5.3} · **W6** = {WP5.2, WP5.4, WP6.1} · **W7** = {WP7.1}.

### 4.2 Dispatch rules

1. One sub-agent per WP. Use worktree isolation for parallel WPs; merge in wave order; orchestrator resolves conflicts (contract files should never conflict — if they do, someone violated the freeze).
2. Sub-agent brief = this template:
   > Implement **WP<n> <name>** from `docs/SPEC_Aslan_Terminal_v0.3_IMPLEMENTATION.md`. Read first: §1 house rules, §2 contracts, your WP section §3, §5 product invariants, §6 Exa gotchas (if your WP touches Exa), and the template files your WP names. Contract files are frozen — report mismatches, don't edit them. Definition of done: house rule 7. Report back: files changed, test/check output pasted, acceptance evidence, anything you flagged instead of fixing.
3. **Phase gates** (orchestrator verifies before the next wave): after W1 — WP1.3's test suite green (this is the product's core-logic gate) + 9 rubrics load; after W4 — Milestone A manual smoke (one real US ticker end-to-end, report renders, credits debited exactly once, public URL redacts); after W6 — Milestone B smoke (watch → fake webhook → alert) ; before flipping `VERDICT_BETA` — WP7.1(a) ≥98%.
4. **Contract changes:** any agent needing a contract change stops; the orchestrator edits the contract file, bumps a change note at the top of `terminal/index.ts`, and re-briefs affected in-flight agents.
5. Milestone A is shippable alone (deep report, no watchlist). Do not let Phase 5 block a Milestone-A ship decision.
6. After Milestone A and B, run `/code-review` on the accumulated diff and feed findings back as fix-up tasks before proceeding.

---

## 5. Product invariants (non-negotiable, from v0.2 interviews)

1. **Evidence, not consensus.** No street estimates, price targets, or sell-side ratings anywhere — not as inputs, not as citations. Reverse-DCF framing replaces "vs estimates". This is positioning, not a gap.
2. **Global research, US verdicts.** Any ticker gets the 9-dimension report; the valuation verdict only where Alpaca prices exist. Never scrape prices. Non-US renders "available for US listings", not a low-confidence guess. Verdict ships Beta-labeled until the extraction eval clears 98% (`VERDICT_BETA`).
3. **Extraction discipline.** Double extraction with independent prompts; disagreements surfaced, never averaged; every figure click-through to its source filing; low extraction confidence is stated in the verdict sentence itself, not a footnote.
4. **Reproducibility (evidence-delta gating).** A grade changes only when its evidence hash changes. Re-sampling alone may never move a grade. Every published grade is pinned to `evidence_hash` + `rubric_version`. Red-flag evidence bypasses batching; ordinary evidence batches.
5. **Ledger is forward-only.** No historical backfill. Empty ledger renders "tracking started {date}" — never a hollow stat.
6. **Liability posture.** Evidence-language standard on every generated flag/alert/narrative (observations with citations, never accusations — `rulebook.md` is the law). Public share URLs show grades/trends/confidence only; screen-hit detail, suspected hits, and ledger-miss narratives are owner-only (`redactForPublic`). AI-disclaimer banner on all report pages.
7. **Independence rule.** Company-controlled sources can raise questions but never confirm health alone (§2.5.4).
8. **Asymmetric deception weighting.** Confirmed false-signal hits cap grades regardless of positive signals and always surface to the owner. F9 vetoes the composite (§2.5.7).
9. **Rubrics are versioned data.** Frameworks live in JSON, reports record their rubric version, rubric changes never silently rewrite history (append-only `dimension_scores`).

---

## 6. Exa API gotchas (verified July 2026 — docs drift; WP7.2 pins these)

- `tweet` category **removed**; social sentiment is an acknowledged F1 evidence gap, not a TODO.
- `livecrawl` **deprecated** → `maxAgeHours` (`0` = force livecrawl, `-1` = cache only, omit = default). `useAutoprompt`, `numSentences`, `highlightsPerUrl`, `tokensNum`, `includeUrls` — all dead params; use `maxCharacters`, `includeDomains`/`excludeDomains` (max 1200).
- On `/search`, `text`/`highlights`/`summary` **must nest inside `contents`**; on `/contents` they are top-level. `stream: true` unsupported on both.
- Categories: `company`, `news`, `financial report`, `research paper`, `personal site`, `people`. Singular-form queries for `company`/`people`; `people` supports no date/text filters.
- Agent API: `POST /agent/runs`, async, effort `minimal…xhigh` ($0.012/$0.025/$0.10/$0.50/$1.00), `outputSchema` validated, citations in `output.grounding`, `input.data` seeds records, 1h max. Exa Connect partner routing is driven by `outputSchema` **field descriptions** naming the source.
- Monitors: min cadence **1h** (`1h/6h/1d/7d`), $15/1k runs, server-side dedup across runs, webhook push. Websets: entity lists with criteria verification + enrichments; `search` behavior catches new entrants.
- Company entities refresh **weekly** (workforce, traffic) — news monitors are the fast path for exec changes, not profile refresh.
- Rate/costs: `/search` 10 QPS $7/1k (deep $12–15/1k), `/contents` 100 QPS $1/1k pages per content type.

---

## 7. Defaults chosen for v0.2's open questions

So no sub-agent is ever blocked on them (revisit post-Milestone A):

1. **Naming/placement:** ships inside the existing app at `/terminal` and `/board`; no rebrand, no landing-page changes in scope.
2. **Eval set:** the WP7.1 list above, editable.
3. **Non-US resolution UX:** Exa company-candidate confirm dialog labeled "research only" (WP4.2).
4. **Credits:** the §2.6 constants — placeholders on Polar rails, tunable in one file, revisited against real usage.
5. **Legal review trigger:** unchanged (accepted residual risk); the §5.6 posture + disclaimer banner carry the interim. Flag before enabling any public marketing of shared URLs.
