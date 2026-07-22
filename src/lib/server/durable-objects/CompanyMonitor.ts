// CompanyMonitor (WP5.1, SPEC v0.3 §3 / §2.6 / §5 invariant 4). One DO instance
// per company (`idFromName(company_id)`). Copies TerminalReportRunner's storage +
// alarm discipline: the alarm does at most ONE expensive unit per invocation (a
// single-dimension rescore = one Exa agent run) then re-arms, so a slow rescore
// never trips the ~15-min alarm execution limit.
//
// Watchers, evidence, scores and alerts all live in D1 (the shared source of
// truth); the DO keeps almost no local state — just `company_id` and the pending
// per-dimension rescore queue. This keeps a company's monitoring correct even if
// the DO is evicted between alarms.
//
// Design decisions (documented per the WP brief):
//  - /ingest triages inline. A monitor run yields a handful of new items (Exa
//    dedups server-side across runs), so 1–5 short structured LLM calls stay well
//    under the webhook budget. ponytail: if payloads ever grow, move triage to an
//    inbox drained on the alarm — the alarm loop already exists.
//  - Rescore grades over the persisted DB evidence set (not the fresh agent
//    items), so the graded `evidence_hash` equals what the delta gate recomputes
//    next tick — the gate stays stable and only fires when new evidence lands
//    (§5.4 reproducibility). The fresh agent run supplies findings/screens only.

import type { DurableObjectState, DurableObjectStorage, D1Database } from "@cloudflare/workers-types"
import type { EmailBinding } from "$lib/server/auth"

import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm"
import { createDb } from "$lib/server/db/client"
import {
	profiles,
	commitments,
	companies,
	creditTransactions,
	dimensionScores,
	evidenceItems,
	terminalAlerts,
	watchlistEntries
} from "$lib/server/db/schema"
import { runDimensionResearch, gradeDimension, computeComposite } from "$lib/server/terminal"
import { runDueCheck, followThroughRate, ftrSignalFinding } from "$lib/server/terminal/ledger"
import { triageEvidence } from "$lib/server/terminal/triage"
import { classifyScreenHits } from "$lib/server/terminal/screens"
import { checkLanguageCompliance } from "$lib/server/terminal/synthesis"
import { evidenceHash, contentHash, COMPANY_CONTROLLED_DOMAINS } from "$lib/server/terminal/scoring"
import { createMonitor, deleteMonitor, parseMonitorWebhook } from "$lib/server/terminal/exa"
import { FRAMEWORKS, RUBRIC_VERSION } from "$lib/server/terminal/rubrics"
import { TERMINAL_CONFIG } from "$lib/server/terminal/config"
import { DIMENSION_IDS } from "$lib/types/terminal"
import type {
	Citation,
	Confidence,
	DimensionGrade,
	DimensionId,
	EvidenceItem,
	ScreenHit,
	TriageResult
} from "$lib/types/terminal"
import { logger } from "$lib/server/logger"
import { toDateOrNull } from "./streaming-runner"

type Env = {
	DB: D1Database
	[key: string]: unknown
}

// A dimension queued for rescore. `immediate` (a red_flag hit or a forced
// /rescore) bypasses the RESCORE_BATCH_HOURS wait; `queued_at` is the first time
// it entered the queue so batched items age from their earliest trigger.
type PendingEntry = { queued_at: number; immediate: boolean }
type PendingMap = Partial<Record<DimensionId, PendingEntry>>

// Persisted on companies.monitor_state — ids + the webhookSecret each monitor
// returns (WP5.2 may verify webhook signatures with it). null == creation tried
// and failed (local-dev URL, or Websets 401) so we know not to recreate blindly.
type MonitorState = {
	news_monitor_id: string | null
	news_secret: string | null
	policy_monitor_id: string | null
	policy_secret: string | null
	competitor_monitor_id: string | null
	competitor_secret: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const SIX_MONTHS_MS = 6 * 30 * DAY_MS

// ─── Pure decisions (exported for unit tests — the DO body needs miniflare) ────

export const DIMENSIONS: readonly DimensionId[] = DIMENSION_IDS

/**
 * next_billing_at math: exactly one calendar month later, clamping the day so
 * Jan 31 → Feb 28 (never overflowing to Mar 3). Preserves the time component.
 * UTC throughout so the result is deterministic regardless of host TZ.
 */
export function addOneMonth(from: Date): Date {
	const d = new Date(from.getTime())
	const day = d.getUTCDate()
	d.setUTCDate(1) // avoid setUTCMonth overflow from a long source month
	d.setUTCMonth(d.getUTCMonth() + 1)
	const daysInTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
	d.setUTCDate(Math.min(day, daysInTarget))
	return d
}

/** §2.6 batch gate: due when immediate (red_flag/forced) or aged past the batch window. */
export function rescoreDue(entry: PendingEntry, now: number, batchMs: number): boolean {
	return entry.immediate || now - entry.queued_at >= batchMs
}

/** Pick one due dimension for this alarm — immediate ones first, then batched, F1..F9 order. */
export function pickDueDimension(pending: PendingMap, now: number, batchMs: number): DimensionId | null {
	let batched: DimensionId | null = null
	for (const dim of DIMENSIONS) {
		const e = pending[dim]
		if (!e || !rescoreDue(e, now, batchMs)) continue
		if (e.immediate) return dim
		if (!batched) batched = dim
	}
	return batched
}

/**
 * §5.4 evidence-delta gate: skip the rescore (grade stands, no re-research, no
 * LLM spend) when the current evidence hash matches the last graded hash.
 */
export function rescoreShouldSkip(currentHash: string, priorHash: string | null): boolean {
	return priorHash != null && currentHash === priorHash
}

/** Alert only when the grade or confidence actually moved vs the prior row (never on a first grade). */
export function alertNeeded(
	prior: { grade: string; confidence: string } | null,
	next: { grade: string; confidence: string }
): boolean {
	if (!prior) return false
	return prior.grade !== next.grade || prior.confidence !== next.confidence
}

// §2.6 news monitor @6h — a broad query spanning the material-event classes triage
// cares about (deals, exec changes, recalls, investigations, restatements) so the
// monitor's server-side dedup surfaces them fast (company profile refresh is weekly, §6).
export function newsMonitorQuery(company: string): string {
	return (
		`${company} acquisition OR merger OR deal OR divestiture OR ` +
		`"chief executive" OR CEO OR CFO OR resignation OR "executive departure" OR ` +
		`recall OR investigation OR probe OR subpoena OR lawsuit OR restatement OR ` +
		`"guidance" OR layoffs OR "short seller"`
	)
}

// §2.6 policy monitor @1d — restricted to the F2 regulator domains (below).
export function policyMonitorQuery(company: string): string {
	return (
		`${company} regulator OR regulation OR enforcement OR investigation OR ` +
		`sanction OR fine OR subsidy OR tariff OR license OR approval`
	)
}

// §2.6 competitor monitor @7d — only created when a competitor webset exists.
export function competitorMonitorQuery(company: string): string {
	return `${company} competitor OR rival OR "market share" OR "new entrant"`
}

/** §2.6 policy domains = the regulator domains declared in the F2 rubric's signal recipes. */
export function policyMonitorDomains(): string[] {
	const domains = new Set<string>()
	for (const sig of FRAMEWORKS.F2.signals) for (const d of sig.recipe.domains ?? []) domains.add(d)
	return [...domains]
}

/** Neutral fallback alert line (evidence-language compliant) when triage reasons aren't usable. */
export function neutralAlertReason(dim: DimensionId, oldGrade: string | null, newGrade: string): string {
	return `${dim} grade moved ${oldGrade ?? "—"} → ${newGrade} on newly cited evidence; see sources.`
}

// ─── DO class ──────────────────────────────────────────────────────────────────

export class CompanyMonitor {
	private readonly env: Env
	private readonly storage: DurableObjectStorage
	private readonly db: ReturnType<typeof createDb>

	constructor(state: DurableObjectState, env: Env) {
		this.env = env
		this.storage = state.storage
		this.db = createDb(env.DB)
	}

	private batchMs(): number {
		return TERMINAL_CONFIG.RESCORE_BATCH_HOURS * 60 * 60 * 1000
	}

	// ── HTTP entry ─────────────────────────────────────────────────────────────

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		try {
			switch (url.pathname) {
				case "/watch":
					return await this.handleWatch(request)
				case "/unwatch":
					return await this.handleUnwatch(request)
				case "/ingest":
					return await this.handleIngest(request)
				case "/rescore":
					return await this.handleRescore(request)
				case "/status":
					return await this.handleStatus()
				case "/tick":
					return await this.handleTick()
				default:
					return new Response("not found", { status: 404 })
			}
		} catch (e) {
			logger.error("company_monitor_fetch_failed", {
				path: url.pathname,
				error: logger.serializeError(e)
			})
			return this.json({ error: "internal_error" }, 500)
		}
	}

	// ── /watch { user_id, company_id } ─────────────────────────────────────────

	private async handleWatch(request: Request): Promise<Response> {
		const { user_id, company_id } = (await request.json()) as { user_id?: string; company_id?: string }
		if (!user_id || !company_id) return this.json({ error: "user_id and company_id required" }, 400)

		await this.storage.put("company_id", company_id)

		// Idempotent upsert: reactivate (fresh billing cycle) if inactive; leave an
		// already-active row untouched so re-watching can't dodge or reset billing.
		const nextBilling = addOneMonth(new Date())
		const [existing] = await this.db
			.select()
			.from(watchlistEntries)
			.where(and(eq(watchlistEntries.user_id, user_id), eq(watchlistEntries.company_id, company_id)))
			.limit(1)

		if (!existing) {
			await this.db.insert(watchlistEntries).values({
				id: crypto.randomUUID(),
				user_id,
				company_id,
				active: true,
				next_billing_at: nextBilling
			})
		} else if (!existing.active) {
			await this.db
				.update(watchlistEntries)
				.set({ active: true, next_billing_at: nextBilling })
				.where(eq(watchlistEntries.id, existing.id))
		}

		// First watcher bootstraps the monitors (monitor_state still null == none yet).
		const company = await this.loadCompany(company_id)
		if (company && company.monitor_state == null) {
			await this.bootstrapMonitors(company)
		}

		await this.scheduleNext(company_id, Date.now())
		return this.json({ ok: true, watching: true })
	}

	// ── /unwatch { user_id, company_id } ───────────────────────────────────────

	private async handleUnwatch(request: Request): Promise<Response> {
		const { user_id, company_id } = (await request.json()) as { user_id?: string; company_id?: string }
		if (!user_id || !company_id) return this.json({ error: "user_id and company_id required" }, 400)

		await this.db
			.update(watchlistEntries)
			.set({ active: false })
			.where(and(eq(watchlistEntries.user_id, user_id), eq(watchlistEntries.company_id, company_id)))

		const remaining = await this.activeWatchers(company_id)
		if (remaining.length === 0) {
			await this.teardownMonitors(company_id)
			await this.storage.delete("pending")
		}
		return this.json({ ok: true, watching: false, remaining_active: remaining.length })
	}

	// ── /ingest (raw webhook payload) ──────────────────────────────────────────

	private async handleIngest(request: Request): Promise<Response> {
		const body = (await request.json()) as { company_id?: string; payload?: unknown }
		const company_id = body.company_id ?? (await this.storage.get<string>("company_id"))
		if (!company_id) return this.json({ error: "company_id required" }, 400)
		await this.storage.put("company_id", company_id)

		const company = await this.loadCompany(company_id)
		if (!company) return this.json({ error: "unknown company" }, 404)

		// Payload may arrive wrapped ({ company_id, payload }) or raw — parse whichever.
		const items = parseMonitorWebhook(body.payload ?? body)
		const now = Date.now()
		const pending = await this.loadPending()

		let ingested = 0
		let deduped = 0
		let armImmediate = false

		for (const item of items) {
			const content_hash = await contentHash({
				url: item.url,
				published_at: item.published_at,
				snippet: item.snippet
			})

			// content_hash dedupe against the (company_id, content_hash) unique index —
			// skip fully if it already exists (no re-triage, no re-insert).
			const [dup] = await this.db
				.select({ id: evidenceItems.id })
				.from(evidenceItems)
				.where(and(eq(evidenceItems.company_id, company_id), eq(evidenceItems.content_hash, content_hash)))
				.limit(1)
			if (dup) {
				deduped++
				continue
			}

			const evItem: EvidenceItem = {
				id: crypto.randomUUID(),
				url: item.url,
				title: item.title,
				source_domain: item.source,
				published_at: item.published_at,
				snippet: item.snippet,
				content_hash,
				origin: "monitor",
				dimensions: [],
				// PR-wire safety-net set (§2.5.11); the company's own domain isn't
				// known here — the rescore's agent run re-marks it if it matters.
				company_controlled: COMPANY_CONTROLLED_DOMAINS.has(item.source.toLowerCase())
			}

			const triage: TriageResult = await triageEvidence(company, evItem)

			await this.db
				.insert(evidenceItems)
				.values({
					id: evItem.id,
					company_id,
					url: evItem.url,
					title: evItem.title,
					source_domain: evItem.source_domain,
					published_at: toDateOrNull(evItem.published_at),
					snippet: evItem.snippet,
					content_hash,
					origin: "monitor",
					dimensions: triage.dimensions,
					triage
				})
				.onConflictDoNothing()
			ingested++

			// Dated commitment → ledger row (status pending). The full check loop is WP6.1's.
			if (triage.commitment) {
				const promised = toDateOrNull(triage.commitment.promised_date)
				await this.db.insert(commitments).values({
					id: crypto.randomUUID(),
					company_id,
					what: triage.commitment.what,
					promised_date: promised,
					source_url: evItem.url,
					status: "pending",
					next_check_at: promised ?? new Date(now + SIX_MONTHS_MS)
				})
			}

			// Route materiality into the rescore queue (§5 invariant 4).
			if (triage.materiality === "red_flag") {
				const dims = triage.dimensions.length ? triage.dimensions : (["F9"] as DimensionId[])
				for (const d of dims) pending[d] = { queued_at: now, immediate: true }
				armImmediate = true
			} else if (triage.materiality === "material") {
				for (const d of triage.dimensions) {
					if (!pending[d]) pending[d] = { queued_at: now, immediate: false }
				}
			}
			// minor / none → stored only.
		}

		await this.savePending(pending)
		// Arm the alarm: immediately for a red_flag, else on the ordinary schedule.
		await this.scheduleNext(company_id, armImmediate ? now - 1 : now)

		return this.json({ ok: true, ingested, deduped })
	}

	// ── /rescore { dimensions? } — force-queue (earnings re-runs, WP2.x) ───────

	private async handleRescore(request: Request): Promise<Response> {
		const company_id = await this.storage.get<string>("company_id")
		if (!company_id) return this.json({ error: "not watching any company" }, 400)

		let dims: readonly DimensionId[] = DIMENSIONS
		try {
			const b = (await request.json()) as { dimensions?: string[] }
			if (Array.isArray(b.dimensions) && b.dimensions.length) {
				dims = b.dimensions.filter((d): d is DimensionId => DIMENSIONS.includes(d as DimensionId))
			}
		} catch {
			/* empty body → all dimensions */
		}

		const now = Date.now()
		const pending = await this.loadPending()
		for (const d of dims) pending[d] = { queued_at: now, immediate: true }
		await this.savePending(pending)
		await this.scheduleNext(company_id, now - 1)
		return this.json({ ok: true, queued: dims })
	}

	// ── /status ────────────────────────────────────────────────────────────────

	private async handleStatus(): Promise<Response> {
		const company_id = await this.storage.get<string>("company_id")
		const pending = await this.loadPending()
		const alarm = await this.storage.getAlarm()
		const company = company_id ? await this.loadCompany(company_id) : null
		const watchers = company_id ? await this.activeWatchers(company_id) : []
		return this.json({
			company_id: company_id ?? null,
			active_watchers: watchers.length,
			pending_rescores: pending,
			monitor_state: (company?.monitor_state as MonitorState | null) ?? null,
			alarm_at: alarm ?? null
		})
	}

	// ── /tick (dev only) — run one alarm cycle synchronously for acceptance ────

	private async handleTick(): Promise<Response> {
		if (this.env.DEV_AUTH_BYPASS !== "1") return new Response("not found", { status: 404 })
		await this.alarm()
		return this.handleStatus()
	}

	// ── Alarm: daily housekeeping + one opportunistic rescore ──────────────────

	async alarm(): Promise<void> {
		const company_id = await this.storage.get<string>("company_id")
		if (!company_id) return
		const now = Date.now()

		// (a) due billing — cheap D1 debits, so all due watchers this pass.
		await this.processBilling(company_id, now)

		// (b) pending rescores — ONE dimension per invocation (the expensive unit).
		const pending = await this.loadPending()
		const dim = pickDueDimension(pending, now, this.batchMs())
		if (dim) {
			try {
				await this.runRescore(company_id, dim)
			} catch (e) {
				logger.error("company_monitor_rescore_failed", {
					company_id,
					dimension: dim,
					error: logger.serializeError(e)
				})
			}
			delete pending[dim]
			await this.savePending(pending)
		}

		// (c) WP6.1: one due ledger check per invocation (the one-expensive-unit
		//     discipline — ≤3 searches + one LLM call). Oldest due commitment first.
		await this.runOneLedgerCheck(company_id, now)

		await this.scheduleNext(company_id, now)
	}

	// ── WP6.1 ledger: one due commitment check per alarm ───────────────────────

	private async runOneLedgerCheck(company_id: string, now: number): Promise<void> {
		const [due] = await this.db
			.select()
			.from(commitments)
			.where(
				and(
					eq(commitments.company_id, company_id),
					isNotNull(commitments.next_check_at),
					sql`${commitments.next_check_at} <= ${Math.floor(now / 1000)}`
				)
			)
			.orderBy(asc(commitments.next_check_at))
			.limit(1)
		if (!due) return

		const company = await this.loadCompany(company_id)
		if (!company) return

		try {
			const status = await runDueCheck(
				{ id: company.id, name: company.name, ticker: company.ticker },
				due,
				{ db: this.db, now }
			)
			logger.info("company_monitor_ledger_checked", { company_id, commitment_id: due.id, status })
		} catch (e) {
			logger.error("company_monitor_ledger_check_failed", {
				company_id,
				commitment_id: due.id,
				error: logger.serializeError(e)
			})
		}
	}

	// ── Billing (§2.6) ─────────────────────────────────────────────────────────

	private async processBilling(company_id: string, now: number): Promise<void> {
		const due = await this.db
			.select()
			.from(watchlistEntries)
			.where(
				and(
					eq(watchlistEntries.company_id, company_id),
					eq(watchlistEntries.active, true),
					sql`${watchlistEntries.next_billing_at} <= ${Math.floor(now / 1000)}`
				)
			)

		const cost = TERMINAL_CONFIG.CREDITS_WATCHLIST_MONTHLY
		for (const entry of due) {
			// Advance-first idempotence: claim the cycle before charging so a crash
			// after this can only ever SKIP a month, never double-bill (§ brief: guard
			// with next_billing_at). Cycles stay aligned by advancing from the due date.
			await this.db
				.update(watchlistEntries)
				.set({ next_billing_at: addOneMonth(entry.next_billing_at) })
				.where(eq(watchlistEntries.id, entry.id))

			const deducted = await this.db
				.update(profiles)
				.set({ credits: sql`${profiles.credits} - ${cost}` })
				.where(and(eq(profiles.user_id, entry.user_id), sql`${profiles.credits} >= ${cost}`))
				.returning({ id: profiles.user_id })

			if (deducted.length > 0) {
				await this.db.insert(creditTransactions).values({
					id: crypto.randomUUID(),
					user_id: entry.user_id,
					amount: -cost,
					reason: "watchlist_monthly"
				})
			} else {
				// Insufficient credits → pause monitoring + tell the user.
				await this.db
					.update(watchlistEntries)
					.set({ active: false })
					.where(eq(watchlistEntries.id, entry.id))
				await this.db.insert(terminalAlerts).values({
					id: crypto.randomUUID(),
					user_id: entry.user_id,
					company_id,
					dimension: "billing",
					old_grade: null,
					new_grade: "paused",
					reason: `Monthly watchlist billing needs ${cost} credits — monitoring paused. Add credits to resume.`
				})
			}
		}
	}

	// ── Rescore one dimension (§5 invariant 4) ─────────────────────────────────

	private async runRescore(company_id: string, dim: DimensionId): Promise<void> {
		const company = await this.loadCompany(company_id)
		if (!company) return
		const framework = FRAMEWORKS[dim]

		// The dimension's current persisted evidence set (report-run + monitor items).
		const rows = await this.evidenceForDimension(company_id, dim)
		const items = rows.map((r) => this.reconstructItem(r))
		const currentHash = await evidenceHash(dim, framework.version, items)

		const priorRow = await this.latestScore(company_id, dim)

		// Evidence-delta gate: unchanged hash ⇒ grade stands, no re-research, no LLM.
		if (rescoreShouldSkip(currentHash, priorRow?.evidence_hash ?? null)) {
			logger.info("company_monitor_rescore_skip", { company_id, dimension: dim, evidence_hash: currentHash })
			return
		}

		const seedItems = items.filter((i) => i.origin === "monitor")
		const research = await runDimensionResearch(company, framework, { seedItems })
		const screen_hits = classifyScreenHits(research.screen_hits, items)
		const prior = priorRow ? this.reconstructGrade(priorRow) : null

		// WP6.1: fold the ledger follow-through into F7/F8 as a synthetic finding.
		let findings = research.findings
		if (dim === "F7" || dim === "F8") {
			const fin = ftrSignalFinding(dim, await followThroughRate(this.db, company_id))
			if (fin) findings = [...findings, fin]
		}

		// Grade over the persisted DB set (`items`) — not the fresh agent items — so
		// grade.evidence_hash === currentHash and the delta gate stays stable next tick.
		const grade = await gradeDimension(
			{ dimension: dim, findings, screen_hits, evidence_items: items, searches_run: research.searches_run },
			framework,
			prior
		)

		await this.db.insert(dimensionScores).values({
			id: crypto.randomUUID(),
			company_id,
			dimension: dim,
			grade: grade.grade,
			score: grade.score,
			confidence: grade.confidence,
			flags: grade.flags,
			citations: grade.top_citations,
			evidence_hash: grade.evidence_hash,
			rubric_version: grade.rubric_version,
			report_id: null
		})

		await this.appendComposite(company, dim, grade)

		if (alertNeeded(prior, grade)) {
			await this.emitAlerts(company, dim, prior, grade, rows)
		}
		logger.info("company_monitor_rescored", {
			company_id,
			dimension: dim,
			grade: grade.grade,
			confidence: grade.confidence,
			alerted: alertNeeded(prior, grade)
		})
	}

	private async appendComposite(
		company: typeof companies.$inferSelect,
		rescoredDim: DimensionId,
		newGrade: DimensionGrade
	): Promise<void> {
		const grades: DimensionGrade[] = []
		for (const d of DIMENSIONS) {
			if (d === rescoredDim) {
				grades.push(newGrade)
				continue
			}
			const row = await this.latestScore(company.id, d)
			if (row) grades.push(this.reconstructGrade(row))
		}
		if (grades.length === 0) return

		const composite = computeComposite(grades, company.sector)
		// The composite row isn't delta-gated; a stable hash over the per-dimension
		// hashes is enough to identify this snapshot.
		const compHash = await evidenceHash(
			"composite",
			RUBRIC_VERSION,
			grades.map((g) => ({ content_hash: g.evidence_hash }))
		)
		await this.db.insert(dimensionScores).values({
			id: crypto.randomUUID(),
			company_id: company.id,
			dimension: "composite",
			grade: composite.grade,
			score: composite.score,
			confidence: composite.confidence,
			flags: [],
			citations: [],
			evidence_hash: compHash,
			rubric_version: RUBRIC_VERSION,
			report_id: null
		})
	}

	private async emitAlerts(
		company: typeof companies.$inferSelect,
		dim: DimensionId,
		prior: DimensionGrade | null,
		grade: DimensionGrade,
		evidenceRows: (typeof evidenceItems.$inferSelect)[]
	): Promise<void> {
		const watchers = await this.activeWatchers(company.id)
		if (watchers.length === 0) return

		const reason = this.buildAlertReason(dim, prior, grade, evidenceRows)

		for (const w of watchers) {
			const alertId = crypto.randomUUID()
			await this.db.insert(terminalAlerts).values({
				id: alertId,
				user_id: w.user_id,
				company_id: company.id,
				dimension: dim,
				old_grade: prior?.grade ?? null,
				new_grade: grade.grade,
				reason,
				citations: grade.top_citations
			})
			const sent = await this.sendAlertEmail(w.user_id, company, dim, prior, grade, reason)
			if (sent) {
				await this.db.update(terminalAlerts).set({ emailed: true }).where(eq(terminalAlerts.id, alertId))
			}
		}
	}

	// Evidence-language one-liner from the driving triage reason; scrub or fall back.
	private buildAlertReason(
		dim: DimensionId,
		prior: DimensionGrade | null,
		grade: DimensionGrade,
		evidenceRows: (typeof evidenceItems.$inferSelect)[]
	): string {
		const candidate = evidenceRows
			.filter((r) => {
				const t = r.triage as TriageResult | null
				return r.origin === "monitor" && t != null && Array.isArray(t.dimensions) && t.dimensions.includes(dim)
			})
			.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]
		const raw = (candidate?.triage as TriageResult | null)?.reason ?? ""
		if (!raw || checkLanguageCompliance(raw).length > 0) {
			return neutralAlertReason(dim, prior?.grade ?? null, grade.grade)
		}
		return raw
	}

	// Cloudflare Email Sending via the EMAIL binding (dynamic env access + swallow
	// failures, mirrors auth.ts). Returns whether it sent.
	private async sendAlertEmail(
		userId: string,
		company: typeof companies.$inferSelect,
		dim: DimensionId,
		prior: DimensionGrade | null,
		grade: DimensionGrade,
		reason: string
	): Promise<boolean> {
		try {
			const email = this.env.EMAIL as EmailBinding | undefined
			if (!email) return false
			const [user] = await this.db
				.select({ email: profiles.email })
				.from(profiles)
				.where(eq(profiles.user_id, userId))
				.limit(1)
			if (!user?.email) return false

			const base = String(this.env.PUBLIC_BASE_URL ?? "")
			const fromDomain =
				String(this.env.EMAIL_FROM_DOMAIN ?? "") || (base ? new URL(base).hostname : "aslanfinance.app")

			await email.send({
				from: { email: `alerts@${fromDomain}`, name: "Aslan Terminal" },
				to: user.email,
				subject: `${company.ticker} — ${dim} grade ${prior?.grade ?? "—"} → ${grade.grade}`,
				text: `${company.name} (${company.ticker}): ${dim} moved ${prior?.grade ?? "—"} → ${grade.grade} (${grade.confidence} confidence).\n\n${reason}\n\nOpen the Board: ${base}/board`,
				html: `<div style="font-family:sans-serif;color:#f0ede8;background:#0a0a0a;padding:32px;">
					<p style="margin:0 0 12px;font-size:15px;"><b>${company.name} (${company.ticker})</b></p>
					<p style="margin:0 0 12px;">${dim} moved <b>${prior?.grade ?? "—"}</b> → <b>${grade.grade}</b> (${grade.confidence} confidence).</p>
					<p style="margin:0 0 16px;color:#c9c4bd;">${reason}</p>
					<p style="margin:0;"><a href="${base}/board" style="color:#f0ede8;">Open the Board</a></p>
				</div>`
			})
			return true
		} catch (e) {
			logger.warn("company_monitor_alert_email_failed", { error: logger.serializeError(e) })
			return false
		}
	}

	// ── Monitor lifecycle ──────────────────────────────────────────────────────

	private async bootstrapMonitors(company: typeof companies.$inferSelect): Promise<void> {
		const base = String(this.env.PUBLIC_BASE_URL ?? "")
		const token = String(this.env.EXA_WEBHOOK_TOKEN ?? "")
		const webhookUrl = `${base}/api/webhooks/exa/${token}`

		const state: MonitorState = {
			news_monitor_id: null,
			news_secret: null,
			policy_monitor_id: null,
			policy_secret: null,
			competitor_monitor_id: null,
			competitor_secret: null
		}

		// Each create is non-fatal: Exa 400s webhook URLs on localhost/private IPs
		// (local dev), and Websets/monitors 401 without a Pro plan. Log, store null, continue.
		try {
			const news = await createMonitor({
				query: newsMonitorQuery(company.name),
				cadence: TERMINAL_CONFIG.MONITOR_CADENCE_NEWS,
				webhookUrl
			})
			state.news_monitor_id = news.id
			state.news_secret = news.webhookSecret
		} catch (e) {
			logger.warn("company_monitor_news_create_failed", { company_id: company.id, error: logger.serializeError(e) })
		}

		try {
			const policy = await createMonitor({
				query: policyMonitorQuery(company.name),
				cadence: TERMINAL_CONFIG.MONITOR_CADENCE_POLICY,
				webhookUrl,
				includeDomains: policyMonitorDomains()
			})
			state.policy_monitor_id = policy.id
			state.policy_secret = policy.webhookSecret
		} catch (e) {
			logger.warn("company_monitor_policy_create_failed", { company_id: company.id, error: logger.serializeError(e) })
		}

		// Competitor monitor only when a webset already exists (§ brief: else skip).
		if (company.competitor_webset_id) {
			try {
				const comp = await createMonitor({
					query: competitorMonitorQuery(company.name),
					cadence: TERMINAL_CONFIG.MONITOR_CADENCE_COMPETITOR,
					webhookUrl
				})
				state.competitor_monitor_id = comp.id
				state.competitor_secret = comp.webhookSecret
			} catch (e) {
				logger.warn("company_monitor_competitor_create_failed", {
					company_id: company.id,
					error: logger.serializeError(e)
				})
			}
		}

		await this.db
			.update(companies)
			.set({ monitor_state: state, updated_at: new Date() })
			.where(eq(companies.id, company.id))
	}

	private async teardownMonitors(company_id: string): Promise<void> {
		const company = await this.loadCompany(company_id)
		const state = (company?.monitor_state as MonitorState | null) ?? null
		if (state) {
			for (const id of [state.news_monitor_id, state.policy_monitor_id, state.competitor_monitor_id]) {
				if (!id) continue
				try {
					await deleteMonitor(id)
				} catch (e) {
					logger.warn("company_monitor_delete_failed", { monitor_id: id, error: logger.serializeError(e) })
				}
			}
		}
		await this.db
			.update(companies)
			.set({ monitor_state: null, updated_at: new Date() })
			.where(eq(companies.id, company_id))
	}

	// ── Alarm scheduling ───────────────────────────────────────────────────────

	// Wake at the soonest of: a due/pending rescore, the next billing date, or a
	// daily housekeeping floor. Never schedules in the past.
	private async scheduleNext(company_id: string, now: number): Promise<void> {
		const pending = await this.loadPending()
		const batchMs = this.batchMs()

		if (pickDueDimension(pending, now, batchMs)) {
			await this.storage.setAlarm(now + 1000)
			return
		}

		let earliestRescore = Infinity
		for (const dim of DIMENSIONS) {
			const e = pending[dim]
			if (e && !e.immediate) earliestRescore = Math.min(earliestRescore, e.queued_at + batchMs)
		}

		const [soonest] = await this.db
			.select({ nb: watchlistEntries.next_billing_at })
			.from(watchlistEntries)
			.where(and(eq(watchlistEntries.company_id, company_id), eq(watchlistEntries.active, true)))
			.orderBy(asc(watchlistEntries.next_billing_at))
			.limit(1)
		const billingWake = soonest ? soonest.nb.getTime() : now + DAY_MS

		const next = Math.max(now + 1000, Math.min(earliestRescore, billingWake))
		await this.storage.setAlarm(next)
	}

	// ── DB / storage helpers ───────────────────────────────────────────────────

	private async loadCompany(company_id: string): Promise<typeof companies.$inferSelect | null> {
		const [row] = await this.db.select().from(companies).where(eq(companies.id, company_id)).limit(1)
		return row ?? null
	}

	private async activeWatchers(company_id: string): Promise<(typeof watchlistEntries.$inferSelect)[]> {
		return this.db
			.select()
			.from(watchlistEntries)
			.where(and(eq(watchlistEntries.company_id, company_id), eq(watchlistEntries.active, true)))
	}

	// ponytail: per-company table scan filtered in JS — dimensions is a JSON array,
	// awkward to query in SQLite. Fine at watchlist scale; add a junction table or
	// json_each index if a company's evidence set ever grows large.
	private async evidenceForDimension(
		company_id: string,
		dim: DimensionId
	): Promise<(typeof evidenceItems.$inferSelect)[]> {
		const all = await this.db.select().from(evidenceItems).where(eq(evidenceItems.company_id, company_id))
		return all.filter((r) => Array.isArray(r.dimensions) && (r.dimensions as string[]).includes(dim))
	}

	private reconstructItem(row: typeof evidenceItems.$inferSelect): EvidenceItem {
		return {
			id: row.id,
			url: row.url,
			title: row.title,
			source_domain: row.source_domain,
			published_at: row.published_at ? row.published_at.toISOString() : null,
			snippet: row.snippet,
			content_hash: row.content_hash,
			origin: row.origin as EvidenceItem["origin"],
			dimensions: (row.dimensions as DimensionId[]) ?? [],
			company_controlled: COMPANY_CONTROLLED_DOMAINS.has(row.source_domain.toLowerCase())
		}
	}

	private async latestScore(
		company_id: string,
		dim: DimensionId | "composite"
	): Promise<typeof dimensionScores.$inferSelect | null> {
		const [row] = await this.db
			.select()
			.from(dimensionScores)
			.where(and(eq(dimensionScores.company_id, company_id), eq(dimensionScores.dimension, dim)))
			.orderBy(desc(dimensionScores.created_at))
			.limit(1)
		return row ?? null
	}

	private reconstructGrade(row: typeof dimensionScores.$inferSelect): DimensionGrade {
		return {
			dimension: row.dimension as DimensionId,
			grade: row.grade,
			score: row.score,
			confidence: row.confidence as Confidence,
			trend: "flat", // only `score` drives the next trend; the rest reconstructs a valid grade
			flags: (row.flags as ScreenHit[]) ?? [],
			top_citations: (row.citations as Citation[]) ?? [],
			summary: "",
			evidence_hash: row.evidence_hash,
			rubric_version: row.rubric_version
		}
	}

	private async loadPending(): Promise<PendingMap> {
		return (await this.storage.get<PendingMap>("pending")) ?? {}
	}

	private async savePending(pending: PendingMap): Promise<void> {
		await this.storage.put("pending", pending)
	}

	private json(body: unknown, status = 200): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" }
		})
	}
}
