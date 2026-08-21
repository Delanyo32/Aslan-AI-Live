import { describe, expect, test } from "bun:test"
import {
	annualComponents, bands, cagr, calQ, companySeries, declaredVsActual,
	indexedSeries, industrySeries, median, pickAliasInstant, qEnd, reportedDebtAt,
	type Entry, type ForwardBucket, type Stmt
} from "./stats"

const entry = (over: Partial<Entry>): Entry => ({
	amount: 0, unit: "USD", kind: "obligation", certainty: "committed", origin: "xbrl",
	value_type: "currency", taxonomy_tag: null, period_start: null, period_end: "2025-06-30",
	due_date: null, superseded: false, notes: null, source_location: "xbrl:10-Q", ...over
})

const stmt = (period_end: string, f: Partial<Stmt["draft"]>, adj?: Partial<Stmt["draft"]>): Stmt => ({
	period_end, fiscal_label: "", currency: "USD",
	draft: { revenue: 100, expenses: 80, net_income: 20, conditional_deferred: 10, backlog_rpo: 5, committed_balance: 50, ...f },
	adjusted: { revenue: 100, expenses: 80, net_income: 20, conditional_deferred: 10, backlog_rpo: 5, committed_balance: 50, ...f, ...adj }
})

describe("calendar", () => {
	test("calQ and qEnd round-trip", () => {
		expect(calQ("2027-09-30")).toBe("2027-Q3")
		expect(qEnd("2027-Q3")).toBe("2027-09-30")
		expect(qEnd("2027-Q1")).toBe("2027-03-31")
	})
})

describe("small stats", () => {
	test("median odd/even/empty", () => {
		expect(median([3, 1, 2])).toBe(2)
		expect(median([4, 1, 2, 3])).toBe(2.5)
		expect(median([])).toBeNull()
	})
	test("cagr doubles in ~3.8y at 20%", () => {
		expect(cagr(100, 200, 5)!).toBeCloseTo(0.1487, 3)
		expect(cagr(0, 200, 5)).toBeNull()
	})
})

describe("companySeries", () => {
	const quarters = ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31"]
	test("TTM sums 4 consecutive quarters", () => {
		const s = quarters.map((d) => stmt(d, { revenue: 10, expenses: 8 }))
		const pts = companySeries(s, [], "USD")
		expect(pts[2].ttm_revenue).toBeNull() // only 3 quarters behind it
		expect(pts[3].ttm_revenue).toBe(40)
		expect(pts[4].ttm_expenses).toBe(32)
	})
	test("a gap breaks the TTM window", () => {
		const s = ["2023-03-31", "2024-06-30", "2024-09-30", "2024-12-31"].map((d) => stmt(d, { revenue: 10 }))
		expect(companySeries(s, [], "USD")[3].ttm_revenue).toBeNull()
	})
	test("filters to the requested currency", () => {
		const s = [stmt("2024-03-31", {}), { ...stmt("2024-06-30", {}), currency: "RUB" }]
		expect(companySeries(s, [], "USD")).toHaveLength(1)
	})
	test("uses adjusted for flows, keeps draft beside", () => {
		const s = [stmt("2024-03-31", { revenue: 100 }, { revenue: 90 })]
		const [p] = companySeries(s, [], "USD")
		expect(p.revenue).toBe(90)
		expect(p.draft_revenue).toBe(100)
	})
})

describe("reported debt alias picks", () => {
	test("first alias present wins; short + long sum", () => {
		const es = [
			entry({ taxonomy_tag: "us-gaap:LongTermDebtNoncurrent", amount: 900 }),
			entry({ taxonomy_tag: "us-gaap:LongTermDebt", amount: 1000 }), // lower priority — ignored
			entry({ taxonomy_tag: "us-gaap:DebtCurrent", amount: 100 })
		]
		expect(reportedDebtAt(es, "2025-06-30", "USD")).toBe(1000)
	})
	test("superseded and ai rows never count", () => {
		const es = [
			entry({ taxonomy_tag: "us-gaap:LongTermDebt", amount: 500, superseded: true }),
			entry({ taxonomy_tag: "us-gaap:LongTermDebt", amount: 400, origin: "ai" })
		]
		expect(reportedDebtAt(es, "2025-06-30", "USD")).toBeNull()
	})
	test("6-K rows (ai origin, 6k: tag) are the debt spine for foreign filers", () => {
		const es = [
			entry({ taxonomy_tag: "6k:debt_long", amount: 900, origin: "ai", unit: "EUR" }),
			entry({ taxonomy_tag: "6k:debt_short", amount: 100, origin: "ai", unit: "EUR" })
		]
		expect(reportedDebtAt(es, "2025-06-30", "EUR")).toBe(1000)
	})
	test("real XBRL outranks a 6-K row for the same period", () => {
		const es = [
			entry({ taxonomy_tag: "6k:debt_long", amount: 900, origin: "ai" }),
			entry({ taxonomy_tag: "us-gaap:LongTermDebtNoncurrent", amount: 800 })
		]
		expect(reportedDebtAt(es, "2025-06-30", "USD")).toBe(800)
	})
	test("6-day date tolerance", () => {
		const es = [entry({ taxonomy_tag: "us-gaap:LongTermDebt", amount: 7, period_end: "2025-06-28" })]
		expect(pickAliasInstant(es, ["us-gaap:LongTermDebt"], "2025-06-30", "USD")).toBe(7)
		expect(pickAliasInstant(es, ["us-gaap:LongTermDebt"], "2025-07-15", "USD")).toBeNull()
	})
})

describe("annualComponents", () => {
	test("FY-span facts only, alias fallback sums the S&M+G&A pair", () => {
		const es = [
			entry({ taxonomy_tag: "us-gaap:ResearchAndDevelopmentExpense", amount: 40, period_start: "2024-01-01", period_end: "2024-12-31" }),
			entry({ taxonomy_tag: "us-gaap:ResearchAndDevelopmentExpense", amount: 10, period_start: "2024-10-01", period_end: "2024-12-31" }), // quarter — ignored
			entry({ taxonomy_tag: "us-gaap:SellingAndMarketingExpense", amount: 5, period_start: "2024-01-01", period_end: "2024-12-31" }),
			entry({ taxonomy_tag: "us-gaap:GeneralAndAdministrativeExpense", amount: 3, period_start: "2024-01-01", period_end: "2024-12-31" })
		]
		const [row] = annualComponents(es, "USD")
		expect(row.year).toBe(2024)
		expect(row.rnd).toBe(40)
		expect(row.sga).toBe(8)
		expect(row.cost_of_revenue).toBeNull()
	})
})

describe("bands", () => {
	const bucket = (period: string, over: Partial<ForwardBucket>): ForwardBucket => ({
		period, total_by_kind: {}, disclosed: {}, estimated: {}, beyond: {}, ...over
	})
	test("5/10-year boundaries and the undated slice", () => {
		const bs = [
			bucket("2027-Q1", { disclosed: { "obligation USD": 10 } }),
			bucket("2031-Q3", { estimated: { "obligation USD": 20 } }), // as_of + 5y..10y
			bucket("2040-Q1", { disclosed: { "obligation USD": 30 } }),
			bucket("2031-Q2", { beyond: { "obligation USD": 99 } }), // after-year-5 lump
			bucket("2028-Q1", { disclosed: { "contingent_revenue USD": 7 }, total_by_kind: { "financing USD": 3 } })
		]
		const b = bands(bs, "2026-08-20", "USD")
		expect(b.obligations[0].disclosed).toBe(10)
		expect(b.obligations[1].estimated).toBe(20)
		expect(b.obligations[2].disclosed).toBe(30)
		expect(b.undated_after5).toBe(99)
		expect(b.future_revenue[0]).toBe(7)
		expect(b.financing).toBe(3)
	})
})

describe("declaredVsActual", () => {
	test("sums by calendar year, draft vs adjusted", () => {
		const s = [
			stmt("2024-03-31", { revenue: 100, expenses: 80 }, { revenue: 90, expenses: 85 }),
			stmt("2024-06-30", { revenue: 100, expenses: 80 }, { revenue: 100, expenses: 80 })
		]
		const [row] = declaredVsActual(companySeries(s, [], "USD"))
		expect(row).toEqual({ year: 2024, draft_revenue: 200, adjusted_revenue: 190, draft_expenses: 160, adjusted_expenses: 165 })
	})
})

describe("industry", () => {
	const mk = (rev: number) =>
		companySeries(["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31"].map((d) => stmt(d, { revenue: rev })), [], "USD")
	test("sums only companies with a TTM at that point", () => {
		const pts = industrySeries(new Map([["A", mk(10)], ["B", mk(20)]]), "2024-Q3", "2024-Q4")
		expect(pts[0].n).toBe(0) // no TTM yet at Q3
		expect(pts[1]).toMatchObject({ q: "2024-Q4", ttm_revenue: 120, n: 2 })
	})
	test("indexedSeries starts at 100", () => {
		const pts = industrySeries(new Map([["A", mk(10)]]), "2024-Q4", "2024-Q4")
		const idx = indexedSeries(pts, ["ttm_revenue", "committed"])
		expect(idx[0].ttm_revenue).toBe(100)
		expect(idx[0].committed).toBe(100)
	})
})
