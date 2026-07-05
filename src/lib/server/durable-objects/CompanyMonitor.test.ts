import { describe, test, expect } from "bun:test"
import {
	addOneMonth,
	rescoreDue,
	pickDueDimension,
	rescoreShouldSkip,
	alertNeeded,
	newsMonitorQuery,
	policyMonitorQuery,
	policyMonitorDomains,
	neutralAlertReason,
	DIMENSIONS
} from "./CompanyMonitor"
import { TERMINAL_CONFIG } from "$lib/server/terminal/config"

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe("addOneMonth (billing due-date math)", () => {
	test("ordinary month advances the day in place", () => {
		expect(iso(addOneMonth(new Date("2026-01-15T00:00:00Z")))).toBe("2026-02-15")
		expect(iso(addOneMonth(new Date("2026-03-10T00:00:00Z")))).toBe("2026-04-10")
	})

	test("Jan 31 clamps to Feb 28 (non-leap), never overflows into March", () => {
		expect(iso(addOneMonth(new Date("2026-01-31T00:00:00Z")))).toBe("2026-02-28")
	})

	test("Jan 31 clamps to Feb 29 in a leap year", () => {
		expect(iso(addOneMonth(new Date("2028-01-31T00:00:00Z")))).toBe("2028-02-29")
	})

	test("Jan 30 also clamps to end of February", () => {
		expect(iso(addOneMonth(new Date("2026-01-30T00:00:00Z")))).toBe("2026-02-28")
	})

	test("December rolls into the next year", () => {
		expect(iso(addOneMonth(new Date("2025-12-15T00:00:00Z")))).toBe("2026-01-15")
	})

	test("preserves the time-of-day component", () => {
		const out = addOneMonth(new Date("2026-01-15T09:41:07Z"))
		expect(out.toISOString()).toBe("2026-02-15T09:41:07.000Z")
	})
})

describe("rescoreDue (batch gating)", () => {
	const batchMs = TERMINAL_CONFIG.RESCORE_BATCH_HOURS * 60 * 60 * 1000
	const now = 1_000_000_000_000

	test("immediate bypasses the batch window regardless of age", () => {
		expect(rescoreDue({ queued_at: now, immediate: true }, now, batchMs)).toBe(true)
	})

	test("batched item younger than the window is not due", () => {
		expect(rescoreDue({ queued_at: now - (batchMs - 1), immediate: false }, now, batchMs)).toBe(false)
	})

	test("batched item aged past the window is due", () => {
		expect(rescoreDue({ queued_at: now - batchMs, immediate: false }, now, batchMs)).toBe(true)
	})
})

describe("pickDueDimension", () => {
	const batchMs = TERMINAL_CONFIG.RESCORE_BATCH_HOURS * 60 * 60 * 1000
	const now = 1_000_000_000_000

	test("returns null when nothing is due", () => {
		expect(pickDueDimension({ F1: { queued_at: now, immediate: false } }, now, batchMs)).toBeNull()
	})

	test("immediate wins over an older batched one", () => {
		const pending = {
			F3: { queued_at: now - 10 * batchMs, immediate: false }, // due, batched
			F7: { queued_at: now, immediate: true } // due, immediate
		}
		expect(pickDueDimension(pending, now, batchMs)).toBe("F7")
	})

	test("falls back to the first due batched dimension in F1..F9 order", () => {
		const pending = {
			F5: { queued_at: now - batchMs, immediate: false },
			F2: { queued_at: now - batchMs, immediate: false }
		}
		expect(pickDueDimension(pending, now, batchMs)).toBe("F2")
	})
})

describe("rescoreShouldSkip (evidence-delta gate)", () => {
	test("same hash → skip", () => {
		expect(rescoreShouldSkip("abc", "abc")).toBe(true)
	})
	test("changed hash → run", () => {
		expect(rescoreShouldSkip("abc", "xyz")).toBe(false)
	})
	test("no prior grade → run (never skip a first grade)", () => {
		expect(rescoreShouldSkip("abc", null)).toBe(false)
	})
})

describe("alertNeeded", () => {
	const g = (grade: string, confidence: string) => ({ grade, confidence })
	test("grade change → alert", () => {
		expect(alertNeeded(g("B", "high"), g("C", "high"))).toBe(true)
	})
	test("confidence change → alert", () => {
		expect(alertNeeded(g("B", "high"), g("B", "medium"))).toBe(true)
	})
	test("neither changed → no alert", () => {
		expect(alertNeeded(g("B", "high"), g("B", "high"))).toBe(false)
	})
	test("no prior → no alert", () => {
		expect(alertNeeded(null, g("B", "high"))).toBe(false)
	})
})

describe("monitor-query construction", () => {
	test("news query names the broad material-event classes", () => {
		const q = newsMonitorQuery("Apple Inc").toLowerCase()
		expect(q).toContain("apple inc")
		for (const term of ["deal", "ceo", "resignation", "recall", "investigation", "restatement"]) {
			expect(q).toContain(term)
		}
	})

	test("policy domains come from the F2 rubric's regulator recipes", () => {
		const domains = policyMonitorDomains()
		// F2's enforcement + licenses recipes list these.
		for (const d of ["sec.gov", "justice.gov", "ftc.gov", "ec.europa.eu", "fda.gov", "fcc.gov"]) {
			expect(domains).toContain(d)
		}
		// deduped
		expect(new Set(domains).size).toBe(domains.length)
	})

	test("policy query interpolates the company", () => {
		expect(policyMonitorQuery("Nikola").toLowerCase()).toContain("nikola")
	})
})

describe("neutralAlertReason", () => {
	test("is a compact evidence-language line naming the move", () => {
		expect(neutralAlertReason("F9", "A", "C")).toContain("F9")
		expect(neutralAlertReason("F9", "A", "C")).toContain("A")
		expect(neutralAlertReason("F9", "A", "C")).toContain("C")
	})
	test("handles a missing prior grade", () => {
		expect(neutralAlertReason("F1", null, "B")).toContain("—")
	})
})

describe("DIMENSIONS", () => {
	test("is the nine frameworks in order", () => {
		expect(DIMENSIONS).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"])
	})
})
