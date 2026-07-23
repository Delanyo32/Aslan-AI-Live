import { describe, test, expect } from "bun:test"
import { impliedGrowth, reconcilePrice, type BucketCaller } from "./reconcile"
import { checkLanguageCompliance } from "./synthesis"
import type { CompositeScore, DimensionGrade, DimensionId, ExtractedFigure, ExtractionResult } from "$lib/types/terminal"
import type { OHLCVBar } from "$lib/types/pipeline"
import type { Company } from "./index"

// ── impliedGrowth (pure) ─────────────────────────────────────────────────────

describe("impliedGrowth", () => {
	// Hand-checkable: with revenue 100, margin 0.10, r=0.10, tg=0.025, years=10,
	// the DCF at g=0 is 61.44567 (annuity) + 52.68759 (discounted Gordon TV) =
	// 114.13326. Feeding that EV back must solve to g ≈ 0.
	test("EV = PV at g=0 solves to ~0", () => {
		const g = impliedGrowth(114.1332573, 100, 0.1)
		expect(g).not.toBeNull()
		expect(Math.abs(g!)).toBeLessThan(1e-3)
	})

	test("monotonic: higher EV ⇒ higher implied growth", () => {
		const low = impliedGrowth(90, 100, 0.1)!
		const mid = impliedGrowth(114.13, 100, 0.1)!
		const high = impliedGrowth(200, 100, 0.1)!
		expect(low).toBeLessThan(mid)
		expect(mid).toBeLessThan(high)
	})

	test("degenerate inputs return null", () => {
		expect(impliedGrowth(0, 100, 0.1)).toBeNull() // zero EV
		expect(impliedGrowth(-5, 100, 0.1)).toBeNull() // negative EV
		expect(impliedGrowth(100, 0, 0.1)).toBeNull() // zero revenue
		expect(impliedGrowth(100, 100, 0)).toBeNull() // zero margin
		expect(impliedGrowth(100, 100, -0.1)).toBeNull() // negative margin (loss-making)
	})

	test("EV outside the [-0.5, 3.0] bracket returns null", () => {
		expect(impliedGrowth(1, 100, 0.1)).toBeNull() // below DCF(-0.5)
		expect(impliedGrowth(1e11, 100, 0.1)).toBeNull() // above DCF(3.0)
	})

	test("respects opts overrides", () => {
		// A higher discount rate lowers every PV, so the same EV implies more growth.
		const base = impliedGrowth(200, 100, 0.1, { discountRate: 0.1 })!
		const steeper = impliedGrowth(200, 100, 0.1, { discountRate: 0.15 })!
		expect(steeper).toBeGreaterThan(base)
	})
})

// ── reconcilePrice fixtures ──────────────────────────────────────────────────

const fig = (name: string, value: number, unit: string, period = "FY2025"): ExtractedFigure => ({
	name,
	value,
	unit,
	period,
	source_url: `https://sec.gov/${name}`,
	filing_date: "2026-02-01",
	passes_agree: true
})

const extraction = (figures: ExtractedFigure[], confidence: ExtractionResult["confidence"] = "high"): ExtractionResult => ({
	figures,
	disagreements: [],
	confidence
})

const FULL_FIGURES = [
	fig("revenue", 100_000_000, "USD"),
	fig("share_count", 10_000_000, "shares"),
	fig("net_debt", 20_000_000, "USD"),
	fig("fcf", 15_000_000, "USD")
]

const usCompany = { name: "Acme Corp", ticker: "ACME", is_us: true, alpaca_symbol: "ACME" } as unknown as Company
const nonUsCompany = { name: "Taiwan Semi", ticker: "TSM", is_us: false, alpaca_symbol: null } as unknown as Company

const composite: CompositeScore = {
	grade: "C",
	score: 55,
	confidence: "medium",
	veto_applied: null,
	red_banner: false,
	weights_used: {} as Record<DimensionId, number>
}

const grade = (dimension: DimensionId, g: string, citations: DimensionGrade["top_citations"] = []): DimensionGrade => ({
	dimension,
	grade: g,
	score: 55,
	confidence: "medium",
	trend: "flat",
	flags: [],
	top_citations: citations,
	summary: "s",
	evidence_hash: "h",
	rubric_version: "1.0.0"
})

const grades: DimensionGrade[] = [grade("F1", "C"), grade("F9", "D")]

// An injected OHLCV source with no qualifying moves (keeps timeline empty/best-effort).
const flatOHLCV = async (): Promise<OHLCVBar[]> => []
// Deterministic clean bucket caller.
const cleanCaller: BucketCaller = async (input) => ({
	bucket: "priced_for_more",
	sentence: `The price implies demanding growth against weak dimension grades${input.confidence === "low" ? " (low confidence)" : ""}.`
})

const baseDeps = { fetchOHLCV: flatOHLCV, fetchSnapshot: async () => 50, bucketCaller: cleanCaller }

describe("reconcilePrice", () => {
	test("non-US company returns null (US verdicts only)", async () => {
		expect(await reconcilePrice(nonUsCompany, extraction(FULL_FIGURES), composite, grades, baseDeps)).toBeNull()
	})

	test("full US fixture: implied set, bucket in enum, multiples computed", async () => {
		const v = (await reconcilePrice(usCompany, extraction(FULL_FIGURES), composite, grades, baseDeps))!
		expect(v).not.toBeNull()
		expect(["priced_for_more", "roughly_priced", "priced_for_less"]).toContain(v.bucket)
		expect(v.implied).not.toBeNull()
		expect(v.implied!.discount_rate).toBe(0.1)
		expect(v.implied!.fcf_margin_scenario).toBeCloseTo(0.15, 5) // 15M / 100M
		// mcap = 50 * 10M = 500M, EV = 520M, EV/Revenue = 5.2
		expect(v.multiples.find((m) => m.name === "EV/Revenue")!.value).toBeCloseTo(5.2, 5)
		// P/FCF = 500M / 15M = 33.33
		expect(v.multiples.find((m) => m.name === "P/FCF")!.value).toBeCloseTo(33.33, 1)
		expect(v.multiples.every((m) => m.peer_median === null)).toBe(true)
	})

	test("missing share_count ⇒ implied null, low confidence, sentence names the gap", async () => {
		const noShares = FULL_FIGURES.filter((f) => f.name !== "share_count")
		const v = (await reconcilePrice(usCompany, extraction(noShares, "high"), composite, grades, baseDeps))!
		expect(v.implied).toBeNull()
		expect(v.confidence).toBe("low")
		expect(v.sentence).toContain("share_count")
	})

	test("assumed net_debt lowers confidence to medium", async () => {
		const noNetDebt = FULL_FIGURES.filter((f) => f.name !== "net_debt")
		// extraction confidence "high" must be capped to "medium" because net_debt is assumed.
		const v = (await reconcilePrice(usCompany, extraction(noNetDebt, "high"), composite, grades, baseDeps))!
		expect(v.confidence).toBe("medium")
		expect(v.implied).not.toBeNull() // net_debt assumed 0, still solvable
	})

	test("LLM violation falls back to the code-templated sentence after one retry", async () => {
		let calls = 0
		const bad: BucketCaller = async () => {
			calls++
			return { bucket: "priced_for_more", sentence: "This is fraud and a scheme." }
		}
		const v = (await reconcilePrice(usCompany, extraction(FULL_FIGURES), composite, grades, {
			...baseDeps,
			bucketCaller: bad
		}))!
		expect(calls).toBe(2) // one attempt + one retry
		expect(checkLanguageCompliance(v.sentence)).toEqual([]) // fallback is compliant
		expect(v.sentence).not.toContain("fraud")
		expect(v.sentence).toContain("composite evidence grade of C")
		expect(v.bucket).toBe("priced_for_more") // model's bucket kept
	})

	test("garbage bucket from the model is coerced into the enum", async () => {
		const junk: BucketCaller = async () => ({ bucket: "wildly_overpriced" as never, sentence: "A neutral cited read." })
		const v = (await reconcilePrice(usCompany, extraction(FULL_FIGURES), composite, grades, {
			...baseDeps,
			bucketCaller: junk
		}))!
		expect(v.bucket).toBe("roughly_priced")
	})

	test("timeline attaches CAR + evidence within the ±2-day window", async () => {
		const now = Date.parse("2026-06-30")
		// Ticker jumps +10% on 2026-06-03; SPY flat, so CAR on that day ≈ +0.10.
		const bar = (date: string, close: number): OHLCVBar => ({ date, open: close, high: close, low: close, close, volume: 1 })
		const ohlcv = async (symbol: string): Promise<OHLCVBar[]> =>
			symbol === "SPY"
				? [bar("2026-06-01", 100), bar("2026-06-02", 100), bar("2026-06-03", 100), bar("2026-06-04", 100)]
				: [bar("2026-06-01", 100), bar("2026-06-02", 100), bar("2026-06-03", 110), bar("2026-06-04", 110)]

		const cited = grade("F1", "C", [
			{ url: "https://reuters.com/a", title: "Guidance cut", source_domain: "reuters.com", published_at: "2026-06-03", snippet: null }
		])
		const v = (await reconcilePrice(usCompany, extraction(FULL_FIGURES), composite, [cited, grade("F9", "D")], {
			...baseDeps,
			fetchOHLCV: ohlcv,
			now
		}))!

		expect(v.timeline).toBeDefined()
		const entry = v.timeline!.find((t) => t.date === "2026-06-03")!
		expect(entry).toBeDefined()
		expect(entry.move_pct).toBeCloseTo(10, 5)
		expect(entry.car).toBeCloseTo(0.1, 5)
		expect(entry.evidence.map((c) => c.url)).toContain("https://reuters.com/a")
	})

	test("Alpaca timeline failure omits the field but still ships a verdict", async () => {
		const boom = async () => {
			throw new Error("alpaca down")
		}
		const v = (await reconcilePrice(usCompany, extraction(FULL_FIGURES), composite, grades, {
			...baseDeps,
			fetchOHLCV: boom
		}))!
		expect(v.timeline).toBeUndefined()
		expect(v.implied).not.toBeNull()
	})

	test("US run persists a price series + graded price for the chart", async () => {
		const bar = (date: string, close: number): OHLCVBar => ({ date, open: close, high: close, low: close, close, volume: 1 })
		const bars = [bar("2026-06-01", 40), bar("2026-06-02", 45), bar("2026-06-03", 50)]
		const v = (await reconcilePrice(usCompany, extraction(FULL_FIGURES), composite, grades, {
			...baseDeps,
			fetchOHLCV: async () => bars,
			fetchSnapshot: async () => 50
		}))!
		expect(v.price_series).toEqual([
			{ date: "2026-06-01", close: 40 },
			{ date: "2026-06-02", close: 45 },
			{ date: "2026-06-03", close: 50 }
		])
		expect(v.graded_price).toBe(50) // live snapshot overrides last close
		expect(v.graded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	})

	test("empty OHLCV ⇒ no price series (chart stays hidden)", async () => {
		const v = (await reconcilePrice(usCompany, extraction(FULL_FIGURES), composite, grades, baseDeps))!
		expect(v.price_series).toBeUndefined()
	})

	test("non-US company stores no price series (verdict is null)", async () => {
		expect(await reconcilePrice(nonUsCompany, extraction(FULL_FIGURES), composite, grades, baseDeps)).toBeNull()
	})
})
