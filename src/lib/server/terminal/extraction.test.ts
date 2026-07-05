import { describe, test, expect } from "bun:test"
import {
	extractFundamentals,
	EXTRACTION_PASSES,
	type ExaCaller,
	type ExtractionLLM
} from "./extraction"
import { buildContentsRequest, type ExaResults } from "./exa"
import type { Company } from "$lib/types/terminal"

const COMPANY = { name: "Acme Corp", ticker: "ACME" } as unknown as Company
const URL = "https://sec.gov/acme-10k"

type Raw = { name: string; value: number; unit: string; period: string }

const fullSet = (): Raw[] => [
	{ name: "revenue", value: 1000, unit: "USD", period: "FY2025" },
	{ name: "gross_margin", value: 45, unit: "%", period: "FY2025" },
	{ name: "operating_margin", value: 30, unit: "%", period: "FY2025" },
	{ name: "fcf", value: 200, unit: "USD", period: "FY2025" },
	{ name: "ocf", value: 250, unit: "USD", period: "FY2025" },
	{ name: "net_income", value: 180, unit: "USD", period: "FY2025" },
	{ name: "net_debt", value: -50, unit: "USD", period: "FY2025" },
	{ name: "share_count", value: 500, unit: "shares", period: "FY2025" },
	{ name: "sbc", value: 20, unit: "USD", period: "FY2025" }
]

// Fixture Exa: search returns one filing URL; contents returns that page's text.
function makeExa(url: string | undefined = URL): ExaCaller {
	return {
		search: async () => ({ results: url ? [{ url, title: "acme-10k" }] : [] }) as ExaResults,
		contents: async () =>
			({
				results: [{ url: url as string, title: null, publishedDate: "2026-02-01", text: "ACME FILING TEXT" }]
			}) as ExaResults
	}
}

// Fixture LLM: pass A gets set `a`, pass B gets set `b`.
const makeLlm =
	(a: Raw[], b: Raw[]): ExtractionLLM =>
	async (pass) => ({ figures: pass === EXTRACTION_PASSES[1] ? b : a })

const run = (a: Raw[], b: Raw[], url?: string) =>
	extractFundamentals(COMPANY, makeExa(url), makeLlm(a, b))

describe("extractFundamentals double extraction", () => {
	test("identical passes agree: 9 figures, all passes_agree, sourced, high confidence", async () => {
		const res = await run(fullSet(), fullSet())
		expect(res.figures).toHaveLength(9)
		expect(res.figures.every((f) => f.passes_agree)).toBe(true)
		expect(res.figures.every((f) => f.source_url === URL)).toBe(true)
		expect(res.figures.every((f) => f.filing_date === "2026-02-01")).toBe(true)
		expect(res.disagreements).toHaveLength(0)
		expect(res.dropped_unsourced).toBe(0)
		expect(res.confidence).toBe("high")
	})

	test("within 1% agrees and keeps the FIRST value (never averaged)", async () => {
		const b = fullSet()
		b[0].value = 1005 // revenue +0.5%
		const res = await run(fullSet(), b)
		const rev = res.figures.find((f) => f.name === "revenue")
		expect(rev?.value).toBe(1000) // first value kept, not 1002.5
		expect(rev?.passes_agree).toBe(true)
		expect(res.confidence).toBe("high")
	})

	test("3% core disagreement → excluded from figures, listed, confidence low", async () => {
		const b = fullSet()
		b[0].value = 1030 // revenue +3%
		const res = await run(fullSet(), b)
		expect(res.figures.find((f) => f.name === "revenue")).toBeUndefined()
		expect(res.disagreements).toContainEqual({
			name: "revenue",
			period: "FY2025",
			values: [1000, 1030],
			sources: [URL, URL]
		})
		expect(res.confidence).toBe("low")
	})

	test("3% non-core disagreement → confidence medium (core still agree)", async () => {
		const b = fullSet()
		b[1].value = 46.5 // gross_margin +3.3%
		const res = await run(fullSet(), b)
		expect(res.figures.find((f) => f.name === "gross_margin")).toBeUndefined()
		expect(res.disagreements.map((d) => d.name)).toContain("gross_margin")
		expect(res.confidence).toBe("medium")
	})

	test("missing core figure in one pass → dropped and confidence low", async () => {
		const b = fullSet().filter((f) => f.name !== "share_count") // share_count only in pass A
		const res = await run(fullSet(), b)
		expect(res.figures.find((f) => f.name === "share_count")).toBeUndefined()
		expect(res.confidence).toBe("low")
	})

	describe("zero is not-found, never agreement (WP1.4b)", () => {
		test("0 in BOTH passes → figure missing, not a spuriously agreed zero", async () => {
			const a = fullSet()
			const b = fullSet()
			a[6].value = 0 // net_debt "not found" in both passes
			b[6].value = 0
			const res = await run(a, b)
			expect(res.figures.find((f) => f.name === "net_debt")).toBeUndefined()
			expect(res.disagreements).toHaveLength(0)
			expect(res.confidence).toBe("medium") // non-core missing
		})

		test("0 in one pass → missing, never a disagreement with the real value", async () => {
			const a = fullSet()
			a[0].value = 0 // revenue "not found" in pass A only (core)
			const res = await run(a, fullSet())
			expect(res.figures.find((f) => f.name === "revenue")).toBeUndefined()
			expect(res.disagreements).toHaveLength(0)
			expect(res.confidence).toBe("low") // core missing
		})
	})

	describe("period pinning to the latest annual filing (WP1.4b)", () => {
		test("prior-year comparatives are excluded; only the newest FY ships", async () => {
			const withComparatives = [
				...fullSet(),
				{ name: "revenue", value: 900, unit: "USD", period: "FY2024" },
				{ name: "net_income", value: 150, unit: "USD", period: "FY2023" }
			]
			const res = await run(withComparatives, withComparatives)
			expect(res.figures).toHaveLength(9)
			expect(res.figures.every((f) => f.period === "FY2025")).toBe(true)
			expect(res.figures.find((f) => f.name === "revenue")?.value).toBe(1000)
			expect(res.confidence).toBe("high")
		})

		test("quarterly-labeled rows are dropped, never silently mixed", async () => {
			const withQuarters = [
				...fullSet(),
				{ name: "revenue", value: 260, unit: "USD", period: "Q1-2026" },
				{ name: "ocf", value: 60, unit: "USD", period: "Three Months Ended June 28, 2025" }
			]
			const res = await run(withQuarters, withQuarters)
			expect(res.figures).toHaveLength(9)
			expect(res.figures.every((f) => f.period === "FY2025")).toBe(true)
			expect(res.figures.find((f) => f.name === "revenue")?.value).toBe(1000)
		})

		test("FY spelling variants normalize and pair (FY 2025, fy2025, FY25)", async () => {
			const b = fullSet()
			b[0].period = "FY 2025"
			b[4].period = "fy2025"
			b[7].period = "FY25"
			const res = await run(fullSet(), b)
			expect(res.figures).toHaveLength(9)
			expect(res.figures.every((f) => f.period === "FY2025")).toBe(true)
			expect(res.confidence).toBe("high")
		})

		test("junk pages are excluded; the top 2 ranked docs are fetched as text", async () => {
			let contentsUrls: string[] = []
			let contentsOpts: Record<string, unknown> | undefined
			const exa: ExaCaller = {
				search: async () =>
					({
						results: [
							{ url: URL, title: "acme-20250927" }, // real 10-K doc, rank 1
							{ url: "https://sec.gov/cgi-bin/browse-edgar?type=10-K", title: "EDGAR Search Results" },
							{ url: "https://sec.gov/0000-25-000079-index.htm", title: "EDGAR Filing Documents" },
							{ url: "https://sec.gov/0000-25-000079.txt", title: "full dump" },
							{ url: "https://sec.gov/acme-def14a.htm", title: "Acme Proxy Statement" },
							{ url: "https://sec.gov/acme-20240928.htm", title: "acme-20240928" },
							{ url: "https://sec.gov/acme-20230924.htm", title: "one too many — beyond top 2" }
						]
					}) as ExaResults,
				contents: async (urls, opts) => {
					contentsUrls = urls
					contentsOpts = opts as Record<string, unknown>
					return { results: [{ url: URL, title: null, text: "FILING" }] } as ExaResults
				}
			}
			await extractFundamentals(COMPANY, exa, makeLlm(fullSet(), fullSet()))
			expect(contentsUrls).toEqual([URL, "https://sec.gov/acme-20240928.htm"])
			expect(contentsOpts?.contents).toBe("text")
		})
	})

	test("every emitted figure carries a source_url", async () => {
		const b = fullSet()
		b[0].value = 1030 // one disagreement present, rest sourced
		const res = await run(fullSet(), b)
		expect(res.figures.length).toBeGreaterThan(0)
		expect(res.figures.every((f) => typeof f.source_url === "string" && f.source_url.length > 0)).toBe(true)
	})

	test("figures from a page with no URL are dropped as unsourced", async () => {
		const exa: ExaCaller = {
			search: async () => ({ results: [{ url: URL, title: null }] }) as ExaResults,
			contents: async () => ({ results: [{ url: "", title: null, text: "FILING" }] }) as ExaResults
		}
		const res = await extractFundamentals(COMPANY, exa, makeLlm(fullSet(), fullSet()))
		expect(res.figures).toHaveLength(0)
		expect(res.disagreements).toHaveLength(0) // unsourced drops are NOT disagreements
		expect(res.dropped_unsourced).toBe(9) // distinct (name, period) figures dropped
		expect(res.confidence).toBe("low") // core figures all missing
	})
})

describe("the two passes are genuinely independent", () => {
	test("prompts differ", () => {
		expect(EXTRACTION_PASSES).toHaveLength(2)
		expect(EXTRACTION_PASSES[0].query).not.toBe(EXTRACTION_PASSES[1].query)
	})
	test("schema field descriptions differ", () => {
		expect(JSON.stringify(EXTRACTION_PASSES[0].schema)).not.toBe(JSON.stringify(EXTRACTION_PASSES[1].schema))
	})
})

// WP1.4 filing-text fetch relies on the textMaxCharacters passthrough (exa.ts).
test("buildContentsRequest supports text maxCharacters top-level", () => {
	const req = buildContentsRequest(["https://a.com"], { contents: "text", textMaxCharacters: 1_000_000 })
	expect(req.text).toEqual({ maxCharacters: 1_000_000 })
})
