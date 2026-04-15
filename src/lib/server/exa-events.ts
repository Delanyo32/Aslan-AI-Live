import Exa from "exa-js"
import { env } from "$env/dynamic/private"
import { Type, complete, validateToolCall, type Tool, type Context, type ToolCall } from "@mariozechner/pi-ai"
import { model } from "./ai"
import type { ExaSearch, EventSpec, RawExaEvent, RankedTicker, EventOccurrence, ResearchEvent, ResearchSummary } from "$lib/types/pipeline"
import type { AssetUniverse } from "./alpaca-market-data"
import { loadUSEquityUniverse } from "./alpaca-market-data"

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

// --- runResearchAgent ---
// Agentic research loop: LLM orchestrates Exa searches (up to MAX_SEARCHES) using
// tool calls, then calls submit_findings with structured event + condition results.
// Replaces the old understand → detect-events two-step flow.

const ResearchFindingsSchema = Type.Object({
	events: Type.Array(Type.Object({
		event_date:           Type.String({ description: "ISO date YYYY-MM-DD when the event occurred" }),
		description:          Type.String({ description: "Brief description of what happened" }),
		tickers_mentioned:    Type.Array(Type.String(), { description: "Relevant stock ticker symbols" }),
		confidence:           Type.String({ description: "HIGH, MEDIUM, or LOW — how confident you are the event occurred" }),
		condition_met:        Type.Boolean({ description: "Whether the condition in the hypothesis was satisfied" }),
		condition_evidence:   Type.String({ description: "One-line summary of the key evidence for/against the condition" }),
		condition_confidence: Type.String({ description: "HIGH, MEDIUM, or LOW — confidence in the condition evaluation" }),
		sources: Type.Array(Type.Object({
			url:   Type.String(),
			title: Type.String()
		}))
	})),
	event_type:        Type.String({ description: "Short label e.g. 'MKBHD iPhone review' or 'Fed rate cut'" }),
	event_description: Type.String({ description: "1-2 sentence description of the event type" }),
	direction_hint:    Type.String({ description: "Expected price direction: long, short, neutral, or unknown" })
})

type ResearchFindings = {
	events: {
		event_date: string
		description: string
		tickers_mentioned: string[]
		confidence: string
		condition_met: boolean
		condition_evidence: string
		condition_confidence: string
		sources: { url: string; title: string }[]
	}[]
	event_type: string
	event_description: string
	direction_hint: string
}

export async function runResearchAgent(
	query: string,
	dateFrom: string,
	dateTo: string,
	onLog: (msg: string) => void
): Promise<{
	events: ResearchEvent[]
	low_confidence_events: ResearchEvent[]
	ranked_tickers: RankedTicker[]
	summary: ResearchSummary
}> {
	const MAX_SEARCHES = 15
	let searchCount = 0

	const exaSearchTool: Tool = {
		name: "exa_search",
		description:
			"Search the web for information about events. Returns article titles and relevant highlights. " +
			"Use natural journalist-style sentences as queries, not keywords.",
		parameters: Type.Object({
			query:       Type.String({ description: "Search query as a journalist headline or natural sentence" }),
			date_from:   Type.Optional(Type.String({ description: "Start date YYYY-MM-DD" })),
			date_to:     Type.Optional(Type.String({ description: "End date YYYY-MM-DD" })),
			num_results: Type.Optional(Type.Number({ description: "Number of results 1-10, default 5" }))
		})
	}

	const submitFindingsTool: Tool = {
		name:        "submit_findings",
		description: "Submit your final structured research findings. Call this exactly once when done.",
		parameters:  ResearchFindingsSchema
	}

	const systemPrompt =
		`You are a financial event research agent. Find ALL historical instances of the trading trigger event ` +
		`in the user's hypothesis, evaluate any conditions, and return structured findings.\n\n` +
		`You have two tools:\n` +
		`- exa_search: Search the web. Results include titles and highlights (excerpts).\n` +
		`- submit_findings: Call once when finished to return structured results.\n\n` +
		`## Process\n\n` +
		`**Step 1 — Analyze the query:**\n` +
		`Identify: (1) the TRIGGER EVENT (what must happen), (2) the CONDITION (additional requirement, if any), ` +
		`(3) the relevant ticker/company, (4) date range: ${dateFrom} to ${dateTo}.\n\n` +
		`**Step 2 — Find all trigger event instances:**\n` +
		`Search broadly for all occurrences in the date range. Extract specific ISO dates (YYYY-MM-DD). ` +
		`Use journalist-style sentences as queries.\n\n` +
		`**Step 3 — Evaluate conditions (if any):**\n` +
		`For each event, if there is a condition, search for evidence of it. ` +
		`Example: for "MKBHD favourably reviewed iPhone 15" — search "MKBHD iPhone 15 review" and read highlights ` +
		`to judge sentiment.\n\n` +
		`**Step 4 — Call submit_findings:**\n` +
		`Include condition_met=true only if evidence clearly supports it. ` +
		`For simple queries with no explicit condition: condition_met=true if event clearly occurred. ` +
		`condition_evidence must be a one-line summary of the key evidence.\n\n` +
		`## Rules\n` +
		`- Maximum ${MAX_SEARCHES} total exa_search calls — use them wisely\n` +
		`- Always extract specific dates (YYYY-MM-DD), not just years\n` +
		`- Be conservative: only mark condition_met=true when evidence clearly supports it\n` +
		`- Include all relevant stock tickers in tickers_mentioned\n` +
		`- Call submit_findings exactly once`

	const context: Context = {
		systemPrompt,
		messages: [{ role: "user", content: query.trim(), timestamp: Date.now() }],
		tools: [exaSearchTool, submitFindingsTool]
	}

	let findings: ResearchFindings | null = null

	while (searchCount <= MAX_SEARCHES) {
		const response = await complete(model, context)

		if (response.stopReason === "error") {
			throw new Error(response.errorMessage ?? "LLM error during research agent")
		}

		// Append assistant message to conversation
		context.messages.push(response)

		if (response.stopReason !== "toolUse") break

		const toolCalls = response.content.filter((b): b is ToolCall => b.type === "toolCall")

		for (const toolCall of toolCalls) {
			if (toolCall.name === "submit_findings") {
				findings = validateToolCall([submitFindingsTool], toolCall) as ResearchFindings
				context.messages.push({
					role:       "toolResult",
					toolCallId: toolCall.id,
					toolName:   toolCall.name,
					content:    [{ type: "text", text: "Findings submitted." }],
					isError:    false,
					timestamp:  Date.now()
				})
				break
			}

			if (toolCall.name === "exa_search") {
				const args = toolCall.arguments as {
					query: string
					date_from?: string
					date_to?: string
					num_results?: number
				}
				searchCount++
				onLog(`Searching: "${args.query}"`)

				let resultText: string
				try {
					const res = await getExa().search(args.query, {
						type:               "auto",
						numResults:         Math.min(args.num_results ?? 5, 10),
						startPublishedDate: args.date_from ?? dateFrom,
						endPublishedDate:   args.date_to   ?? dateTo,
						contents:           { highlights: { maxCharacters: 1500 } }
					})
					const results = res.results.map(r => ({
						title:      r.title,
						url:        r.url,
						published:  r.publishedDate,
						highlights: r.highlights ?? []
					}))
					onLog(`  → ${results.length} result${results.length !== 1 ? "s" : ""}`)
					resultText = JSON.stringify(results)
				} catch (e) {
					const msg = e instanceof Error ? e.message : "search failed"
					onLog(`  → error: ${msg}`)
					resultText = JSON.stringify({ error: msg })
				}

				context.messages.push({
					role:       "toolResult",
					toolCallId: toolCall.id,
					toolName:   toolCall.name,
					content:    [{ type: "text", text: resultText }],
					isError:    false,
					timestamp:  Date.now()
				})
			}
		}

		if (findings) break
	}

	if (!findings) {
		throw new Error("research_agent_limit_exceeded")
	}

	// Map to ResearchEvent[], normalising confidence strings
	const toConfidence = (s: string): "HIGH" | "MEDIUM" | "LOW" =>
		(["HIGH", "MEDIUM", "LOW"].includes(s) ? s : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW"

	const allEvents: ResearchEvent[] = findings.events.map(e => ({
		event_date:           e.event_date,
		description:          e.description,
		tickers_mentioned:    e.tickers_mentioned,
		confidence:           toConfidence(e.confidence),
		sources:              e.sources.map(s => ({ url: s.url, title: s.title, highlight: null })),
		condition_met:        e.condition_met,
		condition_evidence:   e.condition_evidence,
		condition_confidence: toConfidence(e.condition_confidence)
	}))

	const events             = allEvents.filter(e => e.confidence !== "LOW")
	const low_confidence_events = allEvents.filter(e => e.confidence === "LOW")

	const universe       = await loadUSEquityUniverse()
	const ranked_tickers = rankTickers(events, universe)

	const summary: ResearchSummary = {
		event_type:        findings.event_type,
		event_description: findings.event_description,
		direction_hint:    findings.direction_hint,
		date_from:         dateFrom,
		date_to:           dateTo
	}

	return { events, low_confidence_events, ranked_tickers, summary }
}

export async function runResearchAgentForTicker(
	ticker: string,
	query: string,
	dateFrom: string,
	dateTo: string,
	onLog: (msg: string) => void
): Promise<{
	events: ResearchEvent[]
	low_confidence_events: ResearchEvent[]
	searchCount: number
}> {
	const MAX_SEARCHES = 10
	let searchCount = 0

	const exaSearchTool: Tool = {
		name: "exa_search",
		description:
			"Search the web for information about events. Returns article titles and relevant highlights. " +
			"Use natural journalist-style sentences as queries, not keywords.",
		parameters: Type.Object({
			query:       Type.String({ description: "Search query as a journalist headline or natural sentence" }),
			date_from:   Type.Optional(Type.String({ description: "Start date YYYY-MM-DD" })),
			date_to:     Type.Optional(Type.String({ description: "End date YYYY-MM-DD" })),
			num_results: Type.Optional(Type.Number({ description: "Number of results 1-10, default 5" }))
		})
	}

	const submitFindingsTool: Tool = {
		name:        "submit_findings",
		description: "Submit your final structured research findings. Call this exactly once when done.",
		parameters:  ResearchFindingsSchema
	}

	const systemPrompt =
		`You are a financial event research agent focused specifically on ${ticker}. ` +
		`Find ALL historical instances of the trading trigger event in the user's hypothesis that are relevant to ${ticker}, ` +
		`evaluate any conditions, and return structured findings.\n\n` +
		`You have two tools:\n` +
		`- exa_search: Search the web. Results include titles and highlights (excerpts).\n` +
		`- submit_findings: Call once when finished to return structured results.\n\n` +
		`## Process\n\n` +
		`**Step 1 — Analyze the query:**\n` +
		`Identify: (1) the TRIGGER EVENT (what must happen), (2) the CONDITION (additional requirement, if any), ` +
		`(3) focus exclusively on ${ticker}, (4) date range: ${dateFrom} to ${dateTo}.\n\n` +
		`**Step 2 — Find all trigger event instances for ${ticker}:**\n` +
		`Search for all occurrences in the date range that involve ${ticker}. Extract specific ISO dates (YYYY-MM-DD). ` +
		`Use journalist-style sentences as queries.\n\n` +
		`**Step 3 — Evaluate conditions (if any):**\n` +
		`For each event involving ${ticker}, if there is a condition, search for evidence of it.\n\n` +
		`**Step 4 — Call submit_findings:**\n` +
		`Include condition_met=true only if evidence clearly supports it. ` +
		`Always include "${ticker}" in tickers_mentioned for every event. ` +
		`condition_evidence must be a one-line summary of the key evidence.\n\n` +
		`## Rules\n` +
		`- Maximum ${MAX_SEARCHES} total exa_search calls — use them wisely\n` +
		`- Always extract specific dates (YYYY-MM-DD), not just years\n` +
		`- Be conservative: only mark condition_met=true when evidence clearly supports it\n` +
		`- Every event must include ${ticker} in tickers_mentioned\n` +
		`- Call submit_findings exactly once`

	const context: Context = {
		systemPrompt,
		messages: [{ role: "user", content: query.trim(), timestamp: Date.now() }],
		tools: [exaSearchTool, submitFindingsTool]
	}

	let findings: ResearchFindings | null = null

	while (searchCount <= MAX_SEARCHES) {
		const response = await complete(model, context)

		if (response.stopReason === "error") {
			throw new Error(response.errorMessage ?? "LLM error during per-ticker research agent")
		}

		context.messages.push(response)

		if (response.stopReason !== "toolUse") break

		const toolCalls = response.content.filter((b): b is ToolCall => b.type === "toolCall")

		for (const toolCall of toolCalls) {
			if (toolCall.name === "submit_findings") {
				findings = validateToolCall([submitFindingsTool], toolCall) as ResearchFindings
				context.messages.push({
					role:       "toolResult",
					toolCallId: toolCall.id,
					toolName:   toolCall.name,
					content:    [{ type: "text", text: "Findings submitted." }],
					isError:    false,
					timestamp:  Date.now()
				})
				break
			}

			if (toolCall.name === "exa_search") {
				const args = toolCall.arguments as {
					query: string
					date_from?: string
					date_to?: string
					num_results?: number
				}
				searchCount++
				onLog(`[${ticker}] Searching: "${args.query}"`)

				let resultText: string
				try {
					const res = await getExa().search(args.query, {
						type:               "auto",
						numResults:         Math.min(args.num_results ?? 5, 10),
						startPublishedDate: args.date_from ?? dateFrom,
						endPublishedDate:   args.date_to   ?? dateTo,
						contents:           { highlights: { maxCharacters: 1500 } }
					})
					const results = res.results.map(r => ({
						title:      r.title,
						url:        r.url,
						published:  r.publishedDate,
						highlights: r.highlights ?? []
					}))
					onLog(`[${ticker}]   → ${results.length} result${results.length !== 1 ? "s" : ""}`)
					resultText = JSON.stringify(results)
				} catch (e) {
					const msg = e instanceof Error ? e.message : "search failed"
					onLog(`[${ticker}]   → error: ${msg}`)
					resultText = JSON.stringify({ error: msg })
				}

				context.messages.push({
					role:       "toolResult",
					toolCallId: toolCall.id,
					toolName:   toolCall.name,
					content:    [{ type: "text", text: resultText }],
					isError:    false,
					timestamp:  Date.now()
				})
			}
		}

		if (findings) break
	}

	if (!findings) {
		onLog(`[${ticker}] Research limit reached — using partial results`)
		return { events: [], low_confidence_events: [], searchCount }
	}

	const toConfidence = (s: string): "HIGH" | "MEDIUM" | "LOW" =>
		(["HIGH", "MEDIUM", "LOW"].includes(s) ? s : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW"

	const allEvents: ResearchEvent[] = findings.events.map(e => ({
		event_date:           e.event_date,
		description:          e.description,
		tickers_mentioned:    e.tickers_mentioned.includes(ticker)
			? e.tickers_mentioned
			: [ticker, ...e.tickers_mentioned],
		confidence:           toConfidence(e.confidence),
		sources:              e.sources.map(s => ({ url: s.url, title: s.title, highlight: null })),
		condition_met:        e.condition_met,
		condition_evidence:   e.condition_evidence,
		condition_confidence: toConfidence(e.condition_confidence)
	}))

	const events               = allEvents.filter(e => e.confidence !== "LOW")
	const low_confidence_events = allEvents.filter(e => e.confidence === "LOW")

	return { events, low_confidence_events, searchCount }
}
