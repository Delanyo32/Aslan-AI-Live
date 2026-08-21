// Reconciler (PLAN Phase 6). Per-quarter reality statements. Code owns every
// number: quarter frames, sums, Q4 derivation, and the application of
// adjustments. The ONE LLM call proposes adjustments + narratives by CITING
// entry/flag ids only — it never supplies an amount. Code sums the cited
// entries, rejects (never clamps) anything larger than the quarter's own
// figure, and applies the move. Draft AND adjusted views are both persisted
// (audit trail; stored adjustments are the ones actually applied).
//
// Q4 gotcha (probe-pinned): 10-Ks report annual periods and no Q4 filing
// exists, so Q4 flow values are derived: FY − (Q1+Q2+Q3), only when all three
// sibling quarters are present. Derived quarters are marked q4_derived.

import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import { checkLanguageCompliance } from "$lib/server/terminal/synthesis"
import { REALITY_CONFIG } from "./config"
import { CONCEPT_MAP, SCHEDULE_TAG_INFO, addYears } from "./xbrl"
import type { ledgerEntries, ledgerFlags, realityStatements } from "$lib/server/db/schema"

export type LedgerEntryRow = typeof ledgerEntries.$inferSelect
export type LedgerFlagRow = typeof ledgerFlags.$inferSelect
export type RealityStatementInsert = typeof realityStatements.$inferInsert

// ── taxonomy_tag → internal concept ──────────────────────────────────────────

const TAG_TO_INTERNAL = new Map<string, string>()
for (const spec of CONCEPT_MAP) {
	for (const a of spec.usGaap) TAG_TO_INTERNAL.set(`us-gaap:${a}`, spec.internal)
	for (const a of spec.ifrs) TAG_TO_INTERNAL.set(`ifrs-full:${a}`, spec.internal)
	TAG_TO_INTERNAL.set(`6k:${spec.internal}`, spec.internal)
}
const internalOf = (e: LedgerEntryRow): string | null =>
	e.taxonomy_tag ? (TAG_TO_INTERNAL.get(e.taxonomy_tag) ?? null) : null

// P&L expense set for the draft's "real spend" line. Capex stays out (cash-flow
// item; its committed tail shows up in the due schedule instead).
const EXPENSE_PNL = new Set(["cost_of_revenue", "rnd_expense", "sales_marketing", "general_admin", "income_tax"])
const DEFERRED = new Set(["deferred_rev_current", "deferred_rev_noncurrent"])
const COMMITTED_BALANCE = new Set([
	"debt_short", "debt_long", "lease_liability", "lease_liability_current", "lease_liability_noncurrent", "purchase_obligation"
])
const LEASE_COMPONENTS = ["lease_liability_current", "lease_liability_noncurrent"]

// ── quarter frames ───────────────────────────────────────────────────────────

export type Frame = { start: string; end: string; q4_derived: boolean }

const dayDiff = (a: string, b: string): number => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000)
// How many fiscal quarters a duration spans: 1 (quarter), 2 (half-year), 3
// (nine months), 4 (year) — 0 when it isn't close to a whole number of
// quarters. 6-K filers print Q and cumulative columns side by side; annuals
// are just the n=4 case.
export function spanQuarters(s: string, e: string): number {
	const days = dayDiff(e, s)
	for (let n = 1; n <= 4; n++) if (Math.abs(days - n * 91) <= 10 + n * 2) return n
	return 0
}
const isQuarterSpan = (s: string, e: string): boolean => spanQuarters(s, e) === 1
const isAnnualSpan = (s: string, e: string): boolean => spanQuarters(s, e) === 4
const nextDay = (iso: string): string => new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10)
// Week-based fiscal calendars (ASML: quarters end June 28/29) get rounded
// differently across exhibits; dates within 6 days are the same period.
const within = (a: string, b: string, days = 6): boolean => Math.abs(dayDiff(a, b)) <= days

/**
 * Quarter frames from the revenue entries: every reported quarterly span, plus
 * a derived tail frame per cumulative span (half-year, nine-month, annual)
 * whose window contains all of its other quarters — the classic gaps being Q4
 * (annual minus three quarters) and, for 6-K filers, Q2 (half-year minus Q1).
 */
export function quarterFrames(entries: readonly LedgerEntryRow[]): Frame[] {
	const revenue = entries.filter((e) => internalOf(e) === "revenue" && e.period_start)
	const frames = new Map<string, Frame>()
	const cumulatives: { start: string; end: string; n: number }[] = []

	for (const e of revenue) {
		const n = spanQuarters(e.period_start!, e.period_end)
		if (n === 1) frames.set(e.period_end, { start: e.period_start!, end: e.period_end, q4_derived: false })
		else if (n >= 2) cumulatives.push({ start: e.period_start!, end: e.period_end, n })
	}

	// Merge frames whose ends fall within days of each other — the same fiscal
	// quarter reported with differently-rounded end dates (probe: ASML exhibits
	// print 2025-06-29 and 2025-06-30 for one quarter).
	const merged: Frame[] = []
	for (const f of [...frames.values()].sort((x, y) => x.end.localeCompare(y.end))) {
		const prev = merged[merged.length - 1]
		if (prev && within(f.end, prev.end)) continue
		merged.push(f)
	}

	// Shortest cumulatives first, so a half-year derives Q2 before the annual runs.
	for (const c of cumulatives.sort((a, b) => a.n - b.n)) {
		if (merged.some((f) => within(f.end, c.end))) continue // tail quarter already reported
		const inside = merged.filter((f) => f.start >= c.start && f.end <= c.end)
		if (inside.length !== c.n - 1) continue
		const lastEnd = inside.map((f) => f.end).sort().pop()!
		if (spanQuarters(lastEnd, c.end) !== 1) continue // the gap must itself be one quarter
		merged.push({ start: nextDay(lastEnd), end: c.end, q4_derived: true })
		merged.sort((x, y) => x.end.localeCompare(y.end))
	}

	return merged
}

// ── mechanical sums ──────────────────────────────────────────────────────────

// First (earliest-filed) unsuperseded claim per (internal, period) — the
// original statement of the number; revisions stay visible to the
// investigator, not the sums. Mechanical = XBRL rows AND double-pass-verified
// 6-K rows (`6k:` tags) — for foreign filers those ARE the quarterly spine
// (XBRL is annual-only there). XBRL wins when both cover a period.
function firstClaims(entries: readonly LedgerEntryRow[]): LedgerEntryRow[] {
	const mechanical = entries.filter(
		(e) => !e.superseded && (e.origin === "xbrl" || (e.origin === "ai" && e.taxonomy_tag?.startsWith("6k:")))
	)
	const seen = new Map<string, LedgerEntryRow>()
	for (const e of [...mechanical.filter((e) => e.origin === "xbrl"), ...mechanical.filter((e) => e.origin === "ai")]) {
		const internal = internalOf(e)
		if (!internal) continue
		const k = `${internal}|${e.period_start ?? ""}|${e.period_end}`
		if (!seen.has(k)) seen.set(k, e)
	}
	return [...seen.values()]
}

export type DraftStatement = {
	revenue: number | null
	expenses: number | null
	net_income: number | null
	conditional_deferred: number // deferred revenue balance at quarter end
	backlog_rpo: number | null // remaining performance obligations (kept separate: overlaps deferred)
	committed_balance: number // debt + leases + purchase obligations at quarter end
	q4_derived: boolean
}
export type DueItem = { due_date: string; amount: number; unit: string; entry_id: string }

function flowValue(
	claims: readonly LedgerEntryRow[],
	internals: ReadonlySet<string> | string,
	frame: Frame,
	cumulativeByInternal: Map<string, LedgerEntryRow[]>,
	quartersByInternal: Map<string, LedgerEntryRow[]>
): number | null {
	const names = typeof internals === "string" ? [internals] : [...internals]
	let total = 0
	const matched = new Set<string>()
	for (const name of names) {
		const qs = quartersByInternal.get(name) ?? []
		// Tolerant match: same quarter under a differently-rounded fiscal calendar.
		const direct = qs
			.filter((e) => e.period_start && within(e.period_end, frame.end) && within(e.period_start, frame.start))
			.sort((a, b) => Math.abs(dayDiff(a.period_end, frame.end)) - Math.abs(dayDiff(b.period_end, frame.end)))[0]
		if (direct) { total += direct.amount; matched.add(name); continue }
		if (!frame.q4_derived) continue
		// Tail derivation: a cumulative span (half-year / nine-month / annual)
		// ending at this frame minus the quarters reported inside it.
		const cum = (cumulativeByInternal.get(name) ?? [])
			.filter((e) => within(e.period_end, frame.end))
			.sort((a, b) => spanQuarters(a.period_start!, a.period_end) - spanQuarters(b.period_start!, b.period_end))[0]
		if (!cum) continue
		const n = spanQuarters(cum.period_start!, cum.period_end)
		const inside = qs.filter((e) => e.period_start! >= cum.period_start! && e.period_end <= cum.period_end && e.period_end < frame.start)
		if (inside.length !== n - 1) continue
		total += cum.amount - inside.reduce((s, e) => s + e.amount, 0)
		matched.add(name)
	}
	if (matched.size === 0) return null
	// Multi-component sums (the expense set): one stray component is not the
	// quarter's expenses. Require the dominant component plus at least one more —
	// a visible gap beats a silently-partial number.
	if (names.length > 1 && !(matched.has("cost_of_revenue") && matched.size >= 2)) return null
	return total
}

/** Mechanical draft per frame, plus the due schedule stated as of that frame. */
export function buildDrafts(
	entries: readonly LedgerEntryRow[],
	frames: readonly Frame[]
): { frame: Frame; draft: DraftStatement; due: DueItem[]; currency: string }[] {
	const claims = firstClaims(entries)
	const quartersByInternal = new Map<string, LedgerEntryRow[]>()
	const cumulativeByInternal = new Map<string, LedgerEntryRow[]>()
	const instantsByInternal = new Map<string, LedgerEntryRow[]>()
	for (const e of claims) {
		const name = internalOf(e)!
		if (!e.period_start) instantsByInternal.set(name, [...(instantsByInternal.get(name) ?? []), e])
		else if (isQuarterSpan(e.period_start, e.period_end)) quartersByInternal.set(name, [...(quartersByInternal.get(name) ?? []), e])
		else if (spanQuarters(e.period_start, e.period_end) >= 2) cumulativeByInternal.set(name, [...(cumulativeByInternal.get(name) ?? []), e])
	}
	const instantAt = (names: ReadonlySet<string>, end: string): { sum: number; any: boolean } => {
		let sum = 0
		let any = false
		for (const name of names) {
			// Nearest balance within the fiscal-calendar rounding window.
			const hit = (instantsByInternal.get(name) ?? [])
				.filter((e) => within(e.period_end, end))
				.sort((a, b) => Math.abs(dayDiff(a.period_end, end)) - Math.abs(dayDiff(b.period_end, end)))[0]
			if (hit) { sum += hit.amount; any = true }
		}
		return { sum, any }
	}
	// Committed balance: when a filer tags the combined lease liability, the
	// current/noncurrent components are the same money — drop them for that end.
	const committedAt = (end: string): { sum: number; any: boolean } => {
		const names = new Set(COMMITTED_BALANCE)
		if ((instantsByInternal.get("lease_liability") ?? []).some((e) => within(e.period_end, end)))
			for (const c of LEASE_COMPONENTS) names.delete(c)
		return instantAt(names, end)
	}

	// Currency: the dominant unit among revenue claims (foreign filers report home currency).
	const unitCounts = new Map<string, number>()
	for (const e of claims) if (internalOf(e) === "revenue") unitCounts.set(e.unit, (unitCounts.get(e.unit) ?? 0) + 1)
	const currency = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD"

	// Due schedule: any entry (either origin) with a due date, attached to the
	// frame matching its stated period (tolerant of fiscal-calendar rounding).
	// Financing entries (money lent OUT, coming back) stay out — this schedule
	// is outflows owed.
	const dueEntries = entries.filter((e) => e.due_date && !e.superseded && e.kind !== "financing")
	const dueFor = (end: string): DueItem[] =>
		dueEntries
			.filter((e) => within(e.period_end, end))
			.map((e) => ({ due_date: e.due_date!, amount: e.amount, unit: e.unit, entry_id: e.id }))

	return frames.map((frame) => {
		const rpo = instantAt(new Set(["backlog_rpo"]), frame.end)
		const deferred = instantAt(DEFERRED, frame.end)
		const committed = committedAt(frame.end)
		// Per-quarter currency: the nearest quarterly revenue claim's unit beats
		// the company-wide dominant pick (a filer can change reporting currency —
		// Nebius went RUB→USD). Derived frames fall back to the global pick.
		const frameCurrency = (quartersByInternal.get("revenue") ?? [])
			.filter((e) => e.period_start && within(e.period_end, frame.end) && within(e.period_start, frame.start))
			.sort((a, b) => Math.abs(dayDiff(a.period_end, frame.end)) - Math.abs(dayDiff(b.period_end, frame.end)))[0]?.unit ?? currency
		// Filers like ORCL/DLR/HPE never tag CostOfRevenue (probe 2026-08-18);
		// their combined cost total (+ tax when tagged) is the honest fallback.
		// Only when NO cost_of_revenue exists for the frame — a filer with a cost
		// anchor but a failed component gate keeps its visible null, because for
		// them OperatingExpenses may exclude COGS and would silently understate.
		const componentExpenses = flowValue(claims, EXPENSE_PNL, frame, cumulativeByInternal, quartersByInternal)
		const totalCosts = componentExpenses == null &&
			flowValue(claims, "cost_of_revenue", frame, cumulativeByInternal, quartersByInternal) == null
			? flowValue(claims, "total_costs", frame, cumulativeByInternal, quartersByInternal)
			: null
		const expenses = componentExpenses ??
			(totalCosts == null ? null : totalCosts + (flowValue(claims, "income_tax", frame, cumulativeByInternal, quartersByInternal) ?? 0))
		return {
			frame,
			currency: frameCurrency,
			due: dueFor(frame.end).sort((a, b) => a.due_date.localeCompare(b.due_date)),
			draft: {
				revenue: flowValue(claims, "revenue", frame, cumulativeByInternal, quartersByInternal),
				expenses,
				net_income: flowValue(claims, "net_income", frame, cumulativeByInternal, quartersByInternal),
				conditional_deferred: deferred.any ? deferred.sum : 0,
				backlog_rpo: rpo.any ? rpo.sum : null,
				committed_balance: committed.any ? committed.sum : 0,
				q4_derived: frame.q4_derived
			}
		}
	})
}

// ── forward obligations schedule ─────────────────────────────────────────────

export type ForwardBucket = {
	period: string // calendar year-quarter, e.g. "2027-Q3"
	total_by_kind: Record<string, number> // disclosed + estimated + beyond, keyed "kind unit"
	disclosed: Record<string, number> // from filed payment schedules (window ÷ its quarters)
	estimated: Record<string, number> // straight-line spread of dated lumps — an assumption
	beyond: Record<string, number> // "after year five" money at the 5y boundary, never spread
	items: { due_date: string; amount: number; unit: string; kind: string; entry_id: string; notes: string | null }[]
}

const calendarQuarter = (iso: string): string =>
	`${iso.slice(0, 4)}-Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`

const nextQuarterStart = (iso: string): string => {
	const y = Number(iso.slice(0, 4))
	const q = Math.ceil(Number(iso.slice(5, 7)) / 3)
	return q === 4 ? `${y + 1}-01-01` : `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`
}

/** Calendar quarters covering (start, end], in order. */
const quartersBetween = (start: string, end: string): string[] => {
	const out: string[] = []
	let cursor = nextQuarterStart(start)
	let q = calendarQuarter(start)
	const last = calendarQuarter(end)
	while (q < last && out.length < 200) {
		q = calendarQuarter(cursor)
		out.push(q)
		cursor = nextQuarterStart(cursor)
	}
	return out.length ? out : [last]
}

// Family classification for AI-cataloged lumps, used ONLY to avoid double
// counting against a filed schedule of the same money — never to change a number.
const FAMILY_PATTERNS: [string, RegExp][] = [
	["lease", /lease/],
	["purchase", /purchase|supply agreement|manufactur|component|inventory commitment/],
	["debt", /senior notes|notes payable|term loan|borrow|principal payment|debt maturit|credit facility|convertible note/]
]
const classifyFamily = (notes: string | null, source: string | null): string => {
	const t = `${notes ?? ""} ${source ?? ""}`.toLowerCase()
	for (const [family, re] of FAMILY_PATTERNS) if (re.test(t)) return family
	return "other"
}

/**
 * The wall of obligations ahead, spread the way the filings describe it:
 *  - Filed payment schedules (by-year XBRL maturity tags) are the spine. Only
 *    the latest vintage per (family, unit) counts — each annual filing restates
 *    the whole schedule. A year window's amount divides evenly across its
 *    calendar quarters → `disclosed`. "After year five" stays one bucket at the
 *    5-year boundary → `beyond` (open window; spreading it would be invention).
 *  - Dated lumps (AI-cataloged commitments) whose family already has a filed
 *    schedule are dropped (same money, two sources). Survivors spread evenly
 *    from their statement date to their due date → `estimated`, a labeled
 *    straight-line assumption, never mixed into disclosed figures.
 *  - Quarters already past (vs `today`) are dropped — that money came due.
 */
export function forwardSchedule(entries: readonly LedgerEntryRow[], today: string = new Date().toISOString().slice(0, 10)): ForwardBucket[] {
	const byPeriod = new Map<string, ForwardBucket>()
	const nowQ = calendarQuarter(today)
	const bucketOf = (period: string): ForwardBucket => {
		const b = byPeriod.get(period) ?? { period, total_by_kind: {}, disclosed: {}, estimated: {}, beyond: {}, items: [] }
		byPeriod.set(period, b)
		return b
	}
	const add = (layer: "disclosed" | "estimated" | "beyond", period: string, key: string, amount: number) => {
		if (period < nowQ) return
		const b = bucketOf(period)
		b[layer][key] = (b[layer][key] ?? 0) + amount
		b.total_by_kind[key] = (b.total_by_kind[key] ?? 0) + amount
	}

	const rows = entries.filter((e) => e.due_date && !e.superseded)
	const schedule = rows.filter((e) => e.taxonomy_tag && SCHEDULE_TAG_INFO.has(e.taxonomy_tag))

	// Latest vintage per (family, unit).
	const latestEnd = new Map<string, string>()
	for (const e of schedule) {
		const fam = SCHEDULE_TAG_INFO.get(e.taxonomy_tag!)!.family
		const k = `${fam}|${e.unit}`
		if ((latestEnd.get(k) ?? "") < e.period_end) latestEnd.set(k, e.period_end)
	}
	const live = schedule.filter((e) => latestEnd.get(`${SCHEDULE_TAG_INFO.get(e.taxonomy_tag!)!.family}|${e.unit}`) === e.period_end)

	for (const e of live) {
		const info = SCHEDULE_TAG_INFO.get(e.taxonomy_tag!)!
		const key = `${e.kind} ${e.unit}`
		if (info.toYears === null) {
			add("beyond", calendarQuarter(e.due_date!), key, e.amount)
		} else {
			const windowStart = addYears(e.period_end, info.fromYears)
			const qs = quartersBetween(windowStart, e.due_date!)
			for (const q of qs) add("disclosed", q, key, e.amount / qs.length)
		}
		const b = bucketOf(calendarQuarter(e.due_date!))
		b.items.push({ due_date: e.due_date!, amount: e.amount, unit: e.unit, kind: e.kind, entry_id: e.id, notes: e.notes })
	}

	// Lumps: everything dated that is not a schedule row. Filings restate the
	// same commitments every quarter, so lumps get the same latest-vintage rule
	// as schedules: only rows stated at (or within 45 days of) the newest
	// statement date per (kind, family, unit) count — older vintages were
	// superseded by the restatement.
	const liveFamilies = new Set(latestEnd.keys())
	const lumps = rows.filter((e) => !(e.taxonomy_tag && SCHEDULE_TAG_INFO.has(e.taxonomy_tag)))
	// Only obligations dedupe against schedules; financing rows are money
	// coming BACK — a debt schedule is different money entirely.
	const famOf = (e: LedgerEntryRow): string =>
		e.kind === "obligation" ? classifyFamily(e.notes, e.source_location) : "other"
	const latestLump = new Map<string, string>()
	for (const e of lumps) {
		const k = `${e.kind}|${famOf(e)}|${e.unit}`
		if ((latestLump.get(k) ?? "") < e.period_end) latestLump.set(k, e.period_end)
	}
	const surviving = lumps.filter((e) => {
		const family = famOf(e)
		if (family !== "other" && liveFamilies.has(`${family}|${e.unit}`)) return false // filed schedule already carries this money
		if (dayDiff(latestLump.get(`${e.kind}|${family}|${e.unit}`)!, e.period_end) > 45) return false // stale vintage
		return true
	})

	// Same-money dedup (probe 2026-08-21, GOOGL wall ~2x): filings state one
	// commitment in several sentences — a notional beside a max payment, a total
	// beside its segment split. Two read-time rules; amounts are never edited.
	//  1. Lumps sharing (kind, unit, due_date) within 0.5% are one disclosure —
	//     keep the largest. Amount alone is NOT enough (TSM has three distinct
	//     $1.25B bonds; VRT twin $500M notes due 2056/2066) — the due date is.
	//  2. A lump whose note declares it a portion of a larger figure ("Of $811.0
	//     billion…", "$513.9 billion of revenue backlog related to Google Cloud")
	//     drops when a larger same-kind survivor exists — the parent already
	//     carries the money. Without a surviving parent it stays: dropping the
	//     only representative would undercount.
	const dropped = new Set<string>()
	const byDue = new Map<string, LedgerEntryRow[]>()
	for (const e of surviving) {
		const k = `${e.kind}|${e.unit}|${e.due_date}`
		byDue.set(k, [...(byDue.get(k) ?? []), e])
	}
	for (const group of byDue.values()) {
		group.sort((a, b) => b.amount - a.amount)
		for (let i = 0; i < group.length; i++) {
			if (dropped.has(group[i].id)) continue
			for (let j = i + 1; j < group.length; j++)
				if (group[i].amount > 0 && (group[i].amount - group[j].amount) / group[i].amount < 0.005) dropped.add(group[j].id)
		}
	}
	// ponytail: two note shapes cover every observed subset; widen if a probe finds more
	const SUBSET_NOTE = /\bof \$[\d,.]+ ?(billion|million|trillion)\b|(billion|million|trillion) of (revenue backlog|remaining performance)/i
	const maxByKind = new Map<string, number>()
	for (const e of surviving) {
		if (dropped.has(e.id)) continue
		const k = `${e.kind}|${e.unit}`
		maxByKind.set(k, Math.max(maxByKind.get(k) ?? 0, e.amount))
	}
	for (const e of surviving) {
		if (dropped.has(e.id) || !e.notes || !SUBSET_NOTE.test(e.notes)) continue
		if (e.amount < (maxByKind.get(`${e.kind}|${e.unit}`) ?? 0)) dropped.add(e.id)
	}

	for (const e of surviving) {
		if (dropped.has(e.id)) continue
		const key = `${e.kind} ${e.unit}`
		const qs = quartersBetween(e.period_end, e.due_date!)
		const layer = qs.length > 1 ? "estimated" : "disclosed" // due within one quarter = a dated fact, not a spread
		for (const q of qs) add(layer, q, key, e.amount / qs.length)
		const b = bucketOf(calendarQuarter(e.due_date!))
		b.items.push({ due_date: e.due_date!, amount: e.amount, unit: e.unit, kind: e.kind, entry_id: e.id, notes: e.notes })
	}

	for (const b of byPeriod.values()) b.items.sort((a, x) => a.due_date.localeCompare(x.due_date))
	return [...byPeriod.values()].filter((b) => b.period >= nowQ).sort((a, b) => a.period.localeCompare(b.period))
}

// ── fiscal labels ────────────────────────────────────────────────────────────

/** "FY2024 Q3" from the filer's own calendar: FY = the annual window the
 *  quarter falls in (annual ends observed in the data; extended forward for
 *  quarters after the latest closed year). */
export function fiscalLabel(frameEnd: string, annualEnds: readonly string[]): string {
	if (annualEnds.length === 0) return frameEnd
	const sorted = [...annualEnds].sort()
	let fyEnd = sorted.find((e) => e >= frameEnd)
	if (!fyEnd) {
		// past the last closed year: roll the latest end forward in 1y steps
		let d = new Date(sorted[sorted.length - 1])
		while (d.toISOString().slice(0, 10) < frameEnd) d = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()))
		fyEnd = d.toISOString().slice(0, 10)
	}
	const fyStartMs = Date.parse(fyEnd) - 364 * 86_400_000
	const monthsIn = Math.round((Date.parse(frameEnd) - fyStartMs) / (30.44 * 86_400_000))
	const q = Math.min(4, Math.max(1, Math.round(monthsIn / 3)))
	return `FY${fyEnd.slice(0, 4)} Q${q}`
}

// ── the ONE LLM call: adjustments + narratives ───────────────────────────────

const ACTIONS = new Set(["revenue_to_conditional", "conditional_to_revenue", "expense_to_committed", "committed_to_expense"])
// The one failure the amount cap cannot catch: a backlog/RPO balance small
// enough to fit under the quarter's revenue. Future-order money is never part
// of recognized revenue, so those citations are vetoed by wording (AMZN probe:
// filings say "performance obligations" without "remaining").
const RPO_WORDS = /performance obligation|backlog|\brpo\b/i
// An action can only rest on entries of its own economic kind — an acquisition
// obligation can never justify reclassifying revenue (NOW/Moveworks probe).
const ACTION_KINDS: Record<string, Set<string>> = {
	revenue_to_conditional: new Set(["revenue", "contingent_revenue"]),
	conditional_to_revenue: new Set(["revenue", "contingent_revenue"]),
	expense_to_committed: new Set(["expense", "obligation"]),
	committed_to_expense: new Set(["expense", "obligation"])
}

export type RawAdjustment = {
	period_end?: unknown
	action?: unknown
	entry_ids?: unknown
	flag_ids?: unknown
	rationale?: unknown
}
export type RawQuarterOut = { period_end?: unknown; narrative?: unknown }
export type ReconcilerCaller = (
	systemPrompt: string,
	userPrompt: string
) => Promise<{ adjustments: RawAdjustment[]; quarters: RawQuarterOut[] }>

const SYSTEM =
	`You reconcile a company's quarterly reality statements for the Aslan Terminal. The draft ` +
	`numbers are computed by code from the company's own filed figures and are FINAL — never ` +
	`restate or invent a number. Using the cataloged soft-layer claims and the investigator's ` +
	`flags, propose adjustments that reveal the economic reality the headline presentation ` +
	`obscures. You never supply an amount: you cite the catalog entry ids whose amounts ` +
	`justify the move, and code sums those cited entries and applies it. Cite only entries ` +
	`stated as of that quarter, in the statement's currency; percent and per-share ` +
	`observations never qualify. An adjustment whose cited total exceeds the quarter's own ` +
	`figure is rejected outright — cite the quarter-sized claim, never a cumulative ` +
	`balance, total backlog, RPO, or multi-year figure. A revenue_to_conditional move ` +
	`above half the quarter's revenue is also rejected: reclassifying most of a quarter ` +
	`is flag territory, not a statement rewrite. Allowed actions only:\n` +
	`- revenue_to_conditional: part of THIS quarter's revenue depends on conditions (the ` +
	`cited entries state why).\n` +
	`- conditional_to_revenue: a conditional amount is effectively assured.\n` +
	`- expense_to_committed: recognized spend that is really a future commitment.\n` +
	`- committed_to_expense: a committed amount that is economically already incurred (e.g. ` +
	`loss liabilities on committed purchases).\n` +
	`Every dated cataloged claim already sits on its quarter's due schedule automatically — ` +
	`never propose adding one.\n` +
	`Every adjustment carries a one-line rationale in evidence language. Also write a 2-4 ` +
	`sentence narrative per quarter: what the quarter really looked like, cited observations ` +
	`only, never accusations — no words like fraud, scheme, misleading, hiding. Quarters ` +
	`with nothing to adjust get an empty adjustment list and a short narrative. Call ` +
	`submit_reconciliation exactly once.`

async function defaultCaller(system: string, user: string): ReturnType<ReconcilerCaller> {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_reconciliation",
		description: "Submit all adjustments and per-quarter narratives. Call exactly once.",
		parameters: Type.Object({
			adjustments: Type.Array(
				Type.Object({
					period_end: Type.String({ description: "ISO quarter end this adjustment applies to" }),
					action: Type.String({ description: "revenue_to_conditional | conditional_to_revenue | expense_to_committed | committed_to_expense" }),
					entry_ids: Type.Array(Type.String(), { description: "catalog entry ids whose amounts justify the move — code sums them; no amount field exists" }),
					flag_ids: Type.Array(Type.String(), { description: "investigator flag ids, if any" }),
					rationale: Type.String({ description: "one line, evidence language" })
				})
			),
			quarters: Type.Array(
				Type.Object({
					period_end: Type.String({ description: "ISO quarter end" }),
					narrative: Type.String({ description: "2-4 sentences, cited observations, no accusations" })
				})
			)
		})
	}
	const ctx: Context = {
		systemPrompt: system,
		messages: [{ role: "user", content: user, timestamp: Date.now() }],
		tools: [submit]
	}
	const response = await complete(getAiModel(REALITY_CONFIG.MODEL_RECONCILER), ctx)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during reconciliation")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_reconciliation")
	if (!call) throw new Error("reconciler: model did not submit")
	return validateToolCall([submit], call) as Awaited<ReturnType<ReconcilerCaller>>
}

// ── apply + assemble ─────────────────────────────────────────────────────────

export type AdjustedStatement = DraftStatement & { due_schedule: DueItem[] }
export type AppliedAdjustment = {
	action: string
	amount: number // code-computed: the sum of the cited entries' amounts
	entry_ids: string[]
	flag_ids: string[]
	rationale: string
}

/**
 * Apply code-validated adjustments to a draft. An adjustment that does not fit
 * (its amount exceeds what the source field still holds, or a side is null) is
 * REJECTED, never clamped — a wrong citation must not gut a real quarter. The
 * returned `applied` list is what actually landed; store that, not the proposal.
 */
export function applyAdjustments(
	draft: DraftStatement,
	due: DueItem[],
	adjustments: readonly AppliedAdjustment[]
): { statement: AdjustedStatement; applied: AppliedAdjustment[] } {
	const a: AdjustedStatement = { ...draft, due_schedule: [...due] }
	const applied: AppliedAdjustment[] = []
	for (const adj of adjustments) {
		switch (adj.action) {
			case "revenue_to_conditional": {
				if (a.revenue == null || adj.amount > a.revenue) break
				a.revenue -= adj.amount
				a.conditional_deferred += adj.amount
				applied.push(adj)
				break
			}
			case "conditional_to_revenue": {
				if (a.revenue == null || adj.amount > a.conditional_deferred) break
				a.conditional_deferred -= adj.amount
				a.revenue += adj.amount
				applied.push(adj)
				break
			}
			case "expense_to_committed": {
				if (a.expenses == null || adj.amount > a.expenses) break
				a.expenses -= adj.amount
				a.committed_balance += adj.amount
				applied.push(adj)
				break
			}
			case "committed_to_expense": {
				if (a.expenses == null || adj.amount > a.committed_balance) break
				a.committed_balance -= adj.amount
				a.expenses += adj.amount
				applied.push(adj)
				break
			}
		}
	}
	return { statement: a, applied }
}

/**
 * Reconcile one company: code-built drafts → one LLM call (citations only) →
 * code-derived amounts → code-applied adjustments → statement inserts (draft +
 * adjusted kept; stored adjustments are the applied ones).
 */
export async function reconcile(
	cik: string,
	entries: readonly LedgerEntryRow[],
	flags: readonly LedgerFlagRow[],
	caller: ReconcilerCaller = defaultCaller
): Promise<RealityStatementInsert[]> {
	const frames = quarterFrames(entries)
	if (frames.length === 0) return []
	const drafts = buildDrafts(entries, frames)
	const annualEnds = entries
		.filter((e) => internalOf(e) === "revenue" && e.period_start && isAnnualSpan(e.period_start, e.period_end))
		.map((e) => e.period_end)

	const softRows = entries.filter((e) => e.origin === "ai" && !e.superseded)
	const softById = new Map(softRows.map((e) => [e.id, e]))
	const soft = softRows.map((e) => ({
		id: e.id, amount: e.amount, unit: e.unit, kind: e.kind, certainty: e.certainty,
		value_type: e.value_type ?? "currency",
		period_end: e.period_end, due_date: e.due_date, event_date: e.event_date,
		related_party: e.related_party,
		counterparty: e.counterparty, source: e.source_location, notes: e.notes
	}))
	const flagDigest = flags.map((f) => ({
		id: f.id, type: f.flag_type, period_end: f.period_end, summary: f.summary
	}))
	const user = JSON.stringify({
		quarters: drafts.map((d) => ({ period_end: d.frame.end, currency: d.currency, ...d.draft, due: d.due })),
		soft_entries: soft,
		flags: flagDigest
	})

	const raw = await caller(SYSTEM, user)

	const flagIds = new Set(flags.map((f) => f.id))
	const byQuarter = new Map<string, AppliedAdjustment[]>()
	for (const r of raw.adjustments ?? []) {
		const period = typeof r.period_end === "string" ? r.period_end : ""
		const action = typeof r.action === "string" ? r.action : ""
		const d = drafts.find((x) => x.frame.end === period)
		if (!d || !ACTIONS.has(action)) continue
		// Code owns the amount: it is the sum of the cited entries, which must be
		// monetary claims stated as of this quarter in the statement's currency.
		// Percent/per-share observations (kind context) never qualify.
		const citedIds = Array.isArray(r.entry_ids) ? r.entry_ids.filter((x): x is string => typeof x === "string") : []
		const cited = citedIds
			.map((id) => softById.get(id))
			.filter((e): e is LedgerEntryRow => !!e)
			.filter((e) =>
				(e.value_type ?? "currency") === "currency" &&
				e.kind !== "context" &&
				e.unit === d.currency &&
				within(e.period_end, d.frame.end) &&
				ACTION_KINDS[action].has(e.kind) &&
				// committed_balance only ever sums debt/lease/purchase claims, so money
				// can move OUT of it only when the citation IS one of those components.
				// Probe 2026-08-21: all 15 fleet applications cited litigation accruals
				// and receivables the balance never held (INTC's $2.2B VLSI judgment).
				(action !== "committed_to_expense" || COMMITTED_BALANCE.has(internalOf(e) ?? "")) &&
				(action !== "revenue_to_conditional" || !RPO_WORDS.test(`${e.notes ?? ""} ${e.source_location ?? ""}`))
			)
		if (cited.length === 0) continue // uncited (or wrongly cited) adjustments never apply
		const amount = cited.reduce((s, e) => s + e.amount, 0)
		if (amount <= 0) continue
		// Judgment cap: the two shapes that survive every other rule (a deferred
		// balance with no note text, a multi-year contract value) both land just
		// under the quarter's revenue. Erasing most of a quarter is never a
		// reconciliation — ponytail: hard 50% line, revisit if a real case needs more.
		if (action === "revenue_to_conditional" && d.draft.revenue != null && amount > 0.5 * d.draft.revenue) continue

		let rationale = typeof r.rationale === "string" ? r.rationale.trim() : ""
		if (!rationale || checkLanguageCompliance(rationale).length > 0) rationale = `Adjustment (${action}) from cited catalog entries.`
		byQuarter.set(period, [
			...(byQuarter.get(period) ?? []),
			{
				action, amount,
				entry_ids: cited.map((e) => e.id),
				flag_ids: Array.isArray(r.flag_ids) ? r.flag_ids.filter((x): x is string => typeof x === "string" && flagIds.has(x)) : [],
				rationale
			}
		])
	}

	const narratives = new Map<string, string>()
	for (const q of raw.quarters ?? []) {
		const period = typeof q.period_end === "string" ? q.period_end : ""
		let n = typeof q.narrative === "string" ? q.narrative.trim() : ""
		if (!n) continue
		if (checkLanguageCompliance(n).length > 0) n = "The quarter's figures are stated in the draft; see cited entries and flags."
		narratives.set(period, n)
	}

	return drafts.map((d) => {
		const { statement, applied } = applyAdjustments(d.draft, d.due, byQuarter.get(d.frame.end) ?? [])
		return {
			id: crypto.randomUUID(),
			cik,
			period_end: d.frame.end,
			fiscal_label: fiscalLabel(d.frame.end, annualEnds),
			currency: d.currency,
			draft: { ...d.draft, due_schedule: d.due } as object,
			adjusted: statement as object,
			adjustments: applied as object[],
			narrative: narratives.get(d.frame.end) ?? "No reconciliation notes for this quarter."
		}
	})
}
