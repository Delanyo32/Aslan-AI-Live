// Offline tests for the XBRL → ledger-entries mapper. Fixture shapes mirror
// real companyfacts rows (SMCI us-gaap/USD, TSM ifrs-full/TWD) from the
// 2026-08-15 research probes.

import { describe, expect, test } from "bun:test"
import { factsToEntries, FACTS_MIN_END, type CompanyFacts, type XbrlFact } from "./xbrl"

const fact = (over: Partial<XbrlFact>): XbrlFact => ({
	start: "2023-07-01",
	end: "2024-06-30",
	val: 1000,
	accn: "0001-24-000001",
	form: "10-K",
	filed: "2024-08-30",
	...over
})

const facts = (ns: string, concepts: Record<string, Record<string, XbrlFact[]>>): CompanyFacts => ({
	cik: 1375365,
	entityName: "TEST CO",
	facts: {
		[ns]: Object.fromEntries(
			Object.entries(concepts).map(([name, units]) => [name, { units }])
		)
	}
})

describe("factsToEntries", () => {
	test("maps a us-gaap fact with kind/certainty from the concept map", async () => {
		const out = await factsToEntries(
			facts("us-gaap", { PurchaseObligation: { USD: [fact({ start: undefined, val: 6_200_000_000 })] } }),
			"0001375365"
		)
		expect(out.length).toBe(1)
		expect(out[0]).toMatchObject({
			cik: "0001375365",
			amount: 6_200_000_000,
			unit: "USD",
			kind: "obligation",
			certainty: "committed",
			period_start: null, // instant fact
			period_end: "2024-06-30",
			taxonomy_tag: "us-gaap:PurchaseObligation",
			source_location: "xbrl:10-K",
			origin: "xbrl",
			fiscal_year: null,
			fiscal_period: null
		})
		expect(out[0].content_hash).toHaveLength(64)
	})

	test("first us-gaap alias wins over later aliases", async () => {
		const out = await factsToEntries(
			facts("us-gaap", {
				RevenueFromContractWithCustomerExcludingAssessedTax: { USD: [fact({ val: 111 })] },
				Revenues: { USD: [fact({ val: 222 })] }
			}),
			"c"
		)
		expect(out.length).toBe(1)
		expect(out[0].amount).toBe(111)
	})

	test("a later alias fills periods the first alias never covered (NVDA tag-switch shape)", async () => {
		const out = await factsToEntries(
			facts("us-gaap", {
				RevenueFromContractWithCustomerExcludingAssessedTax: {
					USD: [fact({ start: "2019-04-29", end: "2019-07-28", val: 111 })]
				},
				Revenues: {
					USD: [
						fact({ start: "2019-04-29", end: "2019-07-28", val: 999 }), // same period — first alias owns it
						fact({ start: "2025-01-27", end: "2025-04-27", val: 222 }) // new era — only this tag has it
					]
				}
			}),
			"c"
		)
		expect(out.length).toBe(2)
		expect(out.find((e) => e.period_end === "2019-07-28")!.amount).toBe(111)
		expect(out.find((e) => e.period_end === "2025-04-27")!.amount).toBe(222)
	})

	test("negative expense values normalize to positive; income_tax keeps its sign", async () => {
		const out = await factsToEntries(
			facts("us-gaap", {
				CostOfGoodsAndServicesSold: { USD: [fact({ val: -500 })] },
				IncomeTaxExpenseBenefit: { USD: [fact({ val: -40 })] }
			}),
			"c"
		)
		expect(out.find((e) => e.taxonomy_tag?.includes("CostOfGoods"))!.amount).toBe(500)
		expect(out.find((e) => e.taxonomy_tag?.includes("IncomeTax"))!.amount).toBe(-40)
	})

	test("falls back to ifrs-full aliases and foreign currency (TSM shape)", async () => {
		const out = await factsToEntries(
			facts("ifrs-full", { Revenue: { TWD: [fact({ val: 2_161_736_841_000 })] } }),
			"0001046179"
		)
		expect(out.length).toBe(1)
		expect(out[0].unit).toBe("TWD")
		expect(out[0].taxonomy_tag).toBe("ifrs-full:Revenue")
		expect(out[0].kind).toBe("revenue")
	})

	test("identical claims across filings collapse to the earliest-filed accession", async () => {
		const out = await factsToEntries(
			facts("us-gaap", {
				GrossProfit: {
					USD: [
						fact({ accn: "later", filed: "2026-08-28", val: 500 }),
						fact({ accn: "orig", filed: "2024-08-30", val: 500 })
					]
				}
			}),
			"c"
		)
		expect(out.length).toBe(1)
		expect(out[0].accession).toBe("orig")
	})

	test("a changed value for the same period stays as a second row (revision material)", async () => {
		const out = await factsToEntries(
			facts("us-gaap", {
				GrossProfit: {
					USD: [
						fact({ accn: "orig", filed: "2024-08-30", val: 500 }),
						fact({ accn: "restated", filed: "2026-08-28", val: 450 })
					]
				}
			}),
			"c"
		)
		expect(out.length).toBe(2)
		expect(out.map((e) => e.accession).sort()).toEqual(["orig", "restated"])
	})

	test("drops pre-archive periods and ratio units", async () => {
		const out = await factsToEntries(
			facts("us-gaap", {
				GrossProfit: {
					USD: [fact({ start: "2018-07-01", end: "2019-06-30" })], // < FACTS_MIN_END
					"USD/shares": [fact({})], // ratio unit
					pure: [fact({})]
				}
			}),
			"c"
		)
		expect(FACTS_MIN_END > "2019-06-30").toBe(true)
		expect(out.length).toBe(0)
	})

	test("absent concepts are skipped without error", async () => {
		const out = await factsToEntries(facts("us-gaap", {}), "c")
		expect(out).toEqual([])
	})

	test("payment-schedule facts become dated obligation entries with computed windows", async () => {
		const out = await factsToEntries(
			facts("us-gaap", {
				LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo: { USD: [fact({ start: undefined, end: "2026-06-30", val: 400 })] },
				LesseeOperatingLeaseLiabilityPaymentsDueAfterYearFive: { USD: [fact({ start: undefined, end: "2026-06-30", val: 999 })] },
				PurchaseObligationDueInNextTwelveMonths: { USD: [fact({ start: undefined, end: "2026-06-30", val: -5 })] } // negative → dropped
			}),
			"c"
		)
		expect(out.length).toBe(2)
		const debt = out.find((e) => e.taxonomy_tag?.includes("InYearTwo"))!
		expect(debt).toMatchObject({ kind: "obligation", certainty: "committed", due_date: "2028-06-30", period_end: "2026-06-30", period_start: null })
		const lease = out.find((e) => e.taxonomy_tag?.includes("AfterYearFive"))!
		expect(lease.due_date).toBe("2031-06-30") // open window pinned at the 5y boundary
	})
})
