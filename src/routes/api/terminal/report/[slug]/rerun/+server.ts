// POST /api/terminal/report/[slug]/rerun (WP2.2, §2.8 row 5). Owner-only; new
// run for the same company priced at CREDITS_RERUN (isRerun → terminalCreditCost).

import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { companies } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"
import { getTerminalReportBySlug } from "$lib/server/db/terminal-reports"
import { resolveUserId, startTerminalRun } from "$lib/server/terminal/runs"

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })

	const ns = platform?.env.TERMINAL_REPORT_RUNNER
	if (!ns || !platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })
	const db = createDb(platform.env.DB)

	const report = await getTerminalReportBySlug(db, params.slug)
	if (!report) return json({ error: "not_found" }, { status: 404 })
	if (report.user_id !== userId) return json({ error: "forbidden" }, { status: 403 })

	// Full company row — the DO /start payload needs more than the joined identity.
	const [company] = await db.select().from(companies).where(eq(companies.id, report.company_id))
	if (!company) return json({ error: "company_not_found" }, { status: 404 })

	return startTerminalRun(db, ns, { userId, company, isRerun: true })
}
