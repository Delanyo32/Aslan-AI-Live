import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { backtestReports, emailCaptures } from "$lib/server/db/schema"
import { eq, and } from "drizzle-orm"

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 })
	}

	const { email, slug } = body as { email?: string; slug?: string }

	if (!email || !slug) {
		return json({ error: "email and slug are required" }, { status: 400 })
	}

	const { db } = locals

	// Persist email capture (best-effort — never block access on DB failure)
	try {
		const [report] = await db
			.select({ id: backtestReports.id })
			.from(backtestReports)
			.where(
				and(
					eq(backtestReports.slug, slug),
					eq(backtestReports.is_public, true)
				)
			)

		if (report) {
			await db.insert(emailCaptures).values({ id: crypto.randomUUID(), email, report_id: report.id })
		}
	} catch (e) {
		console.error("[email-capture] DB error (non-fatal):", e)
	}

	// Set access cookie so +page.server.ts grants full report on next load
	cookies.set(`report_access_${slug}`, "1", {
		path:     "/",
		maxAge:   60 * 60 * 24 * 365, // 1 year
		httpOnly: true,
		sameSite: "lax"
	})

	return json({ ok: true })
}
