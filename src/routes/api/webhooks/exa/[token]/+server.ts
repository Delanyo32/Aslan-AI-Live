// Exa monitor webhook ingest (WP5.2, §2.8). POST only. 403 unless the URL
// token matches EXA_WEBHOOK_TOKEN; payload → company via monitor id lookup in
// companies.monitor_state; raw payload forwarded to that company's
// CompanyMonitor DO /ingest. Returns 200 fast — the DO triages inline today
// and its content_hash dedupe makes Exa retries (on any non-2xx) idempotent.

import { json } from "@sveltejs/kit"
import { env } from "$env/dynamic/private" // read at call time (house rule 1)
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { extractMonitorId, findCompanyByMonitorId, webhookTokenValid } from "$lib/server/terminal/monitoring"
import { logger } from "$lib/server/logger"

export const POST: RequestHandler = async ({ params, request, platform }) => {
	if (!webhookTokenValid(params.token, env.EXA_WEBHOOK_TOKEN)) {
		return json({ error: "forbidden" }, { status: 403 })
	}

	const ns = platform?.env.COMPANY_MONITOR
	if (!ns || !platform?.env.DB) {
		logger.error("exa_webhook_binding_missing", {})
		return json({ error: "server_misconfigured" }, { status: 500 })
	}

	let payload: unknown
	try {
		payload = await request.json()
	} catch {
		// Malformed body will never parse better on retry — ack it away.
		return json({ ignored: true, reason: "invalid_json" })
	}

	// Unknown/stale monitor id → 200 {ignored:true}: Exa retries every non-2xx,
	// and a torn-down monitor's late webhooks must not become a retry storm.
	const monitorId = extractMonitorId(payload)
	const company = monitorId ? await findCompanyByMonitorId(createDb(platform.env.DB), monitorId) : null
	if (!company) {
		logger.info("exa_webhook_ignored", { monitor_id: monitorId })
		return json({ ignored: true })
	}

	const stub = ns.get(ns.idFromName(company.id))
	const doRes = await stub.fetch("https://company-monitor/ingest", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ company_id: company.id, payload })
	})
	// Success → the DO's {ok, ingested, deduped} summary. DO failure → status
	// passthrough so Exa retries; ingest is idempotent via content_hash dedupe.
	return new Response(await doRes.text(), {
		status: doRes.status,
		headers: { "Content-Type": "application/json" }
	})
}
