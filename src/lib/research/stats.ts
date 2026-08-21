// Pure math for the /research paper snapshot. No server imports, no AI —
// consumed by scripts/build-research-snapshot.ts (bake time) and by tests.
// Inputs are rows as returned by GET /api/reality/[cik].

// ── input shapes (subset of the read model) ─────────────────────────────────

export type StatementFields = {
	revenue: number | null
	expenses: number | null
	net_income: number | null
	conditional_deferred: number | null
	backlog_rpo: number | null
	committed_balance: number | null
}

export type Stmt = {
	period_end: string
	fiscal_label: string
	currency: string
	draft: StatementFields
	adjusted: StatementFields
}

export type Entry = {
	amount: number
	unit: string
	kind: string
	certainty: string
	origin: string
	value_type: string
	taxonomy_tag: string | null
	period_start: string | null
	period_end: string
	due_date: string | null
	superseded: boolean | 0 | 1
	notes: string | null
	source_location: string
}

export type ForwardBucket = {
	period: string // "2027-Q3"
	total_by_kind: Record<string, number> // keyed "kind unit"
	disclosed: Record<string, number>
	estimated: Record<string, number>
	beyond: Record<string, number>
}

// ── calendar helpers ────────────────────────────────────────────────────────

export const calQ = (iso: string): string => `${iso.slice(0, 4)}-Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`

/** Last day of a calendar quarter label ("2027-Q3" → "2027-09-30"). */
export const qEnd = (q: string): string => {
	const [y, n] = [q.slice(0, 4), Number(q.slice(6))]
	return `${y}-${["03-31", "06-30", "09-30", "12-31"][n - 1]}`
}

export const dayDiff = (a: string, b: string): number =>
	Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export const addYearsIso = (iso: string, years: number): string =>
	`${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`

// ── small stats ─────────────────────────────────────────────────────────────

export const median = (xs: number[]): number | null => {
	if (xs.length === 0) return null
	const s = [...xs].sort((a, b) => a - b)
	const m = s.length >> 1
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Compound annual growth rate between two values `years` apart. */
export const cagr = (first: number, last: number, years: number): number | null =>
	first > 0 && last > 0 && years > 0 ? Math.pow(last / first, 1 / years) - 1 : null

// ── quarterly series ────────────────────────────────────────────────────────

export type QuarterPoint = {
	q: string
	period_end: string
	revenue: number | null
	expenses: number | null
	net_income: number | null
	deferred: number | null
	rpo: number | null
	committed: number | null
	reported_debt: number | null
	draft_revenue: number | null
	draft_expenses: number | null
	ttm_revenue: number | null
	ttm_expenses: number | null
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

/**
 * One point per fiscal quarter (deduped to the latest statement per calendar
 * quarter), in the company's dominant currency. Flow fields come from the
 * ADJUSTED statement (the reality view); draft_* keep the as-filed figures.
 * TTM = the sum of 4 consecutive fiscal quarters spanning ≤ 400 days.
 */
export function companySeries(stmts: Stmt[], entries: Entry[], currency: string): QuarterPoint[] {
	const own = stmts.filter((s) => s.currency === currency).sort((a, b) => a.period_end.localeCompare(b.period_end))
	const byQ = new Map<string, Stmt>()
	for (const s of own) byQ.set(calQ(s.period_end), s) // later period_end wins
	const list = [...byQ.values()]
	const pts: QuarterPoint[] = list.map((s) => ({
		q: calQ(s.period_end),
		period_end: s.period_end,
		revenue: num(s.adjusted.revenue),
		expenses: num(s.adjusted.expenses),
		net_income: num(s.adjusted.net_income),
		deferred: num(s.adjusted.conditional_deferred),
		rpo: num(s.adjusted.backlog_rpo),
		committed: num(s.adjusted.committed_balance),
		reported_debt: reportedDebtAt(entries, s.period_end, currency),
		draft_revenue: num(s.draft.revenue),
		draft_expenses: num(s.draft.expenses),
		ttm_revenue: null,
		ttm_expenses: null
	}))
	for (let i = 3; i < pts.length; i++) {
		if (dayDiff(pts[i - 3].period_end, pts[i].period_end) > 310) continue // gap → not 4 consecutive quarters
		const win = pts.slice(i - 3, i + 1)
		if (win.every((p) => p.revenue !== null)) pts[i].ttm_revenue = win.reduce((a, p) => a + p.revenue!, 0)
		if (win.every((p) => p.expenses !== null)) pts[i].ttm_expenses = win.reduce((a, p) => a + p.expenses!, 0)
	}
	return pts
}

// ── reported debt (XBRL alias picks, mirroring xbrl.ts CONCEPT_MAP order) ───

// Keep in sync with src/lib/server/reality/xbrl.ts (debt_short / debt_long).
const DEBT_SHORT_TAGS = [
	"us-gaap:ShortTermBorrowings", "us-gaap:LongTermDebtCurrent", "us-gaap:DebtCurrent",
	"us-gaap:LongTermDebtAndCapitalLeaseObligationsCurrent", "ifrs-full:CurrentPortionOfLongtermBorrowings"
]
const DEBT_LONG_TAGS = [
	"us-gaap:LongTermDebtNoncurrent", "us-gaap:LongTermDebt",
	"us-gaap:LongTermDebtAndCapitalLeaseObligations", "ifrs-full:LongtermBorrowings"
]
const LEASE_TAGS = ["us-gaap:OperatingLeaseLiability"]
const LEASE_PAIR_TAGS = [
	["us-gaap:OperatingLeaseLiabilityCurrent", "ifrs-full:CurrentLeaseLiabilities"],
	["us-gaap:OperatingLeaseLiabilityNoncurrent", "ifrs-full:NoncurrentLeaseLiabilities"]
]
const PURCHASE_TAGS = [
	"us-gaap:PurchaseObligation", "us-gaap:UnrecordedUnconditionalPurchaseObligation",
	"us-gaap:PurchaseCommitmentRemainingMinimumAmountCommitted"
]

const live = (e: Entry): boolean => !e.superseded && e.value_type === "currency" && e.origin === "xbrl"

/** First alias with an instant fact within 6 days of period_end wins (xbrl.ts rule). */
export function pickAliasInstant(entries: Entry[], tags: string[], periodEnd: string, unit: string): number | null {
	for (const tag of tags) {
		const hits = entries.filter(
			(e) => live(e) && e.taxonomy_tag === tag && e.unit === unit && !e.period_start &&
				Math.abs(dayDiff(e.period_end, periodEnd)) <= 6
		)
		if (hits.length) return hits[hits.length - 1].amount
	}
	return null
}

export function reportedDebtAt(entries: Entry[], periodEnd: string, unit: string): number | null {
	const s = pickAliasInstant(entries, DEBT_SHORT_TAGS, periodEnd, unit)
	const l = pickAliasInstant(entries, DEBT_LONG_TAGS, periodEnd, unit)
	return s === null && l === null ? null : (s ?? 0) + (l ?? 0)
}

/** Debt / leases / purchases split of the committed balance at one date. */
export function committedSplitAt(entries: Entry[], periodEnd: string, unit: string) {
	const debt = reportedDebtAt(entries, periodEnd, unit) ?? 0
	let lease = pickAliasInstant(entries, LEASE_TAGS, periodEnd, unit)
	if (lease === null) {
		const parts = LEASE_PAIR_TAGS.map((tags) => pickAliasInstant(entries, tags, periodEnd, unit))
		if (parts.some((p) => p !== null)) lease = parts.reduce<number>((a, p) => a + (p ?? 0), 0)
	}
	const purchase = pickAliasInstant(entries, PURCHASE_TAGS, periodEnd, unit)
	return { debt, lease: lease ?? 0, purchase: purchase ?? 0 }
}

// ── annual expense components (FY-duration XBRL facts) ──────────────────────

const isFY = (e: Entry): boolean => !!e.period_start && dayDiff(e.period_start, e.period_end) > 300

/** First alias group with a FY fact for that year wins; groups of tags are summed. */
function fyPick(entries: Entry[], groups: string[][], year: number, unit: string): number | null {
	for (const tags of groups) {
		const vals = tags.map((tag) => {
			const hits = entries.filter(
				(e) => live(e) && isFY(e) && e.taxonomy_tag === tag && e.unit === unit &&
					Number(e.period_end.slice(0, 4)) === year
			)
			return hits.length ? hits[hits.length - 1].amount : null
		})
		if (vals.some((v) => v !== null)) return vals.reduce<number>((a, v) => a + (v ?? 0), 0)
	}
	return null
}

export type ExpenseComponents = {
	year: number
	cost_of_revenue: number | null
	rnd: number | null
	sga: number | null
	tax: number | null
	sbc: number | null // inside the other lines — a callout, never a slice
	capex: number | null // cash, not P&L — its own series
}

/** One row per fiscal year (labeled by the year the fiscal year ends in). */
export function annualComponents(entries: Entry[], unit: string): ExpenseComponents[] {
	const years = [...new Set(entries.filter((e) => live(e) && isFY(e)).map((e) => Number(e.period_end.slice(0, 4))))].sort()
	return years.map((year) => ({
		year,
		cost_of_revenue: fyPick(entries, [["us-gaap:CostOfRevenue"], ["us-gaap:CostOfGoodsAndServicesSold"], ["ifrs-full:CostOfSales"]], year, unit),
		rnd: fyPick(entries, [["us-gaap:ResearchAndDevelopmentExpense"]], year, unit),
		sga: fyPick(entries, [["us-gaap:SellingGeneralAndAdministrativeExpense"], ["us-gaap:SellingAndMarketingExpense", "us-gaap:GeneralAndAdministrativeExpense"]], year, unit),
		tax: fyPick(entries, [["us-gaap:IncomeTaxExpenseBenefit"]], year, unit),
		sbc: fyPick(entries, [["us-gaap:ShareBasedCompensation"]], year, unit),
		capex: fyPick(entries, [["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment"]], year, unit)
	}))
}

// ── forward-schedule bands ──────────────────────────────────────────────────

export type Bands = {
	/** [next 5y, years 5-10, beyond 10y] with disclosed vs estimated timing. */
	obligations: { disclosed: number; estimated: number }[]
	/** "After year five" money the filings never date — kept whole, own slice. */
	undated_after5: number
	future_revenue: number[] // contingent revenue by the same three bands
	financing: number // money coming back, all bands — never mixed into outflows
}

const sumKind = (rec: Record<string, number>, kind: string, unit: string): number =>
	Object.entries(rec).reduce((a, [k, v]) => (k === `${kind} ${unit}` ? a + v : a), 0)

export function bands(buckets: ForwardBucket[], asOf: string, unit: string): Bands {
	const b5 = addYearsIso(asOf, 5)
	const b10 = addYearsIso(asOf, 10)
	const bandOf = (period: string): number => (qEnd(period) <= b5 ? 0 : qEnd(period) <= b10 ? 1 : 2)
	const out: Bands = {
		obligations: [0, 1, 2].map(() => ({ disclosed: 0, estimated: 0 })),
		undated_after5: 0,
		future_revenue: [0, 0, 0],
		financing: 0
	}
	for (const b of buckets) {
		const band = bandOf(b.period)
		out.obligations[band].disclosed += sumKind(b.disclosed, "obligation", unit)
		out.obligations[band].estimated += sumKind(b.estimated, "obligation", unit)
		out.undated_after5 += sumKind(b.beyond, "obligation", unit)
		out.future_revenue[band] +=
			sumKind(b.disclosed, "contingent_revenue", unit) + sumKind(b.estimated, "contingent_revenue", unit) +
			sumKind(b.beyond, "contingent_revenue", unit)
		out.financing += sumKind(b.total_by_kind, "financing", unit)
	}
	return out
}

// ── declared vs actual (draft vs adjusted, by calendar year) ────────────────

export type DeclaredVsActual = {
	year: number
	draft_revenue: number
	adjusted_revenue: number
	draft_expenses: number
	adjusted_expenses: number
}

export function declaredVsActual(pts: QuarterPoint[]): DeclaredVsActual[] {
	const byYear = new Map<number, DeclaredVsActual>()
	for (const p of pts) {
		if (p.draft_revenue === null || p.revenue === null) continue
		const y = Number(p.period_end.slice(0, 4))
		const row = byYear.get(y) ?? { year: y, draft_revenue: 0, adjusted_revenue: 0, draft_expenses: 0, adjusted_expenses: 0 }
		row.draft_revenue += p.draft_revenue
		row.adjusted_revenue += p.revenue
		row.draft_expenses += p.draft_expenses ?? 0
		row.adjusted_expenses += p.expenses ?? 0
		byYear.set(y, row)
	}
	return [...byYear.values()].sort((a, b) => a.year - b.year)
}

// ── industry aggregation ────────────────────────────────────────────────────

export type IndustrySeriesPoint = {
	q: string
	ttm_revenue: number
	deferred: number
	rpo: number
	committed: number
	reported_debt: number
	n: number // companies contributing at this point
}

/** Sum per calendar quarter across companies; a company joins a point only when it has data there. */
export function industrySeries(all: Map<string, QuarterPoint[]>, fromQ: string, toQ: string): IndustrySeriesPoint[] {
	const quarters: string[] = []
	for (let q = fromQ; q <= toQ; ) {
		quarters.push(q)
		const [y, n] = [Number(q.slice(0, 4)), Number(q.slice(6))]
		q = n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`
	}
	return quarters.map((q) => {
		const out: IndustrySeriesPoint = { q, ttm_revenue: 0, deferred: 0, rpo: 0, committed: 0, reported_debt: 0, n: 0 }
		for (const pts of all.values()) {
			const p = pts.find((x) => x.q === q)
			if (!p || p.ttm_revenue === null) continue
			out.n++
			out.ttm_revenue += p.ttm_revenue
			out.deferred += p.deferred ?? 0
			out.rpo += p.rpo ?? 0
			out.committed += p.committed ?? 0
			out.reported_debt += p.reported_debt ?? 0
		}
		return out
	})
}

/** Index several metric series to 100 at the first quarter where all are positive. */
export function indexedSeries(points: IndustrySeriesPoint[], keys: (keyof IndustrySeriesPoint)[]) {
	const base = points.find((p) => keys.every((k) => (p[k] as number) > 0))
	if (!base) return []
	return points
		.filter((p) => p.q >= base.q)
		.map((p) => ({
			q: p.q,
			...Object.fromEntries(keys.map((k) => [k, (p[k] as number) > 0 ? ((p[k] as number) / (base[k] as number)) * 100 : null]))
		})) as ({ q: string } & Record<string, number | null>)[]
}
