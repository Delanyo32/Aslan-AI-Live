// Aslan Terminal tables — contract file (§2.2 of SPEC v0.3). Frozen after WP0.1.
// House style: snake_case columns, text(mode:"json"), integer(mode:"timestamp")
// Unix seconds, integer(mode:"boolean"). See app.ts header for D1 type notes.

import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { authUser } from "./auth"
// Type-only (erased at compile) — no runtime cycle with $lib/types/terminal.
import type {
	Citation,
	CompositeScore,
	DimensionGrade,
	ExtractionResult,
	ReconciliationVerdict
} from "$lib/types/terminal"

export const companies = sqliteTable("companies", {
	id:            text("id").primaryKey(),                    // crypto.randomUUID()
	ticker:        text("ticker").notNull(),                   // user-facing symbol, e.g. "TSM", "005930.KS"
	name:          text("name").notNull(),
	exa_entity:    text("exa_entity", { mode: "json" }).$type<object>(),   // raw Exa company-entity result
	is_us:         integer("is_us", { mode: "boolean" }).notNull().default(false), // in Alpaca US-equity universe
	alpaca_symbol: text("alpaca_symbol"),                      // set when is_us
	sector:        text("sector"),
	competitor_webset_id: text("competitor_webset_id"),
	monitor_state: text("monitor_state", { mode: "json" }).$type<object>(), // { news_monitor_id, policy_monitor_id, competitor_monitor_id }
	created_at:    integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
	updated_at:    integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
	uniqueIndex("companies_ticker_unique").on(t.ticker),
])

export const terminalReports = sqliteTable("terminal_reports", {
	id:             text("id").primaryKey(),
	slug:           text("slug").unique().notNull(),           // random 6-char, reports.ts pattern
	user_id:        text("user_id").references(() => authUser.id, { onDelete: "set null" }),
	company_id:     text("company_id").notNull().references(() => companies.id),
	status:         text("status").notNull().default("pending"), // pending | running | complete | failed
	rubric_version: text("rubric_version").notNull(),
	composite:      text("composite", { mode: "json" }).$type<CompositeScore>(),
	dimensions:     text("dimensions", { mode: "json" }).$type<DimensionGrade[]>(),
	extraction:     text("extraction", { mode: "json" }).$type<ExtractionResult>(),
	verdict:        text("verdict", { mode: "json" }).$type<ReconciliationVerdict>(), // null for non-US
	bear_bull:      text("bear_bull", { mode: "json" }).$type<{ bear: string; bull: string }>(),
	narrative:      text("narrative"),
	citations:      text("citations", { mode: "json" }).$type<Citation[]>(),  // full appendix
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
}, (t) => [
	index("dimension_scores_company_dimension_created_idx").on(t.company_id, t.dimension, t.created_at),
])

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
}, (t) => [
	uniqueIndex("evidence_items_company_content_hash_unique").on(t.company_id, t.content_hash), // dedup
	index("evidence_items_company_created_idx").on(t.company_id, t.created_at),
])

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
}, (t) => [
	index("commitments_company_idx").on(t.company_id),
	index("commitments_next_check_idx").on(t.next_check_at),
])

export const watchlistEntries = sqliteTable("watchlist_entries", {
	id:              text("id").primaryKey(),
	user_id:         text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
	company_id:      text("company_id").notNull().references(() => companies.id),
	active:          integer("active", { mode: "boolean" }).notNull().default(true),
	next_billing_at: integer("next_billing_at", { mode: "timestamp" }).notNull(),
	created_at:      integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
	uniqueIndex("watchlist_entries_user_company_unique").on(t.user_id, t.company_id),
])

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
}, (t) => [
	index("terminal_alerts_user_read_created_idx").on(t.user_id, t.read, t.created_at),
])

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
