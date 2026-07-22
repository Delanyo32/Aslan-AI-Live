// TerminalReportRunner (WP2.1, SPEC v0.3 §3). One DO instance per run session
// (`idFromName(session_id)`). Extends the shared StreamingRunner engine
// (storage-backed event log, SSE + WebSocket fan-out with Last-Event-ID replay,
// /status, /cancel, abort semantics, stall watchdog); this file owns the staged
// pipeline and the terminal_runs D1 index:
//   resolving → competitor_set → researching (9×, per-dimension checkpoint)
//   → extracting → grading → reconciling → synthesizing → persisting → complete

import { and, desc, eq, sql } from "drizzle-orm"
import {
	authUser,
	creditTransactions,
	companies,
	dimensionScores,
	evidenceItems,
	terminalRuns
} from "$lib/server/db/schema"
import { createTerminalReport } from "$lib/server/db/terminal-reports"
import {
	runDimensionResearch,
	gradeDimension,
	computeComposite,
	extractFundamentals,
	reconcilePrice,
	synthesize
} from "$lib/server/terminal"
import { classifyScreenHits } from "$lib/server/terminal/screens"
import { extractCommitments, followThroughRate, ftrSignalFinding } from "$lib/server/terminal/ledger"
import { evidenceHash } from "$lib/server/terminal/scoring"
import { createCompetitorWebset } from "$lib/server/terminal/exa"
import { FRAMEWORKS, RUBRIC_VERSION } from "$lib/server/terminal/rubrics"
import { TERMINAL_CONFIG } from "$lib/server/terminal/config"
import { DIMENSION_IDS } from "$lib/types/terminal"
import type {
	Citation,
	CompositeScore,
	DimensionEvidence,
	DimensionGrade,
	DimensionId,
	ExtractionResult,
	EvidenceItem,
	ReconciliationVerdict,
	TerminalStage
} from "$lib/types/terminal"
import { logger } from "$lib/server/logger"
import { StreamingRunner, RunnerAbort, toDateOrNull } from "./streaming-runner"

// ─── Types ──────────────────────────────────────────────────────────────────

type StoredCompany = typeof companies.$inferSelect

type StartPayload = {
	session_id: string
	user_id: string
	company: StoredCompany
	credit_cost: number
	reason: "terminal_report" | "terminal_rerun"
}

type Synthesis = { narrative: string; bear: string; bull: string }

// ─── Pure decisions (exported for unit tests — the DO itself needs miniflare) ──

// Stage progression, in order. The alarm handler for stage X advances to the
// next entry on success; the last real stage ("persisting") advances to
// "complete", which is terminal.
export const TERMINAL_STAGE_ORDER: TerminalStage[] = [
	"resolving",
	"competitor_set",
	"researching",
	"extracting",
	"grading",
	"reconciling",
	"synthesizing",
	"persisting",
	"complete"
]

export function nextStage(stage: TerminalStage): TerminalStage {
	const i = TERMINAL_STAGE_ORDER.indexOf(stage)
	if (i < 0 || i >= TERMINAL_STAGE_ORDER.length - 1) return "complete"
	return TERMINAL_STAGE_ORDER[i + 1]
}

// Research runs the nine frameworks in this fixed order; each completed
// dimension is checkpointed so an eviction resumes from the first uncompleted.
export const DIMENSION_ORDER: readonly DimensionId[] = DIMENSION_IDS

// Given the dimensions already checkpointed, which remain to run (in order).
export function pendingDimensions(completed: readonly DimensionId[]): DimensionId[] {
	const done = new Set(completed)
	return DIMENSION_ORDER.filter((d) => !done.has(d))
}

// §2.6 credit cost selection: a rerun costs less than a fresh deep report.
export function terminalCreditCost(isRerun: boolean): number {
	return isRerun ? TERMINAL_CONFIG.CREDITS_RERUN : TERMINAL_CONFIG.CREDITS_DEEP_REPORT
}

// Assemble the composite evidence-snapshot input: every dimension's evidence
// items, deduped by content_hash (merging the dimensions each item belongs to).
// This exact list feeds both the snapshot hash and the evidence_items bulk
// insert, so dedup happens once here.
export function collectEvidenceItems(evidenceList: readonly DimensionEvidence[]): EvidenceItem[] {
	const byHash = new Map<string, EvidenceItem>()
	for (const ev of evidenceList) {
		for (const item of ev.evidence_items) {
			const existing = byHash.get(item.content_hash)
			if (!existing) {
				byHash.set(item.content_hash, { ...item, dimensions: [...item.dimensions] })
				continue
			}
			for (const d of item.dimensions) if (!existing.dimensions.includes(d)) existing.dimensions.push(d)
		}
	}
	return [...byHash.values()]
}

// D1 rejects queries with >100 bound parameters, so bulk inserts are chunked to
// floor(100 / columns) rows per statement (drizzle binds every column, including
// $defaultFn ones like created_at).
export function chunkForD1<T>(rows: readonly T[], columns: number): T[][] {
	const size = Math.max(1, Math.floor(100 / columns))
	const out: T[][] = []
	for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
	return out
}

function dedupeCitations(citations: readonly Citation[]): Citation[] {
	const seen = new Set<string>()
	const out: Citation[] = []
	for (const c of citations) {
		if (seen.has(c.url)) continue
		seen.add(c.url)
		out.push(c)
	}
	return out
}

// ─── DO class ───────────────────────────────────────────────────────────────

export class TerminalReportRunner extends StreamingRunner {
	protected readonly tag = "terminal"

	// ── HTTP entry ───────────────────────────────────────────────────────────

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		try {
			switch (url.pathname) {
				case "/start":
					return await this.handleStart(request)
				case "/stream":
					return await this.handleStream(request)
				case "/status":
					return await this.handleStatus()
				case "/cancel":
					return await this.handleCancel()
				default:
					return new Response("not found", { status: 404 })
			}
		} catch (e) {
			logger.error("terminal_do_fetch_failed", {
				path: url.pathname,
				error: logger.serializeError(e)
			})
			return new Response(JSON.stringify({ error: "internal_error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			})
		}
	}

	// ── /start ───────────────────────────────────────────────────────────────

	private async handleStart(request: Request): Promise<Response> {
		const body = (await request.json()) as StartPayload
		const existing = await this.storage.get<TerminalStage>("stage")

		if (existing && existing !== "pending") {
			return new Response(JSON.stringify({ error: "already_started", stage: existing }), {
				status: 409,
				headers: { "Content-Type": "application/json" }
			})
		}

		if (!body.company?.id || !body.company?.ticker || !body.company?.name) {
			return new Response(JSON.stringify({ error: "invalid_company" }), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			})
		}

		const now = Date.now()
		await this.storage.put({
			session_id: body.session_id,
			user_id: body.user_id,
			company: body.company,
			credit_cost: body.credit_cost,
			reason: body.reason,
			stage: "resolving" satisfies TerminalStage,
			next_event_id: 1,
			created_at: now,
			updated_at: now
		})

		await this.upsertRunRow({
			session_id: body.session_id,
			user_id: body.user_id,
			company_id: body.company.id,
			status: "running",
			stage: "resolving",
			created_at: now,
			updated_at: now
		})

		await this.storage.setAlarm(Date.now())

		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" }
		})
	}

	// ── Alarm — stage state machine ───────────────────────────────────────────

	async alarm(): Promise<void> {
		const stage = (await this.storage.get<TerminalStage>("stage")) ?? "resolving"
		if (stage === "complete" || stage === "failed" || stage === "cancelled") return

		const startedAt = Date.now()
		await this.emit("stage_started", { type: "stage_started", stage, at: startedAt })

		try {
			switch (stage) {
				case "pending":
				case "resolving":
					await this.runResolving()
					break
				case "competitor_set":
					await this.runCompetitorSet()
					break
				case "researching":
					await this.runResearching()
					break
				case "extracting":
					await this.runExtracting()
					break
				case "grading":
					await this.runGrading()
					break
				case "reconciling":
					await this.runReconciling()
					break
				case "synthesizing":
					await this.runSynthesizing()
					break
				case "persisting":
					await this.runPersisting()
					break
			}

			const newStage = (await this.storage.get<TerminalStage>("stage")) ?? stage
			await this.emit("stage_done", { type: "stage_done", stage, duration_ms: Date.now() - startedAt })
			logger.info("terminal_stage", {
				stage,
				duration_ms: Date.now() - startedAt,
				session_id: await this.storage.get<string>("session_id")
			})

			if (newStage !== "complete" && newStage !== "failed" && newStage !== "cancelled") {
				await this.storage.setAlarm(Date.now())
			} else if (newStage === "complete") {
				this.closeAllSubscribers()
			}
		} catch (e) {
			await this.markFailed(stage, e)
			return
		}

		// Watchdog: an idle non-terminal stage past the stall window fails the run.
		await this.runWatchdog()
	}

	// ── Stage: resolving — company row is passed in /start; validate + advance ─

	private async runResolving(): Promise<void> {
		const company = await this.requireCompany()
		if (!company.id || !company.ticker || !company.name)
			throw new RunnerAbort("company_invalid", "resolving")
		await this.log(`Resolved ${company.name} (${company.ticker})${company.is_us ? "" : " — research only, non-US"}`)
		await this.advance("resolving")
	}

	// ── Stage: competitor_set — reuse or create a Webset (non-fatal) ───────────

	private async runCompetitorSet(): Promise<void> {
		const company = await this.requireCompany()

		if (company.competitor_webset_id) {
			await this.log(`Reusing competitor set ${company.competitor_webset_id}`)
			await this.advance("competitor_set")
			return
		}

		try {
			const { id } = await createCompetitorWebset(company.name)
			await this.db
				.update(companies)
				.set({ competitor_webset_id: id, updated_at: new Date() })
				.where(eq(companies.id, company.id))
			await this.storage.put({ company: { ...company, competitor_webset_id: id }, updated_at: Date.now() })
			await this.log(`Built competitor set ${id}`)
		} catch (e) {
			// §WP2.1: non-fatal — research degrades gracefully without a competitor set.
			logger.warn("terminal_competitor_set_failed", { error: logger.serializeError(e) })
			await this.log("Competitor set unavailable — continuing without it")
		}
		await this.advance("competitor_set")
	}

	// ── Stage: researching — 9 frameworks, one concurrent fan-out ──────────────

	private async runResearching(): Promise<void> {
		const company = await this.requireCompany()
		const completed = (await this.storage.get<DimensionId[]>("researching_completed")) ?? []
		let failures = (await this.storage.get<number>("research_failures")) ?? 0

		const pending = pendingDimensions(completed)
		if (pending.length === 0) {
			await this.advance("researching")
			return
		}

		// All pending dimensions run concurrently in ONE alarm. Each is an
		// I/O-bound Exa agent run (poll-with-backoff), so allSettled overlaps the
		// waits: wall-clock drops to ~the slowest dimension (~9× faster than
		// one-per-alarm). Trade-off vs. the old per-dimension checkpoint: a
		// mid-alarm eviction re-runs (and re-pays) every in-flight dimension, not
		// just one — accepted for a ~3-min fan-out.
		// ponytail: flat fan-out — up to 9 dims × MAX_SEARCHES_PER_DIMENSION (12)
		// ≈ 100 concurrent Exa searches. If that trips Exa rate limits, batch the
		// map in groups of ~3, or move to one child DO per dimension to also
		// recover per-dimension resume.
		const results = await Promise.allSettled(
			pending.map((dim) => this.researchDimension(company, dim))
		)

		const evidencePatch: Record<string, DimensionEvidence> = {}
		for (let i = 0; i < pending.length; i++) {
			const dim = pending[i]
			// Empty-evidence marker on failure: this dimension grades at base (C, low
			// confidence) — correct behaviour, not an error (§WP2.1).
			const r = results[i]
			const evidence: DimensionEvidence =
				r.status === "fulfilled"
					? r.value
					: { dimension: dim, findings: [], screen_hits: [], evidence_items: [], searches_run: 0 }
			if (r.status === "rejected") failures++
			evidencePatch[`evidence:${dim}`] = evidence
			completed.push(dim)
			await this.log(
				`${dim} ${FRAMEWORKS[dim].name}: ${evidence.findings.length} findings, ${evidence.evidence_items.length} evidence items`
			)
		}

		await this.storage.put({
			...evidencePatch,
			researching_completed: completed,
			research_failures: failures,
			updated_at: Date.now()
		})

		await this.advance("researching")
	}

	// One dimension's research with a single retry. Throws on the second failure
	// so the allSettled caller can mark it failed (empty-evidence marker).
	private async researchDimension(
		company: StoredCompany,
		dim: DimensionId
	): Promise<DimensionEvidence> {
		const framework = FRAMEWORKS[dim]
		try {
			return await runDimensionResearch(company, framework)
		} catch {
			try {
				return await runDimensionResearch(company, framework) // 1 retry
			} catch (e2) {
				logger.warn("terminal_dimension_failed", {
					dimension: dim,
					error: logger.serializeError(e2)
				})
				throw e2
			}
		}
	}

	// ── Stage: extracting — fundamentals ───────────────────────────────────────

	private async runExtracting(): Promise<void> {
		const company = await this.requireCompany()
		await this.log("Extracting fundamentals from filings…")
		const extraction = await extractFundamentals(company)
		await this.storage.put({ extraction, updated_at: Date.now() })
		await this.log(
			`Extraction: ${extraction.figures.length} figures (${extraction.confidence} confidence), ` +
				`${extraction.disagreements.length} disagreement(s)`
		)
		await this.advance("extracting")
	}

	// ── Stage: grading — classify screens, grade each dimension, composite ─────

	private async runGrading(): Promise<void> {
		const company = await this.requireCompany()
		const evidenceList = await this.loadAllEvidence()

		const grades: DimensionGrade[] = []
		for (const ev of evidenceList) {
			const framework = FRAMEWORKS[ev.dimension]
			const screen_hits = classifyScreenHits(ev.screen_hits, ev.evidence_items)
			const prior = await this.priorGrade(company.id, ev.dimension)
			// WP6.1: F7/F8 get the ledger follow-through as a synthetic finding (null on
			// a first report — commitments are extracted in the persist stage, forward-only).
			let findings = ev.findings
			if (ev.dimension === "F7" || ev.dimension === "F8") {
				const fin = ftrSignalFinding(ev.dimension, await followThroughRate(this.db, company.id))
				if (fin) findings = [...findings, fin]
			}
			const grade = await gradeDimension({ ...ev, findings, screen_hits }, framework, prior)
			grades.push(grade)
			await this.log(`Graded ${ev.dimension}: ${grade.grade} (${grade.confidence})`)
		}

		const composite = computeComposite(grades, company.sector)
		await this.storage.put({ grades, composite, updated_at: Date.now() })
		await this.log(
			`Composite: ${composite.grade} (${composite.score}/100, ${composite.confidence})` +
				(composite.red_banner ? " — red banner" : "")
		)
		await this.advance("grading")
	}

	// ── Stage: reconciling — US only; never fails the run ──────────────────────

	private async runReconciling(): Promise<void> {
		const company = await this.requireCompany()
		let verdict: ReconciliationVerdict | null = null

		if (!company.is_us) {
			await this.log("Price reconciliation available for US listings only — skipped")
		} else {
			const grades = (await this.storage.get<DimensionGrade[]>("grades")) ?? []
			const composite = await this.storage.get<CompositeScore>("composite")
			const extraction = await this.storage.get<ExtractionResult>("extraction")
			if (composite && extraction) {
				try {
					verdict = await reconcilePrice(company, extraction, composite, grades)
				} catch (e) {
					// WP3.1 may not be merged (throws "not implemented") — and any runtime
					// error must never fail the run; verdict falls back to null.
					logger.warn("terminal_reconcile_skipped", { error: logger.serializeError(e) })
					await this.log("Price reconciliation unavailable — continuing without a verdict")
					verdict = null
				}
			}
		}

		await this.storage.put({ verdict, updated_at: Date.now() })
		await this.advance("reconciling")
	}

	// ── Stage: synthesizing — retry once, then fail (invariant 6) ──────────────

	private async runSynthesizing(): Promise<void> {
		const company = await this.requireCompany()
		const grades = (await this.storage.get<DimensionGrade[]>("grades")) ?? []
		const composite = await this.storage.get<CompositeScore>("composite")
		const verdict = (await this.storage.get<ReconciliationVerdict | null>("verdict")) ?? null
		if (!composite) throw new RunnerAbort("composite_missing", "synthesizing")

		await this.log("Writing the report…")
		// WP6.1: feed the announcement-ledger follow-through into synthesis. Empty
		// ledger (this run's commitments aren't extracted until persist) → null, so
		// synthesis renders "no data yet" rather than a hollow all-zero stat (§5.5).
		const ledger = await followThroughRate(this.db, company.id)
		const ledgerStats = ledger.counts.total > 0 ? ledger : null
		let out: Synthesis
		try {
			out = await synthesize(company, grades, composite, verdict, ledgerStats)
		} catch {
			try {
				out = await synthesize(company, grades, composite, verdict, ledgerStats)
			} catch (e2) {
				// Never publish non-compliant text (invariant 6).
				throw new RunnerAbort(
					e2 instanceof Error ? e2.message : "synthesis_failed",
					"synthesizing"
				)
			}
		}

		await this.storage.put({ synthesis: out, updated_at: Date.now() })
		await this.advance("synthesizing")
	}

	// ── Stage: persisting — report + scores + evidence, THEN debit (refundable) ─

	private async runPersisting(): Promise<void> {
		const company = await this.requireCompany()
		const userId = (await this.storage.get<string>("user_id"))!
		const creditCost =
			(await this.storage.get<number>("credit_cost")) ?? TERMINAL_CONFIG.CREDITS_DEEP_REPORT
		const reason =
			(await this.storage.get<"terminal_report" | "terminal_rerun">("reason")) ?? "terminal_report"
		const grades = (await this.storage.get<DimensionGrade[]>("grades")) ?? []
		const composite = await this.storage.get<CompositeScore>("composite")
		const extraction = (await this.storage.get<ExtractionResult>("extraction")) ?? null
		const verdict = (await this.storage.get<ReconciliationVerdict | null>("verdict")) ?? null
		const synthesis = await this.storage.get<Synthesis>("synthesis")
		if (!composite || !synthesis) throw new RunnerAbort("persist_state_missing", "persisting")

		const evidenceList = await this.loadAllEvidence()
		const allItems = collectEvidenceItems(evidenceList)
		// Composite-level snapshot hash over every evidence item (§WP2.1).
		const snapshotHash = await evidenceHash("composite", RUBRIC_VERSION, allItems)
		const citations = dedupeCitations(grades.flatMap((g) => g.top_citations))

		// 1. terminal_reports (slug via reports.ts pattern).
		const report = await createTerminalReport(this.db, {
			user_id: userId,
			company_id: company.id,
			rubric_version: RUBRIC_VERSION,
			composite,
			dimensions: grades,
			extraction,
			verdict,
			bear_bull: { bear: synthesis.bear, bull: synthesis.bull },
			narrative: synthesis.narrative,
			citations,
			evidence_snapshot_hash: snapshotHash,
			credit_cost: creditCost
		})

		// 2. append 10 dimension_scores rows (9 dimensions + composite).
		const scoreRows: (typeof dimensionScores.$inferInsert)[] = grades.map((g) => ({
			id: crypto.randomUUID(),
			company_id: company.id,
			dimension: g.dimension,
			grade: g.grade,
			score: g.score,
			confidence: g.confidence,
			flags: g.flags,
			citations: g.top_citations,
			evidence_hash: g.evidence_hash,
			rubric_version: g.rubric_version,
			report_id: report.id
		}))
		scoreRows.push({
			id: crypto.randomUUID(),
			company_id: company.id,
			dimension: "composite",
			grade: composite.grade,
			score: composite.score,
			confidence: composite.confidence,
			flags: [],
			citations: [],
			evidence_hash: snapshotHash,
			rubric_version: RUBRIC_VERSION,
			report_id: report.id
		})
		for (const batch of chunkForD1(scoreRows, 12)) {
			await this.db.insert(dimensionScores).values(batch)
		}

		// 3. bulk-insert evidence_items (origin report_run; ignore (company_id,
		//    content_hash) conflicts on the dedup unique index).
		const evidenceRows = allItems.map((it) => ({
			id: crypto.randomUUID(),
			company_id: company.id,
			url: it.url,
			title: it.title,
			source_domain: it.source_domain,
			published_at: toDateOrNull(it.published_at),
			snippet: it.snippet,
			content_hash: it.content_hash,
			origin: "report_run",
			dimensions: it.dimensions
		}))
		for (const batch of chunkForD1(evidenceRows, 11)) {
			await this.db.insert(evidenceItems).values(batch).onConflictDoNothing()
		}

		// WP6.1: extract dated commitments from this run's evidence into the
		// forward-only ledger. Non-fatal — a failed extraction must never fail the
		// report (and never block the debit). Triage covers the watchlist path.
		try {
			await extractCommitments(
				this.db,
				{ id: company.id, name: company.name, ticker: company.ticker },
				allItems.map((it) => ({ title: it.title, snippet: it.snippet, url: it.url }))
			)
		} catch (e) {
			logger.warn("terminal_ledger_extract_skipped", { error: logger.serializeError(e) })
		}

		// 4. atomic credit debit + credit_transactions, refund on txn-insert failure
		//    (persistReportAndDebit pattern). Debit is last per §WP2.1 ordering.
		const deducted = await this.db
			.update(authUser)
			.set({ credits: sql`${authUser.credits} - ${creditCost}` })
			.where(and(eq(authUser.id, userId), sql`${authUser.credits} >= ${creditCost}`))
			.returning({ id: authUser.id })
		if (deducted.length === 0) throw new RunnerAbort("insufficient_credits", "persisting")

		try {
			await this.db.insert(creditTransactions).values({
				id: crypto.randomUUID(),
				user_id: userId,
				amount: -creditCost,
				reason
			})
		} catch (e) {
			await this.db
				.update(authUser)
				.set({ credits: sql`${authUser.credits} + ${creditCost}` })
				.where(eq(authUser.id, userId))
			throw e
		}

		await this.storage.put({
			report_id: report.id,
			report_slug: report.slug,
			stage: "complete" satisfies TerminalStage,
			updated_at: Date.now()
		})
		await this.updateRunRow({ status: "complete", stage: "complete", result_slug: report.slug })
		await this.emit("result", { type: "result", slug: report.slug })
	}

	// ── Stage helpers ──────────────────────────────────────────────────────────

	private async advance(stage: TerminalStage): Promise<void> {
		const next = nextStage(stage)
		await this.storage.put({ stage: next, updated_at: Date.now() })
		await this.updateRunRow({ stage: next })
	}

	private async requireCompany(): Promise<StoredCompany> {
		const company = await this.storage.get<StoredCompany>("company")
		if (!company) throw new RunnerAbort("company_missing", "resolving")
		return company
	}

	private async loadAllEvidence(): Promise<DimensionEvidence[]> {
		const out: DimensionEvidence[] = []
		for (const dim of DIMENSION_ORDER) {
			const ev = await this.storage.get<DimensionEvidence>(`evidence:${dim}`)
			if (ev) out.push(ev)
		}
		return out
	}

	private async priorGrade(companyId: string, dimension: DimensionId): Promise<DimensionGrade | null> {
		const [row] = await this.db
			.select()
			.from(dimensionScores)
			.where(and(eq(dimensionScores.company_id, companyId), eq(dimensionScores.dimension, dimension)))
			.orderBy(desc(dimensionScores.created_at))
			.limit(1)
		if (!row) return null
		// Only `score` drives trend; the rest reconstructs a valid DimensionGrade.
		return {
			dimension,
			grade: row.grade,
			score: row.score,
			confidence: row.confidence as DimensionGrade["confidence"],
			trend: "flat",
			flags: (row.flags as DimensionGrade["flags"]) ?? [],
			top_citations: (row.citations as Citation[]) ?? [],
			summary: "",
			evidence_hash: row.evidence_hash,
			rubric_version: row.rubric_version
		}
	}

	// ── D1 terminal_runs index (mirrors pipeline_runs) ─────────────────────────

	private async upsertRunRow(row: {
		session_id: string
		user_id: string
		company_id: string
		status: string
		stage: TerminalStage
		created_at: number
		updated_at: number
	}): Promise<void> {
		await this.db
			.insert(terminalRuns)
			.values(row)
			.onConflictDoUpdate({
				target: terminalRuns.session_id,
				set: { status: row.status, stage: row.stage, updated_at: row.updated_at }
			})
	}

	protected async updateRunRow(
		patch: Partial<{ status: string; stage: string; error: string | null; result_slug: string | null }>
	): Promise<void> {
		const sessionId = await this.storage.get<string>("session_id")
		if (!sessionId) return
		await this.db
			.update(terminalRuns)
			.set({ ...patch, updated_at: Date.now() })
			.where(eq(terminalRuns.session_id, sessionId))
	}
}
