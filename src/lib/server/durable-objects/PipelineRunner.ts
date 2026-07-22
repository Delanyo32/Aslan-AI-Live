// PipelineRunner — one DO instance per backtest run session. Extends the shared
// StreamingRunner engine (event log, SSE/WS fan-out, /status, /cancel, abort,
// watchdog); this file owns the backtest stage machine, /start and /rule
// payloads, and the pipeline_runs D1 index.

import { and, eq, sql } from "drizzle-orm"
import { profiles, creditTransactions, pipelineRuns } from "$lib/server/db/schema"
import type {
	ResearchEvent,
	ResearchSummary,
	ConfirmedTickerWithDirection,
	ImpactWindow,
	OHLCVBar,
	EventOccurrence,
	EntryExitRule,
	BacktestResult,
} from "$lib/types/pipeline"
import { runResearchAgentForTicker } from "$lib/server/exa-events"
import { fetchOHLCV } from "$lib/server/alpaca-market-data"
import { calculateImpactWindow } from "$lib/server/impact-window"
import { runSimulation } from "$lib/server/trade-simulation"
import { createReport, setResearchNarrative } from "$lib/server/db/reports"
import { addCalendarDays } from "$lib/server/date-utils"
import { ENTRY_EXIT_SUGGESTIONS } from "$lib/server/pipeline-config"
import { complete, type Context } from "@mariozechner/pi-ai"
import { getAiModel } from "$lib/server/ai"
import { logger } from "$lib/server/logger"
import { StreamingRunner, RunnerAbort } from "./streaming-runner"

// ─── Types ──────────────────────────────────────────────────────────────────

export type PipelineStage =
	| "pending"
	| "per_ticker_done"
	| "occurrences_done"
	| "impact_done"
	| "rule_received"
	| "simulation_done"
	| "report_done"
	| "complete"
	| "failed"
	| "cancelled"

export type PipelineStatus = "pending" | "running" | "awaiting_rule" | "complete" | "failed" | "cancelled"

type StartPayload = {
	session_id: string
	user_id: string
	params: {
		query: string
		session_id: string
		research_events: ResearchEvent[]
		research_summary: ResearchSummary
		confirmed_tickers: ConfirmedTickerWithDirection[]
		total_portfolio_value: number
		is_rerun?: boolean
		source_report_slug?: string
	}
}

type RulePayload = {
	user_id: string
	rule: EntryExitRule
}

function computeCreditCost(isRerun: boolean, tickerCount: number, exaSearchCount: number): number {
	if (isRerun) return 1
	const aiBaseline = tickerCount >= 6 ? 3 : tickerCount >= 2 ? 2 : 1
	return aiBaseline + exaSearchCount
}

// ─── DO class ───────────────────────────────────────────────────────────────

export class PipelineRunner extends StreamingRunner {
	protected readonly tag = "pipeline"

	// ── HTTP entry ───────────────────────────────────────────────────────────

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		try {
			switch (url.pathname) {
				case "/start":  return await this.handleStart(request)
				case "/stream": return await this.handleStream(request)
				case "/rule":   return await this.handleRule(request)
				case "/status": return await this.handleStatus()
				case "/cancel": return await this.handleCancel()
				default:        return new Response("not found", { status: 404 })
			}
		} catch (e) {
			logger.error("pipeline_do_fetch_failed", {
				path: url.pathname,
				error: logger.serializeError(e),
			})
			return new Response(JSON.stringify({ error: "internal_error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			})
		}
	}

	// ── /start ───────────────────────────────────────────────────────────────

	private async handleStart(request: Request): Promise<Response> {
		const body = (await request.json()) as StartPayload
		const existing = await this.storage.get<PipelineStage>("stage")

		if (existing && existing !== "pending") {
			return new Response(
				JSON.stringify({ error: "already_started", stage: existing }),
				{ status: 409, headers: { "Content-Type": "application/json" } },
			)
		}

		const now = Date.now()
		await this.storage.put({
			params:        body.params,
			user_id:       body.user_id,
			session_id:    body.session_id,
			stage:         "pending" satisfies PipelineStage,
			next_event_id: 1,
			created_at:    now,
			updated_at:    now,
		})

		await this.upsertRunRow({
			session_id: body.session_id,
			user_id:    body.user_id,
			status:     "running",
			stage:      "pending",
			created_at: now,
			updated_at: now,
		})

		await this.emit("stage_started", { stage: "per_ticker_research", at: now })
		await this.storage.setAlarm(Date.now())

		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		})
	}

	// ── /rule ────────────────────────────────────────────────────────────────

	private async handleRule(request: Request): Promise<Response> {
		const body = (await request.json()) as RulePayload
		const stage = await this.storage.get<PipelineStage>("stage")
		const storedUserId = await this.storage.get<string>("user_id")

		if (!storedUserId) {
			return new Response(JSON.stringify({ error: "run_not_found" }), {
				status: 404, headers: { "Content-Type": "application/json" },
			})
		}
		if (body.user_id !== storedUserId) {
			return new Response(JSON.stringify({ error: "forbidden" }), {
				status: 403, headers: { "Content-Type": "application/json" },
			})
		}
		if (stage !== "impact_done") {
			return new Response(
				JSON.stringify({ error: "not_awaiting_rule", stage }),
				{ status: 409, headers: { "Content-Type": "application/json" } },
			)
		}

		await this.storage.put({
			rule:       body.rule,
			stage:      "rule_received" satisfies PipelineStage,
			updated_at: Date.now(),
		})
		await this.updateRunRow({ status: "running", stage: "rule_received" })
		await this.emit("log", { type: "log", timestamp: new Date().toISOString(), message: "Trade parameters confirmed — simulating..." })
		await this.storage.setAlarm(Date.now())

		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		})
	}

	// ── Alarm — stage state machine ─────────────────────────────────────────

	async alarm(): Promise<void> {
		const stage = (await this.storage.get<PipelineStage>("stage")) ?? "pending"
		const startedAt = Date.now()

		try {
			switch (stage) {
				case "pending":          await this.runPerTickerResearch(); break
				case "per_ticker_done":  await this.buildOccurrences();     break
				case "occurrences_done": await this.computeImpactWindows(); break
				case "impact_done":      /* await /rule — no alarm */      return
				case "rule_received":    await this.runSimulationStage();  break
				case "simulation_done":  await this.persistReportAndDebit(); break
				case "report_done":      await this.generateNarrative();   break
				case "complete":
				case "failed":
				case "cancelled":
					return
			}

			const newStage = (await this.storage.get<PipelineStage>("stage")) ?? stage
			await this.emit("stage_done", { stage, duration_ms: Date.now() - startedAt })
			logger.info("pipeline_stage", {
				stage,
				duration_ms: Date.now() - startedAt,
				session_id:  await this.storage.get<string>("session_id"),
			})

			// If we advanced to a non-terminal stage that has more work, loop immediately.
			if (
				newStage !== "impact_done" &&
				newStage !== "complete" &&
				newStage !== "failed" &&
				newStage !== "cancelled"
			) {
				await this.storage.setAlarm(Date.now())
			} else if (newStage === "complete") {
				this.closeAllSubscribers()
			}
		} catch (e) {
			await this.markFailed(stage, e)
		}

		// Watchdog: if run has been idle for a long time on a non-terminal stage,
		// fail it ("impact_done" legitimately waits on /rule).
		await this.runWatchdog("impact_done")
	}

	// ── Stage 1: per-ticker research ────────────────────────────────────────

	private async runPerTickerResearch(): Promise<void> {
		const params = await this.requireParams()

		let merged = params.research_events
		let totalExa = 0

		if (!params.is_rerun) {
			await this.log(
				`Running per-ticker research agents for ${params.confirmed_tickers.length} ticker` +
				`${params.confirmed_tickers.length !== 1 ? "s" : ""}…`
			)

			// Sequential per-ticker so each ticker is a checkpoint. This trades some
			// wall-clock time for stronger resume semantics: if the DO is evicted
			// mid-run, we only re-execute the current ticker rather than all 10.
			const completedTickers = (await this.storage.get<string[]>("per_ticker_completed")) ?? []
			const seenKeys = new Set(
				merged.map(e => `${e.event_date}|${e.tickers_mentioned[0] ?? ""}`),
			)

			for (const t of params.confirmed_tickers) {
				if (completedTickers.includes(t.symbol)) continue

				const result = await runResearchAgentForTicker(
					t.symbol,
					params.query,
					params.research_summary.date_from,
					params.research_summary.date_to,
					(msg) => { void this.log(msg) },
				)
				totalExa += result.searchCount

				const newEvents: ResearchEvent[] = []
				for (const e of result.events) {
					const key = `${e.event_date}|${t.symbol}`
					if (seenKeys.has(key)) continue
					seenKeys.add(key)
					newEvents.push(e)
				}
				merged = [...merged, ...newEvents]
				completedTickers.push(t.symbol)

				await this.storage.put({
					merged_events:        merged,
					total_exa_searches:   totalExa + ((await this.storage.get<number>("total_exa_searches")) ?? 0),
					per_ticker_completed: completedTickers,
					updated_at:           Date.now(),
				})
			}

			const additional = merged.length - params.research_events.length
			await this.log(
				`Per-ticker research complete — ${additional} additional event` +
				`${additional !== 1 ? "s" : ""} found (${totalExa} Exa search${totalExa !== 1 ? "es" : ""} total)`
			)
		}

		await this.storage.put({
			merged_events:      merged,
			total_exa_searches: totalExa,
			stage:              "per_ticker_done" satisfies PipelineStage,
			updated_at:         Date.now(),
		})
		await this.updateRunRow({ stage: "per_ticker_done" })
	}

	// ── Stage 2: build occurrences ──────────────────────────────────────────

	private async buildOccurrences(): Promise<void> {
		const params = await this.requireParams()
		const merged = (await this.storage.get<ResearchEvent[]>("merged_events")) ?? params.research_events

		await this.log(
			`Building event occurrences for ${params.confirmed_tickers.length} ticker` +
			`${params.confirmed_tickers.length !== 1 ? "s" : ""}...`
		)

		const conditionMet = merged.filter(e => e.condition_met)
		const occurrences: EventOccurrence[] = []
		const skipped: string[] = []

		for (const t of params.confirmed_tickers) {
			const tickerEvents = conditionMet.filter(e => e.tickers_mentioned.includes(t.symbol))
			const toUse = tickerEvents.length > 0 ? tickerEvents : conditionMet
			if (toUse.length === 0) {
				skipped.push(t.symbol)
				await this.log(`No events available for ${t.symbol} — skipping`)
				continue
			}
			for (const e of toUse) {
				occurrences.push({
					event_date:  e.event_date,
					description: e.description,
					confidence:  e.confidence,
					tickers:     [t.symbol],
					sources:     e.sources,
				})
			}
			await this.log(
				`${toUse.length} event${toUse.length !== 1 ? "s" : ""} mapped to ${t.symbol}`,
			)
		}

		if (occurrences.length === 0) {
			throw new RunnerAbort("no_events", "detection")
		}

		const confirmed = params.confirmed_tickers
			.filter(t => !skipped.includes(t.symbol))
			.map(t => t.symbol)

		await this.log(
			`Confirmed ${occurrences.length} event occurrences across ${confirmed.length} tickers`,
		)

		await this.storage.put({
			all_occurrences:   occurrences,
			confirmed_symbols: confirmed,
			stage:             "occurrences_done" satisfies PipelineStage,
			updated_at:        Date.now(),
		})
		await this.updateRunRow({ stage: "occurrences_done" })
	}

	// ── Stage 3: impact windows ─────────────────────────────────────────────

	private async computeImpactWindows(): Promise<void> {
		const occurrences = (await this.storage.get<EventOccurrence[]>("all_occurrences")) ?? []
		const confirmed = (await this.storage.get<string[]>("confirmed_symbols")) ?? []

		await this.log(`Fetching price data for ${confirmed.join(", ")}...`)

		const sortedDates = [...occurrences.map(o => o.event_date)].sort()
		const rangeFrom = addCalendarDays(sortedDates[0], -5)
		const rangeTo   = addCalendarDays(sortedDates[sortedDates.length - 1], 35)
		const allSymbols = [...new Set([...confirmed, "SPY"])]

		let priceData: Map<string, OHLCVBar[]>
		try {
			const results = await Promise.all(
				allSymbols.map(async symbol => ({
					symbol,
					bars: await fetchOHLCV(symbol, rangeFrom, rangeTo),
				})),
			)
			priceData = new Map(results.map(r => [r.symbol, r.bars]))
		} catch {
			throw new RunnerAbort("price_fetch_failed", "impact_windows")
		}

		const spyBars = priceData.get("SPY") ?? []
		await this.log(`Calculating impact windows for ${occurrences.length} event-ticker pairs...`)

		const impactWindows: ImpactWindow[] = []
		for (const occurrence of occurrences) {
			for (const ticker of occurrence.tickers) {
				const bars = priceData.get(ticker) ?? []
				impactWindows.push(calculateImpactWindow(ticker, occurrence.event_date, bars, spyBars))
			}
		}

		await this.storage.put({
			impact_windows: impactWindows,
			stage:          "impact_done" satisfies PipelineStage,
			updated_at:     Date.now(),
		})
		await this.updateRunRow({ status: "awaiting_rule", stage: "impact_done" })

		await this.emit("entry_exit_suggestions", {
			type:        "entry_exit_suggestions",
			suggestions: ENTRY_EXIT_SUGGESTIONS,
		})
		// No alarm — wait for /rule.
	}

	// ── Stage 4: simulation ─────────────────────────────────────────────────

	private async runSimulationStage(): Promise<void> {
		const params = await this.requireParams()
		const occurrences = (await this.storage.get<EventOccurrence[]>("all_occurrences")) ?? []
		const impactWindows = (await this.storage.get<ImpactWindow[]>("impact_windows")) ?? []
		const confirmed = (await this.storage.get<string[]>("confirmed_symbols")) ?? []
		const rule = await this.storage.get<EntryExitRule>("rule")
		if (!rule) throw new RunnerAbort("rule_missing", "simulation")

		const positionSize = Math.floor(params.total_portfolio_value / confirmed.length)
		rule.position_size = positionSize

		const directionMap = new Map<string, "long" | "short">(
			params.confirmed_tickers.map(t => [t.symbol, t.direction]),
		)
		rule.directions_map = Object.fromEntries(directionMap)

		const result = runSimulation(
			occurrences,
			impactWindows,
			rule,
			params.total_portfolio_value,
			directionMap,
		)

		if (result.trades.length === 0) {
			throw new RunnerAbort("no_trades", "simulation")
		}

		await this.log(
			`Simulated ${result.summary.trade_count} trades across ${result.summary.event_count} events`,
		)
		await this.log("Saving report...")

		await this.storage.put({
			simulation_result: result,
			rule_final:        rule,
			stage:             "simulation_done" satisfies PipelineStage,
			updated_at:        Date.now(),
		})
		await this.updateRunRow({ status: "running", stage: "simulation_done" })
	}

	// ── Stage 5: persist report + debit credits (atomic sequence) ──────────

	private async persistReportAndDebit(): Promise<void> {
		const params = await this.requireParams()
		const occurrences = (await this.storage.get<EventOccurrence[]>("all_occurrences")) ?? []
		const impactWindows = (await this.storage.get<ImpactWindow[]>("impact_windows")) ?? []
		const confirmed = (await this.storage.get<string[]>("confirmed_symbols")) ?? []
		const result = await this.storage.get<BacktestResult>("simulation_result")
		const ruleFinal = await this.storage.get<EntryExitRule>("rule_final")
		const totalExa = (await this.storage.get<number>("total_exa_searches")) ?? 0
		const userId = (await this.storage.get<string>("user_id"))!

		if (!result || !ruleFinal) throw new RunnerAbort("simulation_missing", "persist")

		const cost = computeCreditCost(params.is_rerun === true, confirmed.length, params.is_rerun ? 0 : totalExa)

		// Reserve credits atomically; rollback on report failure.
		const deducted = await this.db
			.update(profiles)
			.set({ credits: sql`${profiles.credits} - ${cost}` })
			.where(and(eq(profiles.user_id, userId), sql`${profiles.credits} >= ${cost}`))
			.returning({ id: profiles.user_id })

		if (deducted.length === 0) {
			throw new RunnerAbort("insufficient_credits", "credits")
		}

		const syntheticEventSpec = {
			event_type:        params.research_summary.event_type,
			event_description: params.research_summary.event_description,
			geography:         "US",
			direction_hint:    params.research_summary.direction_hint,
			date_range: {
				start: params.research_summary.date_from,
				end:   params.research_summary.date_to,
			},
		}
		const syntheticExaSearch = {
			primary_query:      params.research_summary.event_description,
			additional_queries: [],
			date_from:          params.research_summary.date_from,
			date_to:            params.research_summary.date_to,
		}

		let report
		try {
			report = await createReport(this.db, {
				query:             params.query,
				event_spec:        syntheticEventSpec,
				exa_search:        syntheticExaSearch,
				rule:              ruleFinal,
				confirmed_tickers: confirmed,
				occurrences:       occurrences,
				impact_windows:    impactWindows,
				backtest_result:   result,
				low_confidence_events: params.research_events.filter(e => e.confidence === "LOW"),
				user_id:           userId,
			})
		} catch (e) {
			// Refund the reservation — the report never persisted.
			await this.db
				.update(profiles)
				.set({ credits: sql`${profiles.credits} + ${cost}` })
				.where(eq(profiles.user_id, userId))
			throw e
		}

		await this.db.insert(creditTransactions).values({
			id:          crypto.randomUUID(),
			user_id:     userId,
			amount:      -cost,
			reason:      params.is_rerun === true ? "rerun" : "backtest",
			backtest_id: report.id,
		})

		await this.storage.put({
			report_id:   report.id,
			report_slug: report.slug,
			stage:       "report_done" satisfies PipelineStage,
			updated_at:  Date.now(),
		})
		await this.updateRunRow({ stage: "report_done", result_slug: report.slug })
	}

	// ── Stage 6: narrative (non-blocking tolerance) ─────────────────────────

	private async generateNarrative(): Promise<void> {
		const params = await this.requireParams()
		const result = await this.storage.get<BacktestResult>("simulation_result")
		const reportId = await this.storage.get<string>("report_id")
		const reportSlug = await this.storage.get<string>("report_slug")
		const confirmed = (await this.storage.get<string[]>("confirmed_symbols")) ?? []
		const occurrences = (await this.storage.get<EventOccurrence[]>("all_occurrences")) ?? []

		await this.log("Generating research narrative...")

		if (reportId && result) {
			try {
				const ctx: Context = {
					systemPrompt:
						"You are a financial research analyst. Write a clear, factual " +
						"2-4 paragraph narrative explaining: what this type of event is, " +
						"why these specific tickers were chosen, and what the historical " +
						"price pattern shows. Label it as AI-generated analysis.",
					messages: [{
						role: "user",
						content: JSON.stringify({
							query:        params.query,
							tickers:      confirmed,
							event_count:  occurrences.length,
							total_return: result.summary.total_return_pct,
						}),
						timestamp: Date.now(),
					}],
				}
				const response = await complete(getAiModel(), ctx)
				const narrative = response.content
					.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
					.map(b => b.text)
					.join("")
				if (narrative) {
					await setResearchNarrative(this.db, reportId, narrative)
				}
			} catch (e) {
				logger.warn("pipeline_narrative_failed", {
					stage: "narrative",
					error: logger.serializeError(e),
				})
			}
		}

		await this.storage.put({ stage: "complete" satisfies PipelineStage, updated_at: Date.now() })
		await this.updateRunRow({ status: "complete", stage: "complete", result_slug: reportSlug ?? null })
		if (reportSlug) {
			await this.emit("result", { type: "result", slug: reportSlug })
		}
	}

	// ── D1 pipeline_runs index ──────────────────────────────────────────────

	private async upsertRunRow(row: {
		session_id: string
		user_id: string
		status: PipelineStatus
		stage: PipelineStage
		created_at: number
		updated_at: number
	}): Promise<void> {
		await this.db
			.insert(pipelineRuns)
			.values(row)
			.onConflictDoUpdate({
				target: pipelineRuns.session_id,
				set: {
					status:     row.status,
					stage:      row.stage,
					updated_at: row.updated_at,
				},
			})
	}

	protected async updateRunRow(patch: Partial<{
		status: string
		stage: string
		error: string | null
		result_slug: string | null
	}>): Promise<void> {
		const sessionId = await this.storage.get<string>("session_id")
		if (!sessionId) return
		await this.db
			.update(pipelineRuns)
			.set({ ...patch, updated_at: Date.now() })
			.where(eq(pipelineRuns.session_id, sessionId))
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private async requireParams(): Promise<StartPayload["params"]> {
		const params = await this.storage.get<StartPayload["params"]>("params")
		if (!params) throw new RunnerAbort("params_missing", "init")
		return params
	}
}
