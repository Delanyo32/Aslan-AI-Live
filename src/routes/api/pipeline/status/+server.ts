import { json } from "@sveltejs/kit"
import { logger } from "$lib/server/logger"
import type { RequestHandler } from "./$types"

// GET /api/pipeline/status?session_id=... — lightweight lookup against the
// Durable Object holding the run. Used by the client to decide whether to
// resume an in-flight run (e.g. after reload) or route to the completed report.
export const GET: RequestHandler = async ({ url, locals, platform }) => {
	if (!locals.user) {
		return json({ error: "unauthorized" }, { status: 401 })
	}

	const sessionId = url.searchParams.get("session_id")
	if (!sessionId) return json({ error: "session_id required" }, { status: 400 })

	const ns = platform?.env.PIPELINE_RUNNER
	if (!ns) {
		logger.error("pipeline_runner_binding_missing", {})
		return json({ error: "server_misconfigured" }, { status: 500 })
	}

	const stub = ns.get(ns.idFromName(sessionId))
	const doRes = await stub.fetch("https://pipeline-runner/status", { method: "GET" })

	if (!doRes.ok) {
		return new Response(await doRes.text(), {
			status:  doRes.status,
			headers: { "Content-Type": doRes.headers.get("content-type") ?? "application/json" },
		})
	}

	const data = (await doRes.json()) as { user_id: string | null }
	if (data.user_id && data.user_id !== locals.user.id) {
		return json({ error: "forbidden" }, { status: 403 })
	}

	return json(data)
}
