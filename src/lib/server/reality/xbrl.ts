// XBRL spine of the Reality Ledger (PLAN Phase 3). Fetches SEC companyfacts
// and maps the curated concept set to mechanical ledger entries (origin "xbrl").
// Everything numeric here is copied, never computed — the AI layers only ever
// annotate these rows, they don't produce them.
//
// Probe-pinned facts this module encodes (docs/RESEARCH_Reality_Ledger.md):
//  - fact `fy`/`fp` describe the FILING's context, not the fact's own period
//    (FY2021 revenue appears with fy=2021, 2022, 2023 across successive 10-Ks),
//    so fiscal_year/fiscal_period stay null on xbrl rows — the reconciler
//    derives quarters from period dates + the filer's inferred fiscal calendar.
//  - the same (concept, period, value) claim recurs across filings as
//    comparatives; the content hash below collapses those to one row keyed to
//    the earliest filing. A DIFFERENT value for the same period hashes anew —
//    that surviving pair is the investigator's value_revision material.
//  - foreign filers use ifrs-full names and non-USD currencies; aliases below
//    were verified against live ASML (us-gaap/EUR) and TSM (ifrs-full/TWD) facts.

import type { ledgerEntries } from "$lib/server/db/schema"

export type LedgerEntryInsert = typeof ledgerEntries.$inferInsert

// ── curated concept map (RESEARCH doc, verified 2026-08-15) ──────────────────

export type ConceptSpec = {
	internal: string
	usGaap: string[] // alias order matters: first present wins
	ifrs: string[]
	// "financing" = money the company lends to / invests in others (vendor
	// financing, notes receivable, equity stakes) — the round-trip-revenue trail.
	kind: "revenue" | "expense" | "obligation" | "contingent_revenue" | "context" | "financing"
	certainty: "actual" | "committed" | "conditional"
}

export const CONCEPT_MAP: readonly ConceptSpec[] = [
	{ internal: "revenue", usGaap: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"], ifrs: ["Revenue"], kind: "revenue", certainty: "actual" },
	{ internal: "cost_of_revenue", usGaap: ["CostOfRevenue", "CostOfGoodsAndServicesSold"], ifrs: ["CostOfSales"], kind: "expense", certainty: "actual" },
	{ internal: "gross_profit", usGaap: ["GrossProfit"], ifrs: ["GrossProfit"], kind: "context", certainty: "actual" },
	{ internal: "rnd_expense", usGaap: ["ResearchAndDevelopmentExpense"], ifrs: ["ResearchAndDevelopmentExpense"], kind: "expense", certainty: "actual" },
	{ internal: "sales_marketing", usGaap: ["SellingAndMarketingExpense", "SellingGeneralAndAdministrativeExpense"], ifrs: ["SellingExpense"], kind: "expense", certainty: "actual" },
	{ internal: "general_admin", usGaap: ["GeneralAndAdministrativeExpense"], ifrs: ["AdministrativeExpense"], kind: "expense", certainty: "actual" },
	{ internal: "operating_income", usGaap: ["OperatingIncomeLoss"], ifrs: ["ProfitLossFromOperatingActivities"], kind: "context", certainty: "actual" },
	{ internal: "net_income", usGaap: ["NetIncomeLoss"], ifrs: ["ProfitLoss"], kind: "context", certainty: "actual" },
	{ internal: "income_tax", usGaap: ["IncomeTaxExpenseBenefit"], ifrs: ["IncomeTaxExpenseContinuingOperations"], kind: "expense", certainty: "actual" },
	// Combined operating-cost total, the expense fallback for filers that never
	// tag CostOfRevenue (probe 2026-08-18: ORCL/HPE tag CostsAndExpenses; DLR
	// switched to OperatingExpenses years ago). kind "context" so it never
	// double-counts into the component expense sum. The fallback only fires when
	// the filer tags NO cost_of_revenue for the frame (see buildDrafts), so
	// OperatingExpenses-as-opex-only filers (AAPL) can't be silently understated.
	{ internal: "total_costs", usGaap: ["CostsAndExpenses", "OperatingExpenses"], ifrs: [], kind: "context", certainty: "actual" },
	{ internal: "sbc", usGaap: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"], ifrs: [], kind: "expense", certainty: "actual" },
	{ internal: "ocf", usGaap: ["NetCashProvidedByUsedInOperatingActivities"], ifrs: ["CashFlowsFromUsedInOperatingActivities"], kind: "context", certainty: "actual" },
	{ internal: "capex", usGaap: ["PaymentsToAcquirePropertyPlantAndEquipment"], ifrs: ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"], kind: "expense", certainty: "actual" },
	{ internal: "capex_unpaid", usGaap: ["CapitalExpendituresIncurredButNotYetPaid"], ifrs: [], kind: "expense", certainty: "committed" },
	{ internal: "cash", usGaap: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], ifrs: ["CashAndCashEquivalents"], kind: "context", certainty: "actual" },
	{ internal: "receivables", usGaap: ["AccountsReceivableNetCurrent"], ifrs: ["CurrentTradeReceivables"], kind: "context", certainty: "actual" },
	{ internal: "inventory", usGaap: ["InventoryNet"], ifrs: ["Inventories"], kind: "context", certainty: "actual" },
	{ internal: "deferred_rev_current", usGaap: ["ContractWithCustomerLiabilityCurrent"], ifrs: ["ContractLiabilities"], kind: "contingent_revenue", certainty: "conditional" },
	{ internal: "deferred_rev_noncurrent", usGaap: ["ContractWithCustomerLiabilityNoncurrent"], ifrs: [], kind: "contingent_revenue", certainty: "conditional" },
	{ internal: "backlog_rpo", usGaap: ["RevenueRemainingPerformanceObligation"], ifrs: [], kind: "contingent_revenue", certainty: "conditional" },
	// Debt/lease aliases probe-verified 2026-08-17 against the fleet's blind spots
	// (QCOM DebtCurrent, LRCX LongTermDebtAndCapitalLeaseObligations, SNOW/AI/PLTR/ARM
	// current+noncurrent lease pairs, ANET PurchaseCommitmentRemainingMinimumAmountCommitted).
	{ internal: "debt_short", usGaap: ["ShortTermBorrowings", "LongTermDebtCurrent", "DebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"], ifrs: ["CurrentPortionOfLongtermBorrowings"], kind: "obligation", certainty: "committed" },
	{ internal: "debt_long", usGaap: ["LongTermDebtNoncurrent", "LongTermDebt", "LongTermDebtAndCapitalLeaseObligations"], ifrs: ["LongtermBorrowings"], kind: "obligation", certainty: "committed" },
	{ internal: "lease_liability", usGaap: ["OperatingLeaseLiability"], ifrs: [], kind: "obligation", certainty: "committed" },
	// Component pair: SUMMED into the committed balance (like the deferred pair),
	// but skipped for periods where the combined concept above is tagged.
	{ internal: "lease_liability_current", usGaap: ["OperatingLeaseLiabilityCurrent"], ifrs: ["CurrentLeaseLiabilities"], kind: "obligation", certainty: "committed" },
	{ internal: "lease_liability_noncurrent", usGaap: ["OperatingLeaseLiabilityNoncurrent"], ifrs: ["NoncurrentLeaseLiabilities"], kind: "obligation", certainty: "committed" },
	{ internal: "purchase_obligation", usGaap: ["PurchaseObligation", "UnrecordedUnconditionalPurchaseObligation", "PurchaseCommitmentRemainingMinimumAmountCommitted"], ifrs: [], kind: "obligation", certainty: "committed" },
	{ internal: "loss_contingency", usGaap: ["LossContingencyAccrualAtCarryingValue"], ifrs: ["ProvisionsCurrent"], kind: "obligation", certainty: "conditional" },
	{ internal: "shares_diluted", usGaap: ["WeightedAverageNumberOfDilutedSharesOutstanding"], ifrs: ["DilutedWeightedAverageNumberOfShares"], kind: "context", certainty: "actual" },
	// Vendor-financing trail (verified live on ASML 2026-08-15: it finances customers).
	{ internal: "customer_financing_current", usGaap: ["NotesAndLoansReceivableNetCurrent", "NotesReceivableNet"], ifrs: [], kind: "financing", certainty: "actual" },
	{ internal: "customer_financing_noncurrent", usGaap: ["NotesAndLoansReceivableNetNoncurrent"], ifrs: [], kind: "financing", certainty: "actual" },
	{ internal: "loans_made", usGaap: ["PaymentsToAcquireLoansReceivable"], ifrs: [], kind: "financing", certainty: "actual" },
	{ internal: "equity_method_investments", usGaap: ["EquityMethodInvestments"], ifrs: ["InvestmentsAccountedForUsingEquityMethod"], kind: "financing", certainty: "actual" },
	{ internal: "investments_made", usGaap: ["PaymentsToAcquireEquityMethodInvestments"], ifrs: [], kind: "financing", certainty: "actual" },
] as const

// ── disclosed payment schedules (by-year maturity tags) ──────────────────────
// These are the filings' own payment schedules: amount due in year N after the
// balance date. Ingested as dated obligation entries (due_date = window end) so
// the forward wall can spread disclosed money instead of stacking lumps.
// Probe-verified 2026-08-17: leases 30/35 fleet companies, debt 23/35, purchase 8/35.
// NOT part of CONCEPT_MAP — they must never sum into committed_balance.

export type ScheduleSpec = {
	family: "debt" | "lease" | "purchase"
	fromYears: number // window start, years after the balance date
	toYears: number | null // window end; null = open-ended ("after year five")
	tags: string[] // us-gaap concept aliases, specific first
}

export const SCHEDULE_MAP: readonly ScheduleSpec[] = [
	{ family: "debt", fromYears: 0, toYears: 1, tags: ["LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths", "LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear"] },
	{ family: "debt", fromYears: 1, toYears: 2, tags: ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo"] },
	{ family: "debt", fromYears: 2, toYears: 3, tags: ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearThree"] },
	{ family: "debt", fromYears: 3, toYears: 4, tags: ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFour"] },
	{ family: "debt", fromYears: 4, toYears: 5, tags: ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFive"] },
	{ family: "debt", fromYears: 5, toYears: null, tags: ["LongTermDebtMaturitiesRepaymentsOfPrincipalAfterYearFive"] },
	{ family: "lease", fromYears: 0, toYears: 1, tags: ["LesseeOperatingLeaseLiabilityPaymentsDueNextTwelveMonths", "LesseeOperatingLeaseLiabilityPaymentsRemainderOfFiscalYear"] },
	{ family: "lease", fromYears: 1, toYears: 2, tags: ["LesseeOperatingLeaseLiabilityPaymentsDueYearTwo"] },
	{ family: "lease", fromYears: 2, toYears: 3, tags: ["LesseeOperatingLeaseLiabilityPaymentsDueYearThree"] },
	{ family: "lease", fromYears: 3, toYears: 4, tags: ["LesseeOperatingLeaseLiabilityPaymentsDueYearFour"] },
	{ family: "lease", fromYears: 4, toYears: 5, tags: ["LesseeOperatingLeaseLiabilityPaymentsDueYearFive"] },
	{ family: "lease", fromYears: 5, toYears: null, tags: ["LesseeOperatingLeaseLiabilityPaymentsDueAfterYearFive"] },
	{ family: "purchase", fromYears: 0, toYears: 1, tags: ["PurchaseObligationDueInNextTwelveMonths", "RecordedUnconditionalPurchaseObligationDueInNextTwelveMonths", "UnrecordedUnconditionalPurchaseObligationDueInNextTwelveMonths"] },
	{ family: "purchase", fromYears: 1, toYears: 2, tags: ["PurchaseObligationDueInSecondYear", "RecordedUnconditionalPurchaseObligationDueInSecondYear", "UnrecordedUnconditionalPurchaseObligationDueInSecondYear"] },
	{ family: "purchase", fromYears: 2, toYears: 3, tags: ["PurchaseObligationDueInThirdYear", "RecordedUnconditionalPurchaseObligationDueInThirdYear", "UnrecordedUnconditionalPurchaseObligationDueInThirdYear"] },
	{ family: "purchase", fromYears: 3, toYears: 4, tags: ["PurchaseObligationDueInFourthYear", "RecordedUnconditionalPurchaseObligationDueInFourthYear", "UnrecordedUnconditionalPurchaseObligationDueInFourthYear"] },
	{ family: "purchase", fromYears: 4, toYears: 5, tags: ["PurchaseObligationDueInFifthYear", "RecordedUnconditionalPurchaseObligationDueInFifthYear", "UnrecordedUnconditionalPurchaseObligationDueInFifthYear"] },
	{ family: "purchase", fromYears: 5, toYears: null, tags: ["PurchaseObligationDueAfterFifthYear", "RecordedUnconditionalPurchaseObligationDueAfterFifthYear", "UnrecordedUnconditionalPurchaseObligationDueAfterFifthYear"] },
] as const

/** taxonomy_tag → its schedule window, for read-time spreading. */
export const SCHEDULE_TAG_INFO: ReadonlyMap<string, { family: string; fromYears: number; toYears: number | null }> = new Map(
	SCHEDULE_MAP.flatMap((s) => s.tags.map((t) => [`us-gaap:${t}`, { family: s.family, fromYears: s.fromYears, toYears: s.toYears }]))
)

/** ISO date + n years (open-ended windows use the 5-year boundary). */
export const addYears = (iso: string, n: number): string => {
	const d = new Date(`${iso}T00:00:00Z`)
	d.setUTCFullYear(d.getUTCFullYear() + n)
	return d.toISOString().slice(0, 10)
}

// ── companyfacts shapes (the fields we read; API has more) ───────────────────

export type XbrlFact = {
	start?: string // ISO date; absent on instant (balance-sheet) facts
	end: string
	val: number
	accn: string
	form: string
	filed: string // ISO date the filing was submitted
}

export type CompanyFacts = {
	cik: number
	entityName: string
	facts: Record<string, Record<string, { units: Record<string, XbrlFact[]> }>>
}

// Only fiscal periods that can touch 2020+ matter (SMCI's FY2020 starts
// 2019-07-01); older comparatives are noise for this archive.
export const FACTS_MIN_END = "2019-07-01"

// Unit keys worth cataloging: 3-letter currencies and share counts. Skips
// "pure", "USD/shares", and other ratio units.
const unitOk = (u: string): boolean => /^[A-Z]{3}$/.test(u) || u === "shares"

// ── fetch (UA + rate discipline are the caller's, matching sec.ts) ───────────

export async function fetchCompanyFacts(
	cik: string,
	userAgent: string,
	fetchImpl: typeof fetch = fetch
): Promise<CompanyFacts> {
	const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`
	const res = await fetchImpl(url, { headers: { "User-Agent": userAgent } })
	if (!res.ok) throw new Error(`companyfacts ${cik}: HTTP ${res.status}`)
	return (await res.json()) as CompanyFacts
}

// ── facts → mechanical ledger entries (pure + hashing) ───────────────────────

export async function sha256hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Hash EXCLUDES the accession: identical (concept, period, value) claims across
// filings collapse to one row (earliest filing wins as provenance); a changed
// value for the same period is a new row — deliberate revision material.
export function entryHashInput(tag: string, unit: string, start: string | null, end: string, val: number): string {
	return `${tag}|${unit}|${start ?? ""}|${end}|${val}`
}

/**
 * Map companyfacts to mechanical ledger entry inserts for one company.
 * Alias order per internal concept (us-gaap first, then ifrs-full) resolves
 * PER PERIOD: the first alias with a fact for a (unit, period) owns it; later
 * aliases fill only the periods still uncovered. All matching unit keys are
 * kept (a dual-listed filer may report two currencies); ratio units are skipped.
 */
export async function factsToEntries(facts: CompanyFacts, cik: string): Promise<LedgerEntryInsert[]> {
	const out: LedgerEntryInsert[] = []
	const seen = new Set<string>()

	for (const spec of CONCEPT_MAP) {
		const candidates: { ns: string; name: string }[] = [
			...spec.usGaap.map((name) => ({ ns: "us-gaap", name })),
			...spec.ifrs.map((name) => ({ ns: "ifrs-full", name }))
		]
		// Per-period resolution: every alias contributes, but when two aliases
		// cover the same (unit, period) the earlier-listed (more specific) one
		// wins. A filer that switches tags mid-history (NVDA's revenue, 2022)
		// keeps both eras, and combined concepts never shadow their components
		// for periods the specific tag already covers.
		const covered = new Set<string>()
		for (const c of candidates) {
			const node = facts.facts[c.ns]?.[c.name]
			if (!node) continue // alias absent for this filer — normal, not an error
			const tag = `${c.ns}:${c.name}`
			const mine = new Set<string>()

			for (const [unit, rows] of Object.entries(node.units)) {
				if (!unitOk(unit)) continue
				// Earliest-filed first, so the collapsing dedup keeps original provenance.
				const sorted = [...rows].sort((a, b) => a.filed.localeCompare(b.filed))
				for (const f of sorted) {
					if (f.end < FACTS_MIN_END) continue
					if (typeof f.val !== "number" || !Number.isFinite(f.val)) continue
					const periodKey = `${unit}|${f.start ?? ""}|${f.end}`
					if (covered.has(periodKey)) continue // an earlier alias owns this period
					mine.add(periodKey)
					// IFRS filers tag costs negative to mirror presentation; normalize
					// expense concepts to positive. income_tax keeps its sign — a tax
					// benefit is real economics, not presentation noise.
					const val = spec.kind === "expense" && spec.internal !== "income_tax" ? Math.abs(f.val) : f.val
					const hashInput = entryHashInput(tag, unit, f.start ?? null, f.end, val)
					if (seen.has(hashInput)) continue
					seen.add(hashInput)
					out.push({
						id: crypto.randomUUID(),
						cik,
						accession: f.accn,
						amount: val,
						unit,
						kind: spec.kind,
						certainty: spec.certainty,
						period_start: f.start ?? null,
						period_end: f.end,
						fiscal_year: null, // fy/fp are filing context, not fact period — see header
						fiscal_period: null,
						taxonomy_tag: tag,
						source_location: `xbrl:${f.form}`,
						origin: "xbrl",
						content_hash: await sha256hex(hashInput)
					})
				}
			}
			for (const k of mine) covered.add(k)
		}
	}

	// Payment schedules: same per-period alias resolution, but each fact gets a
	// computed due_date (window end after its balance date) so it lands in the
	// forward wall as disclosed, dated money.
	for (const spec of SCHEDULE_MAP) {
		const covered = new Set<string>()
		for (const name of spec.tags) {
			const node = facts.facts["us-gaap"]?.[name]
			if (!node) continue
			const tag = `us-gaap:${name}`
			const mine = new Set<string>()
			for (const [unit, rows] of Object.entries(node.units)) {
				if (!unitOk(unit)) continue
				const sorted = [...rows].sort((a, b) => a.filed.localeCompare(b.filed))
				for (const f of sorted) {
					if (f.end < FACTS_MIN_END) continue
					if (typeof f.val !== "number" || !Number.isFinite(f.val) || f.val < 0) continue
					const periodKey = `${unit}|${f.end}`
					if (covered.has(periodKey)) continue
					mine.add(periodKey)
					const hashInput = entryHashInput(tag, unit, null, f.end, f.val)
					if (seen.has(hashInput)) continue
					seen.add(hashInput)
					out.push({
						id: crypto.randomUUID(),
						cik,
						accession: f.accn,
						amount: f.val,
						unit,
						kind: "obligation",
						certainty: "committed",
						period_start: null,
						period_end: f.end,
						fiscal_year: null,
						fiscal_period: null,
						due_date: addYears(f.end, spec.toYears ?? 5),
						taxonomy_tag: tag,
						source_location: `xbrl:${f.form}`,
						origin: "xbrl",
						content_hash: await sha256hex(hashInput)
					})
				}
			}
			for (const k of mine) covered.add(k)
		}
	}
	return out
}
