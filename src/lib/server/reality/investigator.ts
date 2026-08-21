// Investigator (PLAN Phase 5). Cross-filing deception hunting over the catalog.
// Writes FLAGS only — never edits a number (one-way data flow). Two layers:
//   - deterministic checks in code (zero tokens): filing cadence, value
//     revisions (with the probe-mandated power-of-10 noise filter), tagging
//     quality, conditional-vs-actual revenue growth.
//   - ONE LLM pass over a compact catalog digest for the judgment flags:
//     vanishing items, redefinitions, one-time dressing, related-party
//     exposure, subsequent events. Revision candidates are attached so the
//     model judges substantive-vs-clerical; code never auto-publishes a
//     value_revision without that judgment.
// Flag text goes through checkLanguageCompliance — observations, never
// accusations (terminal §5.6 discipline).

import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import { checkLanguageCompliance } from "$lib/server/terminal/synthesis"
import { REALITY_CONFIG } from "./config"
import type { ledgerEntries, ledgerFlags } from "$lib/server/db/schema"

export type LedgerEntryRow = typeof ledgerEntries.$inferSelect
export type LedgerFlagInsert = typeof ledgerFlags.$inferInsert
export type FilingRow = { accession: string; form: string; filing_date: string; report_date: string | null }

const AI_FLAG_TYPES = new Set([
	"value_revision", // ai judges the deterministic candidates
	"vanishing_item",
	"redefinition",
	"one_time_dressing",
	"related_party_exposure",
	"subsequent_event",
	"off_balance_sheet", // sole-tenant/build-to-suit deals, lender guarantees, backstopped entities
	"circular_financing" // financing out to a party that shows up as revenue in
])

const flag = (
	cik: string,
	flag_type: string,
	origin: "deterministic" | "ai",
	summary: string,
	over: Partial<LedgerFlagInsert> = {}
): LedgerFlagInsert => ({
	id: crypto.randomUUID(),
	cik,
	flag_type,
	origin,
	summary,
	detail: null,
	entry_ids: [],
	citations: [],
	period_end: null,
	...over
})

// ── deterministic: filing cadence ────────────────────────────────────────────

// Days between period end and filing. Statutory large-accelerated deadlines are
// 60d (10-K) / 40d (10-Q); thresholds sit well past them so only real
// delinquency flags. 20-F: 4 months; 6-K has no deadline (never flagged).
const LATE_DAYS: Record<string, number> = { "10-K": 120, "10-Q": 75, "20-F": 180 }
const dayDiff = (a: string, b: string): number => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000)

export function cadenceFlags(cik: string, filings: readonly FilingRow[]): LedgerFlagInsert[] {
	const out: LedgerFlagInsert[] = []

	for (const f of filings) {
		const base = f.form.replace("/A", "")
		const limit = LATE_DAYS[base]
		if (!limit || !f.report_date) continue
		const days = dayDiff(f.filing_date, f.report_date)
		if (days > limit) {
			out.push(
				flag(cik, "filing_cadence", "deterministic",
					`The ${f.form} for the period ended ${f.report_date} was filed ${days} days after the period end.`,
					{ period_end: f.report_date, citations: [{ accession: f.accession, location: "filing date" }] })
			)
		}
	}

	// Bunched catch-up filings: ≥3 statement filings on one date.
	const byDate = new Map<string, FilingRow[]>()
	for (const f of filings) {
		if (!LATE_DAYS[f.form.replace("/A", "")]) continue
		byDate.set(f.filing_date, [...(byDate.get(f.filing_date) ?? []), f])
	}
	for (const [date, fs] of byDate) {
		if (fs.length >= 3) {
			out.push(
				flag(cik, "filing_cadence", "deterministic",
					`${fs.length} periodic filings (${fs.map((f) => f.form).join(", ")}) were filed on the same day, ${date}.`,
					{ citations: fs.map((f) => ({ accession: f.accession, location: "filing date" })) })
			)
		}
	}
	return out
}

// ── deterministic: value revisions + tagging quality ─────────────────────────

export type RevisionCandidate = {
	taxonomy_tag: string
	period_start: string | null
	period_end: string
	values: number[]
	entry_ids: string[]
	accessions: string[]
}

// Scale noise: one value is (close to) a power-of-10 multiple of the other —
// probe: SMCI's cross-filing diffs are dominated by thousands-vs-full tagging
// slips (1753000 vs 1753000000), which are control-quality signal, not
// restatement signal.
export function isScaleNoise(a: number, b: number): boolean {
	if (a === 0 || b === 0) return false
	const ratio = Math.max(Math.abs(a), Math.abs(b)) / Math.min(Math.abs(a), Math.abs(b))
	const log = Math.log10(ratio)
	return Math.abs(log - Math.round(log)) < 0.01 && Math.round(log) >= 1
}

/**
 * Group xbrl entries by (tag, period, unit); >1 distinct amount → either a
 * tagging_quality data point (scale noise) or a value_revision candidate for
 * the AI to judge. Sub-1% differences are ignored as rounding.
 */
export function revisionScan(
	cik: string,
	entries: readonly LedgerEntryRow[]
): { candidates: RevisionCandidate[]; flags: LedgerFlagInsert[] } {
	const groups = new Map<string, LedgerEntryRow[]>()
	for (const e of entries) {
		if (e.origin !== "xbrl" || !e.taxonomy_tag) continue
		const k = `${e.taxonomy_tag}|${e.unit}|${e.period_start ?? ""}|${e.period_end}`
		groups.set(k, [...(groups.get(k) ?? []), e])
	}

	const candidates: RevisionCandidate[] = []
	let noisePairs = 0
	const noiseTags = new Set<string>()
	for (const rows of groups.values()) {
		if (rows.length < 2) continue
		const [a, b] = [rows[0], rows[1]]
		if (isScaleNoise(a.amount, b.amount)) {
			noisePairs++
			noiseTags.add(a.taxonomy_tag!)
			continue
		}
		const rel = Math.abs(a.amount - b.amount) / Math.max(Math.abs(a.amount), Math.abs(b.amount))
		if (rel <= 0.01) continue // rounding
		candidates.push({
			taxonomy_tag: a.taxonomy_tag!,
			period_start: a.period_start,
			period_end: a.period_end,
			values: rows.map((r) => r.amount),
			entry_ids: rows.map((r) => r.id),
			accessions: rows.map((r) => r.accession)
		})
	}

	const flags: LedgerFlagInsert[] = []
	if (noisePairs >= 3) {
		flags.push(
			flag(cik, "tagging_quality", "deterministic",
				`${noisePairs} XBRL facts were reported at inconsistent scales across filings (e.g. ${[...noiseTags][0]}).`,
				{ detail: `Concepts affected: ${[...noiseTags].join(", ")}` })
		)
	}
	return { candidates, flags }
}

// ── deterministic: balance series outgrowing actual revenue ──────────────────

type SeriesPoint = { end: string; val: number }
const seriesOf = (
	entries: readonly LedgerEntryRow[],
	pick: (e: LedgerEntryRow) => boolean
): SeriesPoint[] =>
	entries
		.filter((e) => e.origin === "xbrl" && pick(e))
		.sort((a, b) => a.period_end.localeCompare(b.period_end))
		.filter((e, i, arr) => i === arr.findIndex((x) => x.period_end === e.period_end)) // first claim per period
		.map((e) => ({ end: e.period_end, val: e.amount }))

// quarterly durations only (~90d), so annual rows don't double-count
const isQuarter = (e: LedgerEntryRow): boolean =>
	e.period_start != null && Math.abs(dayDiff(e.period_end, e.period_start) - 91) < 15
const isAnnual = (e: LedgerEntryRow): boolean =>
	e.period_start != null && Math.abs(dayDiff(e.period_end, e.period_start) - 365) < 20

const quarterlyRevenue = (entries: readonly LedgerEntryRow[]): SeriesPoint[] =>
	seriesOf(entries, (e) => /:Revenue(FromContractWithCustomerExcludingAssessedTax|s)?$/.test(e.taxonomy_tag ?? "") && isQuarter(e))

/** Shared core: an instant balance series growing more than twice as fast as
 *  quarterly revenue over the shared window (≥4 periods, capped at 8). */
function outpaceFlag(
	cik: string,
	entries: readonly LedgerEntryRow[],
	pickBalance: (e: LedgerEntryRow) => boolean,
	flag_type: string,
	label: string
): LedgerFlagInsert | null {
	const rev = quarterlyRevenue(entries)
	const bal = seriesOf(entries, (e) => pickBalance(e) && e.period_start === null)
	if (rev.length < 4 || bal.length < 4) return null

	const span = Math.min(rev.length, bal.length, 8) // up to 2 years
	const growth = (s: SeriesPoint[]): number | null => {
		const a = s[s.length - span]?.val
		const b = s[s.length - 1]?.val
		return a > 0 ? b / a : null
	}
	const g1 = growth(rev)
	const g2 = growth(bal)
	if (g1 == null || g2 == null || g2 <= g1 * 2 || g2 < 1.5) return null

	return flag(cik, flag_type, "deterministic",
		`Over the last ${span} periods, ${label} grew ${g2.toFixed(1)}x while quarterly revenue grew ${g1.toFixed(1)}x.`,
		{ period_end: bal[bal.length - 1].end })
}

/** Conditional revenue balances (deferred revenue) outgrowing actual revenue. */
export const conditionalRatioFlag = (cik: string, entries: readonly LedgerEntryRow[]): LedgerFlagInsert | null =>
	outpaceFlag(cik, entries, (e) => e.kind === "contingent_revenue", "conditional_ratio", "conditional revenue balances")

/** Receivables outgrowing revenue — the classic vendor-financing / revenue-quality
 *  symptom: sales booked, cash not arriving. */
export const receivablesRatioFlag = (cik: string, entries: readonly LedgerEntryRow[]): LedgerFlagInsert | null =>
	outpaceFlag(
		cik,
		entries,
		(e) => e.taxonomy_tag === "us-gaap:AccountsReceivableNetCurrent" || e.taxonomy_tag === "ifrs-full:CurrentTradeReceivables" || e.kind === "financing",
		"receivables_ratio",
		"receivables and customer-financing balances"
	)

// ── deterministic: cash conversion — profits the cash never confirms ──────────

/**
 * Annual net income vs annual operating cash flow. Positive net income with
 * OCF below 60% of it in BOTH of the latest two annual periods flags the
 * pattern (profits booked, cash not collected — the round-trip symptom from
 * the cash-flow angle). ponytail: annual-only comparison — OCF is filed
 * year-to-date, so quarterly splits would need derivation; add if the annual
 * signal proves too coarse.
 */
export function cashConversionFlag(cik: string, entries: readonly LedgerEntryRow[]): LedgerFlagInsert | null {
	const ni = seriesOf(entries, (e) => /:(NetIncomeLoss|ProfitLoss)$/.test(e.taxonomy_tag ?? "") && isAnnual(e))
	const ocf = seriesOf(entries, (e) => /:(NetCashProvidedByUsedInOperatingActivities|CashFlowsFromUsedInOperatingActivities)$/.test(e.taxonomy_tag ?? "") && isAnnual(e))
	if (ni.length < 2 || ocf.length < 2) return null

	const ocfByEnd = new Map(ocf.map((p) => [p.end, p.val]))
	const shared = ni.filter((p) => ocfByEnd.has(p.end)).slice(-2)
	if (shared.length < 2) return null

	const weak = shared.every((p) => p.val > 0 && (ocfByEnd.get(p.end) ?? 0) < 0.6 * p.val)
	if (!weak) return null

	const latest = shared[shared.length - 1]
	const ratio = (ocfByEnd.get(latest.end) ?? 0) / latest.val
	return flag(cik, "cash_conversion", "deterministic",
		`In each of the last two fiscal years, operating cash flow was below 60% of net income (latest year: ${Math.round(ratio * 100)}%).`,
		{ period_end: latest.end })
}

// ── the ONE LLM pass for judgment flags ──────────────────────────────────────

export type RawAiFlag = {
	flag_type?: unknown
	summary?: unknown
	detail?: unknown
	entry_ids?: unknown
	period_end?: unknown
}
export type InvestigatorCaller = (systemPrompt: string, userPrompt: string) => Promise<{ flags: RawAiFlag[] }>

const AI_SYSTEM =
	`You audit a catalog of claims one company made across sequential SEC filings. Every number ` +
	`in the catalog is final — never recompute, restate, or invent one. Find patterns ACROSS ` +
	`filings:\n` +
	`- vanishing_item: a claim appears once, then is never mentioned again.\n` +
	`- redefinition: a commitment or metric quietly changes scope, date, or definition between filings.\n` +
	`- one_time_dressing: one-time items presented in ways that read as recurring performance.\n` +
	`- related_party_exposure: concentration of commitments, credit, loans, or sales with related parties.\n` +
	`- subsequent_event: post-period events that recontextualize the period they follow.\n` +
	`- off_balance_sheet: financing structures that keep obligations off the balance sheet — ` +
	`sole-tenant or build-to-suit deals with lenders, guarantees of another entity's debt, ` +
	`not-yet-commenced leases, unconsolidated entities the company backstops.\n` +
	`- circular_financing: the company finances a party (loan, note receivable, equity ` +
	`investment, prepayment, or debt guarantee) that also appears as a customer or revenue ` +
	`source — revenue funded by the company's own cash.\n` +
	`- value_revision: for each attached revision candidate, judge substantive vs clerical; only ` +
	`substantive ones become flags.\n\n` +
	`For each finding call out: flag_type, the entry ids involved, the period_end it attaches to ` +
	`(ISO date, or empty string), a ONE-line summary and optional detail in evidence language — ` +
	`state what the filings show ("the FY2024 filing reports X; the FY2023 filing reported Y"), ` +
	`never accuse. Do not use words like fraud, scheme, misleading, or hiding. ` +
	`No findings is a valid answer. Call submit_flags exactly once.`

async function defaultCaller(system: string, user: string): Promise<{ flags: RawAiFlag[] }> {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_flags",
		description: "Submit every cross-filing finding. Call exactly once.",
		parameters: Type.Object({
			flags: Type.Array(
				Type.Object({
					flag_type: Type.String({ description: "vanishing_item | redefinition | one_time_dressing | related_party_exposure | subsequent_event | off_balance_sheet | circular_financing | value_revision" }),
					summary: Type.String({ description: "one line, evidence language" }),
					detail: Type.String({ description: "longer narrative, or empty string" }),
					entry_ids: Type.Array(Type.String(), { description: "catalog entry ids this finding rests on" }),
					period_end: Type.String({ description: "ISO date the finding attaches to, or empty string" })
				}),
				{ description: "empty if the catalog shows no cross-filing patterns" }
			)
		})
	}
	const ctx: Context = {
		systemPrompt: system,
		messages: [{ role: "user", content: user, timestamp: Date.now() }],
		tools: [submit]
	}
	const response = await complete(getAiModel(REALITY_CONFIG.MODEL_INVESTIGATOR), ctx)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during investigation")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_flags")
	if (!call) return { flags: [] }
	return validateToolCall([submit], call) as { flags: RawAiFlag[] }
}

// Compact digest: every ai (soft-layer) entry, plus revision candidates.
// The 780-row XBRL spine stays out — its cross-filing signal is already
// distilled into the candidates, and the soft rows carry the narrative.
function digest(
	entries: readonly LedgerEntryRow[],
	candidates: readonly RevisionCandidate[],
	filings: readonly FilingRow[]
): string {
	const soft = entries
		.filter((e) => e.origin === "ai")
		.map((e) => ({
			id: e.id,
			accession: e.accession,
			amount: e.amount,
			// percent rows carry unit "PCT" and amounts that are percentages, not
			// money; per_share rows are per-share prices — value_type disambiguates.
			value_type: e.value_type ?? "currency",
			unit: e.unit,
			kind: e.kind,
			certainty: e.certainty,
			period_end: e.period_end,
			due_date: e.due_date,
			event_date: e.event_date,
			counterparty: e.counterparty,
			related_party: e.related_party,
			source: e.source_location,
			notes: e.notes
		}))
	return JSON.stringify({
		filings: filings.map((f) => ({ accession: f.accession, form: f.form, filed: f.filing_date, period: f.report_date })),
		soft_entries: soft,
		revision_candidates: candidates
	})
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Full investigation for one company: deterministic flags + one LLM judgment
 * pass. Pure over its inputs (rows passed in; the DO does the I/O).
 */
export async function investigate(
	cik: string,
	entries: readonly LedgerEntryRow[],
	filings: readonly FilingRow[],
	caller: InvestigatorCaller = defaultCaller
): Promise<LedgerFlagInsert[]> {
	const out: LedgerFlagInsert[] = []

	out.push(...cadenceFlags(cik, filings))
	const { candidates, flags: taggingFlags } = revisionScan(cik, entries)
	out.push(...taggingFlags)
	for (const f of [conditionalRatioFlag(cik, entries), receivablesRatioFlag(cik, entries), cashConversionFlag(cik, entries)])
		if (f) out.push(f)

	const knownIds = new Set(entries.map((e) => e.id))
	const { flags: rawFlags } = await caller(AI_SYSTEM, digest(entries, candidates, filings))
	for (const r of rawFlags ?? []) {
		const type = typeof r.flag_type === "string" ? r.flag_type : ""
		if (!AI_FLAG_TYPES.has(type)) continue
		let summary = typeof r.summary === "string" ? r.summary.trim() : ""
		if (!summary) continue
		// Alerts never publish accusatory text — neutral template on violation.
		if (checkLanguageCompliance(summary).length > 0)
			summary = `Cross-filing pattern (${type}) observed; see cited entries.`
		const entry_ids = Array.isArray(r.entry_ids)
			? r.entry_ids.filter((x): x is string => typeof x === "string" && knownIds.has(x))
			: []
		const period = typeof r.period_end === "string" && ISO_DAY.test(r.period_end) ? r.period_end : null
		const detail = typeof r.detail === "string" && r.detail.trim() ? r.detail.trim() : null
		out.push(flag(cik, type, "ai", summary, { detail, entry_ids, period_end: period }))
	}
	return out
}
