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

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { authUser } from "./auth"

export const backtestReports = sqliteTable("backtest_reports", {
	id:                   text("id").primaryKey(),
	slug:                 text("slug").unique().notNull(),
	user_id:              text("user_id").references(() => authUser.id, { onDelete: "set null" }),
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

export const emailCaptures = sqliteTable("email_captures", {
	id:          text("id").primaryKey(),
	email:       text("email").notNull(),
	report_id:   text("report_id").references(() => backtestReports.id),
	captured_at: integer("captured_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

export const waitlist = sqliteTable("waitlist", {
	id:         text("id").primaryKey(),
	email:      text("email").notNull(),
	interest:   text("interest"),
	created_at: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

export const creditTransactions = sqliteTable("credit_transactions", {
	id:                text("id").primaryKey(),
	user_id:           text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
	amount:            integer("amount").notNull(),
	reason:            text("reason").notNull(),
	backtest_id:       text("backtest_id").references(() => backtestReports.id),
	stripe_payment_id: text("stripe_payment_id"),
	created_at:        integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
})

export const pipelineSessions = sqliteTable("pipeline_sessions", {
	id:                     text("id").primaryKey(),
	user_id:                text("user_id").notNull(),
	params_json:            text("params_json").notNull(),
	confirmed_rule_json:    text("confirmed_rule_json"),
	confirmed_tickers_json: text("confirmed_tickers_json"),
	created_at:             integer("created_at").notNull(),
	expires_at:             integer("expires_at").notNull(),
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
