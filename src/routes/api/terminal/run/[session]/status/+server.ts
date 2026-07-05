// GET /api/terminal/run/[session]/status (WP2.2, §2.8 row 4). Owner-only read
// of the terminal_runs row the DO keeps updated on every stage change.

import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { terminalRuns } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"
import { resolveUserId } from "$lib/server/terminal/runs"

export const GET: RequestHandler = async ({ params, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })
	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })

	const db = createDb(platform.env.DB)
	const [run] = await db
		.select()
		.from(terminalRuns)
		.where(eq(terminalRuns.session_id, params.session))
	if (!run) return json({ error: "not_found" }, { status: 404 })
	if (run.user_id !== userId) return json({ error: "forbidden" }, { status: 403 })
	return json(run)
}
