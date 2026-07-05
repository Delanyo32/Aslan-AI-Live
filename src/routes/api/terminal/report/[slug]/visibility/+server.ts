// POST /api/terminal/report/[slug]/visibility (WP2.2, §2.8 row 6). Owner-only
// is_public toggle — mirrors api/reports/[slug]/visibility for terminal_reports.

import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { terminalReports } from "$lib/server/db/schema"
import { and, eq } from "drizzle-orm"
import { getTerminalReportBySlug } from "$lib/server/db/terminal-reports"
import { resolveUserId } from "$lib/server/terminal/runs"

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthenticated" }, { status: 401 })

	let body: { is_public?: unknown }
	try {
		body = await request.json()
	} catch {
		return json({ error: "invalid_body" }, { status: 400 })
	}
	if (typeof body.is_public !== "boolean") return json({ error: "invalid_body" }, { status: 400 })

	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })
	const db = createDb(platform.env.DB)

	const report = await getTerminalReportBySlug(db, params.slug)
	if (!report) return json({ error: "not_found" }, { status: 404 })
	if (report.user_id !== userId) return json({ error: "forbidden" }, { status: 403 })

	await db
		.update(terminalReports)
		.set({ is_public: body.is_public, updated_at: new Date() })
		.where(and(eq(terminalReports.slug, params.slug), eq(terminalReports.user_id, userId)))
	return json({ ok: true, is_public: body.is_public })
}
