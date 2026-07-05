import { describe, test, expect } from "bun:test"
import {
	addMonths,
	nextCheckDate,
	extractCommitments,
	runDueCheck,
	followThroughRate,
	ftrSignalFinding,
	type FollowThroughRate,
	type RawCommitment
} from "./ledger"

const COMPANY = { id: "co1", name: "Acme Corp", ticker: "ACME" }

// Minimal Drizzle stand-in covering exactly the three chains ledger.ts uses:
//   select(...).from(_).where(_) → rows ;  insert(_).values(v) ;  update(_).set(s).where(_)
// where() ignores its predicate — each fake holds one company's rows already.
function fakeDb(rows: Record<string, unknown>[]) {
	const inserted: Record<string, unknown>[] = []
	const updates: Record<string, unknown>[] = []
	const db = {
		_inserted: inserted,
		_updates: updates,
		_rows: rows,
		select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
		insert: () => ({
			values: (v: Record<string, unknown>) => {
				inserted.push(v)
				rows.push(v)
				return Promise.resolve()
			}
		}),
		update: () => ({
			set: (s: Record<string, unknown>) => ({
				where: () => {
					updates.push(s)
					return Promise.resolve()
				}
			})
		})
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return db as any
}

const MONTH = 30 * 24 * 3600 * 1000 // rough, for "is it roughly N months out" assertions

function row(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: crypto.randomUUID(),
		company_id: COMPANY.id,
		what: "ship widget",
		promised_date: null as Date | null,
		source_url: "https://x.com/a",
		status: "pending",
		next_check_at: null as Date | null,
		checked_at: null as Date | null,
		check_evidence: [] as unknown[],
		created_at: new Date("2026-01-01T00:00:00Z"),
		...over
	}
}

// ── addMonths / nextCheckDate scheduling ───────────────────────────────────────

describe("addMonths (UTC calendar math)", () => {
	test("clamps to short target month", () => {
		expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28")
	})
	test("month 0 is identity", () => {
		expect(addMonths(new Date("2026-06-15T00:00:00Z"), 0).toISOString().slice(0, 10)).toBe("2026-06-15")
	})
	test("6 months forward", () => {
		expect(addMonths(new Date("2026-01-10T00:00:00Z"), 6).toISOString().slice(0, 10)).toBe("2026-07-10")
	})
})

describe("nextCheckDate (offsets [0,6,12] relative to base)", () => {
	const base = new Date("2026-01-01T00:00:00Z")

	test("just after the promised date → the +6mo offset", () => {
		const now = base.getTime() + 1000 // offset 0 is behind us
		expect(nextCheckDate(base, now)!.toISOString().slice(0, 10)).toBe("2026-07-01")
	})
	test("after the +6mo check → the +12mo offset", () => {
		const now = addMonths(base, 6).getTime() + 1000
		expect(nextCheckDate(base, now)!.toISOString().slice(0, 10)).toBe("2027-01-01")
	})
	test("past all offsets → null", () => {
		const now = addMonths(base, 12).getTime() + 1000
		expect(nextCheckDate(base, now)).toBeNull()
	})
	test("before the first offset → the +0 offset", () => {
		const now = base.getTime() - MONTH
		expect(nextCheckDate(base, now)!.getTime()).toBe(base.getTime())
	})
})

// ── followThroughRate math ─────────────────────────────────────────────────────

describe("followThroughRate", () => {
	test("empty ledger → ftr null (never 0)", async () => {
		const r = await followThroughRate(fakeDb([]), COMPANY.id)
		expect(r.ftr).toBeNull()
		expect(r.counts.total).toBe(0)
		expect(r.tracking_since).toBeNull()
	})

	test("all pending → denominator 0 → ftr null", async () => {
		const r = await followThroughRate(fakeDb([row(), row()]), COMPANY.id)
		expect(r.ftr).toBeNull()
		expect(r.counts.pending).toBe(2)
	})

	test("mixed counts; unaccounted_past_due is in the denominator", async () => {
		const rows = [
			row({ status: "delivered_on_time" }),
			row({ status: "delivered_on_time" }),
			row({ status: "delivered_late" }),
			row({ status: "missed" }),
			row({ status: "unaccounted" }), // past-due, counts against FTR
			row({ status: "redefined" }), // resolved, in denominator, not a display bucket
			row({ status: "pending" }) // excluded from the denominator
		]
		const r = await followThroughRate(fakeDb(rows), COMPANY.id)
		// denominator = total - pending = 6; on_time = 2 → 2/6
		expect(r.ftr).toBeCloseTo(2 / 6, 6)
		expect(r.counts).toMatchObject({ total: 7, on_time: 2, late: 1, missed: 1, unaccounted: 1, pending: 1 })
	})

	test("aggregates check_evidence citations, capped at 3", async () => {
		const cite = (u: string): Citation => ({ url: u, title: null, source_domain: "x.com", published_at: null, snippet: null })
		const rows = [
			row({ status: "delivered_on_time", check_evidence: [cite("a"), cite("b")] }),
			row({ status: "missed", check_evidence: [cite("c"), cite("d")] })
		]
		const r = await followThroughRate(fakeDb(rows), COMPANY.id)
		expect(r.citations).toHaveLength(3)
	})
})

// ── ftrSignalFinding thresholds ────────────────────────────────────────────────

function ftrResult(ftr: number | null, resolved: number): FollowThroughRate {
	return {
		ftr,
		counts: { total: resolved + 1, on_time: Math.round((ftr ?? 0) * resolved), late: 0, missed: 0, unaccounted: 0, pending: 1 },
		tracking_since: null,
		citations: [{ url: "u", title: null, source_domain: "x.com", published_at: null, snippet: null }]
	}
}

describe("ftrSignalFinding", () => {
	test("null ftr → null (day-one: no signal)", () => {
		expect(ftrSignalFinding("F7", ftrResult(null, 0))).toBeNull()
	})
	test("≥0.7 supports; <0.5 undermines; between neutral", () => {
		expect(ftrSignalFinding("F7", ftrResult(0.8, 10))!.direction).toBe("supports")
		expect(ftrSignalFinding("F7", ftrResult(0.4, 10))!.direction).toBe("undermines")
		expect(ftrSignalFinding("F7", ftrResult(0.6, 10))!.direction).toBe("neutral")
	})
	test("strength by sample size (resolved = total - pending)", () => {
		expect(ftrSignalFinding("F8", ftrResult(0.9, 3))!.strength).toBe(1) // <5
		expect(ftrSignalFinding("F8", ftrResult(0.9, 9))!.strength).toBe(2) // 5..14
		expect(ftrSignalFinding("F8", ftrResult(0.9, 20))!.strength).toBe(3) // ≥15
	})
	test("signal id maps to the dimension", () => {
		expect(ftrSignalFinding("F7", ftrResult(0.8, 10))!.signal_id).toBe("f7_followthrough")
		expect(ftrSignalFinding("F8", ftrResult(0.8, 10))!.signal_id).toBe("f8_followthrough")
	})
})

// ── extractCommitments insert shape + dedupe ───────────────────────────────────

describe("extractCommitments", () => {
	const evidence = [
		{ title: "Acme to open Berlin plant", snippet: "opening in June 2026", url: "https://news.com/1" },
		{ title: "Old news", snippet: "shipped last year", url: "https://news.com/2" }
	]
	const now = new Date("2026-02-01T00:00:00Z").getTime()

	test("inserts with the right shape; next_check_at = promised_date when set", async () => {
		const caller = async (): Promise<RawCommitment[]> => [
			{ what: "open the Berlin plant", promised_date: "2026-06-01", source_index: 0 }
		]
		const db = fakeDb([])
		const n = await extractCommitments(db, COMPANY, evidence, caller, now)
		expect(n).toBe(1)
		const ins = db._inserted[0]
		expect(ins).toMatchObject({ company_id: "co1", what: "open the Berlin plant", source_url: "https://news.com/1", status: "pending" })
		expect((ins.promised_date as Date).toISOString().slice(0, 10)).toBe("2026-06-01")
		expect((ins.next_check_at as Date).toISOString().slice(0, 10)).toBe("2026-06-01")
	})

	test("no promised date → next_check_at = now + OFFSETS[1] (6) months", async () => {
		const caller = async (): Promise<RawCommitment[]> => [{ what: "ship the thing", promised_date: null, source_index: 0 }]
		const db = fakeDb([])
		await extractCommitments(db, COMPANY, evidence, caller, now)
		expect((db._inserted[0].next_check_at as Date).toISOString().slice(0, 10)).toBe("2026-08-01") // Feb 1 + 6mo
		expect(db._inserted[0].promised_date).toBeNull()
	})

	test("skips a near-identical open commitment (normalized substring)", async () => {
		const caller = async (): Promise<RawCommitment[]> => [{ what: "Open the Berlin Plant", promised_date: null, source_index: 0 }]
		const db = fakeDb([row({ what: "open the berlin plant", status: "pending" })])
		const n = await extractCommitments(db, COMPANY, evidence, caller, now)
		expect(n).toBe(0)
	})

	test("resolved commitments do not block a re-log (only open ones dedupe)", async () => {
		const caller = async (): Promise<RawCommitment[]> => [{ what: "ship widget", promised_date: null, source_index: 0 }]
		const db = fakeDb([row({ what: "ship widget", status: "delivered_on_time" })])
		const n = await extractCommitments(db, COMPANY, evidence, caller, now)
		expect(n).toBe(1)
	})

	test("drops rows with an out-of-range source_index", async () => {
		const caller = async (): Promise<RawCommitment[]> => [{ what: "x", promised_date: null, source_index: 99 }]
		const db = fakeDb([])
		expect(await extractCommitments(db, COMPANY, evidence, caller, now)).toBe(0)
	})
})

// ── runDueCheck: scheduling + terminal clears next_check_at ─────────────────────

const noSearch = async () => ({ results: [{ url: "https://p.com/x", title: "t", publishedDate: null, highlights: ["h"] }] })

describe("runDueCheck", () => {
	const base = new Date("2026-01-01T00:00:00Z")

	test("terminal status clears next_check_at and records evidence", async () => {
		const db = fakeDb([])
		const c = row({ promised_date: base })
		const status = await runDueCheck(COMPANY, c as never, {
			db,
			search: noSearch as never,
			classify: async () => ({ status: "delivered_on_time", note: "" }),
			now: base.getTime() + 1000
		})
		expect(status).toBe("delivered_on_time")
		const upd = db._updates[0]
		expect(upd.status).toBe("delivered_on_time")
		expect(upd.next_check_at).toBeNull()
		expect((upd.check_evidence as unknown[]).length).toBe(1)
	})

	test("unresolved reschedules to the next offset (pending)", async () => {
		const db = fakeDb([])
		const c = row({ promised_date: base })
		const status = await runDueCheck(COMPANY, c as never, {
			db,
			search: noSearch as never,
			classify: async () => ({ status: "unresolved", note: "" }),
			now: base.getTime() + 1000
		})
		expect(status).toBe("pending")
		expect((db._updates[0].next_check_at as Date).toISOString().slice(0, 10)).toBe("2026-07-01")
	})

	test("unresolved past all offsets → unaccounted, next_check_at null", async () => {
		const db = fakeDb([])
		const c = row({ promised_date: base })
		const status = await runDueCheck(COMPANY, c as never, {
			db,
			search: noSearch as never,
			classify: async () => ({ status: "unresolved", note: "" }),
			now: addMonths(base, 12).getTime() + 1000
		})
		expect(status).toBe("unaccounted")
		expect(db._updates[0].next_check_at).toBeNull()
	})

	test("no promised_date → offsets relative to created_at", async () => {
		const db = fakeDb([])
		const c = row({ promised_date: null, created_at: base })
		await runDueCheck(COMPANY, c as never, {
			db,
			search: noSearch as never,
			classify: async () => ({ status: "unresolved", note: "" }),
			now: addMonths(base, 6).getTime() + 1000
		})
		expect((db._updates[0].next_check_at as Date).toISOString().slice(0, 10)).toBe("2027-01-01") // created + 12mo
	})
})

// keep the Citation import used above tidy
type Citation = { url: string; title: string | null; source_domain: string; published_at: string | null; snippet: string | null }
