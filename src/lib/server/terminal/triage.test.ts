import { describe, test, expect } from "bun:test"
import { triageEvidence, type RawTriageOutput, type TriageCaller } from "./triage"
import type { EvidenceItem } from "$lib/types/terminal"
import type { Company } from "./index"

const company = { name: "Acme Corp", ticker: "ACME", sector: "Technology" } as unknown as Company

function makeItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
	return {
		id: "e1",
		url: "https://example.com/x",
		title: "Acme launches Model X smartphone",
		source_domain: "example.com",
		published_at: "2026-06-01",
		snippet: "The company unveiled its new flagship device at a launch event.",
		content_hash: "h",
		origin: "monitor",
		dimensions: [],
		company_controlled: false,
		...overrides
	}
}

// A caller that returns a fixed raw output, ignoring the prompts.
const fixedCaller =
	(out: RawTriageOutput): TriageCaller =>
	async () =>
		out

const baseRaw: RawTriageOutput = {
	relevant: true,
	dimensions: ["F3"],
	materiality: "material",
	commitment: null,
	reason: "Coverage reports the company shipped a new device."
}

describe("triageEvidence", () => {
	test("valid result passes through unchanged", async () => {
		const r = await triageEvidence(company, makeItem(), fixedCaller(baseRaw))
		expect(r.relevant).toBe(true)
		expect(r.dimensions).toEqual(["F3"])
		expect(r.materiality).toBe("material")
		expect(r.commitment).toBeNull()
		expect(r.reason).toBe("Coverage reports the company shipped a new device.")
	})

	test("unknown dimension ids are dropped", async () => {
		const r = await triageEvidence(
			company,
			makeItem(),
			fixedCaller({ ...baseRaw, dimensions: ["F3", "F99", "banana", "F7"] })
		)
		expect(r.dimensions).toEqual(["F3", "F7"])
	})

	test("red_flag on a routine product-launch item downgrades to material", async () => {
		const r = await triageEvidence(
			company,
			makeItem(), // title/snippet contain no reserved-class keyword
			fixedCaller({ ...baseRaw, materiality: "red_flag" })
		)
		expect(r.materiality).toBe("material")
	})

	test("genuine auditor-resignation item keeps red_flag", async () => {
		const item = makeItem({
			title: "Acme's auditor resigns citing disagreement over revenue recognition",
			snippet: "The independent auditor stepped down ahead of the annual report."
		})
		const r = await triageEvidence(company, item, fixedCaller({ ...baseRaw, materiality: "red_flag", dimensions: ["F9"] }))
		expect(r.materiality).toBe("red_flag")
		expect(r.dimensions).toEqual(["F9"])
	})

	test("restatement / recall / investigation items also keep red_flag", async () => {
		const cases: string[] = [
			"Acme restates FY2025 financial statements",
			"Acme recalls 20,000 units over safety defect",
			"Regulator opens formal investigation into Acme"
		]
		for (const title of cases) {
			const r = await triageEvidence(company, makeItem({ title }), fixedCaller({ ...baseRaw, materiality: "red_flag" }))
			expect(r.materiality).toBe("red_flag")
		}
	})

	test("commitment extraction shape passes through", async () => {
		const commitment = { what: "ship the Model X in the EU", promised_date: "2026-09-30" }
		const r = await triageEvidence(company, makeItem(), fixedCaller({ ...baseRaw, commitment }))
		expect(r.commitment).toEqual(commitment)
	})

	test("commitment with a null date is preserved; empty 'what' collapses to null", async () => {
		const dated = await triageEvidence(
			company,
			makeItem(),
			fixedCaller({ ...baseRaw, commitment: { what: "open the Berlin plant", promised_date: null } })
		)
		expect(dated.commitment).toEqual({ what: "open the Berlin plant", promised_date: null })

		const empty = await triageEvidence(
			company,
			makeItem(),
			fixedCaller({ ...baseRaw, commitment: { what: "  ", promised_date: "2026-01-01" } })
		)
		expect(empty.commitment).toBeNull()
	})

	test("accusatory reason is replaced with a neutral, compliant line", async () => {
		const r = await triageEvidence(
			company,
			makeItem(),
			fixedCaller({ ...baseRaw, reason: "Management is hiding losses — this is fraud." })
		)
		expect(r.reason).not.toContain("fraud")
		expect(r.reason).not.toContain("hiding")
		// neutral template names the materiality + dimension scope
		expect(r.reason).toBe("material evidence for F3; see cited source")
	})

	test("LLM failure after one retry returns the fail-open fallback", async () => {
		const alwaysThrows: TriageCaller = async () => {
			throw new Error("boom")
		}
		const r = await triageEvidence(company, makeItem(), alwaysThrows)
		expect(r).toEqual({
			relevant: true,
			dimensions: [],
			materiality: "minor",
			commitment: null,
			reason: "triage unavailable — stored for next batch"
		})
	})

	test("a single transient failure is retried, not failed open", async () => {
		let calls = 0
		const flaky: TriageCaller = async () => {
			calls++
			if (calls === 1) throw new Error("transient")
			return baseRaw
		}
		const r = await triageEvidence(company, makeItem(), flaky)
		expect(calls).toBe(2)
		expect(r.materiality).toBe("material") // succeeded on retry, no fallback
	})
})
