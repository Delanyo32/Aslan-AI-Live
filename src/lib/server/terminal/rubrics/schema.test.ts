import { describe, test, expect } from "bun:test"
import { validateRubricFramework } from "./schema"

// The §2.4 example framework, comments stripped.
const example = {
	version: "1.0.0",
	id: "F1",
	name: "Investor Sentiment & Relationship Health",
	question:
		"Do the investors who own this company understand it, trust management, and hold for the stated thesis — or is the register churning, hostile, or promotional?",
	weight: 1.0,
	signals: [
		{
			id: "f1_press_tone",
			description: "Tone and consistency of coverage in financial press",
			polarity: "both",
			weight: 0.15,
			recipe: {
				primitive: "search",
				query_template: "{company} investors OR shareholders",
				category: "news",
				days: 90,
				contents: "highlights"
			}
		}
	],
	grade_anchors: {
		A: "Stable, informed base; guidance historically reliable; no live activist/short campaigns; independent coverage tone matches company narrative.",
		C: "Mixed: churning narrative, guidance credibility questioned at least once in 4 quarters, or one unresolved activist/short thesis with partial merit.",
		F: "Open hostility: credible short reports unanswered, serial guidance misses reframed as beats, mass institutional exit, or evidence of coordinated promotion."
	},
	false_signals: [
		{
			id: "promotional_cadence_spike",
			description:
				"Abnormal press-release volume in the 60 days before a share offering, lockup expiry, or reported insider sales.",
			recipe: { primitive: "search", query_template: "…", category: "news", days: 120 },
			action: "cap:C"
		}
	],
	evidence_policy: {
		min_sources: 5,
		min_independent: 2,
		recency_days: 365,
		notes: "evidence gaps to disclose, e.g. no social firehose in v1"
	}
}

describe("validateRubricFramework", () => {
	test("accepts the §2.4 example", () => {
		expect(validateRubricFramework(example)).toEqual([])
	})

	test("rejects non-object input", () => {
		expect(validateRubricFramework(null)).not.toEqual([])
		expect(validateRubricFramework("F1")).not.toEqual([])
	})

	test("rejects a malformed framework and names each fault", () => {
		const malformed = {
			...example,
			version: "one",                                         // not semver
			id: "F10",                                              // not F1…F9
			weight: -1,                                             // not positive
			signals: [
				{ ...example.signals[0], polarity: "bullish", weight: 2 } // bad enum, weight > 1
			],
			grade_anchors: { A: "ok", C: "ok" },                    // missing F
			false_signals: [
				{ ...example.false_signals[0], action: "cap:B" }      // bad action
			],
			evidence_policy: { min_sources: 0, min_independent: -1, recency_days: 0 }
		}
		const errors = validateRubricFramework(malformed)
		for (const field of [
			"version", "id:", "weight:", "signals[0].polarity", "signals[0].weight",
			"grade_anchors.F", "false_signals[0].action",
			"evidence_policy.min_sources", "evidence_policy.min_independent", "evidence_policy.recency_days"
		]) {
			expect(errors.some((e) => e.includes(field))).toBe(true)
		}
	})

	test("rejects missing signals and bad recipe primitive", () => {
		expect(validateRubricFramework({ ...example, signals: [] })).not.toEqual([])
		const badRecipe = {
			...example,
			signals: [{ ...example.signals[0], recipe: { primitive: "scrape" } }]
		}
		expect(
			validateRubricFramework(badRecipe).some((e) => e.includes("signals[0].recipe.primitive"))
		).toBe(true)
	})
})
