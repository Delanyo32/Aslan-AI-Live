// Deterministic grading, composite, veto, confidence, hashing, and trend logic
// (§2.5 of SPEC v0.3). Pure functions — numbers and caps come from code, never
// the LLM. `gradeDimension` is the one place an LLM is called, and only to write
// prose (the `summary`); every number it might touch is computed here first.

import { complete, type Context } from "@mariozechner/pi-ai"
import type {
	Citation,
	Confidence,
	CompositeScore,
	DimensionEvidence,
	DimensionGrade,
	DimensionId,
	EvidenceItem,
	Grade,
	Letter,
	ScreenHit,
	SignalFinding
} from "$lib/types/terminal"
import type { RubricFramework } from "./rubrics/schema"

// ── Constants ────────────────────────────────────────────────────────────────

// §2.5.4 — PR wires count as company-controlled regardless of the company. A
// company's own domain(s) are added on top of this set at call time (derived
// from the evidence items' `company_controlled` flag in `gradeDimension`).
export const COMPANY_CONTROLLED_DOMAINS: ReadonlySet<string> = new Set([
	"prnewswire.com",
	"businesswire.com",
	"globenewswire.com",
	"newswire.ca",
	"accesswire.com"
])

// §2.4 — framework weights: F9 vetoes and weighs double, F3/F5 weigh 1.5, rest 1.
// DimensionGrade does not carry its framework weight, so the composite reads it
// from this canonical table.
export const DIMENSION_WEIGHTS: Record<DimensionId, number> = {
	F1: 1,
	F2: 1,
	F3: 1.5,
	F4: 1,
	F5: 1.5,
	F6: 1,
	F7: 1,
	F8: 1,
	F9: 2
}

// §2.5.1 — every letter band is 15 wide (A: 85..100 inclusive is also 15 wide).
const BAND_WIDTH = 15
const BANDS: { letter: Letter; min: number }[] = [
	{ letter: "A", min: 85 },
	{ letter: "B", min: 70 },
	{ letter: "C", min: 55 },
	{ letter: "D", min: 40 },
	{ letter: "F", min: -Infinity }
]

// Confidence ordering, shared with reconcile.ts.
export const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }
export const CONF_BY_RANK: Confidence[] = ["low", "medium", "high"]

// ── Small helpers ────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function domainControlled(domain: string, extra: ReadonlySet<string>): boolean {
	const d = domain.toLowerCase()
	return COMPANY_CONTROLLED_DOMAINS.has(d) || extra.has(d)
}

// ── Rule 1: grade bands + modifier thirds ────────────────────────────────────

/**
 * score → letter grade with modifier (§2.5.1). Bands: A≥85, B≥70, C≥55, D≥40,
 * F<40. Within a band, the lower third gets "-", the upper third "+", the
 * middle none. Resolution of an under-specified point: thirds are by equal
 * width (band width 15, so boundaries at +5 and +10); the lower boundary is
 * middle (none), the upper boundary is "+". F never carries a modifier.
 */
export function scoreToGrade(score: number): Grade {
	const s = clamp(score, 0, 100)
	const band = BANDS.find((b) => s >= b.min)! // F catches everything via -Infinity
	if (band.letter === "F") return "F"
	const offset = s - band.min
	if (offset < BAND_WIDTH / 3) return `${band.letter}-`
	if (offset >= (2 * BAND_WIDTH) / 3) return `${band.letter}+`
	return band.letter
}

// ── Rule 2 + 4: dimension score with independence downgrade ───────────────────

/**
 * §2.5.2 dimension score: start at 55, each finding moves it by
 * direction(±) × strength(1..3) × signal.weight × 15, clamped 0–100.
 * Findings with zero citations are discarded (§2.5.2). §2.5.4 independence:
 * a "supports" finding whose citations are *all* company-controlled is
 * downgraded to neutral (no positive movement); it can still undermine.
 *
 * `companyControlledDomains` is the company's own domain(s); PR wires are
 * always treated as controlled via COMPANY_CONTROLLED_DOMAINS.
 */
export function scoreDimension(
	findings: readonly SignalFinding[],
	framework: RubricFramework,
	companyControlledDomains: ReadonlySet<string> = new Set()
): number {
	const weightOf = new Map(framework.signals.map((s) => [s.id, s.weight]))
	let score = 55

	for (const f of findings) {
		if (f.citations.length === 0) continue // discard zero-citation findings

		let direction = f.direction
		if (direction === "supports") {
			const allControlled = f.citations.every((c) =>
				domainControlled(c.source_domain, companyControlledDomains)
			)
			if (allControlled) direction = "neutral" // independence downgrade
		}

		const dir = direction === "supports" ? 1 : direction === "undermines" ? -1 : 0
		if (dir === 0) continue

		const weight = weightOf.get(f.signal_id) ?? 0 // unknown signal contributes nothing
		score += dir * f.strength * weight * BAND_WIDTH
	}

	return Math.round(clamp(score, 0, 100))
}

// ── Rule 3: asymmetric, post-hoc screen caps ─────────────────────────────────

/**
 * §2.5.3 — after the score is computed, each *confirmed* hit applies its action:
 * cap:C → min(score, 69), cap:D → min(score, 54), discount → score − 10,
 * composite_cap:C propagates to the composite only (no dimension effect here).
 * Suspected hits never cap. Discounts are applied first, then caps clamp the
 * result — a cap is a ceiling that must hold in the final value.
 */
export function applyScreenCaps(score: number, hits: readonly ScreenHit[]): number {
	const confirmed = hits.filter((h) => h.status === "confirmed")

	let s = score
	for (const h of confirmed) if (h.action === "discount") s -= 10

	let ceiling = Infinity
	for (const h of confirmed) {
		if (h.action === "cap:C") ceiling = Math.min(ceiling, 69)
		else if (h.action === "cap:D") ceiling = Math.min(ceiling, 54)
	}
	s = Math.min(s, ceiling)

	return Math.round(clamp(s, 0, 100))
}

// ── Rule 6: deterministic confidence ─────────────────────────────────────────

/**
 * §2.5.6 confidence, computed not LLM-set. high = ≥8 items AND ≥3 independent
 * sources AND ≥50% of items within recency_days; medium = ≥4 items AND ≥2
 * independent; else low. "Independent sources" = distinct source domains among
 * non-company-controlled items. `now` is injectable for tests.
 */
export function computeConfidence(
	items: readonly EvidenceItem[],
	policy: { recency_days: number },
	now: number = Date.now()
): Confidence {
	const total = items.length

	const independentDomains = new Set(
		items.filter((i) => !i.company_controlled).map((i) => i.source_domain.toLowerCase())
	)
	const independent = independentDomains.size

	const recencyMs = policy.recency_days * 86_400_000
	const recent = items.filter(
		(i) => i.published_at != null && now - Date.parse(i.published_at) <= recencyMs
	).length
	const recentEnough = total > 0 && recent / total >= 0.5

	if (total >= 8 && independent >= 3 && recentEnough) return "high"
	if (total >= 4 && independent >= 2) return "medium"
	return "low"
}

// ── Rule 7: composite + veto ─────────────────────────────────────────────────

function medianConfidence(cs: Confidence[]): Confidence {
	if (cs.length === 0) return "low"
	const ranks = cs.map((c) => CONF_RANK[c]).sort((a, b) => a - b)
	// lower-median: for the real 9-dimension case this is the middle element;
	// for even counts it takes the lower of the two middles (conservative).
	return CONF_BY_RANK[ranks[Math.floor((ranks.length - 1) / 2)]]
}

/**
 * §2.5.7 composite: weighted mean of dimension scores (rubric weights) → bands.
 * F9 < 55 ⇒ composite = min(composite, 84) (veto "f9_cap"). Any confirmed
 * composite_cap:C hit ⇒ composite = min(composite, 69) and red_banner
 * (veto "red_flag_cap"; it is stricter so it wins the single veto slot when
 * both fire). Composite confidence = median dimension confidence, never above
 * F9's. `sector` is reserved — v1 has no sector-specific weighting (§2.5.7).
 */
export function computeComposite(grades: DimensionGrade[], _sector: string | null): CompositeScore {
	const weights_used = {} as Record<DimensionId, number>
	let weighted = 0
	let totalWeight = 0
	for (const g of grades) {
		const w = DIMENSION_WEIGHTS[g.dimension] ?? 1
		weights_used[g.dimension] = w
		weighted += g.score * w
		totalWeight += w
	}

	let score = totalWeight > 0 ? Math.round(weighted / totalWeight) : 55
	let veto_applied: CompositeScore["veto_applied"] = null
	let red_banner = false

	const f9 = grades.find((g) => g.dimension === "F9")
	if (f9 && f9.score < 55) {
		score = Math.min(score, 84)
		veto_applied = "f9_cap"
	}

	const hasCompositeCap = grades.some((g) =>
		g.flags.some((h) => h.status === "confirmed" && h.action === "composite_cap:C")
	)
	if (hasCompositeCap) {
		score = Math.min(score, 69)
		red_banner = true
		veto_applied = "red_flag_cap"
	}

	let confidence = medianConfidence(grades.map((g) => g.confidence))
	if (f9 && CONF_RANK[f9.confidence] < CONF_RANK[confidence]) confidence = f9.confidence

	return {
		grade: scoreToGrade(score),
		score,
		confidence,
		veto_applied,
		red_banner,
		weights_used
	}
}

// ── Rule 5: content + evidence hashes (Web Crypto → async) ────────────────────

async function sha256hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const normalizeSnippet = (s: string | null): string =>
	(s ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500)

/** §2.5.5 content hash: sha256hex(url | published_at | normalizedSnippet). */
export function contentHash(item: {
	url: string
	published_at: string | null
	snippet: string | null
}): Promise<string> {
	return sha256hex(`${item.url}|${item.published_at ?? ""}|${normalizeSnippet(item.snippet)}`)
}

/**
 * §2.5.5 evidence hash — pins a grade to its evidence:
 * sha256hex(dimension | rubric_version | sortedContentHashes). Sorting makes it
 * order-independent; any snippet/url change alters a content hash and therefore
 * this hash (§5.4: a grade may never change without the hash changing).
 */
export function evidenceHash(
	dimension: string,
	rubricVersion: string,
	items: readonly { content_hash: string }[]
): Promise<string> {
	const hashes = [...new Set(items.map((i) => i.content_hash))].sort()
	return sha256hex(`${dimension}|${rubricVersion}|${hashes.join(",")}`)
}

// ── Rule 8: trend ────────────────────────────────────────────────────────────

/** §2.5.8 — delta ≥ +3 → up, ≤ −3 → down, else flat; no prior → new. */
export function computeTrend(score: number, priorScore: number | null): DimensionGrade["trend"] {
	if (priorScore == null) return "new"
	const delta = score - priorScore
	if (delta >= 3) return "up"
	if (delta <= -3) return "down"
	return "flat"
}

// ── gradeDimension: pure parts + ONE LLM call for prose only ──────────────────

export type DimensionSummaryInput = {
	dimension: DimensionId
	question: string
	grade: Grade
	score: number
	confidence: Confidence
	anchors: RubricFramework["grade_anchors"]
	findings: readonly SignalFinding[]
	flags: readonly ScreenHit[]
}

// Injectable so tests run without a network call.
export type DimensionSummaryWriter = (input: DimensionSummaryInput) => Promise<string>

function fallbackSummary(i: DimensionSummaryInput): string {
	const flags = i.flags.length ? `; ${i.flags.length} screen flag(s) noted` : ""
	return `Graded ${i.grade} (${i.score}/100) from ${i.findings.length} evidence finding(s)${flags}.`
}

const defaultWriteSummary: DimensionSummaryWriter = async (input) => {
	try {
		// Lazy import: ../ai reads $env/dynamic/private, which is unavailable at
		// module load (and in unit tests). Only the real LLM path needs it.
		const { getAiModel } = await import("../ai")
		const ctx: Context = {
			systemPrompt:
				"You are a financial research analyst writing one dimension's summary for an " +
				"equity-health report. You are given a grade and score that are FINAL and " +
				"computed by code — never restate a different grade or invent any number, " +
				"metric, or statistic. Write 2-3 sentences of evidence language: describe what " +
				"the cited findings show and why it lands near the given grade anchor. State " +
				"observations with their evidence; never accuse. No price targets, estimates, " +
				"or ratings.",
			messages: [
				{
					role: "user",
					content: JSON.stringify({
						dimension: input.dimension,
						question: input.question,
						final_grade: input.grade,
						final_score: input.score,
						confidence: input.confidence,
						grade_anchors: input.anchors,
						findings: input.findings.map((f) => ({
							direction: f.direction,
							strength: f.strength,
							summary: f.summary
						})),
						screen_flags: input.flags.map((h) => ({ status: h.status, summary: h.summary }))
					}),
					timestamp: Date.now()
				}
			]
		}
		const response = await complete(getAiModel(), ctx)
		if (response.stopReason === "error") return fallbackSummary(input)
		const text = response.content
			.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
			.map((b) => b.text)
			.join("")
			.trim()
		return text || fallbackSummary(input)
	} catch {
		// LLM failure must never fail grading — the numbers already exist.
		return fallbackSummary(input)
	}
}

/**
 * Orchestrates the deterministic pieces then makes ONE LLM call to write the
 * `summary` prose against the grade anchors. Numbers, caps, confidence, trend
 * and hash are all from code; `writeSummary` only produces text.
 */
export async function gradeDimension(
	evidence: DimensionEvidence,
	framework: RubricFramework,
	prior: DimensionGrade | null,
	writeSummary: DimensionSummaryWriter = defaultWriteSummary
): Promise<DimensionGrade> {
	// Source of truth for company-controlled is the evidence items (research.ts
	// marks the company's own domains there); PR wires are added by scoreDimension.
	const companyDomains = new Set(
		evidence.evidence_items
			.filter((i) => i.company_controlled)
			.map((i) => i.source_domain.toLowerCase())
	)

	const base = scoreDimension(evidence.findings, framework, companyDomains)
	const score = applyScreenCaps(base, evidence.screen_hits)
	const grade = scoreToGrade(score)
	const confidence = computeConfidence(evidence.evidence_items, framework.evidence_policy)
	const trend = computeTrend(score, prior?.score ?? null)
	const evidence_hash = await evidenceHash(
		evidence.dimension,
		framework.version,
		evidence.evidence_items
	)

	const summary = await writeSummary({
		dimension: evidence.dimension,
		question: framework.question,
		grade,
		score,
		confidence,
		anchors: framework.grade_anchors,
		findings: evidence.findings,
		flags: evidence.screen_hits
	})

	return {
		dimension: evidence.dimension,
		grade,
		score,
		confidence,
		trend,
		flags: evidence.screen_hits, // all hits (confirmed + suspected) for owner view
		top_citations: topCitations(evidence),
		summary,
		evidence_hash,
		rubric_version: framework.version
	}
}

// Prefer the citations that drove the findings; dedupe by url; cap at 3; fall
// back to raw evidence items when findings carried none.
function topCitations(evidence: DimensionEvidence): Citation[] {
	const seen = new Set<string>()
	const out: Citation[] = []
	const push = (c: Citation) => {
		if (out.length >= 3 || seen.has(c.url)) return
		seen.add(c.url)
		out.push({
			url: c.url,
			title: c.title,
			source_domain: c.source_domain,
			published_at: c.published_at,
			snippet: c.snippet
		})
	}
	for (const f of evidence.findings) for (const c of f.citations) push(c)
	for (const i of evidence.evidence_items) push(i)
	return out
}
