import { json } from "@sveltejs/kit"
import { backtestReports } from "$lib/server/db/schema"
import { eq, and } from "drizzle-orm"
import { getReportBySlugUnfiltered } from "$lib/server/db/reports"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) return json({ error: "unauthenticated" }, { status: 401 })

	let body: { is_public?: unknown }
	try {
		body = await request.json()
	} catch {
		return json({ error: "invalid_body" }, { status: 400 })
	}

	if (typeof body.is_public !== "boolean") {
		return json({ error: "invalid_body" }, { status: 400 })
	}

	const { db } = locals
	const report = await getReportBySlugUnfiltered(db, params.slug)
	if (!report) return json({ error: "not_found" }, { status: 404 })
	if (report.user_id !== locals.user.id) return json({ error: "forbidden" }, { status: 403 })

	try {
		await db
			.update(backtestReports)
			.set({ is_public: body.is_public, updated_at: new Date() })
			.where(and(eq(backtestReports.slug, params.slug), eq(backtestReports.user_id, locals.user.id)))
		return json({ ok: true, is_public: body.is_public })
	} catch (err) {
		console.error("[visibility report]", err)
		return json({ error: "update_failed" }, { status: 500 })
	}
}
