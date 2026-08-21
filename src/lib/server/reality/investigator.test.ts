// Offline investigator tests. The SMCI cadence fixtures are the real filing
// dates from the local archive — the known 2024-2025 delinquency must flag.

import { describe, expect, test } from "bun:test"
import {
	cadenceFlags,
	conditionalRatioFlag,
	investigate,
	isScaleNoise,
	revisionScan,
	type FilingRow,
	type LedgerEntryRow
} from "./investigator"

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
	taxonomy_tag: "us-gaap:GrossProfit",
	source_location: "xbrl:10-K",
	notes: null,
	origin: "xbrl",
	superseded: false,
	content_hash: crypto.randomUUID(),
	created_at: new Date(),
	...over
})

describe("cadenceFlags", () => {
	test("flags SMCI's real delinquent FY2024 10-K and the same-day catch-up batch", () => {
		const filings: FilingRow[] = [
			{ accession: "0001375365-23-000036", form: "10-K", filing_date: "2023-08-28", report_date: "2023-06-30" }, // 59d, fine
			{ accession: "0001375365-25-000004", form: "10-K", filing_date: "2025-02-25", report_date: "2024-06-30" }, // 240d late
			{ accession: "0001375365-25-000005", form: "10-Q", filing_date: "2025-02-25", report_date: "2024-09-30" }, // 148d late
			{ accession: "0001375365-25-000006", form: "10-Q", filing_date: "2025-02-25", report_date: "2024-12-31" } // 56d, fine
		]
		const flags = cadenceFlags("0001375365", filings)
		const late = flags.filter((f) => f.summary.includes("days after the period end"))
		expect(late.length).toBe(2) // the 10-K and the Sep 10-Q
		const bunched = flags.filter((f) => f.summary.includes("same day"))
		expect(bunched.length).toBe(1)
		expect(bunched[0].summary).toContain("2025-02-25")
	})

	test("6-K filings never flag late (no deadline)", () => {
		const flags = cadenceFlags("c", [
			{ accession: "x", form: "6-K", filing_date: "2026-07-15", report_date: "2025-12-31" }
		])
		expect(flags).toEqual([])
	})
})

describe("isScaleNoise / revisionScan", () => {
	test("power-of-10 pairs are noise; material diffs are candidates; rounding ignored", () => {
		expect(isScaleNoise(1_753_000, 1_753_000_000)).toBe(true) // real SMCI pair
		expect(isScaleNoise(100_000_000, 1_000_000_000)).toBe(true) // real SMCI pair
		expect(isScaleNoise(32_471_000, 24_800_000)).toBe(false)

		const rows: LedgerEntryRow[] = [
			// noise pair ×3 → tagging_quality
			entry({ taxonomy_tag: "t1", period_end: "2022-06-30", amount: 1_753_000 }),
			entry({ taxonomy_tag: "t1", period_end: "2022-06-30", amount: 1_753_000_000 }),
			entry({ taxonomy_tag: "t2", period_end: "2023-06-30", amount: 82_000 }),
			entry({ taxonomy_tag: "t2", period_end: "2023-06-30", amount: 82_000_000 }),
			entry({ taxonomy_tag: "t3", period_end: "2023-06-30", amount: 100_000_000 }),
			entry({ taxonomy_tag: "t3", period_end: "2023-06-30", amount: 1_000_000_000 }),
			// material revision → candidate
			entry({ taxonomy_tag: "t4", period_end: "2023-06-30", amount: 500, accession: "orig" }),
			entry({ taxonomy_tag: "t4", period_end: "2023-06-30", amount: 450, accession: "restated" }),
			// rounding → ignored
			entry({ taxonomy_tag: "t5", period_end: "2023-06-30", amount: 1000 }),
			entry({ taxonomy_tag: "t5", period_end: "2023-06-30", amount: 1004 })
		]
		const { candidates, flags } = revisionScan("c", rows)
		expect(candidates.length).toBe(1)
		expect(candidates[0]).toMatchObject({ taxonomy_tag: "t4", values: [500, 450] })
		expect(flags.length).toBe(1)
		expect(flags[0].flag_type).toBe("tagging_quality")
	})
})

describe("conditionalRatioFlag", () => {
	const quarter = (end: string, start: string, val: number) =>
		entry({
			taxonomy_tag: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
			kind: "revenue", period_start: start, period_end: end, amount: val
		})
	const deferred = (end: string, val: number) =>
		entry({ taxonomy_tag: "us-gaap:ContractWithCustomerLiabilityCurrent", kind: "contingent_revenue", period_end: end, amount: val })

	test("flags conditional revenue outgrowing actual revenue", () => {
		const rows = [
			quarter("2023-09-30", "2023-07-01", 100), deferred("2023-09-30", 50),
			quarter("2023-12-31", "2023-10-01", 105), deferred("2023-12-31", 90),
			quarter("2024-03-31", "2024-01-01", 110), deferred("2024-03-31", 150),
			quarter("2024-06-30", "2024-04-01", 115), deferred("2024-06-30", 260)
		]
		const f = conditionalRatioFlag("c", rows)
		expect(f).not.toBeNull()
		expect(f!.flag_type).toBe("conditional_ratio")
	})

	test("null when both grow in step or history is short", () => {
		expect(conditionalRatioFlag("c", [quarter("2024-06-30", "2024-04-01", 100), deferred("2024-06-30", 50)])).toBeNull()
	})
})

describe("investigate (ai layer)", () => {
	test("validates ai flags: unknown types and unknown entry ids dropped, banned language neutralized", async () => {
		const e1 = entry({ origin: "ai", notes: "commitment noted" })
		const flags = await investigate("c", [e1], [], async () => ({
			flags: [
				{ flag_type: "vanishing_item", summary: "A $5.0 million commitment appears in one filing only.", entry_ids: [e1.id, "ghost"], period_end: "2024-06-30", detail: "" },
				{ flag_type: "made_up_type", summary: "x", entry_ids: [], period_end: "" },
				{ flag_type: "redefinition", summary: "Management is hiding the change.", entry_ids: [], period_end: "not-a-date" }
			]
		}))
		expect(flags.length).toBe(2)
		expect(flags[0]).toMatchObject({
			flag_type: "vanishing_item",
			origin: "ai",
			entry_ids: [e1.id], // ghost dropped
			period_end: "2024-06-30"
		})
		// banned framing ("is hiding") replaced with the neutral template
		expect(flags[1].summary).toBe("Cross-filing pattern (redefinition) observed; see cited entries.")
		expect(flags[1].period_end).toBeNull()
	})
})

// appended: vendor-financing deterministic checks
import { cashConversionFlag, receivablesRatioFlag } from "./investigator"

describe("receivablesRatioFlag", () => {
	const q = (end: string, start: string, val: number) =>
		entry({ taxonomy_tag: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", kind: "revenue", period_start: start, period_end: end, amount: val })
	const ar = (end: string, val: number) =>
		entry({ taxonomy_tag: "us-gaap:AccountsReceivableNetCurrent", kind: "context", period_end: end, amount: val })
	const loans = (end: string, val: number) =>
		entry({ taxonomy_tag: "us-gaap:NotesAndLoansReceivableNetCurrent", kind: "financing", period_end: end, amount: val })

	test("flags receivables + customer financing outgrowing revenue", () => {
		const rows = [
			q("2023-09-30", "2023-07-01", 100), ar("2023-09-30", 40), loans("2023-09-30", 10),
			q("2023-12-31", "2023-10-01", 105), ar("2023-12-31", 80), loans("2023-12-31", 30),
			q("2024-03-31", "2024-01-01", 110), ar("2024-03-31", 130), loans("2024-03-31", 60),
			q("2024-06-30", "2024-04-01", 115), ar("2024-06-30", 210), loans("2024-06-30", 90)
		]
		const f = receivablesRatioFlag("c", rows)
		expect(f).not.toBeNull()
		expect(f!.flag_type).toBe("receivables_ratio")
		expect(f!.summary).toContain("receivables and customer-financing")
	})

	test("null when receivables track revenue", () => {
		const rows = [
			q("2023-09-30", "2023-07-01", 100), ar("2023-09-30", 40),
			q("2023-12-31", "2023-10-01", 110), ar("2023-12-31", 44),
			q("2024-03-31", "2024-01-01", 120), ar("2024-03-31", 48),
			q("2024-06-30", "2024-04-01", 130), ar("2024-06-30", 52)
		]
		expect(receivablesRatioFlag("c", rows)).toBeNull()
	})
})

describe("cashConversionFlag", () => {
	const ni = (start: string, end: string, val: number) =>
		entry({ taxonomy_tag: "us-gaap:NetIncomeLoss", period_start: start, period_end: end, amount: val })
	const ocf = (start: string, end: string, val: number) =>
		entry({ taxonomy_tag: "us-gaap:NetCashProvidedByUsedInOperatingActivities", period_start: start, period_end: end, amount: val })

	test("flags two straight years of weak cash conversion", () => {
		const rows = [
			ni("2022-07-01", "2023-06-30", 100), ocf("2022-07-01", "2023-06-30", 30),
			ni("2023-07-01", "2024-06-30", 200), ocf("2023-07-01", "2024-06-30", 50)
		]
		const f = cashConversionFlag("c", rows)
		expect(f).not.toBeNull()
		expect(f!.flag_type).toBe("cash_conversion")
		expect(f!.summary).toContain("25%") // 50/200
	})

	test("null when only one year is weak", () => {
		const rows = [
			ni("2022-07-01", "2023-06-30", 100), ocf("2022-07-01", "2023-06-30", 90),
			ni("2023-07-01", "2024-06-30", 200), ocf("2023-07-01", "2024-06-30", 50)
		]
		expect(cashConversionFlag("c", rows)).toBeNull()
	})
})

describe("new ai flag types", () => {
	test("off_balance_sheet and circular_financing survive validation", async () => {
		const e1 = entry({ origin: "ai", kind: "financing" })
		const flags = await investigate("c", [e1], [], async () => ({
			flags: [
				{ flag_type: "off_balance_sheet", summary: "A sole-tenant lease with fixed payments is reported as not yet commenced.", entry_ids: [e1.id], period_end: "", detail: "" },
				{ flag_type: "circular_financing", summary: "The filings report a loan to an entity also reported as a customer.", entry_ids: [e1.id], period_end: "", detail: "" }
			]
		}))
		expect(flags.map((f) => f.flag_type).sort()).toEqual(["circular_financing", "off_balance_sheet"])
	})
})
