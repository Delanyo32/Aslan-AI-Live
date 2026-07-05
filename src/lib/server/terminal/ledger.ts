// Announcement Ledger (WP6.1, §3 / v0.2 §4.4 / §5 invariant 5).
//
// Forward-only. Dated commitments management makes ("ship X by Q3", "open the
// Berlin plant in June") are logged from a deep-report run or from watchlist
// triage, then re-checked on the LEDGER_CHECK_OFFSETS_MONTHS cadence until each
// is delivered, missed, redefined, or ages out to `unaccounted`. A company's
// follow-through rate feeds F7/F8 grading as a synthetic SignalFinding — no
// historical backfill (§5.5): an empty ledger is "tracking started", not a 0%.
//
// LLM calls follow the module house pattern: pi-ai imported at top, getAiModel
// imported lazily (it reads $env at load, which bun test can't resolve), and the
// caller is injectable so tests run offline.

import { eq } from "drizzle-orm"
import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import { hostOf } from "$lib/utils"
import type { createDb } from "../db/client"
import { commitments } from "../db/schema"
import { TERMINAL_CONFIG } from "./config"
import { terminalSearch, type ExaResultItem, type ExaResults } from "./exa"
import type { RubricRecipe } from "./rubrics/schema"
import type { Citation, SignalFinding } from "$lib/types/terminal"

type Db = ReturnType<typeof createDb>
type CommitmentRow = typeof commitments.$inferSelect
export type LedgerCompany = { id: string; name: string; ticker: string }

// Statuses the LLM resolves a check into; `unaccounted`/`pending` are code-derived.
export type CheckStatus = "delivered_on_time" | "delivered_late" | "missed" | "redefined" | "unresolved"

// A commitment is "resolved" once it has an answer (or aged out to unaccounted);
// `pending` is the only open state. Redefined counts as resolved but isn't a
// display bucket (it folds into `total`).
const OFFSETS = TERMINAL_CONFIG.LEDGER_CHECK_OFFSETS_MONTHS

// ── date helpers (UTC, calendar-correct — mirrors CompanyMonitor.addOneMonth) ──

/** Add whole calendar months, clamping the day to the target month's length. */
export function addMonths(base: Date, months: number): Date {
	const d = new Date(base.getTime())
	const day = d.getUTCDate()
	d.setUTCDate(1) // avoid setUTCMonth overflow off a long source month
	d.setUTCMonth(d.getUTCMonth() + months)
	const daysInTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
	d.setUTCDate(Math.min(day, daysInTarget))
	return d
}

/**
 * The next check date: the first LEDGER_CHECK_OFFSETS_MONTHS offset (relative to
 * `base` — promised_date when set, else the log date) that falls strictly after
 * `now`. `null` once all offsets are behind us (→ commitment ages to unaccounted).
 */
export function nextCheckDate(base: Date, now: number): Date | null {
	for (const m of OFFSETS) {
		const d = addMonths(base, m)
		if (d.getTime() > now) return d
	}
	return null
}

function toDateOrNull(iso: string | null): Date | null {
	if (!iso) return null
	const d = new Date(iso)
	return Number.isNaN(d.getTime()) ? null : d
}

function toCitation(r: ExaResultItem): Citation {
	return {
		url: r.url,
		title: r.title ?? null,
		source_domain: hostOf(r.url) ?? "",
		published_at: r.publishedDate ?? null,
		snippet: r.highlights?.[0] ?? r.summary ?? r.text ?? null
	}
}

// Normalized form for dedupe: lowercase, whitespace-collapsed. Substring match on
// this is the "near-identical" test.
const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim()

// ── extractCommitments (report-run path; triage covers the monitor path) ───────

export type RawCommitment = { what: string; promised_date: string | null; source_index: number }
export type ExtractCaller = (
	company: LedgerCompany,
	items: { title: string | null; snippet: string | null; url: string }[]
) => Promise<RawCommitment[]>

const defaultExtract: ExtractCaller = async (company, items) => {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_commitments",
		description: "Log every specific dated commitment management makes in these sources. Call exactly once.",
		parameters: Type.Object({
			commitments: Type.Array(
				Type.Object({
					what: Type.String({ description: "the promised action, e.g. 'ship the X model', 'open the Berlin plant'" }),
					promised_date: Type.String({ description: "ISO YYYY-MM-DD if a date/quarter is stated, else empty string" }),
					source_index: Type.Number({ description: "0-based index of the source item this promise came from" })
				}),
				{ description: "empty if none of the sources contain a specific dated promise" }
			)
		})
	}
	const ctx: Context = {
		systemPrompt:
			"You extract dated commitments for a forward-only announcement ledger. A commitment is a specific, " +
			"verifiable promise management makes to ship / deliver / launch / open / complete something by a time " +
			"(an explicit date, quarter, or 'by end of year'). Ignore vague aspirations, analyst commentary, and " +
			"past achievements. For each, give the action, its date (ISO, or empty if no resolvable date), and the " +
			"0-based index of the source item it came from.",
		messages: [
			{
				role: "user",
				content: JSON.stringify({
					company: { name: company.name, ticker: company.ticker },
					sources: items.map((it, i) => ({ index: i, title: it.title, snippet: it.snippet }))
				}),
				timestamp: Date.now()
			}
		],
		tools: [submit]
	}
	const response = await complete(getAiModel(), ctx)
	if (response.stopReason === "error") return []
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_commitments")
	if (!call) return []
	const out = validateToolCall([submit], call) as { commitments: RawCommitment[] }
	return (out.commitments ?? []).map((c) => ({
		what: c.what,
		promised_date: (c.promised_date ?? "").trim() || null,
		source_index: c.source_index
	}))
}

/**
 * Extract dated commitments from a report run's evidence and insert them
 * (status pending). next_check_at = promised_date ?? now + OFFSETS[1] months.
 * Dedupe: skip a `what` that near-matches an existing OPEN (pending) commitment.
 * Returns the number inserted. Idempotence relies on the dedupe, not a constraint.
 */
export async function extractCommitments(
	db: Db,
	company: LedgerCompany,
	evidence: { title: string | null; snippet: string | null; url: string }[],
	caller: ExtractCaller = defaultExtract,
	now: number = Date.now()
): Promise<number> {
	const items = evidence.filter((e) => e.url && (e.title || e.snippet))
	if (items.length === 0) return 0

	const raw = await caller(company, items)
	if (raw.length === 0) return 0

	const existing = await db
		.select({ what: commitments.what, status: commitments.status })
		.from(commitments)
		.where(eq(commitments.company_id, company.id))
	// ponytail: O(n·m) normalized-substring dedupe — fine at ledger scale (tens of
	// open rows per company); swap for a trigram index only if a company ever logs
	// thousands of commitments.
	const openNorms = existing.filter((e) => e.status === "pending").map((e) => normalize(e.what))

	let inserted = 0
	for (const c of raw) {
		const what = c.what?.trim()
		if (!what) continue
		const src = items[c.source_index]
		if (!src) continue
		const norm = normalize(what)
		if (openNorms.some((o) => o.includes(norm) || norm.includes(o))) continue

		const promised = toDateOrNull(c.promised_date)
		await db.insert(commitments).values({
			id: crypto.randomUUID(),
			company_id: company.id,
			what,
			promised_date: promised,
			source_url: src.url,
			status: "pending",
			next_check_at: promised ?? addMonths(new Date(now), OFFSETS[1])
		})
		openNorms.push(norm) // dedupe within this batch too
		inserted++
	}
	return inserted
}

// ── runDueCheck (one commitment per invocation — the expensive unit) ───────────

export type LedgerSearchFn = (query: string) => Promise<ExaResults>
export type LedgerClassifyFn = (input: {
	company: LedgerCompany
	what: string
	promised_date: string | null
	evidence: Citation[]
}) => Promise<{ status: CheckStatus; note: string }>

export type LedgerCheckDeps = {
	db: Db
	search?: LedgerSearchFn
	classify?: LedgerClassifyFn
	now?: number
}

const defaultSearch: LedgerSearchFn = async (query) => {
	// Ad-hoc recipe: query is already fully-formed (no {company} placeholder), so
	// terminalSearch's interpolation is a no-op over an empty company string.
	const recipe: RubricRecipe = {
		primitive: "search",
		query_template: query,
		category: "news",
		days: 730,
		contents: "highlights"
	}
	return terminalSearch(recipe, "", { numResults: 5 })
}

const defaultClassify: LedgerClassifyFn = async ({ company, what, promised_date, evidence }) => {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_status",
		description: "Classify whether the company followed through on this dated commitment. Call exactly once.",
		parameters: Type.Object({
			status: Type.Union(
				[
					Type.Literal("delivered_on_time"),
					Type.Literal("delivered_late"),
					Type.Literal("missed"),
					Type.Literal("redefined"),
					Type.Literal("unresolved")
				],
				{
					description:
						"delivered_on_time: shipped by the promised date; delivered_late: shipped but after it; " +
						"missed: date passed with evidence it was cancelled/abandoned; redefined: scope or date quietly " +
						"changed; unresolved: the evidence does not clearly establish any of these"
				}
			),
			note: Type.String({ description: "one-line evidence-language observation, never an accusation" })
		})
	}
	const ctx: Context = {
		systemPrompt:
			"You verify whether a company delivered on a specific dated commitment, using ONLY the cited evidence. " +
			"Use evidence language — observations backed by sources, never accusations. If the evidence does not " +
			"clearly establish delivery, lateness, cancellation, or redefinition, answer unresolved.",
		messages: [
			{
				role: "user",
				content: JSON.stringify({
					company: { name: company.name, ticker: company.ticker },
					commitment: what,
					promised_date,
					today: new Date().toISOString().slice(0, 10),
					evidence: evidence.map((c) => ({
						url: c.url,
						title: c.title,
						published: c.published_at,
						snippet: c.snippet
					}))
				}),
				timestamp: Date.now()
			}
		],
		tools: [submit]
	}
	const response = await complete(getAiModel(), ctx)
	if (response.stopReason === "error") return { status: "unresolved", note: "" }
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_status")
	if (!call) return { status: "unresolved", note: "" }
	const out = validateToolCall([submit], call) as { status: CheckStatus; note: string }
	return { status: out.status, note: out.note ?? "" }
}

function buildCheckQueries(company: LedgerCompany, what: string): string[] {
	const c = company.name
	// ≤3 company-scoped targeted searches: did it ship / open / complete — or slip?
	return [
		`${c} ${what} shipped OR launched OR released OR available`,
		`${c} ${what} completed OR delivered OR opened OR live`,
		`${c} ${what} delayed OR cancelled OR postponed OR missed`
	]
}

/**
 * Re-check ONE due commitment: ≤3 targeted searches → one LLM classification →
 * update the row (status, checked_at, check_evidence, next offset). A terminal
 * status clears next_check_at; `unresolved` reschedules to the next offset, or
 * ages to `unaccounted` once all offsets are behind. Returns the new status.
 */
export async function runDueCheck(
	company: LedgerCompany,
	commitment: CommitmentRow,
	deps: LedgerCheckDeps
): Promise<CommitmentRow["status"]> {
	const now = deps.now ?? Date.now()
	const search = deps.search ?? defaultSearch
	const classify = deps.classify ?? defaultClassify

	const citations: Citation[] = []
	const seen = new Set<string>()
	for (const q of buildCheckQueries(company, commitment.what)) {
		let res: ExaResults
		try {
			res = await search(q)
		} catch {
			continue // a failed search never fails the check
		}
		for (const r of res.results ?? []) {
			if (!r.url || seen.has(r.url)) continue
			seen.add(r.url)
			citations.push(toCitation(r))
		}
	}

	const promisedIso = commitment.promised_date ? commitment.promised_date.toISOString().slice(0, 10) : null
	const { status: verdict } = await classify({ company, what: commitment.what, promised_date: promisedIso, evidence: citations })

	const base = commitment.promised_date ?? commitment.created_at
	const next = nextCheckDate(base, now)

	let status: CommitmentRow["status"]
	let nextCheckAt: Date | null
	if (verdict === "unresolved") {
		if (next) {
			status = "pending"
			nextCheckAt = next
		} else {
			status = "unaccounted" // past all offsets, still no evidence → past-due
			nextCheckAt = null
		}
	} else {
		status = verdict // terminal
		nextCheckAt = null
	}

	await deps.db
		.update(commitments)
		.set({
			status,
			checked_at: new Date(now),
			check_evidence: citations.slice(0, 3), // §2.9: ledger-check evidence is owner-only
			next_check_at: nextCheckAt
		})
		.where(eq(commitments.id, commitment.id))

	return status
}

// ── followThroughRate + synthetic SignalFinding for F7/F8 grading ──────────────

export type FollowThroughRate = {
	// on_time / (resolved + unaccounted_past_due); null when the denominator is 0
	// (empty ledger or all-pending) — never 0, per §5.5.
	ftr: number | null
	counts: { total: number; on_time: number; late: number; missed: number; unaccounted: number; pending: number }
	tracking_since: string | null // earliest commitment log date, ISO
	citations: Citation[] // aggregated ledger check_evidence (owner-only), cap 3 — feeds the finding
}

export async function followThroughRate(db: Db, companyId: string): Promise<FollowThroughRate> {
	const rows = await db.select().from(commitments).where(eq(commitments.company_id, companyId))

	const counts = { total: rows.length, on_time: 0, late: 0, missed: 0, unaccounted: 0, pending: 0 }
	let earliest: number | null = null
	const citations: Citation[] = []
	for (const r of rows) {
		switch (r.status) {
			case "delivered_on_time":
				counts.on_time++
				break
			case "delivered_late":
				counts.late++
				break
			case "missed":
				counts.missed++
				break
			case "unaccounted":
				counts.unaccounted++
				break
			case "pending":
				counts.pending++
				break
			// redefined: counted only in `total` (resolved, but not a display bucket)
		}
		const t = r.created_at instanceof Date ? r.created_at.getTime() : null
		if (t != null && (earliest == null || t < earliest)) earliest = t
		if (Array.isArray(r.check_evidence)) {
			for (const c of r.check_evidence as Citation[]) if (citations.length < 3) citations.push(c)
		}
	}

	const resolved = counts.total - counts.pending // resolved + unaccounted_past_due
	const ftr = resolved > 0 ? counts.on_time / resolved : null
	return {
		ftr,
		counts,
		tracking_since: earliest != null ? new Date(earliest).toISOString() : null,
		citations: citations.slice(0, 3)
	}
}

/**
 * Synthetic SignalFinding feeding the ledger follow-through rate into F7/F8
 * grading (signal ids f7_followthrough / f8_followthrough, weight 0.15 each in
 * the rubric). Direction: supports ≥0.7, undermines <0.5, else neutral. Strength
 * by sample size. Returns null when ftr is null (day-one: no signal, not a bad
 * signal). Scoring discards it if citations end up empty (rule 2).
 */
export function ftrSignalFinding(dimension: "F7" | "F8", r: FollowThroughRate): SignalFinding | null {
	if (r.ftr == null) return null

	const resolved = r.counts.total - r.counts.pending
	const direction: SignalFinding["direction"] = r.ftr >= 0.7 ? "supports" : r.ftr < 0.5 ? "undermines" : "neutral"
	const strength: SignalFinding["strength"] = resolved < 5 ? 1 : resolved < 15 ? 2 : 3
	const pct = Math.round(r.ftr * 100)
	const c = r.counts
	const summary =
		`Of ${resolved} dated commitment${resolved !== 1 ? "s" : ""} now due, ${c.on_time} delivered on time, ` +
		`${c.late} late, ${c.missed} missed, ${c.unaccounted} unaccounted — ${pct}% follow-through.`

	return {
		signal_id: dimension === "F7" ? "f7_followthrough" : "f8_followthrough",
		direction,
		strength,
		summary,
		citations: r.citations.slice(0, 3)
	}
}
