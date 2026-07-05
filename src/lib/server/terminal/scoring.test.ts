import { describe, test, expect } from "bun:test"
import {
	scoreToGrade,
	scoreDimension,
	applyScreenCaps,
	computeConfidence,
	computeComposite,
	contentHash,
	evidenceHash,
	computeTrend,
	gradeDimension,
	COMPANY_CONTROLLED_DOMAINS
} from "./scoring"
import type {
	Citation,
	Confidence,
	DimensionGrade,
	DimensionId,
	EvidenceItem,
	ScreenHit,
	SignalFinding
} from "$lib/types/terminal"
import type { RubricFramework } from "./rubrics/schema"

// ── Inline fixtures (do NOT depend on rubrics/F*.json — WP0.2 runs in parallel) ─

const framework = (
	id: DimensionId,
	signals: { id: string; weight: number }[],
	extra: Partial<RubricFramework> = {}
): RubricFramework => ({
	version: "1.0.0",
	id,
	name: `${id} test`,
	question: "q?",
	weight: 1,
	signals: signals.map((s) => ({
		id: s.id,
		description: "d",
		polarity: "both",
		weight: s.weight,
		recipe: { primitive: "search", query_template: "x" }
	})),
	grade_anchors: { A: "a", C: "c", F: "f" },
	false_signals: [],
	evidence_policy: { min_sources: 5, min_independent: 2, recency_days: 365 },
	...extra
})

// one signal, weight 1.0 → clean math: 55 + dir*strength*1*15
const fw1 = framework("F1", [{ id: "s1", weight: 1 }])

const cite = (domain: string, url = `https://${domain}/a`): Citation => ({
	url,
	title: null,
	source_domain: domain,
	published_at: null,
	snippet: null
})

const finding = (over: Partial<SignalFinding> = {}): SignalFinding => ({
	signal_id: "s1",
	direction: "supports",
	strength: 1,
	summary: "s",
	citations: [cite("reuters.com")],
	...over
})

const hit = (action: ScreenHit["action"], status: ScreenHit["status"]): ScreenHit => ({
	pattern_id: "p",
	status,
	summary: "s",
	detail: "d",
	citations: [],
	action
})

const item = (over: Partial<EvidenceItem> = {}): EvidenceItem => ({
	url: "https://reuters.com/a",
	title: null,
	source_domain: "reuters.com",
	published_at: null,
	snippet: null,
	id: crypto.randomUUID(),
	content_hash: "h",
	origin: "report_run",
	dimensions: ["F1"],
	company_controlled: false,
	...over
})

// ── Rule 1: bands + modifiers ────────────────────────────────────────────────

describe("scoreToGrade — band edges", () => {
	test("39 → F, 40 → D", () => {
		expect(scoreToGrade(39)).toBe("F")
		expect(scoreToGrade(40)).toBe("D-")
	})
	test("54 → D, 55 → C", () => {
		expect(scoreToGrade(54)).toBe("D+")
		expect(scoreToGrade(55)).toBe("C-")
	})
	test("69 → C, 70 → B", () => {
		expect(scoreToGrade(69)).toBe("C+")
		expect(scoreToGrade(70)).toBe("B-")
	})
	test("84 → B, 85 → A", () => {
		expect(scoreToGrade(84)).toBe("B+")
		expect(scoreToGrade(85)).toBe("A-")
	})
	test("100 → A+", () => {
		expect(scoreToGrade(100)).toBe("A+")
	})
})

describe("scoreToGrade — modifier thirds", () => {
	// C band = [55,70): lower [55,60)→C-, middle [60,65)→C, upper [65,70)→C+
	test("lower/middle boundary at +5 (59 vs 60)", () => {
		expect(scoreToGrade(59)).toBe("C-")
		expect(scoreToGrade(60)).toBe("C")
	})
	test("middle/upper boundary at +10 (64 vs 65)", () => {
		expect(scoreToGrade(64)).toBe("C")
		expect(scoreToGrade(65)).toBe("C+")
	})
	test("F carries no modifier at any score", () => {
		for (const s of [0, 10, 20, 39]) expect(scoreToGrade(s)).toBe("F")
	})
})

// ── Rule 2 + 4: dimension score ──────────────────────────────────────────────

describe("scoreDimension", () => {
	test("no findings → base 55", () => {
		expect(scoreDimension([], fw1)).toBe(55)
	})
	test("supports strength 1, weight 1 → 55 + 15 = 70", () => {
		expect(scoreDimension([finding()], fw1)).toBe(70)
	})
	test("supports strength 2 → 55 + 30 = 85; undermines strength 3 → 55 - 45 = 10", () => {
		expect(scoreDimension([finding({ strength: 2 })], fw1)).toBe(85)
		expect(scoreDimension([finding({ direction: "undermines", strength: 3 })], fw1)).toBe(10)
	})
	test("zero-citation findings are discarded before scoring", () => {
		expect(scoreDimension([finding({ citations: [] })], fw1)).toBe(55)
	})
	test("neutral direction never moves the score", () => {
		expect(scoreDimension([finding({ direction: "neutral", strength: 3 })], fw1)).toBe(55)
	})
	test("unknown signal_id contributes nothing", () => {
		expect(scoreDimension([finding({ signal_id: "nope" })], fw1)).toBe(55)
	})

	// §2.5.4 independence downgrade
	test("all-company-controlled positive → downgraded to neutral (55)", () => {
		const f = finding({ citations: [cite("prnewswire.com"), cite("businesswire.com")] })
		expect(scoreDimension([f], fw1)).toBe(55)
	})
	test("mixed citations → supports still counts (70)", () => {
		const f = finding({ citations: [cite("prnewswire.com"), cite("reuters.com")] })
		expect(scoreDimension([f], fw1)).toBe(70)
	})
	test("company's own domain (passed in) counts as controlled → 55", () => {
		const f = finding({ citations: [cite("acme.com")] })
		expect(scoreDimension([f], fw1, new Set(["acme.com"]))).toBe(55)
	})
	test("all-controlled UNDERMINES still counts (independence only blocks positives)", () => {
		const f = finding({ direction: "undermines", strength: 1, citations: [cite("prnewswire.com")] })
		expect(scoreDimension([f], fw1)).toBe(40)
	})
})

// ── Rule 3: screen caps ──────────────────────────────────────────────────────

describe("applyScreenCaps", () => {
	test("confirmed cap:C → min(score, 69)", () => {
		expect(applyScreenCaps(85, [hit("cap:C", "confirmed")])).toBe(69)
		expect(applyScreenCaps(60, [hit("cap:C", "confirmed")])).toBe(60)
	})
	test("confirmed cap:D → min(score, 54)", () => {
		expect(applyScreenCaps(85, [hit("cap:D", "confirmed")])).toBe(54)
	})
	test("confirmed discount → score − 10", () => {
		expect(applyScreenCaps(85, [hit("discount", "confirmed")])).toBe(75)
	})
	test("suspected hits never cap", () => {
		expect(applyScreenCaps(85, [hit("cap:D", "suspected")])).toBe(85)
	})
	test("composite_cap:C does not touch the dimension score", () => {
		expect(applyScreenCaps(85, [hit("composite_cap:C", "confirmed")])).toBe(85)
	})
	test("discount then cap both apply; stricter cap wins", () => {
		// discount first (85→75), then cap:C ceiling 69 → 69
		expect(applyScreenCaps(85, [hit("discount", "confirmed"), hit("cap:C", "confirmed")])).toBe(69)
		// cap:C and cap:D → stricter (54)
		expect(applyScreenCaps(85, [hit("cap:C", "confirmed"), hit("cap:D", "confirmed")])).toBe(54)
	})
})

// ── Rule 6: confidence ───────────────────────────────────────────────────────

describe("computeConfidence", () => {
	const policy = { recency_days: 365 }
	const now = Date.parse("2026-07-04")

	const many = (n: number, independentDomains: number, recentCount: number): EvidenceItem[] => {
		const arr: EvidenceItem[] = []
		for (let i = 0; i < n; i++) {
			const independent = i < independentDomains
			arr.push(
				item({
					company_controlled: !independent,
					source_domain: independent ? `indep${i}.com` : "prnewswire.com",
					published_at: i < recentCount ? "2026-06-01" : "2020-01-01"
				})
			)
		}
		return arr
	}

	test("high edge: 8 items, 3 independent domains, 50% recent", () => {
		expect(computeConfidence(many(8, 3, 4), policy, now)).toBe("high")
	})
	test("7 items (below 8) drops to medium", () => {
		expect(computeConfidence(many(7, 3, 4), policy, now)).toBe("medium")
	})
	test("8 items but <50% recent drops to medium", () => {
		expect(computeConfidence(many(8, 3, 3), policy, now)).toBe("medium")
	})
	test("medium edge: 4 items, 2 independent", () => {
		expect(computeConfidence(many(4, 2, 0), policy, now)).toBe("medium")
	})
	test("4 items, 1 independent → low", () => {
		expect(computeConfidence(many(4, 1, 0), policy, now)).toBe("low")
	})
	test("3 items → low", () => {
		expect(computeConfidence(many(3, 3, 3), policy, now)).toBe("low")
	})
	test("empty → low", () => {
		expect(computeConfidence([], policy, now)).toBe("low")
	})
})

// ── Rule 7: composite + veto ─────────────────────────────────────────────────

const grade = (
	dimension: DimensionId,
	score: number,
	confidence: Confidence = "high",
	flags: ScreenHit[] = []
): DimensionGrade => ({
	dimension,
	grade: scoreToGrade(score),
	score,
	confidence,
	trend: "new",
	flags,
	top_citations: [],
	summary: "",
	evidence_hash: "h",
	rubric_version: "1.0.0"
})

const nine = (f9score: number, others = 95, f9flags: ScreenHit[] = []): DimensionGrade[] => [
	grade("F1", others),
	grade("F2", others),
	grade("F3", others),
	grade("F4", others),
	grade("F5", others),
	grade("F6", others),
	grade("F7", others),
	grade("F8", others),
	grade("F9", f9score, "high", f9flags)
]

describe("computeComposite", () => {
	test("weighted mean uses F9=2, F3/F5=1.5, others=1", () => {
		const c = computeComposite(nine(95), "tech")
		expect(c.score).toBe(95) // all 95 → 95 regardless of weights
		expect(c.weights_used.F9).toBe(2)
		expect(c.weights_used.F3).toBe(1.5)
		expect(c.weights_used.F1).toBe(1)
	})

	test("F9 < 55 caps composite at 84 with veto_applied f9_cap", () => {
		const c = computeComposite(nine(54), "tech") // raw mean ≈ 88
		expect(c.score).toBe(84)
		expect(c.veto_applied).toBe("f9_cap")
		expect(c.red_banner).toBe(false)
	})

	test("F9 ≥ 55 does not veto", () => {
		const c = computeComposite(nine(55), "tech")
		expect(c.veto_applied).toBeNull()
	})

	test("confirmed composite_cap:C → 69 + red_banner + veto red_flag_cap", () => {
		const c = computeComposite(nine(95, 95, [hit("composite_cap:C", "confirmed")]), "tech")
		expect(c.score).toBe(69)
		expect(c.red_banner).toBe(true)
		expect(c.veto_applied).toBe("red_flag_cap")
	})

	test("suspected composite_cap:C does not cap", () => {
		const c = computeComposite(nine(95, 95, [hit("composite_cap:C", "suspected")]), "tech")
		expect(c.red_banner).toBe(false)
		expect(c.veto_applied).toBeNull()
	})

	test("composite confidence = median, never above F9's", () => {
		// all high except F9 low → median is high, but F9 caps it to low
		const c = computeComposite(nine(90, 90).map((g) => (g.dimension === "F9" ? { ...g, confidence: "low" as Confidence } : g)), null)
		expect(c.confidence).toBe("low")
	})

	test("median confidence when F9 is high", () => {
		// five low, four high (F9 high) → lower-median = low; F9 high does not raise it
		const grades = nine(90).map((g, i) => ({ ...g, confidence: (i < 5 ? "low" : "high") as Confidence }))
		// ensure F9 (index 8) is high
		const c = computeComposite(grades, null)
		expect(c.confidence).toBe("low")
	})
})

// ── Rule 5: hashes ───────────────────────────────────────────────────────────

describe("contentHash", () => {
	test("normalizes snippet: case + whitespace collapse are equal", async () => {
		const a = await contentHash({ url: "u", published_at: "2026-01-01", snippet: "Hello   World" })
		const b = await contentHash({ url: "u", published_at: "2026-01-01", snippet: "hello world" })
		expect(a).toBe(b)
	})
	test("one snippet char change → different hash", async () => {
		const a = await contentHash({ url: "u", published_at: null, snippet: "hello world" })
		const b = await contentHash({ url: "u", published_at: null, snippet: "hellq world" })
		expect(a).not.toBe(b)
	})
})

describe("evidenceHash", () => {
	test("same items any order ⇒ same hash", async () => {
		const items = [{ content_hash: "aaa" }, { content_hash: "bbb" }, { content_hash: "ccc" }]
		const forward = await evidenceHash("F1", "1.0.0", items)
		const reversed = await evidenceHash("F1", "1.0.0", [...items].reverse())
		expect(forward).toBe(reversed)
	})
	test("one content hash change ⇒ different evidence hash", async () => {
		const a = await evidenceHash("F1", "1.0.0", [{ content_hash: "aaa" }, { content_hash: "bbb" }])
		const b = await evidenceHash("F1", "1.0.0", [{ content_hash: "aaa" }, { content_hash: "bbX" }])
		expect(a).not.toBe(b)
	})
	test("rubric version participates in the hash", async () => {
		const a = await evidenceHash("F1", "1.0.0", [{ content_hash: "aaa" }])
		const b = await evidenceHash("F1", "1.1.0", [{ content_hash: "aaa" }])
		expect(a).not.toBe(b)
	})
	test("end-to-end: snippet change flows through content hash to evidence hash", async () => {
		const mk = async (snippet: string) => ({
			content_hash: await contentHash({ url: "u", published_at: null, snippet })
		})
		const base = await evidenceHash("F1", "1.0.0", [await mk("alpha"), await mk("beta")])
		const changed = await evidenceHash("F1", "1.0.0", [await mk("alpha"), await mk("betX")])
		expect(base).not.toBe(changed)
	})
})

// ── Rule 8: trend ────────────────────────────────────────────────────────────

describe("computeTrend", () => {
	test("no prior → new", () => {
		expect(computeTrend(70, null)).toBe("new")
	})
	test("delta +3 → up, +2 → flat", () => {
		expect(computeTrend(58, 55)).toBe("up")
		expect(computeTrend(57, 55)).toBe("flat")
	})
	test("delta -3 → down, -2 → flat", () => {
		expect(computeTrend(52, 55)).toBe("down")
		expect(computeTrend(53, 55)).toBe("flat")
	})
})

// ── COMPANY_CONTROLLED_DOMAINS const ─────────────────────────────────────────

describe("COMPANY_CONTROLLED_DOMAINS", () => {
	test("includes the five PR wires from §2.5.4", () => {
		for (const d of [
			"prnewswire.com",
			"businesswire.com",
			"globenewswire.com",
			"newswire.ca",
			"accesswire.com"
		])
			expect(COMPANY_CONTROLLED_DOMAINS.has(d)).toBe(true)
	})
})

// ── gradeDimension: orchestration, LLM injectable, numbers unaffected by prose ─

describe("gradeDimension", () => {
	const stubWriter = async () => "STUB SUMMARY"

	test("orchestrates pure parts; LLM only writes the summary", async () => {
		const g = await gradeDimension(
			{
				dimension: "F1",
				findings: [finding({ strength: 2 })], // 55 + 30 = 85
				screen_hits: [hit("cap:C", "confirmed")], // → min(85,69) = 69
				evidence_items: [item()],
				searches_run: 1
			},
			fw1,
			null,
			stubWriter
		)
		expect(g.score).toBe(69) // cap applied by code
		expect(g.grade).toBe("C+")
		expect(g.summary).toBe("STUB SUMMARY")
		expect(g.rubric_version).toBe("1.0.0")
		expect(g.evidence_hash).toMatch(/^[0-9a-f]{64}$/)
		expect(g.flags).toHaveLength(1)
	})

	test("uses prior score for trend", async () => {
		const prior = grade("F1", 55)
		const g = await gradeDimension(
			{
				dimension: "F1",
				findings: [finding({ strength: 2 })], // → 85
				screen_hits: [],
				evidence_items: [item()],
				searches_run: 1
			},
			fw1,
			prior,
			stubWriter
		)
		expect(g.score).toBe(85)
		expect(g.trend).toBe("up") // 85 vs 55
	})

	test("company-controlled evidence items feed the independence downgrade", async () => {
		const g = await gradeDimension(
			{
				dimension: "F1",
				findings: [finding({ strength: 2, citations: [cite("acme.com")] })],
				screen_hits: [],
				// acme.com marked company_controlled → supports downgraded → stays 55
				evidence_items: [item({ source_domain: "acme.com", company_controlled: true })],
				searches_run: 1
			},
			fw1,
			null,
			stubWriter
		)
		expect(g.score).toBe(55)
	})
})
