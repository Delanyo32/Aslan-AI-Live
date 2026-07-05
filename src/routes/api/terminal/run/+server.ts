// Terminal run routes (WP2.2, §2.8 rows 2–3 + cancel).
//
// POST { company_id } → auth, load company, credit pre-check, create
//         terminal_runs row, start the TerminalReportRunner DO, 202 {session_id}.
//         Companies come from POST /api/terminal/resolve (candidates + confirm).
// GET ?session_id= → SSE proxy to the DO's /stream (Last-Event-ID passthrough),
//         copied from api/pipeline/run/+server.ts. Unchanged from WP2.1.
// DELETE ?session_id= → proxy the DO's /cancel. Unchanged from WP2.1.

import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { logger } from "$lib/server/logger"
import { createDb } from "$lib/server/db/client"
import { companies } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"
import { resolveUserId, startTerminalRun } from "$lib/server/terminal/runs"

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })

	let body: { company_id?: unknown }
	try {
		body = await request.json()
	} catch {
		return json({ error: "invalid_body" }, { status: 400 })
	}
	if (typeof body.company_id !== "string" || !body.company_id) {
		return json({ error: "company_id_required" }, { status: 400 })
	}

	const ns = platform?.env.TERMINAL_REPORT_RUNNER
	if (!ns || !platform?.env.DB) {
		logger.error("terminal_report_runner_binding_missing", {})
		return json({ error: "server_misconfigured" }, { status: 500 })
	}
	const db = createDb(platform.env.DB)

	const [company] = await db.select().from(companies).where(eq(companies.id, body.company_id))
	if (!company) return json({ error: "company_not_found" }, { status: 404 })

	return startTerminalRun(db, ns, { userId, company, isRerun: false })
}

// DELETE /api/terminal/run?session_id=… — proxy the DO's /cancel.
export const DELETE: RequestHandler = async ({ url, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" }
		})
	}
	const sessionId = url.searchParams.get("session_id")
	if (!sessionId) return new Response("Missing session_id", { status: 400 })
	const ns = platform?.env.TERMINAL_REPORT_RUNNER
	if (!ns) return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500 })
	const stub = ns.get(ns.idFromName(sessionId))
	const doRes = await stub.fetch("https://terminal-report-runner/cancel", { method: "POST" })
	return new Response(await doRes.text(), {
		status: doRes.status,
		headers: { "Content-Type": "application/json" }
	})
}

// GET /api/terminal/run?session_id=… — SSE proxy to the DO stream, Last-Event-ID
// passthrough. Copied from api/pipeline/run/+server.ts.
export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" }
		})
	}

	const sessionId = url.searchParams.get("session_id")
	if (!sessionId) return new Response("Missing session_id", { status: 400 })

	const ns = platform?.env.TERMINAL_REPORT_RUNNER
	if (!ns) {
		logger.error("terminal_report_runner_binding_missing", {})
		return new Response(JSON.stringify({ error: "server_misconfigured" }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		})
	}

	const stub = ns.get(ns.idFromName(sessionId))
	const lastEventId = request.headers.get("Last-Event-ID") ?? ""

	const doRes = await stub.fetch("https://terminal-report-runner/stream", {
		method: "GET",
		headers: { "Last-Event-ID": lastEventId, Accept: "text/event-stream" }
	})

	return new Response(doRes.body as unknown as ReadableStream<Uint8Array>, {
		status: doRes.status,
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no"
		}
	})
}
