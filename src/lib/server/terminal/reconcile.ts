// Reverse-DCF price reconciliation (WP3.1, SPEC v0.3 §3, invariants §5.2/§5.3).
//
// The market price is turned into the growth it implies (never compared to
// street estimates — §5.1). We compute EVERY number here — market cap, EV,
// implied growth, multiples — and the LLM only picks the verdict bucket and
// words one sentence from those numbers. US-listed only; non-US returns null
// (callers render "available for US listings"). Reconciliation must never kill
// a report run, so all external failures degrade to gaps, never throws.

import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import type {
	Citation,
	Company,
	CompositeScore,
	Confidence,
	DimensionGrade,
	ExtractionResult,
	ReconciliationVerdict
} from "$lib/types/terminal"
import type { OHLCVBar } from "$lib/types/pipeline"
import { TERMINAL_CONFIG } from "./config"
import { checkLanguageCompliance } from "./synthesis"
import { CONF_RANK, CONF_BY_RANK } from "./scoring"
import { computeCAR } from "../impact-window"
// alpaca-market-data reads $env/dynamic/private at module load (unavailable in
// unit tests), so it is lazy-imported only when a caller injects no fetcher.

const DISCOUNT_RATE = 0.1
const TERMINAL_GROWTH = 0.025
const YEARS = 10
const SPY = "SPY"

const BUCKETS = ["priced_for_more", "roughly_priced", "priced_for_less"] as const
type Bucket = ReconciliationVerdict["bucket"]

const minConf = (a: Confidence, b: Confidence): Confidence => CONF_BY_RANK[Math.min(CONF_RANK[a], CONF_RANK[b])]
const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 1e4) / 1e4

// ── impliedGrowth: pure bisection reverse-DCF ────────────────────────────────

/**
 * Solve for the revenue-growth rate g whose 10-year DCF equals `ev`:
 * revenue grows at g each year, FCF = revenue × margin, discounted at
 * `discountRate`, plus a Gordon terminal value on the year-`years` FCF.
 * DCF is monotonically increasing in g, so a plain bisection over [-0.5, 3.0]
 * finds it. Returns null when unsolvable: non-positive EV, revenue, or margin,
 * a non-positive Gordon denominator, or an EV that falls outside the bracket.
 */
export function impliedGrowth(
	ev: number,
	revenue: number,
	fcfMargin: number,
	opts: { discountRate?: number; years?: number; terminalGrowth?: number } = {}
): number | null {
	const discountRate = opts.discountRate ?? DISCOUNT_RATE
	const years = opts.years ?? YEARS
	const terminalGrowth = opts.terminalGrowth ?? TERMINAL_GROWTH

	if (!(ev > 0) || !(revenue > 0) || !(fcfMargin > 0)) return null
	if (discountRate <= terminalGrowth) return null // Gordon denominator must be positive

	const dcf = (g: number): number => {
		let pv = 0
		let rev = revenue
		let lastFcf = 0
		for (let t = 1; t <= years; t++) {
			rev *= 1 + g
			const fcf = rev * fcfMargin
			pv += fcf / Math.pow(1 + discountRate, t)
			lastFcf = fcf
		}
		const tv = (lastFcf * (1 + terminalGrowth)) / (discountRate - terminalGrowth)
		return pv + tv / Math.pow(1 + discountRate, years)
	}

	const LO = -0.5
	const HI = 3.0
	if (ev < dcf(LO) || ev > dcf(HI)) return null // outside the solvable bracket

	let a = LO
	let b = HI
	for (let i = 0; i < 100; i++) {
		const mid = (a + b) / 2
		const val = dcf(mid)
		if (Math.abs(val - ev) < ev * 1e-9) return mid
		if (val < ev) a = mid
		else b = mid
	}
	return (a + b) / 2
}

// ── figure selection: latest annual period ───────────────────────────────────

const yearOf = (period: string): number => {
	const m = period.match(/(\d{4})/)
	return m ? parseInt(m[1], 10) : 0
}
const isAnnual = (period: string): boolean => /^\s*FY/i.test(period)

/** Values for each figure name from the single latest annual (FY) period. */
function latestAnnualFigures(figures: ExtractionResult["figures"]): Map<string, number> {
	const annual = figures.filter((f) => isAnnual(f.period))
	const pool = annual.length ? annual : figures
	if (pool.length === 0) return new Map()
	const latestYear = Math.max(...pool.map((f) => yearOf(f.period)))
	const latest = pool.filter((f) => yearOf(f.period) === latestYear)
	const out = new Map<string, number>()
	for (const f of latest) if (!out.has(f.name)) out.set(f.name, f.value)
	return out
}

// ── verdict bucket + sentence (the ONE LLM call) ─────────────────────────────

type Scenario = { label: string; fcf_margin: number; revenue_growth_10y: number | null }

export type BucketInput = {
	company: { name: string; ticker: string }
	composite: { grade: string; score: number; confidence: Confidence }
	dimensions: { dimension: string; grade: string; confidence: Confidence }[]
	implied_scenarios: Scenario[]
	multiples: ReconciliationVerdict["multiples"]
	discount_rate: number
	net_debt_assumed: boolean
	confidence: Confidence
	retry_violations?: string[]
}
export type BucketOutput = { bucket: Bucket; sentence: string }
// Injectable so tests (and any offline caller) run without a network call.
export type BucketCaller = (input: BucketInput) => Promise<BucketOutput>

const coerceBucket = (b: string): Bucket =>
	(BUCKETS as readonly string[]).includes(b) ? (b as Bucket) : "roughly_priced"

const BUCKET_SYSTEM_PROMPT =
	"You reconcile a company's market price against the evidence for the Aslan Terminal. " +
	"Every number you are given (implied growth scenarios, multiples, grades) is FINAL and computed " +
	"by code — never restate a different number, invent one, or cite a street estimate, price target, " +
	"or analyst rating. Pick exactly one bucket:\n" +
	"- priced_for_more: the growth/margins the price implies look demanding relative to the evidence grades.\n" +
	"- roughly_priced: the implied assumptions look broadly consistent with the evidence.\n" +
	"- priced_for_less: the implied assumptions look conservative relative to the evidence.\n" +
	"Then write ONE sentence that names the specific weak dimensions (by their letter grade) driving the read. " +
	"If confidence is low, state that inline in the sentence. Write cited-observation tone — describe what the " +
	"numbers and grades show; never accuse, and use no banned framings (fraud, scheme, misleading accounting, etc.). " +
	"Call submit_verdict exactly once."

async function defaultBucketCaller(input: BucketInput): Promise<BucketOutput> {
	// Lazy import: ../ai reads $env at module load, unavailable in unit tests;
	// this path only runs when no caller is injected.
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_verdict",
		description: "Submit the price-reconciliation bucket and one sentence. Call exactly once.",
		parameters: Type.Object({
			bucket: Type.String({ description: "one of: priced_for_more, roughly_priced, priced_for_less" }),
			sentence: Type.String({
				description:
					"one sentence; name the specific weak dimensions by grade; state confidence inline if low; " +
					"cited-observation tone, never accusation; no price targets, estimates, or ratings"
			})
		})
	}
	const context: Context = {
		systemPrompt: BUCKET_SYSTEM_PROMPT,
		messages: [{ role: "user", content: JSON.stringify(input), timestamp: Date.now() }],
		tools: [submit]
	}
	const response = await complete(getAiModel(), context)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during reconcile verdict")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_verdict")
	if (!call) throw new Error("reconcile: model did not submit a verdict")
	const out = validateToolCall([submit], call) as BucketOutput
	return { bucket: coerceBucket(out.bucket), sentence: out.sentence }
}

/**
 * Code-templated neutral sentence — the guaranteed-compliant fallback used when
 * the model's sentence still trips checkLanguageCompliance after one retry, or
 * when the LLM call fails outright. Reads as a cited observation, never fatal.
 */
function fallbackSentence(input: BucketInput): string {
	const s = input.implied_scenarios[0]
	const conf =
		input.confidence === "low"
			? " Confidence is low: core figures are missing or disagree, so read this as indicative only."
			: ""
	if (!s || s.revenue_growth_10y == null) {
		return (
			`At the current price a reverse-DCF does not resolve to a plausible ten-year revenue-growth rate ` +
			`within the tested range, against a composite evidence grade of ${input.composite.grade}.${conf}`
		)
	}
	const growth = `${round2(s.revenue_growth_10y * 100)}%`
	const margin = `${round2(s.fcf_margin * 100)}%`
	return (
		`At the current price the market implies about ${growth} annual revenue growth over ten years at a ` +
		`${margin} free-cash-flow margin, against a composite evidence grade of ${input.composite.grade}.${conf}`
	)
}

async function resolveVerdictText(input: BucketInput, caller: BucketCaller): Promise<BucketOutput> {
	try {
		const first = await caller(input)
		if (checkLanguageCompliance(first.sentence).length === 0) {
			return { bucket: coerceBucket(first.bucket), sentence: first.sentence }
		}
		const second = await caller({ ...input, retry_violations: checkLanguageCompliance(first.sentence) })
		if (checkLanguageCompliance(second.sentence).length === 0) {
			return { bucket: coerceBucket(second.bucket), sentence: second.sentence }
		}
		// Keep the model's bucket (buckets carry no language risk); template the sentence.
		return { bucket: coerceBucket(second.bucket), sentence: fallbackSentence(input) }
	} catch {
		return { bucket: "roughly_priced", sentence: fallbackSentence(input) }
	}
}

// ── event-attribution timeline (best-effort, US only) ────────────────────────

type FetchOHLCV = (symbol: string, from: string, to: string) => Promise<OHLCVBar[]>
type TimelineEntry = NonNullable<ReconciliationVerdict["timeline"]>[number]

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function withinDays(published: string | null, date: string, days: number): boolean {
	if (!published) return false
	const p = Date.parse(published)
	const d = Date.parse(date)
	if (Number.isNaN(p) || Number.isNaN(d)) return false
	return Math.abs(p - d) <= days * 86_400_000
}

/**
 * The ≤5 largest daily moves ≥3% over the last 180 days, each carrying its CAR
 * (vs SPY) and the researched citations published within ±2 days. Returns []
 * when there are no qualifying moves; throws only on a hard fetch failure — the
 * caller swallows that and omits the timeline field entirely.
 */
async function computeTimeline(
	symbol: string,
	grades: DimensionGrade[],
	fetch: FetchOHLCV,
	now: number
): Promise<TimelineEntry[]> {
	const from = isoDay(now - 180 * 86_400_000)
	const to = isoDay(now)
	const bars = await fetch(symbol, from, to)
	if (bars.length < 2) return []

	const moves: { date: string; move_pct: number }[] = []
	for (let i = 1; i < bars.length; i++) {
		const prev = bars[i - 1].close
		if (!(prev > 0)) continue
		const pct = (bars[i].close / prev - 1) * 100
		if (Math.abs(pct) >= 3) moves.push({ date: bars[i].date, move_pct: pct })
	}
	const top = moves.sort((a, b) => Math.abs(b.move_pct) - Math.abs(a.move_pct)).slice(0, 5)

	// CAR context is a secondary read — a SPY fetch failure degrades cars to null,
	// it does not sink the timeline.
	let carByDate = new Map<string, number>()
	try {
		const spy = await fetch(SPY, from, to)
		carByDate = new Map(computeCAR(bars, spy).map((c) => [c.date, c.car]))
	} catch {
		/* cars stay null */
	}

	const citations = grades.flatMap((g) => g.top_citations)
	return top
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((m) => ({
			date: m.date,
			move_pct: round2(m.move_pct),
			car: carByDate.get(m.date) ?? null,
			evidence: citations.filter((c) => withinDays(c.published_at, m.date, 2)) as Citation[]
		}))
}

// ── reconcilePrice ───────────────────────────────────────────────────────────

export type ReconcileDeps = {
	fetchSnapshot: (symbol: string) => Promise<number | null>
	fetchOHLCV: FetchOHLCV
	bucketCaller: BucketCaller
	now: number
}

function gapVerdict(sentence: string, beta: boolean, timeline: TimelineEntry[] | undefined): ReconciliationVerdict {
	return {
		bucket: "roughly_priced",
		beta,
		implied: null,
		multiples: [
			{ name: "EV/Revenue", value: null, peer_median: null },
			{ name: "P/FCF", value: null, peer_median: null }
		],
		sentence,
		confidence: "low",
		...(timeline ? { timeline } : {})
	}
}

/**
 * §2.3 reconcilePrice. Non-US → null. Otherwise: implied growth from a reverse
 * DCF over three margin scenarios, EV/Revenue and P/FCF multiples, an LLM-picked
 * bucket + sentence, and a best-effort price-move timeline. Every external call
 * (Alpaca, LLM) is injectable via `deps` so tests run offline; every one degrades
 * to a gap rather than throwing.
 */
export async function reconcilePrice(
	company: Company,
	extraction: ExtractionResult,
	composite: CompositeScore,
	grades: DimensionGrade[],
	deps: Partial<ReconcileDeps> = {}
): Promise<ReconciliationVerdict | null> {
	if (!company.is_us || !company.alpaca_symbol) return null // §5.2 global research, US verdicts

	const snapshot = deps.fetchSnapshot ?? (async (s: string) => (await import("../alpaca-market-data")).fetchSnapshot(s))
	const ohlcv =
		deps.fetchOHLCV ?? (async (s: string, f: string, t: string) => (await import("../alpaca-market-data")).fetchOHLCV(s, f, t))
	const bucketCaller = deps.bucketCaller ?? defaultBucketCaller
	const now = deps.now ?? Date.now()
	const symbol = company.alpaca_symbol
	const beta = TERMINAL_CONFIG.VERDICT_BETA

	// Timeline never blocks the verdict; a hard fetch failure omits the field.
	let timeline: TimelineEntry[] | undefined
	try {
		timeline = await computeTimeline(symbol, grades, ohlcv, now)
	} catch {
		timeline = undefined
	}

	// Price-at-grading chart: best-effort ~1y of daily closes. Attached to every
	// verdict (incl. gaps) so the report shows a price line whenever data exists.
	let priceSeries: { date: string; close: number }[] | undefined
	try {
		const to = new Date(now).toISOString().slice(0, 10)
		const from = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
		const bars = await ohlcv(symbol, from, to)
		priceSeries = bars.length ? bars.map((b) => ({ date: b.date, close: b.close })) : undefined
	} catch {
		priceSeries = undefined
	}
	const gradedAt = new Date(now).toISOString().slice(0, 10)
	// graded price defaults to the latest close; the main path overrides with the live snapshot.
	const chartFields = (gradedPrice: number | null): Partial<ReconciliationVerdict> => {
		if (!priceSeries) return {}
		const gp = typeof gradedPrice === "number" && gradedPrice > 0 ? gradedPrice : priceSeries[priceSeries.length - 1].close
		return { price_series: priceSeries, graded_price: gp, graded_at: gradedAt }
	}

	const fig = latestAnnualFigures(extraction.figures)
	const revenue = fig.get("revenue")
	const shareCount = fig.get("share_count")

	const missing: string[] = []
	if (revenue == null) missing.push("revenue")
	if (shareCount == null) missing.push("share_count")
	if (missing.length) {
		return {
			...gapVerdict(
				`A price verdict is not available: the extraction is missing ${missing.join(" and ")}, ` +
					`so enterprise value cannot be computed. Confidence is low.`,
				beta,
				timeline
			),
			...chartFields(null)
		}
	}

	const price = await snapshot(symbol).catch(() => null)
	if (price == null) {
		return {
			...gapVerdict(
				`A price verdict is not available: no current market price was retrieved for ${company.ticker}, ` +
					`so market cap cannot be computed. Confidence is low.`,
				beta,
				timeline
			),
			...chartFields(null)
		}
	}

	const netDebtRaw = fig.get("net_debt")
	const netDebtAssumed = netDebtRaw == null
	const netDebt = netDebtRaw ?? 0

	const fcfNum = fig.get("fcf") ?? fig.get("ocf") ?? null // FCF, or OCF as its proxy
	const margin = fcfNum != null && revenue! > 0 ? fcfNum / revenue! : null

	const mcap = price * shareCount!
	const ev = mcap + netDebt

	// Three margin scenarios: current, +200bps, +500bps. implied uses the current one.
	const scenarios: Scenario[] =
		margin != null
			? [
					{ label: "current", fcf_margin: margin },
					{ label: "+200bps", fcf_margin: margin + 0.02 },
					{ label: "+500bps", fcf_margin: margin + 0.05 }
				].map((s) => {
					const g = impliedGrowth(ev, revenue!, s.fcf_margin, { discountRate: DISCOUNT_RATE })
					return { ...s, revenue_growth_10y: g == null ? null : round4(g) }
				})
			: []

	const current = scenarios[0]
	const implied =
		current && current.revenue_growth_10y != null
			? {
					revenue_growth_10y: current.revenue_growth_10y,
					fcf_margin_scenario: round4(current.fcf_margin),
					discount_rate: DISCOUNT_RATE
				}
			: null

	const multiples: ReconciliationVerdict["multiples"] = [
		{ name: "EV/Revenue", value: revenue! > 0 ? round2(ev / revenue!) : null, peer_median: null },
		{ name: "P/FCF", value: fcfNum != null && fcfNum > 0 ? round2(mcap / fcfNum) : null, peer_median: null }
	]

	// §3: net_debt assumed OR any multiple missing caps confidence at medium.
	let confidence = extraction.confidence
	if (netDebtAssumed || multiples.some((m) => m.value == null)) confidence = minConf(confidence, "medium")

	const { bucket, sentence } = await resolveVerdictText(
		{
			company: { name: company.name, ticker: company.ticker },
			composite: { grade: composite.grade, score: composite.score, confidence: composite.confidence },
			dimensions: grades.map((g) => ({ dimension: g.dimension, grade: g.grade, confidence: g.confidence })),
			implied_scenarios: scenarios,
			multiples,
			discount_rate: DISCOUNT_RATE,
			net_debt_assumed: netDebtAssumed,
			confidence
		},
		bucketCaller
	)

	return {
		bucket,
		beta,
		implied,
		multiples,
		sentence,
		confidence,
		...(timeline ? { timeline } : {}),
		...chartFields(price)
	}
}
