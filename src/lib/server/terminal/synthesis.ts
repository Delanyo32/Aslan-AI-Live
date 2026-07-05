// Synthesis + evidence-language enforcement (WP1.5, §2.3 `synthesize`).
// Builds the report narrative + evidence-drawn bear/bull cases in ONE structured
// LLM call, with rulebook.md injected into the system prompt. Any banned framing
// in the output triggers one retry naming the violations; a second failure throws
// (callers surface it — non-compliant text is never published silently).

import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import type { Company, CompositeScore, DimensionGrade, ReconciliationVerdict } from "$lib/types/terminal"
import RULEBOOK from "./rulebook.md?raw" // ?raw type is declared in raw-md.d.ts

// Mirrors the "Banned framings" list in rulebook.md (v1.0.0). Keep in sync with it.
export const BANNED_FRAMINGS = [
	"misleading accounting",
	"fake deal",
	"fraud",
	"fraudulent",
	"scheme",
	"scam",
	"lied",
	"lying",
	"deception",
	"cooking the books",
	"pump and dump",
	// accusatory verb constructions ("management is hiding/concealing/faking")
	"is hiding",
	"are hiding",
	"is concealing",
	"are concealing",
	"is faking",
	"are faking"
] as const

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Pure banned-phrase scan: case-insensitive, word-boundary aware, whitespace-flexible.
 * Returns the banned framings found in `text` (empty ⇒ compliant).
 */
export function checkLanguageCompliance(text: string): string[] {
	const found: string[] = []
	for (const phrase of BANNED_FRAMINGS) {
		const body = phrase.split(/\s+/).map(escapeRegex).join("\\s+")
		if (new RegExp(`\\b${body}\\b`, "i").test(text)) found.push(phrase)
	}
	return found
}

export type SynthesisOutput = { narrative: string; bear: string; bull: string }
// (systemPrompt, userPrompt) → structured output. Injectable so tests run offline.
export type SynthesisCaller = (systemPrompt: string, userPrompt: string) => Promise<SynthesisOutput>

const systemPrompt = () =>
	`You are an equity-research writer for the Aslan Terminal. You write in published ` +
	`short-research style: specific, sourced, falsifiable statements. You report cited ` +
	`observations and let the reader draw the conclusion.\n\n` +
	`You MUST obey this editorial rulebook exactly. Every generated sentence is bound by it:\n\n` +
	`<rulebook>\n${RULEBOOK}\n</rulebook>\n\n` +
	`Call submit_report exactly once with the narrative and the two evidence-drawn cases.`

function citationLine(c: { url: string; title: string | null; source_domain: string }) {
	return `- ${c.title ?? c.source_domain} (${c.source_domain}) ${c.url}`
}

function userPrompt(
	company: Company,
	grades: DimensionGrade[],
	composite: CompositeScore,
	verdict: ReconciliationVerdict | null,
	ledgerStats: object | null
): string {
	const pool = new Map<string, ReturnType<typeof citationLine>>()
	const dims = grades.map((g) => {
		for (const c of [...g.top_citations, ...g.flags.flatMap((f) => f.citations)]) {
			if (!pool.has(c.url)) pool.set(c.url, citationLine(c))
		}
		const flags = g.flags.length
			? `\n  flags: ${g.flags.map((f) => `${f.status}: ${f.summary}`).join("; ")}`
			: ""
		return `${g.dimension} — grade ${g.grade} (${g.confidence}): ${g.summary}${flags}`
	})

	return [
		`Company: ${company.name} (${company.ticker})`,
		`Composite: grade ${composite.grade}, score ${composite.score}, confidence ${composite.confidence}` +
			(composite.red_banner ? " — RED BANNER active" : ""),
		``,
		`Dimension grades and summaries:`,
		...dims,
		``,
		verdict
			? `Price-reconciliation verdict (${verdict.bucket}, confidence ${verdict.confidence}): ${verdict.sentence}`
			: `Price-reconciliation verdict: not available (non-US listing).`,
		ledgerStats ? `Announcement ledger: ${JSON.stringify(ledgerStats)}` : `Announcement ledger: no data yet.`,
		``,
		`Shared evidence pool (both the bear and bull case must draw only from these):`,
		...pool.values(),
		``,
		`Write three fields:`,
		`- narrative: 2–4 paragraphs on where the evidence stands, cited observations only.`,
		`- bear: "Bear case from the evidence" — cited observations that weigh against the company.`,
		`- bull: "Bull case from the evidence" — cited observations that weigh for the company.`
	].join("\n")
}

// Real LLM path: single structured call via getAiModel + pi-ai submit tool (exa-events pattern).
// getAiModel is imported lazily: it reads $env at module load, which the offline test
// runner cannot resolve — and this path never runs when a caller is injected.
async function defaultCaller(system: string, user: string): Promise<SynthesisOutput> {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_report",
		description: "Submit the finished narrative and evidence-drawn bear/bull cases. Call exactly once.",
		parameters: Type.Object({
			narrative: Type.String({ description: "2–4 paragraphs, cited observations only, no accusations" }),
			bear: Type.String({ description: "Bear case from the evidence — cited observations, never accusation" }),
			bull: Type.String({ description: "Bull case from the evidence — cited observations, never promotion" })
		})
	}
	const context: Context = {
		systemPrompt: system,
		messages: [{ role: "user", content: user, timestamp: Date.now() }],
		tools: [submit]
	}
	const response = await complete(getAiModel(), context)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during synthesis")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_report")
	if (!call) throw new Error("synthesis: model did not submit a report")
	return validateToolCall([submit], call) as SynthesisOutput
}

/**
 * §2.3 synthesize. Builds narrative + bear/bull from the citation pool via one
 * structured LLM call with rulebook.md embedded. Retries once on any banned
 * framing; throws (never publishes) if the retry still violates.
 */
export async function synthesize(
	company: Company,
	grades: DimensionGrade[],
	composite: CompositeScore,
	verdict: ReconciliationVerdict | null,
	ledgerStats: object | null,
	caller: SynthesisCaller = defaultCaller
): Promise<SynthesisOutput> {
	const system = systemPrompt()
	const baseUser = userPrompt(company, grades, composite, verdict, ledgerStats)

	let user = baseUser
	let violations: string[] = []
	for (let attempt = 0; attempt < 2; attempt++) {
		const out = await caller(system, user)
		violations = [
			...new Set([
				...checkLanguageCompliance(out.narrative),
				...checkLanguageCompliance(out.bear),
				...checkLanguageCompliance(out.bull)
			])
		]
		if (violations.length === 0) return out
		user =
			`${baseUser}\n\n---\nYour previous draft violated the editorial rulebook by using these banned ` +
			`framings: ${violations.join(", ")}. Rewrite every affected sentence as a cited observation with ` +
			`no accusation, and do not use those words.`
	}
	throw new Error(`synthesis language non-compliant after retry: ${violations.join(", ")}`)
}
