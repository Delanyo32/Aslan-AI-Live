// Fundamentals extraction (WP1.4 + WP1.4b, SPEC v0.3 §3, invariant §5.3).
//
// Double extraction discipline: fetch the latest ANNUAL filing's text via Exa,
// run it through TWO independently-worded structured LLM prompts, pair figures
// by (name, period), keep a figure only when the two values agree within 1%.
// Disagreements are surfaced, NEVER averaged. Every emitted figure carries its
// source filing URL + date; a figure with no resolvable source page is dropped.
//
// WP1.4b (eval-driven) mechanism notes:
//   - a 0 value is a "not found" placeholder, never a figure — mutual
//     zero-misses used to score as agreement (17/20 spurious on AAPL).
//   - pinned to the latest annual filing: junk URLs (EDGAR query/index pages,
//     dumps, proxies) filtered, FY-labeled periods only, newest FY only
//     (10-Ks carry prior-year comparatives; quarterly rows never mix in).
//   - extraction reads Exa `text` + getAiModel(), NOT Exa `summary`: probes
//     showed Exa's summarizer fabricates figures on multi-MB inline-XBRL
//     10-Ks while its text extraction contains every statement table intact.
//
// The Exa + LLM surfaces are injectable parameters of extractFundamentals, so
// tests and the eval harness run offline; a different fundamentals source is a
// different `exa`/`llm` pair, not a new class.

import { Type, complete, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import type { Company, Confidence, ExtractedFigure, ExtractionResult } from "$lib/types/terminal"
import type { RubricRecipe } from "./rubrics/schema"
import { TERMINAL_CONFIG } from "./config"
import { terminalContents, terminalSearch } from "./exa"

// §2.3 figure set. Core figures gate the verdict (§5.3): if any is missing or
// disagrees the whole extraction is low-confidence.
const FIGURE_NAMES = [
	"revenue", "gross_margin", "operating_margin", "fcf", "ocf",
	"net_income", "net_debt", "share_count", "sbc"
] as const
const FIGURE_NAME_SET: ReadonlySet<string> = new Set(FIGURE_NAMES)
const CORE_NAMES: ReadonlySet<string> = new Set(["revenue", "ocf", "net_income", "share_count"])

// ── the two independently-worded extraction passes ───────────────────────────
// Different prompt wording AND different schema field descriptions on purpose:
// two ways of asking for the same numbers, so agreement means the number is
// robust to the prompt, not memorised. (Test asserts the strings differ.)

function figureSchema(desc: { root: string; value: string; period: string }) {
	return Type.Object({
		figures: Type.Array(
			Type.Object({
				name: Type.Union(FIGURE_NAMES.map((n) => Type.Literal(n)), {
					description: "which figure this row reports"
				}),
				value: Type.Number({ description: desc.value }),
				unit: Type.Union([Type.Literal("USD"), Type.Literal("%"), Type.Literal("shares")], {
					description: "USD for money amounts, % for margins, shares for share counts"
				}),
				period: Type.String({ description: desc.period })
			}),
			{ description: desc.root }
		)
	})
}

export type ExtractionPass = { query: string; schema: ReturnType<typeof figureSchema> }

export const EXTRACTION_PASSES: readonly ExtractionPass[] = [
	{
		// Pass A — accountant framing.
		query:
			"You are given the text of a company's annual report. Extract the financial figures for " +
			"the MOST RECENT FULL FISCAL YEAR reported in it: total revenue, gross margin, operating " +
			"margin, free cash flow, operating cash flow, net income, net debt, diluted share count, " +
			"and stock-based compensation. For each, give the numeric value, its unit (USD, %, or " +
			"shares), and the fiscal year formatted like FY2025. Report money amounts in FULL US " +
			"dollars, expanding the filing's thousands/millions convention (a statement line of " +
			"$416,161 million becomes 416161000000), and share counts in individual shares. Gross " +
			"margin, operating margin, free cash flow, and net debt may be computed by simple " +
			"arithmetic from line items printed in the document (gross profit / revenue, operating " +
			"income / revenue, operating cash flow minus capital expenditures). Net debt = total debt " +
			"(long-term debt plus its current portion plus any commercial paper) minus cash and cash " +
			"equivalents ONLY — do not subtract short-term marketable securities; report it whenever " +
			"the balance sheet prints those lines, negative when cash exceeds debt. Every other " +
			"figure must be read off the document directly. Ignore " +
			"quarterly figures and prior-year comparative columns. Omit any figure whose line items " +
			"the document does not print — never write 0 for a missing figure. Call submit_figures " +
			"exactly once.",
		schema: figureSchema({
			root: "Financial figures for the latest full fiscal year reported in this annual report.",
			value: "the amount in full units (whole US dollars or individual shares, thousands/millions convention expanded); omit the row rather than reporting 0 when the filing does not state it",
			period: "the fiscal year the figure covers, formatted FY2025-style; full-year figures only, never quarterly"
		})
	},
	{
		// Pass B — analyst framing, independently worded.
		query:
			"The user message contains a company's annual filing. Identify each of these line items " +
			"for the latest completed fiscal year only and report its number, measurement unit, and " +
			"fiscal year (format: FY2025): sales/revenue; gross profit as a percentage of revenue; " +
			"operating income as a percentage of revenue; cash generated from operating activities; " +
			"free cash flow (operating cash flow less capital expenditure); profit attributable to " +
			"shareholders; total borrowings net of cash (all interest-bearing debt, short- and " +
			"long-term including commercial paper, less cash and cash equivalents alone — leave " +
			"marketable securities and other short-term investments out; a net-cash position is a " +
			"negative number, and the figure is expected whenever debt and cash appear on the " +
			"balance sheet); weighted diluted shares " +
			"outstanding; and share-based payment expense. Express each money figure in absolute " +
			"dollars — expand the table's stated scale, so 416,161 presented in millions is " +
			"416161000000 — and each share count as a whole number of shares. The two margin " +
			"percentages, free cash flow, and net debt are ratios or differences of line items " +
			"printed in the filing; derive them from those printed numbers only, and derive nothing " +
			"else. Skip prior-year comparison columns and all quarterly or year-to-date data. Leave " +
			"out entirely any line item the filing does not print — a zero placeholder is wrong. " +
			"Submit through the submit_figures tool, one call only.",
		schema: figureSchema({
			root: "Reported line items for the newest completed fiscal year, read off this company's annual filing.",
			value: "the figure's number in absolute units (whole dollars / whole shares, any thousands-or-millions presentation expanded); leave it out entirely if the filing does not report it, never substituting zero",
			period: "which completed fiscal year this line item belongs to, written like FY2025; skip interim and quarterly periods"
		})
	}
] as const

// ── injectable surfaces ──────────────────────────────────────────────────────

// Injectable Exa + LLM surfaces so tests run with fixtures and no network.
export type ExaCaller = {
	search: typeof terminalSearch
	contents: typeof terminalContents
}

// Returns the model's submitted arguments ({ figures: [...] } expected; parsed
// defensively — a sloppy row is skipped, not thrown).
export type ExtractionLLM = (pass: ExtractionPass, filingText: string) => Promise<unknown>

const DEFAULT_EXA: ExaCaller = { search: terminalSearch, contents: terminalContents }

/** One structured pi-ai call: pass prompt as system, filing text as user, submit tool. */
export function makeExtractionLLM(model: Parameters<typeof complete>[0]): ExtractionLLM {
	return async (pass, filingText) => {
		const tool: Tool = {
			name: "submit_figures",
			description: "Submit every extracted figure. Call exactly once.",
			parameters: pass.schema
		}
		const context: Context = {
			systemPrompt: pass.query,
			messages: [{ role: "user", content: `<filing>\n${filingText}\n</filing>`, timestamp: Date.now() }],
			tools: [tool]
		}
		const response = await complete(model, context)
		if (response.stopReason === "error")
			throw new Error(response.errorMessage ?? "LLM error during extraction")
		const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_figures")
		if (!call) throw new Error("extraction: model did not submit figures")
		return call.arguments
	}
}

// Real path: getAiModel imported lazily — ai.ts reads $env at module load,
// which offline test runners / bun scripts cannot resolve, and this path never
// runs when a caller is injected (synthesis.ts pattern).
const defaultLLM: ExtractionLLM = async (pass, filingText) => {
	const { getAiModel } = await import("../ai")
	return makeExtractionLLM(getAiModel())(pass, filingText)
}

type SourcedFigure = {
	name: string
	value: number
	unit: string
	period: string
	source_url: string
	filing_date: string | null
}

const keyOf = (name: string, period: string): string => `${name} ${period}`

// §5.3 agreement test: 1% relative tolerance. Values are nonzero by
// construction — 0 rows are dropped as not-found at parse (WP1.4b).
const agree = (x: number, y: number): boolean =>
	Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)) <= 0.01

// Period pin: annual figures only, normalized to "FY<4-digit year>". Anything
// else ("Q1-2026", "Three Months Ended …") is dropped — interim data never
// silently mixes into the annual set.
// ponytail: annual-only v1; a separately-labeled interim pass can come back
// when reconcile needs TTM figures.
function normalizeFY(period: string): string | null {
	const m = period.toUpperCase().replace(/[\s-]/g, "").match(/^FY(\d{4}|\d{2})$/)
	if (!m) return null
	return `FY${m[1].length === 2 ? `20${m[1]}` : m[1]}`
}

type FilingPage = { url: string; filing_date: string | null; text: string }

// Collect one LLM pass's rows for one page into the pass map. Defensive: bad
// rows are skipped, not thrown. Figures on a page with no URL are dropped
// (unsourced); their (name, period) keys feed the dropped_unsourced count.
function collectRows(
	submitted: unknown,
	page: FilingPage,
	map: Map<string, SourcedFigure>,
	unsourced: Set<string>
): void {
	const rows = (submitted as { figures?: unknown })?.figures
	if (!Array.isArray(rows)) return

	for (const row of rows) {
		if (typeof row !== "object" || row === null) continue
		const r = row as Record<string, unknown>
		const { name, value, unit, period } = r
		if (typeof name !== "string" || !FIGURE_NAME_SET.has(name)) continue
		if (typeof value !== "number" || !Number.isFinite(value)) continue
		if (typeof unit !== "string" || typeof period !== "string") continue
		// WP1.4b: 0 is the "not found" placeholder, not a figure — mutual
		// zero-misses scored as agreement. A legitimate exact-0 is vanishingly
		// rare in this figure set; treat as missing.
		if (value === 0) continue
		const fy = normalizeFY(period)
		if (!fy) continue // non-annual period label → dropped, never mixed

		const key = keyOf(name, fy)
		if (!page.url) {
			unsourced.add(key)
			continue
		}
		if (!map.has(key)) {
			map.set(key, {
				name, value, unit, period: fy,
				source_url: page.url,
				filing_date: page.filing_date
			})
		}
	}
}

// EDGAR query/index pages, full-text dumps, and proxy statements carry no
// financial statements and invite fabricated figures (probe-verified on AAPL).
const JUNK_PAGE = /cgi-bin|-index\.|\.txt$|def14a|proxy/i

// ponytail: trust Exa's ranking — the targeted query puts the newest 10-K
// first (probe-verified); 2 doc pages + the latest-FY pin cover an older
// filing sneaking in. Widen toward EXTRACTION_FILING_PAGES if eval shows misses.
const EXTRACTION_DOC_PAGES = 2
// Inline-XBRL 10-Ks extract to ~200–300k chars; cap defends the LLM context
// window against pathological pages without touching normal filings.
const MAX_FILING_CHARS = 800_000

/**
 * §2.3 extractFundamentals — Exa filings search + double extraction. `exa` and
 * `llm` default to the real network surfaces; tests and the eval harness inject
 * fixtures.
 */
export async function extractFundamentals(
	company: Company,
	exa: ExaCaller = DEFAULT_EXA,
	llm: ExtractionLLM = defaultLLM
): Promise<ExtractionResult> {
	// 1. Find the latest ANNUAL filing document pages.
	const recipe: RubricRecipe = {
		primitive: "search",
		query_template: "{company} most recent annual report 10-K filing",
		category: "financial report"
	}
	const cap = TERMINAL_CONFIG.EXTRACTION_FILING_PAGES
	const found = await exa.search(recipe, company.name, { numResults: cap })
	const docs = (found.results ?? []).filter(
		(r) => !!r.url && !JUNK_PAGE.test(`${r.title ?? ""} ${r.url}`)
	)
	const urls = docs.map((r) => r.url).slice(0, Math.min(EXTRACTION_DOC_PAGES, cap))

	// 2. Fetch the filing text once (shared by both passes).
	let pages: FilingPage[] = []
	if (urls.length > 0) {
		const contents = await exa.contents(urls, { contents: "text", textMaxCharacters: 1_000_000 })
		pages = (contents.results ?? [])
			.filter((r) => typeof r.text === "string" && r.text.length > 0)
			.map((r) => ({
				url: r.url,
				filing_date: r.publishedDate ?? null,
				text: (r.text as string).slice(0, MAX_FILING_CHARS)
			}))
	}

	// 3. Extract twice over the SAME text with the two independent passes.
	const unsourced = new Set<string>()
	const passMaps: Map<string, SourcedFigure>[] = []
	for (const pass of EXTRACTION_PASSES) {
		const map = new Map<string, SourcedFigure>()
		for (const page of pages) {
			collectRows(await llm(pass, page.text), page, map, unsourced)
		}
		passMaps.push(map)
	}

	return reconcilePasses(passMaps[0], passMaps[1], unsourced.size)
}

// 4. Pair by (name, period) across the two passes. Agree → keep first value.
// Disagree → both values to disagreements[], figure excluded. Never average.
function reconcilePasses(
	a: Map<string, SourcedFigure>,
	b: Map<string, SourcedFigure>,
	dropped_unsourced: number
): ExtractionResult {
	const figures: ExtractedFigure[] = []
	const disagreements: ExtractionResult["disagreements"] = []

	// Annual reports carry prior-year comparatives; publish only the newest
	// fiscal year either pass saw ("FY2025" > "FY2024" lexicographically).
	const latest = [...a.values(), ...b.values()].map((f) => f.period).sort().pop()

	for (const [key, fa] of a) {
		if (fa.period !== latest) continue
		const fb = b.get(key)
		if (!fb) continue // only one pass found it → not confirmed → drop (counts as missing)
		if (agree(fa.value, fb.value)) {
			figures.push({
				name: fa.name,
				value: fa.value, // keep first value, never averaged
				unit: fa.unit,
				period: fa.period,
				source_url: fa.source_url,
				filing_date: fa.filing_date,
				passes_agree: true
			})
		} else {
			disagreements.push({
				name: fa.name,
				period: fa.period,
				values: [fa.value, fb.value],
				sources: [fa.source_url, fb.source_url]
			})
		}
	}

	return {
		figures,
		disagreements,
		confidence: confidenceOf(figures, disagreements),
		dropped_unsourced // distinct (name, period) figures returned without a source page
	}
}

// §5.3 confidence: low if any CORE figure missing/disagrees; medium if any
// non-core missing/disagrees; else high. A disagreement counts against its
// figure even if another period of the same name agreed.
function confidenceOf(
	figures: ExtractedFigure[],
	disagreements: ExtractionResult["disagreements"]
): Confidence {
	const emitted = new Set(figures.map((f) => f.name))
	const disagreed = new Set(disagreements.map((d) => d.name))
	const bad = (name: string): boolean => !emitted.has(name) || disagreed.has(name)

	for (const name of CORE_NAMES) if (bad(name)) return "low"
	for (const name of FIGURE_NAMES) if (bad(name)) return "medium"
	return "high"
}
