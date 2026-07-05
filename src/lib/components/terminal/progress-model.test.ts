import { test, expect } from "bun:test"
import { STAGE_TO_DISPLAY, DISPLAY_STAGES, dimensionFromLogLine, isReplay } from "./progress-model"

test("stage names map to valid display indices; grading/writing collapse correctly", () => {
	// Every DO stage maps to a real display step.
	for (const idx of Object.values(STAGE_TO_DISPLAY)) {
		expect(idx).toBeGreaterThanOrEqual(0)
		expect(idx).toBeLessThan(DISPLAY_STAGES.length)
	}
	// synthesizing + persisting collapse onto "Writing report".
	expect(STAGE_TO_DISPLAY.synthesizing).toBe(STAGE_TO_DISPLAY.persisting)
	expect(DISPLAY_STAGES[STAGE_TO_DISPLAY.synthesizing]).toBe("Writing report")
	// grading is "Screening & grading" (screens run inside grading).
	expect(DISPLAY_STAGES[STAGE_TO_DISPLAY.grading]).toBe("Screening & grading")
})

test("dimensionFromLogLine extracts the F-prefix, ignores non-dimension logs", () => {
	expect(dimensionFromLogLine("F3 Competitive Landscape: 7 findings, 21 evidence items")).toBe("F3")
	expect(dimensionFromLogLine("F9 Value Creation: 4 findings, 8 evidence items")).toBe("F9")
	expect(dimensionFromLogLine("Extracting fundamentals from filings…")).toBeNull()
	expect(dimensionFromLogLine("Reusing competitor set abc123")).toBeNull()
})

test("nine distinct F-lines yield a 9/9 count even with a replayed duplicate", () => {
	const seen = new Set<string>()
	const lines = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `F${n} Framework: ${n} findings, ${n} evidence items`)
	// Replay F3 (as a wrangler reconnect would).
	for (const l of [...lines, "F3 Framework: 7 findings, 21 evidence items"]) {
		const d = dimensionFromLogLine(l)
		if (d) seen.add(d)
	}
	expect(seen.size).toBe(9)
})

test("isReplay drops already-seen ids, admits new ones, ignores absent ids", () => {
	expect(isReplay("1", 0)).toBe(false) // fresh
	expect(isReplay("3", 5)).toBe(true) // replayed after reconnect (id ≤ maxSeen)
	expect(isReplay("5", 5)).toBe(true) // exact boundary is a replay
	expect(isReplay("6", 5)).toBe(false) // strictly newer
	expect(isReplay("", 5)).toBe(false) // no id field → nothing to dedupe against
	expect(isReplay("abc", 5)).toBe(false) // non-numeric → not a replay
})
