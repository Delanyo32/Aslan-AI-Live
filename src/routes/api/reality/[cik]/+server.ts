// GET /api/reality/[cik] — the Reality Ledger read model, one JSON blob:
// quarterly statements (draft + adjusted + adjustments), flags, and entries.
// Open read in v1: everything here derives from public SEC filings and carries
// no user data; the scratch HTML page consumes it directly.

import { json } from "@sveltejs/kit"
import { asc, eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { ledgerEntries, ledgerFlags, realityStatements, secCompanies } from "$lib/server/db/schema"
import { forwardSchedule } from "$lib/server/reality/reconciler"

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })
	if (!/^\d{10}$/.test(params.cik)) return json({ error: "invalid_cik" }, { status: 400 })
	const db = createDb(platform.env.DB)

	const [company] = await db.select().from(secCompanies).where(eq(secCompanies.cik, params.cik))
	const [statements, flags, entries] = await Promise.all([
		db.select().from(realityStatements).where(eq(realityStatements.cik, params.cik)).orderBy(asc(realityStatements.period_end)),
		db.select().from(ledgerFlags).where(eq(ledgerFlags.cik, params.cik)),
		db.select().from(ledgerEntries).where(eq(ledgerEntries.cik, params.cik)).orderBy(asc(ledgerEntries.period_end))
	])

	return json({
		company: company ?? null,
		statements,
		flags,
		entries,
		// The wall of obligations ahead, grouped by due calendar quarter (code-only
		// view over due-dated entries; nothing spread or invented).
		forward_schedule: forwardSchedule(entries)
	})
}
