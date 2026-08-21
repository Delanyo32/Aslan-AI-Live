// POST /api/sec/sync?symbol=AAPL[&since=2020-01-01][&limit=5] — download a
// company's SEC filings into R2 and record them in D1. Not wired into the app;
// you curl it.
//
// `since` is a floor on filing date, default DEFAULT_SINCE (2020-01-01). Pass an
// earlier date to reach further back; SEC has filings to 1994.
//
// Token-guarded because an open endpoint here is an open R2 bill: one call is
// ~1,200 SEC fetches and ~250 MB of writes.
//
// Streams NDJSON-ish progress lines while it runs (a full backfill is ~2 min),
// then a final JSON summary. Use `curl -N` to see lines as they arrive.

import { json } from "@sveltejs/kit"
import { env } from "$env/dynamic/private" // read at call time (house rule 1)
import type { RequestHandler } from "./$types"
import type { R2Bucket } from "@cloudflare/workers-types"
import { createDb } from "$lib/server/db/client"
import { webhookTokenValid } from "$lib/server/terminal/monitoring"
import { syncSymbol, isIsoDate, DEFAULT_SINCE } from "$lib/server/sec"
import { logger } from "$lib/server/logger"

export const POST: RequestHandler = async ({ url, request, platform }) => {
	if (!webhookTokenValid(request.headers.get("x-sec-token") ?? undefined, env.SEC_SYNC_TOKEN)) {
		return json({ error: "forbidden" }, { status: 403 })
	}

	const symbol = url.searchParams.get("symbol")?.trim()
	if (!symbol) return json({ error: "symbol required" }, { status: 400 })

	// Rejected up front rather than defaulted: a silently-ignored typo would pull
	// every filing back to 1994 instead of the window the caller meant.
	const since = url.searchParams.get("since")?.trim() || DEFAULT_SINCE
	if (!isIsoDate(since)) return json({ error: `since must be YYYY-MM-DD, got: ${since}` }, { status: 400 })

	const r2 = platform?.env.SEC_R2 as R2Bucket | undefined
	const userAgent = env.SEC_USER_AGENT // hoisted: $env/dynamic is a proxy, so guards don't narrow it
	if (!r2 || !platform?.env.DB || !userAgent) {
		logger.error("sec_sync_binding_missing", { r2: !!r2, db: !!platform?.env.DB, ua: !!userAgent })
		return json({ error: "server_misconfigured" }, { status: 500 })
	}

	const limit = Number(url.searchParams.get("limit")) || undefined
	const db = createDb(platform.env.DB)

	// Reader gone (Ctrl-C, `| head`) → abort, so we stop fetching from SEC instead
	// of running the whole backfill with nobody listening.
	const abort = new AbortController()

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder()
			// enqueue() throws once the reader is gone; that throw is the disconnect
			// signal. Swallowing it here also keeps it out of the per-filing catch,
			// which would otherwise book a successful filing as a failure too.
			const say = (line: string) => {
				try {
					controller.enqueue(enc.encode(line + "\n"))
				} catch {
					abort.abort()
				}
			}
			try {
				const summary = await syncSymbol({
					symbol, db, r2, userAgent, since, limit, onProgress: say, signal: abort.signal,
				})
				logger.info("sec_sync_done", { ...summary })
				say(JSON.stringify(summary))
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				logger.error("sec_sync_failed", { symbol, message })
				say(JSON.stringify({ error: message }))
			}
			try {
				controller.close()
			} catch {
				// Already closed by the disconnect — nothing to do.
			}
		},
		cancel() {
			abort.abort()
		},
	})

	return new Response(stream, {
		headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
	})
}
