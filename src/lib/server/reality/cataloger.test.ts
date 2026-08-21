// Offline cataloger tests — LLM surfaces injected, no network (house pattern).
// The model reports values AS PRINTED; these tests pin that CODE does every
// multiplication and every piece of date arithmetic.

import { describe, expect, test } from "bun:test"
import {
	catalogSoftLayer,
	extractSixKFigures,
	noteConsistent,
	pickResultsDocs,
	stripFilingHtml,
	type FilingMeta,
	type RawSixKFigure,
	type RawSoftEntry
} from "./cataloger"

const META: FilingMeta = {
	cik: "0001375365",
	accession: "0001375365-25-000004",
	form: "10-K",
	report_date: "2024-06-30"
}

describe("stripFilingHtml", () => {
	test("drops ix:header, scripts, tags; decodes entities", () => {
		const html =
			`<html><ix:header><ix:hidden>smci:AblecomMember junk</ix:hidden></ix:header>` +
			`<script>var x=1</script><body><p>The Company&#8217;s commitments were $&#160;6.2 billion&nbsp;total.</p></body></html>`
		const t = stripFilingHtml(html)
		expect(t).toBe(`The Company's commitments were $ 6.2 billion total.`)
		expect(t.includes("Ablecom")).toBe(false)
	})
})

describe("catalogSoftLayer", () => {
	const good: RawSoftEntry = {
		value: 6.2,
		value_high: 0,
		scale: "billions",
		value_type: "currency",
		unit: "USD",
		kind: "obligation",
		certainty: "committed",
		period_end: "2024-06-30",
		date_role: "due",
		date: "",
		due_window: "lt1y",
		counterparty: "",
		related_party: false,
		source_location: "Note 13 Commitments",
		notes: "Non-cancelable purchase commitments primarily through the next 12 months."
	}

	test("code multiplies value by scale and computes the window due date", async () => {
		const [e] = await catalogSoftLayer(META, "text", async () => ({ entries: [good] }))
		expect(e).toMatchObject({
			cik: META.cik,
			accession: META.accession,
			origin: "ai",
			amount: 6_200_000_000, // 6.2 × billions — code's multiplication
			value_type: "currency",
			kind: "obligation",
			certainty: "committed",
			due_date: "2025-06-30", // period_end + lt1y — code's date arithmetic
			inferred_due: true,
			event_date: null,
			counterparty: null,
			taxonomy_tag: null
		})
		expect(e.content_hash).toHaveLength(64)
	})

	test("scale expansion covers the audit's failure shapes", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 61.3, scale: "millions", date_role: "", due_window: "" }, // "$61.3 million"
				{ ...good, value: 152_300_000, scale: "units", date_role: "", due_window: "" }, // fully printed
				{ ...good, value: 17.9, scale: "typo", date_role: "", due_window: "" } // unknown scale → unverifiable
			]
		}))
		expect(out.map((e) => e.amount)).toEqual([61_300_000, 152_300_000])
	})

	test("percent disclosures become PCT context rows, never money", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 21, scale: "millions", value_type: "percent", kind: "revenue", date_role: "", due_window: "", notes: "One customer accounted for 21% of revenue." }
			]
		}))
		expect(out.length).toBe(1)
		expect(out[0]).toMatchObject({ amount: 21, unit: "PCT", kind: "context", value_type: "percent" }) // scale ignored for percents
	})

	test("per-share figures become context rows at printed value", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 1.37, scale: "millions", value_type: "per_share", unit: "EUR", kind: "obligation", date_role: "", due_window: "", notes: "Interim dividend of 1.37 euros per ordinary share." }
			]
		}))
		expect(out[0]).toMatchObject({ amount: 1.37, unit: "EUR", kind: "context", value_type: "per_share" })
	})

	test("ranges keep both printed ends; a non-range high is nulled", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 26.1, value_high: 26.9, scale: "billions", kind: "contingent_revenue", certainty: "conditional", date_role: "", due_window: "" },
				{ ...good, value: 5, value_high: 0, scale: "millions", date_role: "", due_window: "" }
			]
		}))
		expect(out[0].amount).toBe(26_100_000_000)
		expect(out[0].amount_high).toBe(26_900_000_000)
		expect(out[1].amount_high).toBeNull()
	})

	test("event dates land in event_date; a past 'due' date is dropped, not kept", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 257.1, scale: "millions", date_role: "event", date: "2020-10-30", due_window: "" },
				{ ...good, value: 18.25, scale: "millions", date_role: "due", date: "2023-05-05", due_window: "" } // before period_end
			]
		}))
		expect(out[0]).toMatchObject({ event_date: "2020-10-30", due_date: null })
		expect(out[1]).toMatchObject({ event_date: null, due_date: null, inferred_due: false })
	})

	test("a printed bare year and a window label both become code-computed dates", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 959.4, scale: "millions", date_role: "due", date: "2027", due_window: "" },
				{ ...good, value: 100, scale: "millions", date_role: "due", date: "", due_window: "y1_3" }
			]
		}))
		expect(out[0]).toMatchObject({ due_date: "2027-12-31", inferred_due: true })
		expect(out[1]).toMatchObject({ due_date: "2027-06-30", inferred_due: true }) // period_end + 3y
	})

	test("drops malformed rows, keeps related-party detail", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 0 }, // zero placeholder
				{ ...good, unit: "US DOLLARS" }, // not a currency code
				{ ...good, kind: "context" }, // context is not a soft claim
				{ ...good, certainty: "maybe" }, // bad enum
				{ ...good, value_type: "shares" }, // share count in a currency unit
				{ ...good, value: 152.3, scale: "millions", counterparty: "Ablecom", related_party: true, date_role: "", due_window: "" }
			]
		}))
		expect(out.length).toBe(1)
		expect(out[0]).toMatchObject({
			amount: 152_300_000,
			counterparty: "Ablecom",
			related_party: true,
			due_date: null,
			inferred_due: false
		})
	})

	test("normalizes unit spellings: lowercase and NTD→TWD; expense magnitudes go positive", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, unit: "usd" },
				{ ...good, unit: "NTD" },
				{ ...good, unit: "USD", kind: "expense", certainty: "actual", value: -500, scale: "thousands", date_role: "", due_window: "" }
			]
		}))
		expect(out.map((e) => e.unit)).toEqual(["USD", "TWD", "USD"])
		expect(out[2].amount).toBe(500_000)
	})

	test("a row contradicting its own evidence line is dropped (self-consistency guard)", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [
				{ ...good, value: 5000, scale: "billions", date_role: "", due_window: "", notes: "A $5.0 billion unsecured revolving credit facility." }, // double-expanded → 5e12 vs stated 5e9
				{ ...good, value: 5, scale: "billions", date_role: "", due_window: "", notes: "A $5.0 billion unsecured revolving credit facility." },
				{ ...good, value: 2025, scale: "units", date_role: "", due_window: "", notes: "The $1.25 billion convertible notes are due 2025." } // year-as-amount
			]
		}))
		expect(out.length).toBe(1)
		expect(out[0].amount).toBe(5_000_000_000)
	})

	test("bad period_end falls back to the filing's report_date", async () => {
		const out = await catalogSoftLayer(META, "text", async () => ({
			entries: [{ ...good, period_end: "Q4 FY24" }]
		}))
		expect(out[0].period_end).toBe("2024-06-30")
	})
})

describe("pickResultsDocs", () => {
	test("no docs → no classify call", async () => {
		let called = false
		const out = await pickResultsDocs([], async () => ((called = true), [0]))
		expect(out).toEqual([])
		expect(called).toBe(false)
	})
})

describe("extractSixKFigures", () => {
	const fig = (over: Partial<RawSixKFigure>): RawSixKFigure => ({
		concept: "revenue",
		value: 7691.7,
		scale: "millions",
		currency: "EUR",
		period_start: "2026-03-30",
		period_end: "2026-06-28",
		...over
	})

	test("keeps only 1%-agreement figures; disagreements surfaced, never averaged", async () => {
		const passes = [
			{ figures: [fig({}), fig({ concept: "net_income", value: 2918 })] },
			{ figures: [fig({ value: 7691.7001 }), fig({ concept: "net_income", value: 3500 })] }
		]
		let i = 0
		const { entries, disagreements } = await extractSixKFigures(META, "statements.htm", "text", async () => passes[i++])
		expect(entries.length).toBe(1)
		expect(entries[0]).toMatchObject({
			amount: 7_691_700_000, // pass A's value, code-expanded
			value_type: "currency",
			unit: "EUR",
			kind: "revenue",
			certainty: "actual",
			taxonomy_tag: "6k:revenue",
			source_location: "6k:statements.htm",
			origin: "ai"
		})
		expect(disagreements).toEqual([
			{ concept: "net_income", period_end: "2026-06-28", values: [2_918_000_000, 3_500_000_000] }
		])
	})

	test("a scale disagreement between passes is dropped and surfaced — the shared-multiplication hole is closed", async () => {
		const passes = [
			{ figures: [fig({ value: 5596.1, scale: "millions" })] },
			{ figures: [fig({ value: 5596.1, scale: "thousands" })] }
		]
		let i = 0
		const { entries, disagreements } = await extractSixKFigures(META, "d.htm", "text", async () => passes[i++])
		expect(entries.length).toBe(0)
		expect(disagreements).toEqual([
			{ concept: "revenue", period_end: "2026-06-28", values: [5_596_100_000, 5_596_100] }
		])
	})

	test("one-pass-only, zero, and unscaled figures are dropped; instants get null period_start", async () => {
		const cash = fig({ concept: "cash", value: 7582, period_start: "2026-06-28", period_end: "2026-06-28" })
		const passes = [
			{ figures: [cash, fig({ concept: "capex" }), fig({ concept: "ocf", value: 0 }), fig({ concept: "inventory", scale: "" })] },
			{ figures: [cash] }
		]
		let i = 0
		const { entries, disagreements } = await extractSixKFigures(META, "d.htm", "text", async () => passes[i++])
		expect(entries.length).toBe(1)
		expect(entries[0].period_start).toBeNull()
		expect(entries[0].amount).toBe(7_582_000_000)
		expect(entries[0].kind).toBe("context")
		expect(disagreements).toEqual([])
	})
})

describe("noteConsistent", () => {
	test("exactly-one-quantity notes bound the amount to 100x either way", () => {
		expect(noteConsistent(5_000_000_000_000, "a $5.0 billion facility")).toBe(false)
		expect(noteConsistent(5_000_000_000, "a $5.0 billion facility")).toBe(true)
		expect(noteConsistent(2025, "the $1.25 billion notes are due 2025")).toBe(false)
	})
	test("zero or many quantities never reject", () => {
		expect(noteConsistent(123, "no monetary language here")).toBe(true)
		expect(noteConsistent(123, "$344 million for the quarter and $1.5 billion for nine months")).toBe(true)
		expect(noteConsistent(9e14, null)).toBe(true)
	})
})
