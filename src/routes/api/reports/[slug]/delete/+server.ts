import { json } from "@sveltejs/kit"
import { backtestReports } from "$lib/server/db/schema"
import { eq, and, isNull, or } from "drizzle-orm"
import { getReportBySlug } from "$lib/server/db/reports"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: "unauthenticated" }, { status: 401 })

	const { db } = locals
	const report = await getReportBySlug(db, params.slug)
	if (!report) return json({ error: "not_found" }, { status: 404 })
	const isOwner = report.user_id === locals.user.id || report.user_id === null
	if (!isOwner) return json({ error: "forbidden" }, { status: 403 })

	try {
		await db
			.update(backtestReports)
			.set({ is_public: false, updated_at: new Date() })
			.where(and(
				eq(backtestReports.slug, params.slug),
				or(eq(backtestReports.user_id, locals.user.id), isNull(backtestReports.user_id))
			))
		return json({ ok: true })
	} catch (err) {
		console.error("[delete report]", err)
		return json({ error: "delete_failed" }, { status: 500 })
	}
}
