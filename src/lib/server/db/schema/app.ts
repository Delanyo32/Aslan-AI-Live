// Application-owned tables — column names are snake_case, matching the existing
// database schema from 001_initial.sql + 002_auth.sql migrations.
// TypeScript property names intentionally mirror the SQL column names so that
// BacktestReportRow (pipeline.ts) stays compatible with Drizzle's inferred types.
//
// SQLite/D1 type notes:
//   jsonb  → text (mode: "json")    — Drizzle auto-parses/stringifies
//   uuid   → text                   — generated via crypto.randomUUID() in app code
//   array  → text (mode: "json")    — stored as JSON array string
//   timestamp → integer (mode: "timestamp")  — Unix seconds
//   boolean → integer (mode: "boolean")      — 0/1

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const backtestReports = sqliteTable("backtest_reports", {
	id:                   text("id").primaryKey(),
	slug:                 text("slug").unique().notNull(),
	user_id:              text("user_id"),
	email:                text("email"),
	query:                text("query").notNull(),
	event_spec:           text("event_spec", { mode: "json" }).$type<object>().notNull(),
	exa_search:           text("exa_search", { mode: "json" }).$type<object>().notNull(),
	rule:                 text("rule", { mode: "json" }).$type<object>().notNull(),
	confirmed_tickers:    text("confirmed_tickers", { mode: "json" }).$type<string[]>().notNull(),
	occurrences:          text("occurrences", { mode: "json" }).$type<object[]>().notNull(),
	impact_windows:       text("impact_windows", { mode: "json" }).$type<object[]>().notNull(),
	backtest_result:      text("backtest_result", { mode: "json" }).$type<object>().notNull(),
	low_confidence_events: text("low_confidence_events", { mode: "json" }).$type<object[]>().notNull().default([]),
	research_narrative:   text("research_narrative"),
	status:               text("status").notNull().default("pending"),
	is_public:            integer("is_public", { mode: "boolean" }).notNull().default(true),
	view_count:           integer("view_count").notNull().default(0),
	created_at:           integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
	updated_at:           integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

export const waitlist = sqliteTable("waitlist", {
	id:         text("id").primaryKey(),
	email:      text("email").notNull(),
	interest:   text("interest"),
	created_at: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

// Per-generation cost ledger. One row per billable action (deep report, rerun,
// backtest, watchlist cycle). Records the measured Exa unit counts and an
// estimated USD cost so real cost-to-serve and per-user margin are queryable:
//   per generation → one row; per user → SUM(est_cost_usd) GROUP BY user_id.
// est_cost_usd is an estimate (COST_USD price map × counts), not a billed amount.
export const usageEvents = sqliteTable("usage_events", {
	id:              text("id").primaryKey(),
	user_id:         text("user_id").notNull(),
	kind:            text("kind").notNull(),                       // deep_report | rerun | backtest | watchlist
	report_id:       text("report_id"),                           // terminal report id or backtest id
	exa_agent_runs:  integer("exa_agent_runs").notNull().default(0),
	exa_searches:    integer("exa_searches").notNull().default(0),
	exa_contents:    integer("exa_contents").notNull().default(0),
	exa_websets:     integer("exa_websets").notNull().default(0),
	est_cost_usd:    real("est_cost_usd").notNull().default(0),
	credits_charged: integer("credits_charged").notNull().default(0),
	created_at:      integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

export const creditTransactions = sqliteTable("credit_transactions", {
	id:                text("id").primaryKey(),
	user_id:           text("user_id").notNull(),
	amount:            integer("amount").notNull(),
	reason:            text("reason").notNull(),
	backtest_id:       text("backtest_id").references(() => backtestReports.id),
	stripe_payment_id: text("stripe_payment_id"),
	created_at:        integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

// Clerk-owned identity mirror + app credit balance. Replaces the better-auth `user`
// table's role as the credit store: keyed by Clerk user id (e.g. "user_xxx"), populated
// from the Clerk `user.created` webhook. `credits` is the atomic debit target the DOs hit
// (moving off authUser.credits in phase 5). `plan` / `period_end` track the active
// subscription allotment (set by the paymentAttempt.updated webhook).
export const profiles = sqliteTable("profiles", {
	user_id:    text("user_id").primaryKey(),                  // Clerk user id
	email:      text("email"),
	credits:    integer("credits").notNull().default(20),      // welcome grant; refilled per billing cycle
	plan:       text("plan"),                                  // Clerk plan slug; null = free
	period_end: integer("period_end", { mode: "timestamp" }),  // when the current allotment lapses
	created_at: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
	updated_at: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

// Cross-DO index of pipeline runs. One row per run. The DO itself owns event log
// and per-stage state in DO storage; this table exists so other Workers can look
// up status / result by session_id without routing through the DO.
export const pipelineRuns = sqliteTable("pipeline_runs", {
	session_id:  text("session_id").primaryKey(),
	user_id:     text("user_id").notNull(),
	status:      text("status").notNull(),       // pending | running | awaiting_rule | complete | failed | cancelled
	stage:       text("stage").notNull(),        // see PipelineStage union in PipelineRunner.ts
	error:       text("error"),
	result_slug: text("result_slug"),
	created_at:  integer("created_at").notNull(),
	updated_at:  integer("updated_at").notNull(),
})
