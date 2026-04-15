import type { RequestHandler } from "./$types"
import { model } from "$lib/server/ai"
import { complete, type Context } from "@mariozechner/pi-ai"
import type {
	ResearchEvent,
	ResearchSummary,
	ConfirmedTickerWithDirection,
	ImpactWindow,
	OHLCVBar,
	EventOccurrence
} from "$lib/types/pipeline"
import { fetchOHLCV } from "$lib/server/alpaca-market-data"
import { calculateImpactWindow } from "$lib/server/impact-window"
import { runSimulation } from "$lib/server/trade-simulation"
import { waitForRule, storePipelineParams, getPipelineParams } from "$lib/server/pipeline-sessions"
import { createReport, setResearchNarrative } from "$lib/server/db/reports"
import { authUser, creditTransactions } from "$lib/server/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { runResearchAgentForTicker } from "$lib/server/exa-events"

function computeCreditCost(isRerun: boolean, tickerCount: number, exaSearchCount: number): number {
	if (isRerun) return 1
	const aiBaseline = tickerCount >= 6 ? 3 : tickerCount >= 2 ? 2 : 1
	return aiBaseline + exaSearchCount
}

async function runConcurrent<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
	const results: T[] = []
	const queue = [...tasks]
	const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
		while (queue.length) {
			const task = queue.shift()!
			results.push(await task())
		}
	})
	await Promise.all(workers)
	return results
}

function addCalendarDays(isoDate: string, days: number): string {
	const d = new Date(isoDate)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	let body: { session_id?: string }
	try {
		body = await request.json()
	} catch {
		return new Response("Invalid JSON", { status: 400 })
	}

	if (!body.session_id) {
		return new Response("session_id required", { status: 400 })
	}

	storePipelineParams(body.session_id, body)
	return new Response(JSON.stringify({ ok: true }), {
		headers: { "Content-Type": "application/json" },
	})
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return new Response(JSON.stringify({ error: "unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const session_id = url.searchParams.get("session_id")
	if (!session_id) {
		return new Response("Missing session_id", { status: 400 })
	}

	let params: {
		query: string
		session_id: string
		research_events: ResearchEvent[]
		research_summary: ResearchSummary
		confirmed_tickers: ConfirmedTickerWithDirection[]
		total_portfolio_value: number
		is_rerun?: boolean
		source_report_slug?: string
	}

	const stored = getPipelineParams(session_id)
	if (!stored) {
		return new Response("Session not found or expired", { status: 404 })
	}
	params = stored as typeof params

	const { query, research_events, research_summary, confirmed_tickers, total_portfolio_value } = params

	if (!query || !session_id || !research_events?.length || !research_summary || !confirmed_tickers?.length) {
		return new Response("query, session_id, research_events, research_summary, and confirmed_tickers are required", { status: 400 })
	}

	const { db } = locals
	const user = locals.user

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
				// ── Per-ticker research agents ─────────────────────────────────────────
				let totalExaSearches = 0
				let mergedEvents = research_events

				if (!params.is_rerun) {
					log(`Running per-ticker research agents for ${confirmed_tickers.length} ticker${confirmed_tickers.length !== 1 ? 's' : ''}…`)

					const tickerTasks = confirmed_tickers.map(t => async () => {
						const result = await runResearchAgentForTicker(
							t.symbol,
							query,
							research_summary.date_from,
							research_summary.date_to,
							(msg) => log(msg)
						)
						totalExaSearches += result.searchCount
						return { ticker: t.symbol, ...result }
					})

					const tickerResults = await runConcurrent(tickerTasks, 3)

					// Merge per-ticker events into research_events, deduplicating on (event_date, primary ticker)
					const seenKeys = new Set(
						research_events.map(e => `${e.event_date}|${e.tickers_mentioned[0] ?? ""}`)
					)
					const additionalEvents: ResearchEvent[] = tickerResults.flatMap(r =>
						r.events.filter(e => {
							const key = `${e.event_date}|${r.ticker}`
							if (seenKeys.has(key)) return false
							seenKeys.add(key)
							return true
						})
					)
					mergedEvents = [...research_events, ...additionalEvents]
					log(`Per-ticker research complete — ${additionalEvents.length} additional event${additionalEvents.length !== 1 ? "s" : ""} found (${totalExaSearches} Exa search${totalExaSearches !== 1 ? "es" : ""} total)`)
				}

				// ── Stage 1: Build occurrences from pre-researched events ─────────────
				log(`Building event occurrences for ${confirmed_tickers.length} ticker${confirmed_tickers.length !== 1 ? 's' : ''}...`)

				const conditionMetEvents = mergedEvents.filter(e => e.condition_met)
				const allOccurrences: EventOccurrence[] = []
				const skippedTickers: string[] = []

				for (const t of confirmed_tickers) {
					const tickerEvents = conditionMetEvents.filter(e =>
						e.tickers_mentioned.includes(t.symbol)
					)
					// Fall back to all condition-met events if none mention this ticker explicitly
					const eventsToUse = tickerEvents.length > 0 ? tickerEvents : conditionMetEvents
					if (eventsToUse.length === 0) {
						skippedTickers.push(t.symbol)
						log(`No events available for ${t.symbol} — skipping`)
						continue
					}
					for (const e of eventsToUse) {
						allOccurrences.push({
							event_date:  e.event_date,
							description: e.description,
							confidence:  e.confidence,
							tickers:     [t.symbol],
							sources:     e.sources
						})
					}
					log(`${eventsToUse.length} event${eventsToUse.length !== 1 ? 's' : ''} mapped to ${t.symbol}`)
				}

				if (allOccurrences.length === 0) {
					emit("error", { type: "error", message: "no_events", stage: "detection" })
					safeClose()
					return
				}

				const confirmedSymbols = confirmed_tickers
					.filter(t => !skippedTickers.includes(t.symbol))
					.map(t => t.symbol)

				log(`Confirmed ${allOccurrences.length} event occurrences across ${confirmedSymbols.length} tickers`)

				// ── Stage 2: Impact Windows ────────────────────────────────────────────
				log(`Fetching price data for ${confirmedSymbols.join(", ")}...`)

				const sortedDates = [...allOccurrences.map(o => o.event_date)].sort()
				const rangeFrom = addCalendarDays(sortedDates[0], -5)
				const rangeTo   = addCalendarDays(sortedDates[sortedDates.length - 1], 35)
				const allSymbols = [...new Set([...confirmedSymbols, "SPY"])]

				let priceData: Map<string, OHLCVBar[]>
				try {
					const results = await Promise.all(
						allSymbols.map(async symbol => ({
							symbol,
							bars: await fetchOHLCV(symbol, rangeFrom, rangeTo)
						}))
					)
					priceData = new Map(results.map(r => [r.symbol, r.bars]))
				} catch {
					emit("error", { type: "error", message: "price_fetch_failed", stage: "impact_windows" })
					safeClose()
					return
				}

				const spyBars = priceData.get("SPY") ?? []
				log(`Calculating impact windows for ${allOccurrences.length} event-ticker pairs...`)

				const impact_windows: ImpactWindow[] = []
				for (const occurrence of allOccurrences) {
					for (const ticker of occurrence.tickers) {
						const tickerBars = priceData.get(ticker) ?? []
						impact_windows.push(
							calculateImpactWindow(ticker, occurrence.event_date, tickerBars, spyBars)
						)
					}
				}

				const entry_exit_suggestions = {
					aggressive: {
						label: "Aggressive",
						entry_rule: "Market open on event day",
						exit_rule: "Close on peak CAR date",
						description:
							"Catches maximum upside but requires same-day execution. Best for fast-moving events."
					},
					moderate: {
						label: "Moderate",
						entry_rule: "Market open next trading day after event",
						exit_rule: "Close on impact window end date (CAR decay or mean reversion)",
						description:
							"Rides the full event effect with a 1-day entry buffer to avoid gap-open noise."
					},
					conservative: {
						label: "Conservative",
						entry_rule: "Market open 2 trading days after event",
						exit_rule: "Close 5 trading days after event",
						description:
							"Avoids gap-open noise; trades the sustained trend only. Fixed 5-day hold."
					}
				}

				// Register rule wait BEFORE emitting suggestions.
				const rulePromise = waitForRule(session_id)

				emit("entry_exit_suggestions", {
					type: "entry_exit_suggestions",
					suggestions: entry_exit_suggestions
				})

				let rule
				try {
					rule = await rulePromise
				} catch {
					emit("error", {
						type: "error",
						message: "rule_confirmation_timeout",
						stage: "impact_windows"
					})
					safeClose()
					return
				}

				log("Trade parameters confirmed — simulating...")

				// ── Stage 3: Simulation ────────────────────────────────────────────────
				// Position size = total portfolio split equally across active tickers
				const position_size_per_ticker = Math.floor(total_portfolio_value / confirmedSymbols.length)
				rule.position_size = position_size_per_ticker

				// Build per-ticker direction map from confirmed_tickers
				const directionMap = new Map<string, "long" | "short">(
					confirmed_tickers.map(t => [t.symbol, t.direction])
				)

				// Embed directions into rule for DB persistence
				rule.directions_map = Object.fromEntries(directionMap)

				const result = runSimulation(
					allOccurrences,
					impact_windows,
					rule,
					total_portfolio_value,
					directionMap
				)

				// Fail fast: no trades generated
				if (result.trades.length === 0) {
					emit("error", { type: "error", message: "no_trades", stage: "simulation" })
					safeClose()
					return
				}

				log(
					`Simulated ${result.summary.trade_count} trades across ${result.summary.event_count} events`
				)
				log("Saving report...")

				// ── Credit deduction ───────────────────────────────────────────────────
				const creditCost = computeCreditCost(
					params.is_rerun === true,
					confirmedSymbols.length,
					params.is_rerun ? 0 : totalExaSearches
				)
				const deducted = await db
					.update(authUser)
					.set({ credits: sql`${authUser.credits} - ${creditCost}` })
					.where(
						and(
							eq(authUser.id, user.id),
							sql`${authUser.credits} >= ${creditCost}`
						)
					)
					.returning({ id: authUser.id })
				if (deducted.length === 0) {
					emit("error", {
						type: "error",
						message: "insufficient_credits",
						stage: "credits",
						required: creditCost,
						available: user.credits ?? 0
					})
					safeClose()
					return
				}

				// ── Persist to DB ──────────────────────────────────────────────────────
				// Synthesize event_spec and exa_search from research_summary for backward compat
				const syntheticEventSpec = {
					event_type:        research_summary.event_type,
					event_description: research_summary.event_description,
					geography:         "US",
					direction_hint:    research_summary.direction_hint,
					date_range: {
						start: research_summary.date_from,
						end:   research_summary.date_to
					}
				}
				const syntheticExaSearch = {
					primary_query:      research_summary.event_description,
					additional_queries: [],
					date_from:          research_summary.date_from,
					date_to:            research_summary.date_to
				}

				const report = await createReport(db, {
					query,
					event_spec:           syntheticEventSpec,
					exa_search:           syntheticExaSearch,
					rule,
					confirmed_tickers:    confirmedSymbols,
					occurrences:          allOccurrences,
					impact_windows,
					backtest_result:      result,
					low_confidence_events: research_events.filter(e => e.confidence === "LOW"),
					user_id:              user.id,
				})

				// ── Record credit transaction ─────────────────────────────────────────
				await db.insert(creditTransactions).values({
					id:          crypto.randomUUID(),
					user_id:     user.id,
					amount:      -creditCost,
					reason:      params.is_rerun === true ? "rerun" : "backtest",
					backtest_id: report.id,
				})

				// ── Generate research narrative (async, non-blocking) ──────────────────
				log("Generating research narrative...")
				try {
					const narrativeCtx: Context = {
						systemPrompt:
							"You are a financial research analyst. Write a clear, factual " +
							"2-4 paragraph narrative explaining: what this type of event is, " +
							"why these specific tickers were chosen, and what the historical " +
							"price pattern shows. Label it as AI-generated analysis.",
						messages: [
							{
								role: "user",
								content: JSON.stringify({
									query,
									tickers: confirmedSymbols,
									event_count: allOccurrences.length,
									total_return: result.summary.total_return_pct
								}),
								timestamp: Date.now()
							}
						]
					}
					const narrativeResponse = await complete(model, narrativeCtx)
					const narrative = narrativeResponse.content
						.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
						.map(b => b.text)
						.join("")
					if (narrative) {
						await setResearchNarrative(db, report.id, narrative)
					}
				} catch (e) {
					console.error("[pipeline/run] narrative generation failed (non-fatal):", e)
				}

				emit("result", { type: "result", slug: report.slug })
			} catch (e) {
				console.error("[pipeline/run] unhandled error:", e)
				try {
					emit("error", { type: "error", message: "internal_error", stage: "unknown" })
				} catch {
					// stream already closed
				}
			} finally {
				safeClose()
			}
		}
	})

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no"
		}
	})
}
