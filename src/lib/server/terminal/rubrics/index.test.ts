import { describe, test, expect } from "bun:test"
import { FRAMEWORKS, RUBRIC_VERSION } from "./index"

const IDS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"] as const

describe("rubric loader", () => {
	test("all nine frameworks load and validate", () => {
		expect(Object.keys(FRAMEWORKS).sort()).toEqual([...IDS])
		for (const id of IDS) expect(FRAMEWORKS[id].id).toBe(id)
	})

	test("signal weights sum to 1.0 per framework", () => {
		for (const id of IDS) {
			const sum = FRAMEWORKS[id].signals.reduce((s, sig) => s + sig.weight, 0)
			expect(Math.abs(sum - 1)).toBeLessThanOrEqual(0.01)
		}
	})

	test("framework weights: F9=2.0, F3/F5=1.5, others 1.0", () => {
		for (const id of IDS) {
			const expected = id === "F9" ? 2.0 : id === "F3" || id === "F5" ? 1.5 : 1.0
			expect(FRAMEWORKS[id].weight).toBe(expected)
		}
	})

	test("F9 is the veto anchor with a full deception battery", () => {
		expect(FRAMEWORKS.F9.veto).toBe(true)
		expect(FRAMEWORKS.F9.false_signals.length).toBeGreaterThanOrEqual(6)
		expect(FRAMEWORKS.F9.false_signals.some((f) => f.action === "composite_cap:C")).toBe(true)
	})

	test("every signal and false signal carries a non-empty recipe", () => {
		for (const id of IDS) {
			const fw = FRAMEWORKS[id]
			for (const s of [...fw.signals, ...fw.false_signals]) {
				expect(s.recipe).toBeDefined()
				expect(s.recipe.primitive.length).toBeGreaterThan(0)
				expect((s.recipe.query_template ?? "").length).toBeGreaterThan(0)
			}
		}
	})

	test("RUBRIC_VERSION is the max of the file versions", () => {
		// WP6.1 bumped F7/F8 to 1.1.0 (added the ledger follow-through signals).
		expect(RUBRIC_VERSION).toBe("1.1.0")
	})
})
