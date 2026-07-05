// ponytail: dev-only fixture — remove when real terminal_reports rows exist.
// Exercises the report UI (owner vs public redaction) without a live pipeline run.

import type { Citation, DimensionGrade } from "$lib/types/terminal"
import type { TerminalReportWithCompany } from "$lib/server/db/terminal-reports"

const cite = (domain: string, title: string, date: string): Citation => ({
	url: `https://${domain}/article`,
	title,
	source_domain: domain,
	published_at: date,
	snippet: null
})

const dim = (
	dimension: DimensionGrade["dimension"],
	grade: string,
	score: number,
	confidence: DimensionGrade["confidence"],
	trend: DimensionGrade["trend"],
	summary: string,
	flags: DimensionGrade["flags"] = []
): DimensionGrade => ({
	dimension,
	grade,
	score,
	confidence,
	trend,
	flags,
	summary,
	top_citations: [
		cite("reuters.com", `${dimension} coverage in the financial press`, "2026-05-14"),
		cite("sec.gov", `${dimension} disclosure in the latest filing`, "2026-04-30"),
		cite("bloomberg.com", `${dimension} independent analysis`, "2026-06-02")
	],
	evidence_hash: `hash_${dimension.toLowerCase()}`,
	rubric_version: "1.0.0"
})

export const fixtureReport: TerminalReportWithCompany = {
	id: "fixture-id",
	slug: "__fixture__",
	user_id: "fixture-owner",
	company_id: "fixture-company",
	status: "complete",
	rubric_version: "1.0.0",
	company: { id: "fixture-company", name: "Meridian Semiconductor", ticker: "MRDN", is_us: true },
	composite: {
		grade: "C",
		score: 61,
		confidence: "medium",
		veto_applied: "red_flag_cap",
		red_banner: true,
		weights_used: { F1: 1, F2: 1, F3: 1.5, F4: 1, F5: 1.5, F6: 1, F7: 1, F8: 1, F9: 2 }
	},
	dimensions: [
		dim("F1", "B+", 78, "high", "up", "Institutional register is stable and coverage tone matches the company's stated thesis across the trailing four quarters."),
		dim("F2", "B", 72, "medium", "flat", "No live regulatory actions; one pending export-control review is disclosed but unresolved."),
		dim("F3", "C-", 57, "medium", "down", "Two well-capitalized entrants are cited as gaining design-win share in the mid-range node.", [
			{
				pattern_id: "share_gain_suspected",
				status: "suspected",
				summary: "Trade-press reports describe competitor design wins not yet confirmed in filings.",
				detail: "Owner-only: sourced to two unnamed supply-chain checks; treat as directional until 10-Q confirms.",
				citations: [cite("digitimes.com", "Competitor design-win report", "2026-06-10")],
				action: "discount"
			}
		]),
		dim("F4", "B", 71, "high", "flat", "Supplier base is diversified; no single-source dependency is disclosed for critical inputs."),
		dim("F5", "A-", 88, "high", "up", "Backlog and reported bookings point to durable end-market demand across data-center customers."),
		dim("F6", "C", 60, "low", "new", "Public signals on attrition are thin; a Glassdoor-visible leadership departure is noted."),
		dim("F7", "C+", 66, "medium", "down", "Two of the last four dated product commitments slipped past their stated ship windows per company posts."),
		dim("F8", "B-", 68, "medium", "flat", "Announced partnerships are corroborated by counterparty statements; deal economics are undisclosed."),
		dim("F9", "D", 48, "medium", "down", "Cash conversion lags reported earnings and a going-concern-adjacent auditor comment is on file.", [
			{
				pattern_id: "auditor_event",
				status: "confirmed",
				summary: "The company disclosed a change of independent auditor concurrent with a restatement of prior-period revenue.",
				detail: "Owner-only: the 8-K names the departing auditor's disagreement over revenue-recognition timing on two multi-year contracts.",
				citations: [cite("sec.gov", "Form 8-K — change of auditor", "2026-05-28")],
				action: "composite_cap:C"
			}
		])
	],
	extraction: {
		figures: [
			{ name: "revenue", value: 4_820_000_000, unit: "USD", period: "FY2025", source_url: "https://sec.gov/10k", filing_date: "2026-02-14", passes_agree: true },
			{ name: "fcf", value: 610_000_000, unit: "USD", period: "FY2025", source_url: "https://sec.gov/10k", filing_date: "2026-02-14", passes_agree: false }
		],
		disagreements: [
			{ name: "net_debt", period: "FY2025", values: [1_200_000_000, 1_340_000_000], sources: ["https://sec.gov/10k", "https://sec.gov/10q"] }
		],
		confidence: "low"
	},
	verdict: {
		bucket: "priced_for_more",
		beta: true,
		implied: { revenue_growth_10y: 0.19, fcf_margin_scenario: 0.16, discount_rate: 0.1 },
		multiples: [
			{ name: "EV/Revenue", value: 8.4, peer_median: 6.1 },
			{ name: "P/FCF", value: 41.2, peer_median: null }
		],
		sentence:
			"At today's price the market implies ~19% annual revenue growth for a decade — a bar the demand evidence (F5) partly supports but the execution slippage (F7) and the F9 cash-conversion gap do not. Extraction confidence is low because net-debt figures disagree across filings, so read this reconciliation as directional.",
		confidence: "low"
	},
	bear_bull: {
		bear: "The confirmed F9 auditor change alongside a revenue restatement caps confidence in reported cash generation, and F7 shows a pattern of dated commitments slipping.",
		bull: "Demand signals (F5) are among the strongest in the peer set and the investor register (F1) is stable, giving the company room to re-earn credibility if the F9 items resolve cleanly."
	},
	narrative:
		"Meridian Semiconductor grades out at a C overall, held down by a confirmed red-flag finding in Value Creation (F9).\n\nThe demand and investor-relationship dimensions are genuinely strong. What caps the composite is not the narrative but the evidence: a disclosed change of auditor concurrent with a prior-period revenue restatement, plus cash conversion that lags reported earnings.\n\nThe price reconciliation reads as priced for more than the current evidence supports, though extraction confidence is low where filings disagree on net debt.",
	citations: [
		cite("reuters.com", "Meridian names new independent auditor", "2026-05-28"),
		cite("ft.com", "Data-center demand lifts specialty chipmakers", "2026-06-01"),
		cite("wsj.com", "Export-control review touches mid-range nodes", "2026-04-22")
	],
	evidence_snapshot_hash: "snapshot_fixture",
	credit_cost: 5,
	is_public: true,
	view_count: 0,
	created_at: "2026-06-15T12:00:00.000Z",
	updated_at: "2026-06-15T12:00:00.000Z"
}
