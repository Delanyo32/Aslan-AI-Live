// Alerts routes (WP5.2, §2.8 row 9). GET: the authed user's alerts,
// newest-first, optional ?unread=1 filter, capped at 50. POST {ids, read:true}:
// owner-scoped mark-read (rows belonging to other users are silently skipped).

import { json } from "@sveltejs/kit"
import { and, desc, eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { terminalAlerts } from "$lib/server/db/schema"
import { resolveUserId } from "$lib/server/terminal/runs"
import { markAlertsRead } from "$lib/server/terminal/monitoring"

export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })
	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })

	const unreadOnly = url.searchParams.get("unread") === "1"
	const owner = eq(terminalAlerts.user_id, userId)
	const alerts = await createDb(platform.env.DB)
		.select()
		.from(terminalAlerts)
		.where(unreadOnly ? and(owner, eq(terminalAlerts.read, false)) : owner)
		.orderBy(desc(terminalAlerts.created_at))
		.limit(50)
	return json({ alerts })
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })
	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })

	let body: { ids?: unknown; read?: unknown }
	try {
		body = await request.json()
	} catch {
		return json({ error: "invalid_body" }, { status: 400 })
	}
	const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string") : []
	if (ids.length === 0 || body.read !== true) {
		return json({ error: "ids_and_read_true_required" }, { status: 400 })
	}

	const updated = await markAlertsRead(createDb(platform.env.DB), userId, ids)
	return json({ ok: true, updated })
}
