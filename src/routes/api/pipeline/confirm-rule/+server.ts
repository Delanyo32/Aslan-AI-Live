import { json } from "@sveltejs/kit"
import { logger } from "$lib/server/logger"
import type { EntryExitRule } from "$lib/types/pipeline"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		return json({ error: "unauthenticated" }, { status: 401 })
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 })
	}

	const b = body as Record<string, unknown>
	if (!b.session_id || typeof b.session_id !== "string") {
		return json({ error: "session_id is required" }, { status: 400 })
	}
	if (!b.rule || typeof b.rule !== "object") {
		return json({ error: "rule is required" }, { status: 400 })
	}

	const rule = b.rule as EntryExitRule
	const validEntry = ["event_day", "next_day", "two_days_after"]
	const validExit  = ["peak_car_date", "impact_end", "fixed_5_days"]
	const validDir   = ["long", "short"]

	if (!validEntry.includes(rule.entry)) {
		return json({ error: `rule.entry must be one of: ${validEntry.join(", ")}` }, { status: 400 })
	}
	if (!validExit.includes(rule.exit)) {
		return json({ error: `rule.exit must be one of: ${validExit.join(", ")}` }, { status: 400 })
	}
	if (!validDir.includes(rule.direction)) {
		return json({ error: 'rule.direction must be "long" or "short"' }, { status: 400 })
	}
	if (typeof rule.position_size !== "number" || rule.position_size <= 0) {
		return json({ error: "rule.position_size must be a positive number" }, { status: 400 })
	}

	const ns = platform?.env.PIPELINE_RUNNER
	if (!ns) {
		logger.error("pipeline_runner_binding_missing", {})
		return json({ error: "server_misconfigured" }, { status: 500 })
	}

	const stub = ns.get(ns.idFromName(b.session_id))
	const doRes = await stub.fetch("https://pipeline-runner/rule", {
		method:  "POST",
		headers: { "Content-Type": "application/json" },
		body:    JSON.stringify({ user_id: locals.user.id, rule }),
	})

	if (!doRes.ok) {
		const text = await doRes.text()
		if (doRes.status === 404) return json({ error: "session_not_found_or_expired" }, { status: 404 })
		return new Response(text, {
			status:  doRes.status,
			headers: { "Content-Type": doRes.headers.get("content-type") ?? "application/json" },
		})
	}

	return json({ ok: true })
}
