// Shared Aslan Terminal types — contract file (§2.3 of SPEC v0.3).
// Frozen after WP0.1; changes require orchestrator sign-off.

// Type-only schema imports — erased at compile time, so no runtime cycle and
// nothing server-only leaks into client bundles.
import type { companies, terminalReports } from "$lib/server/db/schema/terminal"

/** companies row — the single shared Company shape for all terminal modules. */
export type Company = typeof companies.$inferSelect

export const DIMENSION_IDS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"] as const
export type DimensionId = (typeof DIMENSION_IDS)[number]
export type Letter = "A" | "B" | "C" | "D" | "F"
export type Grade = string // Letter plus optional +/-; "F" never carries a modifier
export type Confidence = "high" | "medium" | "low"

export type Citation = {
	url: string
	title: string | null
	source_domain: string
	published_at: string | null // ISO date
	snippet: string | null
}

export type EvidenceItem = Citation & {
	id: string
	content_hash: string
	origin: "report_run" | "monitor" | "ledger_check"
	dimensions: DimensionId[]
	company_controlled: boolean // §2.5.4 independence rule
}

export type SignalFinding = {
	signal_id: string // matches rubric signal id
	direction: "supports" | "undermines" | "neutral"
	strength: 1 | 2 | 3 // weak / clear / strong
	summary: string // one sentence, evidence-language
	citations: Citation[] // ≥1 or the finding is discarded
}

export type ScreenHit = {
	pattern_id: string // matches rubric false-signal id
	status: "confirmed" | "suspected"
	summary: string // evidence-language (observation, never accusation)
	detail: string // owner-only narrative
	citations: Citation[]
	action: "cap:C" | "cap:D" | "discount" | "composite_cap:C"
}

export type DimensionEvidence = {
	dimension: DimensionId
	findings: SignalFinding[]
	screen_hits: ScreenHit[]
	evidence_items: EvidenceItem[]
	searches_run: number
}

export type DimensionGrade = {
	dimension: DimensionId
	grade: Grade
	score: number // 0–100
	confidence: Confidence
	trend: "up" | "down" | "flat" | "new" // vs previous dimension_scores row
	flags: ScreenHit[]
	top_citations: Citation[] // ≤3
	summary: string
	evidence_hash: string
	rubric_version: string
}

export type CompositeScore = {
	grade: Grade
	score: number
	confidence: Confidence
	veto_applied: null | "f9_cap" | "red_flag_cap"
	red_banner: boolean
	weights_used: Record<DimensionId, number>
}

export type ExtractedFigure = {
	name: string // "revenue" | "gross_margin" | "operating_margin" | "fcf" | "ocf" | "net_income" | "net_debt" | "share_count" | "sbc"
	value: number
	unit: string // "USD" | "%" | "shares"
	period: string // "FY2025" | "Q1-2026"
	source_url: string
	filing_date: string | null
	passes_agree: boolean // double-extraction agreement (§5.3)
}

export type ExtractionResult = {
	figures: ExtractedFigure[]
	disagreements: { name: string; period: string; values: number[]; sources: string[] }[]
	// Figures the model returned without a resolvable source page — dropped, never published.
	dropped_unsourced?: number
	confidence: Confidence // low if any core figure disagrees or is missing
}

export type ReconciliationVerdict = {
	bucket: "priced_for_more" | "roughly_priced" | "priced_for_less"
	beta: boolean // §5.2 accuracy gate
	implied: { revenue_growth_10y: number; fcf_margin_scenario: number; discount_rate: number } | null
	multiples: { name: string; value: number | null; peer_median: number | null }[]
	sentence: string // names the specific dimension gaps; states confidence inline when low
	confidence: Confidence
	// Event-attribution timeline (US only): major price moves aligned against researched evidence.
	timeline?: { date: string; move_pct: number; car: number | null; evidence: Citation[] }[]
}

export type TriageResult = {
	relevant: boolean
	dimensions: DimensionId[]
	materiality: "red_flag" | "material" | "minor" | "none"
	commitment: { what: string; promised_date: string | null } | null // feeds the ledger
	reason: string
}

export type TerminalStage =
	| "pending" | "resolving" | "competitor_set" | "researching" // researching checkpoints per dimension
	| "extracting" | "grading" | "reconciling" | "synthesizing"
	| "persisting" | "complete" | "failed" | "cancelled"

// ── terminal_reports row as loaded for pages/APIs ────────────────────────────
// Derived from the drizzle table (its JSON columns carry these types via
// $type<>). Dates widen to string | Date: they arrive as strings through
// SvelteKit's devalue layer (BacktestReportRow pattern).

export type TerminalReportRow = Omit<
	typeof terminalReports.$inferSelect,
	"created_at" | "updated_at"
> & {
	created_at: string | Date
	updated_at: string | Date
}

// ── §2.9 public redaction contract ──────────────────────────────────────────
// Public/shared payloads keep grades, scores, confidence, trends, composite,
// verdict bucket + sentence, bear/bull, top citations. They drop:
//   - ScreenHit.detail (owner-only narrative)
//   - all "suspected" screen hits
//   - the extraction disagreement list
// Ledger check_evidence never reaches public payloads — pages load counts only.
// Owner-rendered pages get the full object.

export type RedactableReport = {
	dimensions?: DimensionGrade[] | null
	extraction?: ExtractionResult | null
}

const redactHits = (flags: ScreenHit[]): ScreenHit[] =>
	flags.filter((h) => h.status === "confirmed").map((h) => ({ ...h, detail: "" }))

export function redactForPublic<T extends RedactableReport>(report: T): T {
	return {
		...report,
		dimensions: report.dimensions
			? report.dimensions.map((d) => ({ ...d, flags: redactHits(d.flags) }))
			: report.dimensions,
		extraction: report.extraction
			? { ...report.extraction, disagreements: [] }
			: report.extraction
	}
}
