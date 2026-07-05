import { describe, test, expect } from "bun:test"
import { checkLanguageCompliance, synthesize, type SynthesisCaller } from "./synthesis"
import type { CompositeScore, DimensionGrade, DimensionId } from "$lib/types/terminal"
import type { Company } from "./index"

const company = { name: "Acme Corp", ticker: "ACME" } as unknown as Company

const grades: DimensionGrade[] = [
	{
		dimension: "F1",
		grade: "C",
		score: 55,
		confidence: "medium",
		trend: "flat",
		flags: [],
		top_citations: [
			{ url: "https://sec.gov/x", title: "10-K", source_domain: "sec.gov", published_at: "2026-01-01", snippet: null }
		],
		summary: "Filings show operating cash flow trailing net income for six consecutive quarters.",
		evidence_hash: "h",
		rubric_version: "1.0.0"
	}
]

const composite: CompositeScore = {
	grade: "C",
	score: 55,
	confidence: "medium",
	veto_applied: null,
	red_banner: false,
	weights_used: {} as Record<DimensionId, number>
}

const clean = { narrative: "clean text", bear: "clean text", bull: "clean text" }

describe("checkLanguageCompliance", () => {
	// Every canonical banned framing must be caught (case-insensitive, in a sentence).
	const canonical = [
		["misleading accounting", "This is misleading accounting by any measure."],
		["fake deal", "The whole thing was a Fake Deal."],
		["fraud", "The report alleges fraud."],
		["fraudulent", "These are fraudulent numbers."],
		["scheme", "It looks like a scheme."],
		["scam", "Investors called it a scam."],
		["lied", "Management lied to the board."],
		["lying", "They are lying about revenue."],
		["deception", "The pattern is one of deception."],
		["cooking the books", "They were cooking the books for years."],
		["pump and dump", "A classic pump and dump."],
		// accusatory-verb construction
		["is hiding", "Management is hiding losses from investors."]
	] as const

	for (const [phrase, sentence] of canonical) {
		test(`catches "${phrase}"`, () => {
			expect(checkLanguageCompliance(sentence)).toContain(phrase)
		})
	}

	test("clean evidence-language sentences pass", () => {
		expect(
			checkLanguageCompliance(
				"Filings show operating cash flow trailing net income for 6 consecutive quarters [source]."
			)
		).toEqual([])
		expect(
			checkLanguageCompliance(
				"No partner-side announcement found for the 2025-03 partnership [searches run, dates]."
			)
		).toEqual([])
	})

	test("word-boundary aware: does not fire inside larger words", () => {
		// "schemer"/"scammed" would be false positives without \b anchoring.
		expect(checkLanguageCompliance("the compensation was fully disclosed")).toEqual([])
	})
})

describe("synthesize", () => {
	test("built system prompt embeds rulebook.md content", async () => {
		let captured = ""
		const capture: SynthesisCaller = async (system) => {
			captured = system
			return clean
		}
		await synthesize(company, grades, composite, null, null, capture)
		expect(captured).toContain("Evidence-Language Rulebook")
		expect(captured).toContain("Let the reader draw the conclusion")
		expect(captured).toContain("misleading accounting")
	})

	test("retries once then throws when the model keeps violating", async () => {
		let calls = 0
		const bad: SynthesisCaller = async () => {
			calls++
			return { narrative: "This is fraud.", bear: "clean", bull: "clean" }
		}
		let threw = false
		try {
			await synthesize(company, grades, composite, null, null, bad)
		} catch (e) {
			threw = true
			expect(String(e)).toContain("fraud")
		}
		expect(threw).toBe(true)
		expect(calls).toBe(2) // one attempt + one retry
	})

	test("retry succeeds when the second draft is clean", async () => {
		let calls = 0
		const flip: SynthesisCaller = async () => {
			calls++
			return calls === 1 ? { narrative: "a scam", bear: "clean", bull: "clean" } : clean
		}
		const out = await synthesize(company, grades, composite, null, null, flip)
		expect(out).toEqual(clean)
		expect(calls).toBe(2)
	})
})
