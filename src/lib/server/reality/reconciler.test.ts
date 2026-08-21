// Offline reconciler tests — SMCI-shaped fixtures (June fiscal year end).

import { describe, expect, test } from "bun:test"
import {
	applyAdjustments,
	buildDrafts,
	fiscalLabel,
	quarterFrames,
	reconcile,
	type DraftStatement,
	type LedgerEntryRow
} from "./reconciler"

const entry = (over: Partial<LedgerEntryRow>): LedgerEntryRow => ({
	id: crypto.randomUUID(),
	cik: "c",
	accession: "a-1",
	amount: 100,
	amount_high: null,
	value_type: "currency",
	unit: "USD",
	kind: "context",
	certainty: "actual",
	period_start: null,
	period_end: "2024-06-30",
	fiscal_year: null,
	fiscal_period: null,
	due_date: null,
	inferred_due: false,
	event_date: null,
	counterparty: null,
	related_party: false,
	taxonomy_tag: null,
	source_location: "xbrl:10-K",
	notes: null,
	origin: "xbrl",
	superseded: false,
	content_hash: crypto.randomUUID(),
	created_at: new Date(),
	...over
})

// FY2024 (Jul 2023 – Jun 2024): three reported quarters + the annual.
const rev = (start: string, end: string, amount: number) =>
	entry({ taxonomy_tag: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", kind: "revenue", period_start: start, period_end: end, amount })
const FY24 = [
	rev("2023-07-01", "2023-09-30", 100),
	rev("2023-10-01", "2023-12-31", 110),
	rev("2024-01-01", "2024-03-31", 120),
	rev("2023-07-01", "2024-06-30", 500) // annual → Q4 = 170
]

describe("quarterFrames", () => {
	test("derives the Q4 frame from the annual gap", () => {
		const frames = quarterFrames(FY24)
		expect(frames.length).toBe(4)
		const q4 = frames[3]
		expect(q4).toEqual({ start: "2024-04-01", end: "2024-06-30", q4_derived: true })
	})

	test("no derivation when a sibling quarter is missing", () => {
		const frames = quarterFrames(FY24.filter((e) => e.period_end !== "2023-12-31"))
		expect(frames.some((f) => f.q4_derived)).toBe(false)
	})
})

describe("buildDrafts", () => {
	const cost = (start: string, end: string, amount: number) =>
		entry({ taxonomy_tag: "us-gaap:CostOfRevenue", kind: "expense", period_start: start, period_end: end, amount })
	const rnd = (start: string, end: string, amount: number) =>
		entry({ taxonomy_tag: "us-gaap:ResearchAndDevelopmentExpense", kind: "expense", period_start: start, period_end: end, amount })
	const rows = [
		...FY24,
		cost("2023-07-01", "2023-09-30", 60),
		cost("2023-10-01", "2023-12-31", 65),
		cost("2024-01-01", "2024-03-31", 70),
		cost("2023-07-01", "2024-06-30", 300), // annual → Q4 = 105
		rnd("2023-07-01", "2023-09-30", 10),
		rnd("2023-10-01", "2023-12-31", 10),
		rnd("2024-01-01", "2024-03-31", 10),
		rnd("2023-07-01", "2024-06-30", 40), // annual → Q4 = 10
		entry({ taxonomy_tag: "us-gaap:ContractWithCustomerLiabilityCurrent", kind: "contingent_revenue", period_end: "2024-06-30", amount: 40 }),
		entry({ taxonomy_tag: "us-gaap:ContractWithCustomerLiabilityNoncurrent", kind: "contingent_revenue", period_end: "2024-06-30", amount: 10 }),
		entry({ taxonomy_tag: "us-gaap:RevenueRemainingPerformanceObligation", kind: "contingent_revenue", period_end: "2024-06-30", amount: 90 }),
		entry({ taxonomy_tag: "us-gaap:PurchaseObligation", kind: "obligation", certainty: "committed", period_end: "2024-06-30", amount: 6200 }),
		// soft entry with a due date, stated as of FY end
		entry({ origin: "ai", kind: "obligation", certainty: "committed", period_end: "2024-06-30", amount: 700, due_date: "2028-07-15" })
	]

	test("derived Q4 flows, instant balances, and the due schedule", () => {
		const drafts = buildDrafts(rows, quarterFrames(rows))
		const q4 = drafts[3]
		expect(q4.draft).toMatchObject({
			revenue: 170,
			expenses: 115, // cost 105 + R&D 10
			conditional_deferred: 50,
			backlog_rpo: 90, // kept separate — overlaps deferred
			committed_balance: 6200,
			q4_derived: true
		})
		expect(q4.due).toEqual([{ due_date: "2028-07-15", amount: 700, unit: "USD", entry_id: rows[rows.length - 1].id }])
		expect(q4.currency).toBe("USD")
		// Q1 had a direct quarterly value
		expect(drafts[0].draft.revenue).toBe(100)
		expect(drafts[0].draft.q4_derived).toBe(false)
	})

	test("lease components sum, but yield to the combined concept when both are tagged", () => {
		const lease = (tag: string, amount: number) =>
			entry({ taxonomy_tag: tag, kind: "obligation", certainty: "committed", period_end: "2023-09-30", amount })
		const components = [
			...FY24,
			lease("us-gaap:OperatingLeaseLiabilityCurrent", 30),
			lease("us-gaap:OperatingLeaseLiabilityNoncurrent", 170)
		]
		expect(buildDrafts(components, quarterFrames(components))[0].draft.committed_balance).toBe(200)
		const both = [...components, lease("us-gaap:OperatingLeaseLiability", 200)]
		expect(buildDrafts(both, quarterFrames(both))[0].draft.committed_balance).toBe(200) // no double count
	})

	test("a lone expense component yields a gap, not a partial total", () => {
		const lone = [...FY24, cost("2023-07-01", "2023-09-30", 60)]
		const drafts = buildDrafts(lone, quarterFrames(lone))
		expect(drafts[0].draft.expenses).toBeNull() // cost alone ≠ the quarter's expenses
	})

	test("revisions do not pollute sums (first claim wins)", () => {
		const restated = rev("2023-07-01", "2023-09-30", 999)
		restated.created_at = new Date()
		const drafts = buildDrafts([...FY24, restated], quarterFrames(FY24))
		expect(drafts[0].draft.revenue).toBe(100)
	})

	test("CostsAndExpenses (+ tax) fills the gap for filers that never tag CostOfRevenue (ORCL/DLR/HPE shape)", () => {
		const total = (start: string, end: string, amount: number) =>
			entry({ taxonomy_tag: "us-gaap:CostsAndExpenses", kind: "context", period_start: start, period_end: end, amount })
		const tax = (start: string, end: string, amount: number) =>
			entry({ taxonomy_tag: "us-gaap:IncomeTaxExpenseBenefit", kind: "expense", period_start: start, period_end: end, amount })
		const rows = [...FY24, total("2023-07-01", "2023-09-30", 80), tax("2023-07-01", "2023-09-30", 7)]
		const drafts = buildDrafts(rows, quarterFrames(rows))
		expect(drafts[0].draft.expenses).toBe(87) // fallback total + tax
		expect(drafts[1].draft.expenses).toBeNull() // no data at all stays a visible gap
	})

	test("the fallback never fires for a filer with a cost anchor (OperatingExpenses may exclude COGS)", () => {
		const rows = [
			...FY24,
			cost("2023-07-01", "2023-09-30", 60), // cost anchor exists, but the component gate fails (lone component)
			entry({ taxonomy_tag: "us-gaap:OperatingExpenses", kind: "context", period_start: "2023-07-01", period_end: "2023-09-30", amount: 25 })
		]
		expect(buildDrafts(rows, quarterFrames(rows))[0].draft.expenses).toBeNull() // gap, not a COGS-less total
	})
})

describe("fiscalLabel", () => {
	const ends = ["2023-06-30", "2024-06-30"]
	test("labels inside a closed year", () => {
		expect(fiscalLabel("2023-12-31", ends)).toBe("FY2024 Q2")
		expect(fiscalLabel("2024-06-30", ends)).toBe("FY2024 Q4")
	})
	test("extends past the latest closed year", () => {
		expect(fiscalLabel("2024-09-30", ends)).toBe("FY2025 Q1")
	})
})

describe("applyAdjustments", () => {
	const draft: DraftStatement = {
		revenue: 170, expenses: 105, net_income: 20,
		conditional_deferred: 50, backlog_rpo: 90, committed_balance: 6200, q4_derived: true
	}
	const adj = (action: string, amount: number) =>
		({ action, amount, entry_ids: ["e"], flag_ids: [], rationale: "r" })

	test("moves amounts between real and conditional, keeps draft untouched", () => {
		const due = [{ due_date: "2024-11-01", amount: 500, unit: "USD", entry_id: "e" }]
		const { statement: a, applied } = applyAdjustments(draft, due, [
			adj("revenue_to_conditional", 30),
			adj("committed_to_expense", 26)
		])
		expect(a).toMatchObject({ revenue: 140, conditional_deferred: 80, expenses: 131, committed_balance: 6174 })
		expect(a.due_schedule).toEqual(due) // the mechanical schedule passes through
		expect(applied.length).toBe(2)
		expect(draft.revenue).toBe(170) // input untouched
	})
	test("REJECTS an oversized move — never clamps a real quarter away", () => {
		const { statement: a, applied } = applyAdjustments(draft, [], [adj("revenue_to_conditional", 300)])
		expect(a.revenue).toBe(170) // untouched — the wrong citation did not gut the quarter
		expect(a.conditional_deferred).toBe(50)
		expect(applied.length).toBe(0)
	})
	test("skips a move when the source side is null", () => {
		const { statement: a } = applyAdjustments({ ...draft, revenue: null }, [], [adj("revenue_to_conditional", 30)])
		expect(a.revenue).toBeNull()
		expect(a.conditional_deferred).toBe(50) // untouched — the pair never drifts apart
	})
})

describe("reconcile (validation layer)", () => {
	// Soft (origin ai) claims stated as of the Q4 end — the only rows the
	// reconciler may derive an amount from.
	const softQ4 = entry({ origin: "ai", kind: "contingent_revenue", certainty: "conditional", amount: 30, period_end: "2024-06-30", taxonomy_tag: null, source_location: "Note 3 Revenue" })
	const softOversized = entry({ origin: "ai", kind: "contingent_revenue", certainty: "conditional", amount: 999, period_end: "2024-06-30", taxonomy_tag: null, source_location: "Note 3 RPO balance" })
	const softPercent = entry({ origin: "ai", kind: "context", value_type: "percent", unit: "PCT", amount: 21, period_end: "2024-06-30", taxonomy_tag: null, source_location: "Note 2 Concentration" })
	const softHalf = entry({ origin: "ai", kind: "contingent_revenue", certainty: "conditional", amount: 100, period_end: "2024-06-30", taxonomy_tag: null, source_location: "Note 3 Deferred" })
	const softRpo = entry({ origin: "ai", kind: "contingent_revenue", certainty: "conditional", amount: 60, period_end: "2024-06-30", taxonomy_tag: null, source_location: "Note 3", notes: "Future-service performance obligations remained unrecognized." })
	const softAcq = entry({ origin: "ai", kind: "obligation", certainty: "conditional", amount: 50, period_end: "2024-06-30", taxonomy_tag: null, source_location: "Note 8", notes: "The proposed acquisition consideration remained subject to closing conditions." })
	const softDue = entry({ origin: "ai", kind: "obligation", certainty: "committed", amount: 500, period_end: "2024-06-30", due_date: "2024-11-01", taxonomy_tag: null, source_location: "Note 13" })

	test("code derives amounts from cited entries; oversized, uncited, percent, and bad rows drop", async () => {
		const rows = [...FY24, softQ4, softOversized, softPercent, softHalf, softRpo, softAcq, softDue]
		const mechanicalId = FY24[0].id
		const out = await reconcile("c", rows, [], async () => ({
			adjustments: [
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [softQ4.id], flag_ids: [], rationale: "Management is hiding revenue conditions." }, // applies, amount 30 from the cited entry
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [softOversized.id], flag_ids: [], rationale: "cumulative balance cited" }, // 999 > 170 → rejected
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [softPercent.id], flag_ids: [], rationale: "percent row cited" }, // never qualifies
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [softRpo.id], flag_ids: [], rationale: "sub-cap RPO cited" }, // vetoed by wording — backlog is not recognized revenue
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [softHalf.id], flag_ids: [], rationale: "most of the quarter cited" }, // 100 > 50% of 170 → judgment cap
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [softAcq.id], flag_ids: [], rationale: "acquisition cited" }, // vetoed by kind — an obligation cannot reclassify revenue
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [mechanicalId], flag_ids: [], rationale: "mechanical row cited" }, // not a soft row
				{ period_end: "2024-06-30", action: "revenue_to_conditional", entry_ids: [], flag_ids: [], rationale: "uncited" },
				{ period_end: "2099-01-01", action: "revenue_to_conditional", entry_ids: [softQ4.id], flag_ids: [], rationale: "unknown quarter" },
				{ period_end: "2024-06-30", action: "invent_revenue", entry_ids: [softQ4.id], flag_ids: [], rationale: "bad action" }
			],
			quarters: [{ period_end: "2023-09-30", narrative: "Quarter one narrative." }]
		}))
		expect(out.length).toBe(4)
		const q4 = out.find((s) => s.period_end === "2024-06-30")!
		const applied = q4.adjustments as { action: string; amount: number; rationale: string }[]
		expect(applied.length).toBe(1)
		expect(applied[0].amount).toBe(30) // code-derived, not model-supplied
		expect(applied[0].rationale).toBe("Adjustment (revenue_to_conditional) from cited catalog entries.") // banned phrase replaced
		expect((q4.adjusted as { revenue: number }).revenue).toBe(140)
		// the dated soft claim is on the schedule automatically — no add_due action exists
		expect((q4.adjusted as { due_schedule: object[] }).due_schedule).toContainEqual({ due_date: "2024-11-01", amount: 500, unit: "USD", entry_id: softDue.id })
		expect((q4.draft as { revenue: number }).revenue).toBe(170)
		expect(q4.fiscal_label).toBe("FY2024 Q4")
		const q1 = out.find((s) => s.period_end === "2023-09-30")!
		expect(q1.narrative).toBe("Quarter one narrative.")
		expect(q4.narrative).toBe("No reconciliation notes for this quarter.")
	})
})

// appended: forward obligations schedule
import { forwardSchedule } from "./reconciler"

describe("forwardSchedule", () => {
	const TODAY = "2026-08-17"
	const sched = (tag: string, amount: number, over: Partial<Parameters<typeof entry>[0]> = {}) =>
		entry({ taxonomy_tag: `us-gaap:${tag}`, kind: "obligation", certainty: "committed", period_end: "2026-06-30", amount, ...over })

	test("a filed year window spreads evenly across its 4 quarters; after-five stays one bucket", () => {
		const out = forwardSchedule([
			sched("LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo", 400, { due_date: "2028-06-30" }),
			sched("LongTermDebtMaturitiesRepaymentsOfPrincipalAfterYearFive", 999, { due_date: "2031-06-30" })
		], TODAY)
		const spread = out.filter((b) => b.disclosed["obligation USD"])
		expect(spread.map((b) => b.period)).toEqual(["2027-Q3", "2027-Q4", "2028-Q1", "2028-Q2"])
		expect(spread.every((b) => b.disclosed["obligation USD"] === 100)).toBe(true)
		const beyond = out.find((b) => b.beyond["obligation USD"])!
		expect(beyond.period).toBe("2031-Q2")
		expect(beyond.beyond["obligation USD"]).toBe(999)
	})

	test("only the latest schedule vintage counts", () => {
		const out = forwardSchedule([
			sched("LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo", 8888, { period_end: "2025-06-30", due_date: "2027-06-30" }),
			sched("LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo", 400, { due_date: "2028-06-30" })
		], TODAY)
		const total = out.reduce((s, b) => s + (b.total_by_kind["obligation USD"] ?? 0), 0)
		expect(total).toBe(400) // the 2025 vintage was restated by the 2026 one
	})

	test("a lump already covered by a filed schedule is dropped; other commitments spread straight-line", () => {
		const out = forwardSchedule([
			sched("PurchaseObligationDueInNextTwelveMonths", 6200, { due_date: "2027-06-30" }),
			entry({ kind: "obligation", certainty: "committed", amount: 6200, period_end: "2026-06-30", due_date: "2027-06-30", notes: "Non-cancelable purchase commitments" }),
			entry({ kind: "obligation", certainty: "committed", amount: 800, period_end: "2026-06-30", due_date: "2027-06-30", notes: "Guarantee of lender obligations of an unconsolidated entity" })
		], TODAY)
		const disclosed = out.reduce((s, b) => s + (b.disclosed["obligation USD"] ?? 0), 0)
		const estimated = out.reduce((s, b) => s + (b.estimated["obligation USD"] ?? 0), 0)
		expect(disclosed).toBeCloseTo(6200) // schedule only — the purchase lump was the same money
		expect(estimated).toBeCloseTo(800) // the guarantee survives, straight-lined
	})

	test("straight-line spread sums to the lump and drops already-past quarters", () => {
		const out = forwardSchedule([
			entry({ kind: "obligation", certainty: "committed", amount: 800, period_end: "2026-06-30", due_date: "2027-06-30", notes: "settlement payable" })
		], TODAY)
		// window covers Q3'26..Q2'27 (4 quarters × 200); none are past TODAY
		expect(out.map((b) => b.period)).toEqual(["2026-Q3", "2026-Q4", "2027-Q1", "2027-Q2"])
		expect(out.every((b) => b.estimated["obligation USD"] === 200)).toBe(true)
		const past = forwardSchedule([
			entry({ kind: "obligation", certainty: "committed", amount: 800, period_end: "2025-06-30", due_date: "2026-06-30", notes: "settlement payable" })
		], TODAY)
		expect(past.length).toBe(0) // all of it came due before today
	})

	test("a lump restated in a newer filing supersedes the older vintage", () => {
		const out = forwardSchedule([
			entry({ kind: "obligation", certainty: "committed", amount: 5000, period_end: "2026-03-31", due_date: "2027-03-31", notes: "settlement payable" }),
			entry({ kind: "obligation", certainty: "committed", amount: 4000, period_end: "2026-06-30", due_date: "2027-06-30", notes: "settlement payable" })
		], TODAY)
		const total = out.reduce((s, b) => s + (b.total_by_kind["obligation USD"] ?? 0), 0)
		expect(total).toBeCloseTo(4000) // only the newest statement of the obligation counts
	})

	test("share counts, currencies, and financing keep separate keys; a within-quarter due lands whole", () => {
		const out = forwardSchedule([
			entry({ kind: "obligation", certainty: "committed", amount: 1000, period_end: "2029-01-15", due_date: "2029-03-01" }),
			entry({ kind: "obligation", certainty: "committed", amount: 16250, period_end: "2029-01-15", due_date: "2029-03-15", unit: "shares" }),
			entry({ kind: "financing", certainty: "actual", amount: 50, period_end: "2029-01-15", due_date: "2029-01-31", origin: "ai" })
		], TODAY)
		expect(out.length).toBe(1)
		expect(out[0].total_by_kind).toEqual({ "obligation USD": 1000, "obligation shares": 16250, "financing USD": 50 })
		expect(out[0].disclosed).toEqual(out[0].total_by_kind) // dated facts, no spreading needed
	})
})

// appended: foreign-filer regression — 6-K rows are the quarterly spine, and
// week-based fiscal ends (ASML: 06-28/29 vs 06-30) merge into one frame.
describe("buildDrafts (6-K spine)", () => {
	const sixkRev = (start: string, end: string, amount: number) =>
		entry({ origin: "ai", taxonomy_tag: "6k:revenue", kind: "revenue", period_start: start, period_end: end, amount, unit: "EUR" })

	test("uses double-pass 6-K figures and merges rounded quarter ends", () => {
		const rows = [
			sixkRev("2025-12-29", "2026-03-29", 7691_700_000),
			// same quarter, differently-rounded end from another exhibit
			sixkRev("2025-12-31", "2026-03-31", 7691_700_000),
			sixkRev("2026-03-30", "2026-06-28", 9326_500_000),
			// balance at the rounded date must still attach to the 06-28 frame
			entry({ origin: "ai", taxonomy_tag: "6k:cash", kind: "context", period_end: "2026-06-30", amount: 7_582_000_000, unit: "EUR" })
		]
		const frames = quarterFrames(rows)
		expect(frames.length).toBe(2) // merged, not 3
		const drafts = buildDrafts(rows, frames)
		expect(drafts[0].draft.revenue).toBe(7691_700_000)
		expect(drafts[1].draft.revenue).toBe(9326_500_000)
		expect(drafts[1].currency).toBe("EUR")
	})

	test("a currency switch mid-history labels each quarter with its own unit (Nebius shape)", () => {
		const rows = [
			entry({ origin: "ai", taxonomy_tag: "6k:revenue", kind: "revenue", period_start: "2025-10-01", period_end: "2025-12-31", amount: 100, unit: "RUB" }),
			entry({ origin: "ai", taxonomy_tag: "6k:revenue", kind: "revenue", period_start: "2026-01-01", period_end: "2026-03-31", amount: 200, unit: "USD" }),
			entry({ origin: "ai", taxonomy_tag: "6k:revenue", kind: "revenue", period_start: "2026-04-01", period_end: "2026-06-30", amount: 300, unit: "USD" })
		]
		const drafts = buildDrafts(rows, quarterFrames(rows))
		expect(drafts.map((d) => d.currency)).toEqual(["RUB", "USD", "USD"])
	})

	test("xbrl wins over 6-K when both cover a period", () => {
		const rows = [
			rev("2026-01-01", "2026-03-31", 111), // xbrl
			sixkRev("2026-01-01", "2026-03-31", 999)
		]
		const drafts = buildDrafts(rows, quarterFrames(rows))
		expect(drafts[0].draft.revenue).toBe(111)
	})
})

// appended: half-year tail derivation (ASML July 6-K prints Q1 + H1 only)
describe("half-year derivation", () => {
	const sixk = (start: string, end: string, amount: number) =>
		entry({ origin: "ai", taxonomy_tag: "6k:revenue", kind: "revenue", period_start: start, period_end: end, amount, unit: "EUR" })

	test("Q2 = H1 − Q1 when only the cumulative is printed", () => {
		const rows = [
			sixk("2026-01-01", "2026-03-29", 8_767_000_000), // Q1 reported
			sixk("2026-01-01", "2026-06-28", 18_093_400_000) // H1 cumulative only
		]
		const frames = quarterFrames(rows)
		expect(frames.length).toBe(2)
		expect(frames[1]).toEqual({ start: "2026-03-30", end: "2026-06-28", q4_derived: true })
		const drafts = buildDrafts(rows, frames)
		expect(drafts[1].draft.revenue).toBe(9_326_400_000) // 18,093.4 − 8,767.0
	})
})
