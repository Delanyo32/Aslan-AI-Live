// Reality Ledger run routes (PLAN Phase 7). Token-guarded with the same
// x-sec-token as /api/sec/sync — this pipeline spends real LLM+SEC money and
// is operator-only in v1 (no user surface yet).
//
// POST ?symbol=SMCI  → resolve via sec_companies, start the RealityRunner DO
//                      (one instance per CIK), 202 {session_id, cik}.
// GET  ?cik=…        → SSE proxy to the DO's /stream (Last-Event-ID passthrough).
// DELETE ?cik=…      → proxy the DO's /cancel.

import { json } from "@sveltejs/kit"
import { eq } from "drizzle-orm"
import { env } from "$env/dynamic/private" // read at call time (house rule 1)
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { secCompanies } from "$lib/server/db/schema"
import { webhookTokenValid } from "$lib/server/terminal/monitoring"
import { logger } from "$lib/server/logger"

const authorized = (request: Request): boolean =>
	webhookTokenValid(request.headers.get("x-sec-token") ?? undefined, env.SEC_SYNC_TOKEN)

export const POST: RequestHandler = async ({ url, request, platform }) => {
	if (!authorized(request)) return json({ error: "forbidden" }, { status: 403 })

	const symbol = url.searchParams.get("symbol")?.trim().toUpperCase()
	if (!symbol) return json({ error: "symbol required" }, { status: 400 })

	const ns = platform?.env.REALITY_RUNNER
	if (!ns || !platform?.env.DB || !platform?.env.SEC_R2) {
		logger.error("reality_runner_binding_missing", {})
		return json({ error: "server_misconfigured" }, { status: 500 })
	}

	const db = createDb(platform.env.DB)
	const [company] = await db.select().from(secCompanies).where(eq(secCompanies.ticker, symbol))
	if (!company) {
		return json({ error: "unknown_symbol", hint: "sync filings first: POST /api/sec/sync?symbol=…" }, { status: 404 })
	}

	const session_id = crypto.randomUUID()
	const stub = ns.get(ns.idFromName(company.cik))
	// ?recatalog wipes the company's ai rows + catalog checkpoint so changed
	// cataloger prompts re-extract from scratch (expensive: full LLM re-pass).
	const recatalog = url.searchParams.get("recatalog") !== null
	const doRes = await stub.fetch("https://reality-runner/start", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ session_id, cik: company.cik, recatalog })
	})
	if (!doRes.ok) {
		return new Response(await doRes.text(), { status: doRes.status, headers: { "Content-Type": "application/json" } })
	}
	return json({ session_id, cik: company.cik, ticker: company.ticker }, { status: 202 })
}

export const GET: RequestHandler = async ({ url, request, platform }) => {
	if (!authorized(request)) return json({ error: "forbidden" }, { status: 403 })
	const cik = url.searchParams.get("cik")
	if (!cik) return new Response("Missing cik", { status: 400 })
	const ns = platform?.env.REALITY_RUNNER
	if (!ns) return json({ error: "server_misconfigured" }, { status: 500 })

	const stub = ns.get(ns.idFromName(cik))
	const path = url.searchParams.get("status") !== null ? "/status" : "/stream"
	const headers = new Headers()
	const lastEventId = request.headers.get("Last-Event-ID")
	if (lastEventId) headers.set("Last-Event-ID", lastEventId)
	const doRes = await stub.fetch(`https://reality-runner${path}`, { headers })
	// Workers-vs-DOM ReadableStream nominal mismatch; same runtime object (house
	// pattern from api/terminal/run).
	return new Response(doRes.body as unknown as ReadableStream<Uint8Array>, {
		status: doRes.status,
		headers: doRes.headers as unknown as Headers
	})
}

export const DELETE: RequestHandler = async ({ url, request, platform }) => {
	if (!authorized(request)) return json({ error: "forbidden" }, { status: 403 })
	const cik = url.searchParams.get("cik")
	if (!cik) return new Response("Missing cik", { status: 400 })
	const ns = platform?.env.REALITY_RUNNER
	if (!ns) return json({ error: "server_misconfigured" }, { status: 500 })
	const stub = ns.get(ns.idFromName(cik))
	const doRes = await stub.fetch("https://reality-runner/cancel", { method: "POST" })
	return new Response(await doRes.text(), { status: doRes.status, headers: { "Content-Type": "application/json" } })
}
