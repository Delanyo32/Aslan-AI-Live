import { json } from "@sveltejs/kit"
import {
	deepSearchEvents,
	supplementarySearchEvents,
	deduplicateEvents,
	rankTickers
} from "$lib/server/exa-events"
import { loadUSEquityUniverse } from "$lib/server/alpaca-market-data"
import type { ExaSearch, EventSpec } from "$lib/types/pipeline"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request }) => {
	let exa_search: ExaSearch
	let event_spec: EventSpec

	try {
		const body = await request.json()
		exa_search = body?.exa_search
		event_spec = body?.event_spec
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 })
	}

	if (!exa_search || !event_spec) {
		return json({ error: "exa_search and event_spec are required" }, { status: 400 })
	}

	// Run deep search and (conditionally) supplementary search concurrently
	let deepResults: Awaited<ReturnType<typeof deepSearchEvents>>
	let suppResults: Awaited<ReturnType<typeof supplementarySearchEvents>>

	try {
		;[deepResults, suppResults] = await Promise.all([
			deepSearchEvents(exa_search),
			exa_search.date_from < "2019-01-01"
				? supplementarySearchEvents(exa_search)
				: Promise.resolve([])
		])
	} catch (e) {
		console.error("[detect-events] Exa search failed:", e)
		return json(
			{ error: "exa_search_failed", detail: e instanceof Error ? e.message : String(e) },
			{ status: 502 }
		)
	}

	const { confirmed, low_confidence } = deduplicateEvents([...deepResults, ...suppResults])
	const universe = await loadUSEquityUniverse()
	const ranked_tickers = rankTickers(confirmed, universe)

	return json({
		raw_events: confirmed,
		low_confidence_events: low_confidence,
		ranked_tickers,
		total_found: confirmed.length + low_confidence.length,
		high_confidence: confirmed.filter(e => e.confidence === "HIGH").length,
		medium_confidence: confirmed.filter(e => e.confidence === "MEDIUM").length,
		low_confidence: low_confidence.length
	})
}
