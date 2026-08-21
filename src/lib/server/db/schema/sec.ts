// SEC EDGAR filing archive — standalone tables, keyed on CIK. Deliberately not
// joined to `companies` (terminal.ts): the sync worker has no Exa entity to
// build one from. Link later by adding a `cik` column there; nothing here moves.
// House style: snake_case columns, integer(mode:"timestamp") Unix seconds.

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"

export const secCompanies = sqliteTable("sec_companies", {
	// Zero-padded 10-digit CIK, e.g. "0000320193" — matches data.sec.gov paths.
	// CIK is stable across ticker changes (FB→META kept CIK 1326801), so it is
	// the key everywhere; `ticker` is a label, not an identity.
	cik:            text("cik").primaryKey(),
	ticker:         text("ticker").notNull(),
	name:           text("name").notNull(),
	last_synced_at: integer("last_synced_at", { mode: "timestamp" }),
})

export const secFilings = sqliteTable("sec_filings", {
	// Row exists ⇔ every document for this filing is in R2. Written last, so a
	// crashed run leaves no row and the next run re-downloads that filing.
	accession:        text("accession").primaryKey(),        // "0000320193-26-000018"
	cik:              text("cik").notNull(),
	form:             text("form").notNull(),                // "10-K", "8-K", …
	filing_date:      text("filing_date").notNull(),         // "2026-07-30" (ISO date)
	report_date:      text("report_date"),                   // period covered; often "" pre-2001
	primary_document: text("primary_document"),              // "" for 1990s filings
	r2_prefix:        text("r2_prefix").notNull(),           // "sec/0000320193/0000320193-26-000018/"
	doc_count:        integer("doc_count").notNull(),
	bytes:            integer("bytes").notNull(),
	downloaded_at:    integer("downloaded_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
	index("sec_filings_cik_form_date").on(t.cik, t.form, t.filing_date),
])
