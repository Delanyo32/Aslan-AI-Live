import type { RequestHandler } from "./$types"
import { runResearchAgent } from "$lib/server/exa-events"

const TODAY         = new Date().toISOString().split("T")[0]
const FIVE_YEARS_AGO = `${new Date().getFullYear() - 5}-01-01`

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status:  401,
			headers: { "Content-Type": "application/json" }
		})
	}

	const query     = url.searchParams.get("query")?.trim()
	const date_from = url.searchParams.get("date_from") ?? FIVE_YEARS_AGO
	const date_to   = url.searchParams.get("date_to")   ?? TODAY

	if (!query) {
		return new Response("Missing query parameter", { status: 400 })
	}

	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		async start(controller) {
			function emit(eventType: string, data: object): void {
				try {
					controller.enqueue(
						encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
					)
				} catch {
					// client disconnected
				}
			}

			function log(message: string): void {
				emit("log", { type: "log", timestamp: new Date().toISOString(), message })
			}

			function safeClose(): void {
				try { controller.close() } catch { /* already closed */ }
			}

			try {
				log("Starting event research…")

				const result = await runResearchAgent(query, date_from, date_to, log)

				const conditionMet    = result.events.filter(e => e.condition_met).length
				const conditionFailed = result.events.filter(e => !e.condition_met).length
				log(
					`Research complete — ${result.events.length} event${result.events.length !== 1 ? "s" : ""} found` +
					(conditionFailed > 0
						? `, ${conditionMet} satisfied condition, ${conditionFailed} filtered out`
						: "")
				)

				emit("result", {
					type:                 "result",
					research_events:      result.events,
					low_confidence_events: result.low_confidence_events,
					ranked_tickers:       result.ranked_tickers,
					summary:              result.summary
				})
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e)
				console.error("[research] agent error:", msg)

				if (msg === "research_agent_limit_exceeded") {
					emit("error", { type: "error", message: "research_agent_limit_exceeded" })
				} else {
					emit("error", { type: "error", message: "research_failed", detail: msg })
				}
			} finally {
				safeClose()
			}
		}
	})

	return new Response(stream, {
		headers: {
			"Content-Type":    "text/event-stream",
			"Cache-Control":   "no-cache",
			"Connection":      "keep-alive",
			"X-Accel-Buffering": "no"
		}
	})
}
