import type { RequestHandler } from "./$types"
import { logger } from "$lib/server/logger"
import type {
	ResearchEvent,
	ResearchSummary,
	ConfirmedTickerWithDirection,
} from "$lib/types/pipeline"

// POST /api/pipeline/run — starts a Durable Object run keyed by session_id.
// Returns 202 immediately; the DO executes the pipeline across its own alarm
// cycles so the response lifecycle is not tied to the run's wall-clock length.
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	let body: {
		session_id?: string
		query?: string
		research_events?: ResearchEvent[]
		research_summary?: ResearchSummary
		confirmed_tickers?: ConfirmedTickerWithDirection[]
		total_portfolio_value?: number
		is_rerun?: boolean
		source_report_slug?: string
	}
	try {
		body = await request.json()
	} catch {
		return new Response("Invalid JSON", { status: 400 })
	}

	if (!body.session_id) return new Response("session_id required", { status: 400 })
	if (!body.query) return new Response("query required", { status: 400 })
	if (!body.research_events?.length) return new Response("research_events required", { status: 400 })
	if (!body.research_summary) return new Response("research_summary required", { status: 400 })
	if (!body.confirmed_tickers?.length) return new Response("confirmed_tickers required", { status: 400 })

	const ns = platform?.env.PIPELINE_RUNNER
	if (!ns) {
		logger.error("pipeline_runner_binding_missing", {})
		return new Response(JSON.stringify({ error: "server_misconfigured" }), {
			status: 500, headers: { "Content-Type": "application/json" },
		})
	}

	const stub = ns.get(ns.idFromName(body.session_id))
	const doRes = await stub.fetch("https://pipeline-runner/start", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			session_id: body.session_id,
			user_id:    locals.user.id,
			params: {
				query:                 body.query,
				session_id:            body.session_id,
				research_events:       body.research_events,
				research_summary:      body.research_summary,
				confirmed_tickers:     body.confirmed_tickers,
				total_portfolio_value: body.total_portfolio_value ?? 0,
				is_rerun:              body.is_rerun ?? false,
				source_report_slug:    body.source_report_slug,
			},
		}),
	})

	if (!doRes.ok) {
		const text = await doRes.text()
		return new Response(text, {
			status: doRes.status,
			headers: { "Content-Type": doRes.headers.get("content-type") ?? "application/json" },
		})
	}

	return new Response(JSON.stringify({ ok: true, session_id: body.session_id }), {
		status:  202,
		headers: { "Content-Type": "application/json" },
	})
}

// GET /api/pipeline/run?session_id=... — subscribes to the DO's event stream.
// Supports SSE reconnection via Last-Event-ID header (browser native on EventSource)
// so reopening the page or recovering a dropped connection replays missed events.
export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const sessionId = url.searchParams.get("session_id")
	if (!sessionId) return new Response("Missing session_id", { status: 400 })

	const ns = platform?.env.PIPELINE_RUNNER
	if (!ns) {
		logger.error("pipeline_runner_binding_missing", {})
		return new Response(JSON.stringify({ error: "server_misconfigured" }), {
			status: 500, headers: { "Content-Type": "application/json" },
		})
	}

	const stub = ns.get(ns.idFromName(sessionId))
	const lastEventId = request.headers.get("Last-Event-ID") ?? ""

	const doRes = await stub.fetch("https://pipeline-runner/stream", {
		method: "GET",
		headers: {
			"Last-Event-ID": lastEventId,
			"Accept":        "text/event-stream",
		},
	})

	// Return DO's streaming response directly. CF stitches the stream through.
	// The CF ReadableStream<Uint8Array> is runtime-equivalent to the DOM type
	// the Response constructor expects; the cast here is purely a type-system
	// accommodation for the workers-types / lib.dom overlap.
	return new Response(doRes.body as unknown as ReadableStream<Uint8Array>, {
		status:  doRes.status,
		headers: {
			"Content-Type":      "text/event-stream",
			"Cache-Control":     "no-cache",
			"Connection":        "keep-alive",
			"X-Accel-Buffering": "no",
		},
	})
}
