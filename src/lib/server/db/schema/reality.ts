// Reality Ledger tables (docs/PLAN_Reality_Ledger_v0.1.md, schema per
// docs/RESEARCH_Reality_Ledger.md "Schema addenda"). Keyed on CIK like sec.ts —
// the pipeline runs off the SEC archive, deliberately not joined to the Exa
// `companies` table. House style: snake_case, integer(mode:"timestamp"),
// text(mode:"json") columns.

import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core"

// One cataloged claim from one filing. Mechanical rows (origin: xbrl) come from
// the curated concept map over companyfacts; soft rows (origin: ai) come from
// the cataloger's note-section pass. Numbers are never edited after insert —
// amendments mark the original filing's rows superseded instead (a
// restatement's before/after is investigator input).
export const ledgerEntries = sqliteTable("ledger_entries", {
	id:              text("id").primaryKey(),
	cik:             text("cik").notNull(),                    // zero-padded 10-digit, matches sec_companies
	accession:       text("accession").notNull(),              // source filing (sec_filings.accession)
	amount:          real("amount").notNull(),                 // full units (dollars/shares), scale expanded BY CODE from the as-printed value
	amount_high:     real("amount_high"),                      // upper end when the filing prints a range; null otherwise
	value_type:      text("value_type").notNull().default("currency"), // currency | shares | percent | per_share — only currency rows may enter amount sums
	unit:            text("unit").notNull(),                   // "USD" | "EUR" | "TWD" | … | "shares" | "PCT" (percent rows)
	kind:            text("kind").notNull(),                   // revenue | expense | obligation | contingent_revenue | context | financing (money lent out)
	certainty:       text("certainty").notNull(),              // actual | committed | conditional
	period_start:    text("period_start"),                     // ISO date; null for instant (balance-sheet) facts
	period_end:      text("period_end").notNull(),             // ISO date the claim belongs to
	fiscal_year:     integer("fiscal_year"),                   // filer's fiscal calendar, from XBRL fy/fp; null for ai rows
	fiscal_period:   text("fiscal_period"),                    // FY | Q1 | Q2 | Q3 | Q4
	due_date:        text("due_date"),                         // ISO; obligations/conditional only — money owed in the future
	inferred_due:    integer("inferred_due", { mode: "boolean" }).notNull().default(false), // due_date computed from a window/year, not printed in full
	event_date:      text("event_date"),                       // ISO; when the claim is a dated past event (close, redemption), never a due schedule item
	counterparty:    text("counterparty"),                     // named party, if the text names one
	related_party:   integer("related_party", { mode: "boolean" }).notNull().default(false),
	taxonomy_tag:    text("taxonomy_tag"),                     // source XBRL concept for mechanical rows ("us-gaap:PurchaseObligation")
	source_location: text("source_location").notNull(),        // "xbrl:<form>" or the note/section the ai row came from
	notes:           text("notes"),                            // one-line evidence-language note (ai rows)
	origin:          text("origin").notNull(),                 // xbrl | ai
	superseded:      integer("superseded", { mode: "boolean" }).notNull().default(false), // filing amended; kept, not deleted
	content_hash:    text("content_hash").notNull(),           // idempotent re-runs dedupe on (cik, content_hash)
	created_at:      integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
	uniqueIndex("ledger_entries_cik_content_hash_unique").on(t.cik, t.content_hash),
	index("ledger_entries_cik_period_idx").on(t.cik, t.period_end),
	index("ledger_entries_cik_accession_idx").on(t.cik, t.accession),
])

// Investigator output. Flags annotate entries — they never edit numbers.
// flag_type vocabulary (RESEARCH doc "Flag taxonomy"): deterministic —
// filing_cadence | value_revision | tagging_quality | conditional_ratio |
// receivables_ratio | cash_conversion;
// ai — vanishing_item | redefinition | one_time_dressing |
// related_party_exposure | subsequent_event | off_balance_sheet |
// circular_financing.
export const ledgerFlags = sqliteTable("ledger_flags", {
	id:         text("id").primaryKey(),
	cik:        text("cik").notNull(),
	flag_type:  text("flag_type").notNull(),
	origin:     text("origin").notNull(),                      // deterministic | ai
	summary:    text("summary").notNull(),                     // one line, evidence-language compliant
	detail:     text("detail"),
	entry_ids:  text("entry_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
	citations:  text("citations", { mode: "json" }).$type<object[]>().notNull().default([]), // {accession, location}
	period_end: text("period_end"),                            // ISO date the flag attaches to, when period-specific
	created_at: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
	index("ledger_flags_cik_type_idx").on(t.cik, t.flag_type),
])

// Reconciler output, one row per company-quarter. `draft` is the mechanical
// code-built statement; `adjusted` is after applying the AI's adjustment list.
// Both kept — every adjustment cites entry/flag ids.
export const realityStatements = sqliteTable("reality_statements", {
	id:           text("id").primaryKey(),
	cik:          text("cik").notNull(),
	period_end:   text("period_end").notNull(),                // quarter end, ISO date
	fiscal_label: text("fiscal_label").notNull(),              // e.g. "FY2024 Q3" (filer's fiscal calendar)
	currency:     text("currency").notNull(),                  // filing currency; no FX conversion in v1
	draft:        text("draft", { mode: "json" }).$type<object>().notNull(),
	adjusted:     text("adjusted", { mode: "json" }).$type<object>().notNull(),
	adjustments:  text("adjustments", { mode: "json" }).$type<object[]>().notNull().default([]), // {action, amount, entry_ids, flag_ids, rationale}
	narrative:    text("narrative").notNull(),
	created_at:   integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
	uniqueIndex("reality_statements_cik_period_unique").on(t.cik, t.period_end),
])

// Cross-DO run index, mirroring terminal_runs (RealityRunner DO owns the run).
export const realityRuns = sqliteTable("reality_runs", {
	session_id: text("session_id").primaryKey(),
	cik:        text("cik").notNull(),
	status:     text("status").notNull(),   // pending | running | complete | failed | cancelled
	stage:      text("stage").notNull(),    // cataloging | investigating | reconciling | complete
	error:      text("error"),
	created_at: integer("created_at").notNull(),
	updated_at: integer("updated_at").notNull(),
})
