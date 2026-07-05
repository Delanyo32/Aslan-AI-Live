import { describe, test, expect } from "bun:test"
import { latestPerDimension, deteriorationScore } from "./board"

const NOW = new Date("2026-07-05T12:00:00Z")

function row(dimension: string, score: number, daysAgo: number) {
	return {
		dimension,
		score,
		created_at: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000)
	}
}

describe("latestPerDimension", () => {
	test("picks the newest row and its predecessor per dimension, unsorted input", () => {
		const rows = [row("F7", 60, 5), row("F7", 41, 10), row("F1", 72, 20), row("F7", 58, 40)]
		const out = latestPerDimension(rows)
		expect(out.get("F7")!.latest.score).toBe(60)
		expect(out.get("F7")!.prior!.score).toBe(41)
		expect(out.get("F1")!.latest.score).toBe(72)
		expect(out.get("F1")!.prior).toBeNull()
	})

	test("empty input → empty map", () => {
		expect(latestPerDimension([]).size).toBe(0)
	})
})

describe("deteriorationScore", () => {
	test("single row per dimension → 0", () => {
		expect(deteriorationScore([row("F7", 41, 3)], { now: NOW })).toBe(0)
	})

	test("pure improvement → 0", () => {
		expect(deteriorationScore([row("F5", 60, 10), row("F5", 80, 2)], { now: NOW })).toBe(0)
	})

	test("sums only the negative deltas across consecutive rows", () => {
		// F7: 58 → 41 (−17) → 60 (+19) → 54 (−6): deterioration 23
		const rows = [row("F7", 58, 20), row("F7", 41, 10), row("F7", 60, 5), row("F7", 54, 1)]
		expect(deteriorationScore(rows, { now: NOW })).toBe(23)
	})

	test("deltas landing outside the 30-day window are ignored", () => {
		const rows = [row("F3", 90, 60), row("F3", 50, 40), row("F3", 45, 5)]
		// −40 delta landed 40 days ago (outside); only −5 counts.
		expect(deteriorationScore(rows, { now: NOW })).toBe(5)
	})

	test("composite rows never count (would double-express F1–F9 moves)", () => {
		const rows = [row("composite", 70, 10), row("composite", 40, 2)]
		expect(deteriorationScore(rows, { now: NOW })).toBe(0)
	})

	test("aggregates across dimensions", () => {
		const rows = [row("F2", 40, 10), row("F2", 30, 2), row("F4", 64, 10), row("F4", 48, 2)]
		expect(deteriorationScore(rows, { now: NOW })).toBe(26)
	})
})
