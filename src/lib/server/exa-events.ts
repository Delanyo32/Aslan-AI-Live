import Exa from "exa-js"
import { env } from "$env/dynamic/private"
import type { ExaSearch, EventSpec, RawExaEvent, RankedTicker, EventOccurrence } from "$lib/types/pipeline"
import type { AssetUniverse } from "./alpaca-market-data"

function getExa() { return new Exa(env.EXA_API_KEY) }

const TICKER_BLOCKLIST = new Set([
	"IT", "US", "AI", "CEO", "IPO", "GDP", "FED", "SEC", "DOJ",
	"API", "EU", "UK", "UN", "IMF", "WHO", "WTO", "ETF", "ESG",
	"EPS", "PE", "VC", "NY", "DC", "LA", "PR", "IR"
])

function scanTickers(text: string): string[] {
	return [...text.matchAll(/\b[A-Z]{2,5}\b/g)].map(m => m[0])
}

// --- deepSearchEvents ---
// Primary search — covers full date range with structured output via outputSchema.

export async function deepSearchEvents(
	exaSearch: ExaSearch,
	numResults = 30
): Promise<RawExaEvent[]> {
	const response = await getExa().search(exaSearch.primary_query, {
		type: "deep",
		category: "news",
		numResults,
		startPublishedDate: exaSearch.date_from,
		endPublishedDate: exaSearch.date_to,
		additionalQueries: exaSearch.additional_queries,
		outputSchema: {
			type: "object",
			properties: {
				events: {
					type: "array",
					items: {
						type: "object",
						properties: {
							event_date: { type: "string" },
							description: { type: "string" },
							tickers_mentioned: { type: "array", items: { type: "string" } },
							confidence: { type: "string" }
						}
					}
				}
			}
		},
		contents: {
			highlights: { maxCharacters: 2000 }
		}
	})

	// Primary path: use structured output when outputSchema succeeded
	const outputContent = response.output?.content
	if (outputContent) {
		try {
			const parsed =
				typeof outputContent === "string" ? JSON.parse(outputContent) : outputContent
			const events: unknown[] =
				((parsed as Record<string, unknown>).events as unknown[]) ?? []

			// Flatten all citations across grounding entries, deduplicate by URL
			const seenUrls = new Set<string>()
			const sources = (response.output?.grounding ?? [])
				.flatMap(g => g.citations.map(c => ({ url: c.url, title: c.title, highlight: null as null })))
				.filter(s => {
					if (seenUrls.has(s.url)) return false
					seenUrls.add(s.url)
					return true
				})

			return events.map((e): RawExaEvent => {
				const ev = e as Record<string, unknown>
				return {
					event_date: String(ev.event_date ?? ""),
					description: String(ev.description ?? ""),
					tickers_mentioned: Array.isArray(ev.tickers_mentioned)
						? (ev.tickers_mentioned as unknown[]).map(String)
						: [],
					confidence: (["HIGH", "MEDIUM", "LOW"].includes(String(ev.confidence))
						? String(ev.confidence)
						: "MEDIUM") as RawExaEvent["confidence"],
					sources
				}
			})
		} catch {
			// fall through to per-result fallback
		}
	}

	// Fallback: parse from individual search results
	return response.results.map((result): RawExaEvent => ({
		event_date: result.publishedDate ?? "",
		description: result.title ?? "",
		confidence: "MEDIUM",
		tickers_mentioned: scanTickers(result.highlights?.[0] ?? ""),
		sources: [
			{
				url: result.url,
				title: result.title ?? "",
				highlight: result.highlights?.[0] ?? null
			}
		]
	}))
}

// --- supplementarySearchEvents ---
// Catches older events (pre-2019) where deep search has lower recall.
// Skipped entirely when date_from >= 2019-01-01.

export async function supplementarySearchEvents(
	exaSearch: ExaSearch
): Promise<RawExaEvent[]> {
	if (exaSearch.date_from >= "2019-01-01") return []

	const response = await getExa().search(exaSearch.primary_query, {
		type: "auto",
		category: "news",
		numResults: 20,
		startPublishedDate: exaSearch.date_from,
		endPublishedDate: "2019-01-01",
		contents: {
			highlights: { maxCharacters: 1500 },
			summary: {
				query: "What US-listed stock ticker symbols are directly affected by this event?"
			}
		}
	})

	return response.results.map((result): RawExaEvent => ({
		event_date: result.publishedDate ?? "",
		description: result.title ?? "",
		confidence: "MEDIUM",
		tickers_mentioned: scanTickers(
			(result.summary ?? "") + " " + (result.highlights?.[0] ?? "")
		),
		sources: [
			{
				url: result.url,
				title: result.title ?? "",
				highlight: result.highlights?.[0] ?? null
			}
		]
	}))
}

// --- deduplicateEvents ---
// Groups events whose event_date values fall within 3 calendar days of each other.
// Keeps earliest date, highest-confidence description, merged sources and tickers.

const CONFIDENCE_RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const

export function deduplicateEvents(
	events: RawExaEvent[]
): { confirmed: RawExaEvent[]; low_confidence: RawExaEvent[] } {
	if (events.length === 0) return { confirmed: [], low_confidence: [] }

	const sorted = [...events].sort((a, b) => a.event_date.localeCompare(b.event_date))

	const clusters: RawExaEvent[][] = []
	let currentCluster: RawExaEvent[] = [sorted[0]]

	for (let i = 1; i < sorted.length; i++) {
		const event = sorted[i]
		const clusterStart = new Date(currentCluster[0].event_date).getTime()
		const eventTime = new Date(event.event_date).getTime()
		const daysDiff = Math.abs(eventTime - clusterStart) / 86_400_000

		if (daysDiff <= 3) {
			currentCluster.push(event)
		} else {
			clusters.push(currentCluster)
			currentCluster = [event]
		}
	}
	clusters.push(currentCluster)

	const deduped = clusters.map(cluster => {
		const earliest = cluster[0]
		const highestConf = cluster.reduce((best, e) =>
			CONFIDENCE_RANK[e.confidence] > CONFIDENCE_RANK[best.confidence] ? e : best
		)

		const seenUrls = new Set<string>()
		const mergedSources = cluster
			.flatMap(e => e.sources)
			.filter(s => {
				if (seenUrls.has(s.url)) return false
				seenUrls.add(s.url)
				return true
			})

		const seenTickers = new Set<string>()
		const mergedTickers = cluster
			.flatMap(e => e.tickers_mentioned)
			.filter(t => {
				if (seenTickers.has(t)) return false
				seenTickers.add(t)
				return true
			})

		return {
			event_date: earliest.event_date,
			description: highestConf.description,
			confidence: highestConf.confidence,
			tickers_mentioned: mergedTickers,
			sources: mergedSources
		}
	})

	const confirmed      = deduped.filter(e => e.confidence !== "LOW")
	const low_confidence = deduped.filter(e => e.confidence === "LOW")
	return { confirmed, low_confidence }
}

// --- rankTickers ---
// Counts per-event ticker mentions, filters blocklist + singletons, caps at 10.

export function rankTickers(events: RawExaEvent[], universe?: AssetUniverse | null): RankedTicker[] {
	const tickerCounts = new Map<string, number>()
	const hasUniverse = universe && universe.symbols.size > 0

	for (const event of events) {
		// Count each ticker at most once per event
		for (const ticker of new Set(event.tickers_mentioned)) {
			if (ticker.length < 2) continue
			if (TICKER_BLOCKLIST.has(ticker)) continue
			if (hasUniverse && !universe.symbols.has(ticker)) continue
			tickerCounts.set(ticker, (tickerCounts.get(ticker) ?? 0) + 1)
		}
	}

	const totalEvents = events.length

	const entries = Array.from(tickerCounts.entries()).sort(([, a], [, b]) => b - a)

	// Prefer tickers mentioned in more than one event; fall back to all tickers
	// (including singletons) when no multi-event tickers exist — this prevents
	// empty results for queries about a single company (e.g. "Oracle earnings").
	const multiEvent = entries.filter(([, count]) => count > 1)
	const filtered   = multiEvent.length > 0 ? multiEvent : entries

	return filtered
		.slice(0, 10)
		.map(([symbol, event_count]) => ({
			symbol,
			name: universe?.names.get(symbol),
			event_count,
			total_events: totalEvents
		}))
}

// --- searchEventsForTicker ---
// Targeted per-ticker search: prepends company name to the primary query so Exa
// returns articles that specifically cover this ticker's reaction to the event.
// Called after the user confirms tickers in the new flow.

export async function searchEventsForTicker(
	ticker: string,
	companyName: string,
	eventSpec: EventSpec,
	exaSearch: ExaSearch
): Promise<RawExaEvent[]> {
	const namePrefix = companyName ? `${companyName}: ` : `${ticker}: `
	const tickerSearch: ExaSearch = {
		...exaSearch,
		primary_query: `${namePrefix}${eventSpec.event_description}`,
		additional_queries: exaSearch.additional_queries.map(q => `${namePrefix}${q}`)
	}

	const events = await deepSearchEvents(tickerSearch, 20)

	// Deduplicate and return only events that mention this ticker or company name
	const { confirmed } = deduplicateEvents(events)

	// Filter: keep events where ticker is mentioned, OR keep all if none match
	// (the company-name query is already specific enough)
	const withTicker = confirmed.filter(e =>
		e.tickers_mentioned.includes(ticker) ||
		e.description.toUpperCase().includes(ticker)
	)
	return withTicker.length > 0 ? withTicker : confirmed
}

// --- buildEventOccurrences ---
// Filters tickers_mentioned to only those the user confirmed.
// Called in Step 9 after ticker confirmation — not in the detect-events endpoint.

export function buildEventOccurrences(
	events: RawExaEvent[],
	confirmedTickers: string[]
): EventOccurrence[] {
	const confirmed = new Set(confirmedTickers)
	return events
		.map(e => ({
			event_date: e.event_date,
			description: e.description,
			confidence: e.confidence,
			tickers: e.tickers_mentioned.filter(t => confirmed.has(t)),
			sources: e.sources
		}))
		.filter(e => e.tickers.length > 0)
}
