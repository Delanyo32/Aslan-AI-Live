// Bakes the /research paper's data: reads every company from the running dev
// server's read model (GET /api/reality/[cik] — so the real reconciler code
// computes the forward schedule), computes industry + per-company stats in
// code, has the model write short prose, validates it (numbers must come from
// the computed facts; banned framings rejected), and writes frozen JSON into
// src/lib/data/research/. Per-segment revenue is deliberately absent: it lives
// in dimensional XBRL, which the pipeline does not parse yet.
//
//   bun scripts/build-research-snapshot.ts [--no-ai] [--only TICKER]
//
// Needs: `bun run dev` on :5173 and OPENROUTER_API_KEY in .dev.vars.

import { Database } from "bun:sqlite"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import {
	annualComponents, bands, cagr, companySeries, dayDiff, declaredVsActual, committedSplitAt,
	indexedSeries, industrySeries, median, qEnd, type Bands, type Entry, type ExpenseComponents,
	type ForwardBucket, type QuarterPoint, type Stmt
} from "../src/lib/research/stats"

const API = "http://localhost:5173"
const OUT = "src/lib/data/research"
const NO_AI = process.argv.includes("--no-ai")
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null
const AS_OF = new Date().toISOString().slice(0, 10)

// ── who is in the paper (grilling decisions, 2026-08-20) ────────────────────

const EXCLUDED = new Set(["AAPL"]) // testing artifact, not part of the AI-infrastructure story
// Full page, but out of every industry aggregate:
const PAGE_ONLY = new Set(["SPCX" /* 2 quarters */, "ASML" /* EUR */, "TSM" /* TWD */])

const CATEGORY: Record<string, string> = {
	NVDA: "Chips", AMD: "Chips", AVGO: "Chips", MU: "Chips", ARM: "Chips", MRVL: "Chips", QCOM: "Chips", INTC: "Chips", TSM: "Chips",
	AMAT: "Chip equipment", LRCX: "Chip equipment", KLAC: "Chip equipment", ASML: "Chip equipment",
	SMCI: "Hardware & networking", DELL: "Hardware & networking", HPE: "Hardware & networking", ANET: "Hardware & networking", VRT: "Hardware & networking",
	MSFT: "Cloud & platforms", AMZN: "Cloud & platforms", GOOGL: "Cloud & platforms", META: "Cloud & platforms", ORCL: "Cloud & platforms", IBM: "Cloud & platforms",
	EQIX: "Data centers", DLR: "Data centers", CRWV: "Data centers", NBIS: "Data centers",
	PLTR: "AI software", NOW: "AI software", SNOW: "AI software", CRM: "AI software", AI: "AI software",
	SPCX: "Aerospace"
}

// ── local sqlite (company list + archive stamp only) ────────────────────────

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
function openDbCopy(): Database {
	const files = readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite"))
	files.sort((a, b) => statSync(join(D1_DIR, b)).size - statSync(join(D1_DIR, a)).size)
	const src = join(D1_DIR, files[0])
	const tmp = join(mkdtempSync(join(tmpdir(), "research-bake-")), "db.sqlite")
	copyFileSync(src, tmp)
	for (const ext of ["-wal", "-shm"]) if (existsSync(src + ext)) copyFileSync(src + ext, tmp + ext)
	return new Database(tmp)
}

// ── model plumbing ──────────────────────────────────────────────────────────

for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
	const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

// Keep in sync with CUSTOM_MODELS in src/lib/server/ai.ts (can't import it here:
// that module reads $env/dynamic/private, a SvelteKit-only virtual module).
const MODEL = {
	id: "openai/gpt-5.6-luna", name: "OpenAI: GPT-5.6 Luna", api: "openai-completions",
	provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", reasoning: true,
	input: ["text"], cost: { input: 0.1, output: 0.6, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1_050_000, maxTokens: 128_000
	// biome-ignore lint/suspicious/noExplicitAny: plain-object model def, same shape ai.ts uses
} as any

async function callTool<T>(systemPrompt: string, user: string, tool: Tool): Promise<T> {
	const ctx: Context = { systemPrompt, messages: [{ role: "user", content: user, timestamp: Date.now() }], tools: [tool] }
	const response = await complete(MODEL, ctx)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === tool.name)
	if (!call) throw new Error(`model did not call ${tool.name}`)
	return validateToolCall([tool], call) as T
}

// Keep in sync with BANNED_FRAMINGS in src/lib/server/terminal/synthesis.ts
// (that module imports rulebook.md?raw — Vite-only, unloadable under bun).
const BANNED = [
	"misleading accounting", "fake deal", "fraud", "fraudulent", "scheme", "scam", "lied", "lying",
	"deception", "cooking the books", "pump and dump", "is hiding", "are hiding", "is concealing",
	"are concealing", "is faking", "are faking"
]
// Style tells that made the last bake read like a machine narrating a table.
const STYLE_BANNED = [
	"n/a", "5_to_10y", "is a company", "the ledger shows", "the filings report",
	"identified in the filings", "recontextualize"
]
const bannedIn = (text: string): string[] => {
	const hits = [...BANNED, ...STYLE_BANNED].filter((p) => new RegExp(`\\b${p.replace(/ /g, "\\s+")}\\b`, "i").test(text))
	// "$0 million" is banned, but "$97.0 million" is a real figure — no digit/dot before the 0.
	if (/(?<![\d.])0 million\b/.test(text)) hits.push("0 million")
	return hits
}

/** Every number in prose must appear in the facts blob (or be a year / tiny int). */
function offendingNumbers(text: string, factsJson: string): string[] {
	const allowed = new Set((factsJson.match(/\d[\d,]*\.?\d*/g) ?? []).map((t) => t.replace(/,/g, "")))
	const out: string[] = []
	for (const tok of text.match(/\d[\d,]*\.?\d*/g) ?? []) {
		const n = tok.replace(/,/g, "").replace(/\.$/, "") // "27." at a sentence end is just 27
		const v = Number(n)
		if (allowed.has(n)) continue
		if (Number.isInteger(v) && ((v >= 2019 && v <= 2100) || (v >= 0 && v <= 15))) continue
		out.push(tok)
	}
	return out
}

const PROSE_RULES =
	"You write short prose blocks for a public research paper about SEC filings. The reader sees " +
	"stat tiles and charts right next to your text that already show every headline total, so never " +
	"walk through totals one at a time. Each block earns its place by saying the one thing a chart " +
	"cannot: lead with the sharpest fact, then set it against the FACTS number or ratio that gives " +
	"it scale. A number lands relatively — pair it with its contrast. " +
	"Plain English, 8th-grade level, short sentences, active voice, no em dashes. " +
	"Never open with boilerplate ('X is a company', 'X is listed as...') — the reader is already on " +
	"the page. Vary sentence openers; do not narrate a data source in every sentence. Every amount " +
	"must name what it is for — never a bare list of dollar figures. If a fact is missing from " +
	"FACTS, skip it silently: do not write 'n/a' and do not narrate zero values. Do not repeat the " +
	"same number in two different sections. " +
	"Neutral evidence language only: state what filings show, never accuse (no 'fraud', 'scheme', " +
	"'hiding', or similar). Every number you write MUST be copied character-for-character from the " +
	"FACTS block. Do not compute new numbers, including ratios in words — if FACTS gives no ratio, " +
	"make no quantitative comparison. Do not add facts not in FACTS."

async function checkedProse<T extends Record<string, string>>(
	system: string, factsJson: string, tool: Tool, label: string
): Promise<T | null> {
	if (NO_AI) return null
	for (let attempt = 0, feedback = ""; attempt < 2; attempt++) {
		try {
			const out = await callTool<T>(system, `FACTS:\n${factsJson}\n${feedback}`, tool)
			const bad = Object.values(out).flatMap((text) => [
				...bannedIn(text).map((b) => `banned phrase "${b}"`),
				...offendingNumbers(text, factsJson).map((n) => `number ${n} is not in FACTS`)
			])
			if (bad.length === 0) return out
			feedback = `\nYour previous draft failed validation: ${bad.join("; ")}. Fix and resubmit.`
			console.log(`  prose retry (${label}): ${bad.slice(0, 4).join("; ")}`)
		} catch (e) {
			console.log(`  prose error (${label}): ${(e as Error).message}`)
		}
	}
	console.log(`  prose dropped (${label})`)
	return null
}

const addMonths = (iso: string, m: number): string => {
	const d = new Date(iso + "T00:00:00Z")
	d.setUTCMonth(d.getUTCMonth() + m)
	return d.toISOString().slice(0, 10)
}

// ── formatting for facts blobs (model copies these verbatim) ────────────────

const fmtMoney = (v: number | null | undefined, cur = "USD"): string => {
	if (v === null || v === undefined) return "n/a"
	const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : `${cur} `
	const a = Math.abs(v)
	if (a >= 1e12) return `${sym}${(v / 1e12).toFixed(2)} trillion`
	if (a >= 1e9) return `${sym}${(v / 1e9).toFixed(1)} billion`
	return `${sym}${(v / 1e6).toFixed(0)} million`
}
const fmtPct = (v: number | null | undefined): string =>
	v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(0).replace(/^-0$/, "0")}%`

// The model narrates whatever it sees: strip absent/zero facts so it can't write "n/a" or "$0 million".
const dropEmpty = (_k: string, v: unknown) =>
	v === "n/a" || (typeof v === "string" && /^\D*0 million$/.test(v)) ? undefined : v

// Code owns every number: comparisons the prose may want are computed here, never by the model.
const ratio = (a: number | null | undefined, b: number | null | undefined): string | undefined => {
	if (!a || !b || a <= 0 || b <= 0) return undefined
	const r = (a / b).toFixed(1)
	return r === "0.0" ? undefined : `${r}x` // a sub-0.1x ratio reads as "0.0x" — worse than silence
}

// ── per-company build ───────────────────────────────────────────────────────

type ApiPayload = {
	company: { cik: string; ticker: string; name: string } | null
	statements: (Stmt & { narrative: string })[]
	flags: { flag_type: string; origin: string; summary: string; period_end: string | null }[]
	entries: Entry[]
	forward_schedule: ForwardBucket[]
}

function growthOf(pts: QuarterPoint[]) {
	// Per metric: first→last positive value, ≥ 2 years apart.
	const c = (f: (p: QuarterPoint) => number | null) => {
		const first = pts.find((p) => (f(p) ?? 0) > 0)
		const last = [...pts].reverse().find((p) => (f(p) ?? 0) > 0)
		if (!first || !last) return null
		const y = dayDiff(first.period_end, last.period_end) / 365.25
		return y >= 2 ? cagr(f(first)!, f(last)!, y) : null
	}
	const ttm = pts.filter((p) => p.ttm_revenue !== null)
	return {
		window: ttm.length ? [ttm[0].q, ttm.at(-1)!.q] : null,
		revenue_cagr: c((p) => p.ttm_revenue),
		expenses_cagr: c((p) => p.ttm_expenses),
		committed_cagr: c((p) => p.committed),
		reported_debt_cagr: c((p) => p.reported_debt),
		deferred_cagr: c((p) => p.deferred)
	}
}

const differs = (p: QuarterPoint): boolean =>
	(p.draft_revenue !== null && p.revenue !== null && p.draft_revenue !== p.revenue) ||
	(p.draft_expenses !== null && p.expenses !== null && p.draft_expenses !== p.expenses)

async function buildCompany(ticker: string, cik: string, name: string) {
	const res = await fetch(`${API}/api/reality/${cik}`)
	if (!res.ok) throw new Error(`${ticker}: read model ${res.status}`)
	const data = (await res.json()) as ApiPayload
	if (data.statements.length === 0) return null

	const currency = data.statements.at(-1)!.currency
	const droppedCurrencies = [...new Set(data.statements.map((s) => s.currency).filter((c) => c !== currency))]
	const pts = companySeries(data.statements, data.entries, currency)
	const lastPt = pts.at(-1)!
	const lastTtm = pts.filter((p) => p.ttm_revenue !== null).at(-1) ?? null
	const wall = bands(data.forward_schedule, AS_OF, currency)
	const split = committedSplitAt(data.entries, lastPt.period_end, currency)

	const company = {
		ticker, name, cik, currency,
		category: CATEGORY[ticker] ?? "Other",
		in_industry: !PAGE_ONLY.has(ticker) && currency === "USD",
		thin: pts.length < 8,
		dropped_currencies: droppedCurrencies,
		as_of: AS_OF,
		quarters: pts.length,
		series: pts,
		latest: {
			period_end: lastPt.period_end,
			q: lastPt.q,
			ttm_revenue: lastTtm?.ttm_revenue ?? null,
			ttm_expenses: lastTtm?.ttm_expenses ?? null,
			deferred: lastPt.deferred,
			rpo: lastPt.rpo,
			committed: lastPt.committed,
			reported_debt: lastPt.reported_debt,
			committed_split: split
		},
		expense_components: annualComponents(data.entries, currency).filter((r) => r.year >= 2020),
		wall,
		growth: growthOf(pts),
		declared_vs_actual: declaredVsActual(pts),
		adjusted_quarters: { n: pts.filter(differs).length, of: pts.length },
		flags: data.flags.map((f) => ({ type: f.flag_type, origin: f.origin, summary: f.summary, period_end: f.period_end })),
		narratives: data.statements.slice(-4).map((s) => ({ period_end: s.period_end, narrative: s.narrative })),
		prose: null as Record<string, string> | null
	}

	const facts = JSON.stringify({
		name, ticker, currency,
		latest_quarter: lastPt.q,
		trailing_year_revenue: fmtMoney(company.latest.ttm_revenue, currency),
		trailing_year_expenses: fmtMoney(company.latest.ttm_expenses, currency),
		reported_debt: fmtMoney(lastPt.reported_debt, currency),
		total_committed: fmtMoney(lastPt.committed, currency),
		committed_split: {
			debt: fmtMoney(split.debt, currency), leases: fmtMoney(split.lease, currency), purchases: fmtMoney(split.purchase, currency)
		},
		deferred_revenue: fmtMoney(lastPt.deferred, currency),
		backlog: fmtMoney(lastPt.rpo, currency),
		wall_next_5y: fmtMoney(wall.obligations[0].disclosed + wall.obligations[0].estimated, currency),
		wall_5_to_10y: fmtMoney(wall.obligations[1].disclosed + wall.obligations[1].estimated, currency),
		wall_beyond_10y: fmtMoney(wall.obligations[2].disclosed + wall.obligations[2].estimated, currency),
		undated_after_year_5: fmtMoney(wall.undated_after5, currency),
		future_revenue_next_5y: fmtMoney(wall.future_revenue[0], currency),
		committed_vs_reported_debt: ratio(lastPt.committed, lastPt.reported_debt),
		backlog_vs_one_year_of_revenue: ratio(lastPt.rpo, company.latest.ttm_revenue),
		due_next_5y_vs_revenue_promised_next_5y: ratio(
			wall.obligations[0].disclosed + wall.obligations[0].estimated, wall.future_revenue[0]),
		revenue_growth_per_year: fmtPct(company.growth.revenue_cagr),
		expense_growth_per_year: fmtPct(company.growth.expenses_cagr),
		committed_growth_per_year: fmtPct(company.growth.committed_cagr),
		quarters_changed_by_reconciliation: `${company.adjusted_quarters.n} of ${company.adjusted_quarters.of}`,
		flags: company.flags.slice(0, 12).map((f) => `${f.type}: ${f.summary}`),
		recent_narratives: company.narratives.map((n) => n.narrative.slice(0, 300))
	}, dropEmpty, 1)

	const tool: Tool = {
		name: "submit_prose",
		description: "Short sections for one company's research page",
		parameters: Type.Object({
			overview: Type.String({ description: "2-3 sentences. Lead with this company's single sharpest fact and the FACTS comparison that gives it scale — prefer revenue scale, backlog vs revenue, growth, or a striking flag, NOT the debt-vs-committed story (the debt section owns that). Never open with who the company is or its ticker — both are in the page title." }),
			debt: Type.String({ description: "1-3 sentences: what total committed money adds beyond reported debt (leases, purchases). If they are nearly equal, one sentence saying so." }),
			wall: Type.String({ description: "1-3 sentences: the tension between what is due and the revenue already promised to them. Skip empty bands entirely." }),
			flags_note: Type.String({ description: "1-3 sentences. Lead with the most striking flag; every amount must name what it is tied to. Neutral evidence language; empty string if no flags." })
		})
	}
	company.prose = await checkedProse(PROSE_RULES, facts, tool, ticker)
	return company
}

// ── main ────────────────────────────────────────────────────────────────────

const db = openDbCopy()
const companies = db.query(
	"SELECT c.cik, c.ticker, c.name FROM sec_companies c WHERE EXISTS (SELECT 1 FROM reality_statements s WHERE s.cik = c.cik) ORDER BY c.ticker"
).all() as { cik: string; ticker: string; name: string }[]

// Writes are buffered and flushed once at the very end: each write into src/
// triggers a full wrangler-dev rebuild, and 30+ in a row crashes the server
// this script is reading from.
const pending = new Map<string, string>()
const flush = () => {
	mkdirSync(join(OUT, "companies"), { recursive: true })
	for (const [path, body] of pending) writeFileSync(path, body)
}

const built: Awaited<ReturnType<typeof buildCompany>>[] = []
for (const c of companies) {
	if (EXCLUDED.has(c.ticker)) continue
	if (ONLY && c.ticker !== ONLY) continue
	console.log(`building ${c.ticker}…`)
	const out = await buildCompany(c.ticker, c.cik, c.name)
	if (!out) continue
	pending.set(join(OUT, "companies", `${c.ticker}.json`), JSON.stringify(out))
	built.push(out)
}
if (ONLY) { flush(); console.log("done (single company; industry.json not rebuilt)"); process.exit(0) }

// Industry aggregates — USD, in_industry companies only.
const ind = built.filter((c) => c!.in_industry) as NonNullable<(typeof built)[number]>[]
const ptsMap = new Map(ind.map((c) => [c.ticker, c.series]))
const lastQ = [...ind.map((c) => c.latest.q)].sort().at(-1)!
let series = industrySeries(ptsMap, "2021-Q1", lastQ)
const minN = Math.floor(ind.length * 0.8)
series = series.filter((p) => p.n >= minN)

const latest = series.at(-1)!
const wallSum: Bands = {
	obligations: [0, 1, 2].map((i) => ({
		disclosed: ind.reduce((a, c) => a + c.wall.obligations[i].disclosed, 0),
		estimated: ind.reduce((a, c) => a + c.wall.obligations[i].estimated, 0)
	})),
	undated_after5: ind.reduce((a, c) => a + c.wall.undated_after5, 0),
	future_revenue: [0, 1, 2].map((i) => ind.reduce((a, c) => a + c.wall.future_revenue[i], 0)),
	financing: ind.reduce((a, c) => a + c.wall.financing, 0)
}

const years = [2020, 2021, 2022, 2023, 2024, 2025]
const compSum: ExpenseComponents[] = years.map((year) => {
	const rows = ind.map((c) => c.expense_components.find((r) => r.year === year)).filter(Boolean) as ExpenseComponents[]
	// Half-coverage gate: capex, for one, is tagged by ~23 of 31 companies — a
	// sum over most of the industry beats a null. The page discloses the gap.
	const sum = (k: keyof ExpenseComponents) => {
		const vals = rows.map((r) => r[k]).filter((v): v is number => v !== null)
		return vals.length >= Math.ceil(ind.length / 2) ? vals.reduce((a, b) => a + b, 0) : null
	}
	return { year, cost_of_revenue: sum("cost_of_revenue"), rnd: sum("rnd"), sga: sum("sga"), tax: sum("tax"), sbc: sum("sbc"), capex: sum("capex") }
}).filter((r) => r.cost_of_revenue !== null)

const dvaYears = years.map((year) => ({
	year,
	draft_revenue: ind.reduce((a, c) => a + (c.declared_vs_actual.find((r) => r.year === year)?.draft_revenue ?? 0), 0),
	adjusted_revenue: ind.reduce((a, c) => a + (c.declared_vs_actual.find((r) => r.year === year)?.adjusted_revenue ?? 0), 0),
	draft_expenses: ind.reduce((a, c) => a + (c.declared_vs_actual.find((r) => r.year === year)?.draft_expenses ?? 0), 0),
	adjusted_expenses: ind.reduce((a, c) => a + (c.declared_vs_actual.find((r) => r.year === year)?.adjusted_expenses ?? 0), 0)
})).filter((r) => r.draft_revenue > 0)

const flagCounts = new Map<string, number>()
for (const c of built) for (const f of c!.flags) flagCounts.set(f.type, (flagCounts.get(f.type) ?? 0) + 1)

const industryTickers = new Set(ind.map((c) => c.ticker))
const stamp = (() => {
	const ciks = companies.filter((c) => !EXCLUDED.has(c.ticker)).map((c) => `'${c.cik}'`).join(",")
	return db.query(`SELECT COUNT(*) n, COALESCE(SUM(bytes),0) b FROM sec_filings WHERE cik IN (${ciks})`).get() as { n: number; b: number }
})()

const yearsSpanned = series.length ? dayDiff(qEnd(series[0].q), qEnd(latest.q)) / 365.25 : 0
const g = (f: (p: (typeof series)[number]) => number) =>
	series.length >= 8 ? cagr(f(series[0]), f(latest), yearsSpanned) : null

const industry = {
	as_of: AS_OF,
	stamp: { companies: built.length, industry_companies: ind.length, filings: stamp.n, gigabytes: Math.round(stamp.b / 1e8) / 10, since: "2020-01-02" },
	companies: built.map((c) => ({
		ticker: c!.ticker, name: c!.name, category: c!.category, currency: c!.currency,
		quarters: c!.quarters, in_industry: c!.in_industry, thin: c!.thin
	})),
	headline: {
		ttm_revenue: latest.ttm_revenue, reported_debt: latest.reported_debt, committed: latest.committed,
		deferred: latest.deferred, rpo: latest.rpo,
		wall_next5: wallSum.obligations[0].disclosed + wallSum.obligations[0].estimated,
		flags_total: [...flagCounts.values()].reduce((a, b) => a + b, 0),
		latest_q: latest.q, n: latest.n
	},
	debt: {
		per_company: ind
			.filter((c) => c.latest.reported_debt !== null && c.latest.committed !== null)
			.map((c) => ({ ticker: c.ticker, category: c.category, reported: c.latest.reported_debt!, committed: c.latest.committed! }))
			.sort((a, b) => b.committed - a.committed),
		series: series.map((p) => ({ q: p.q, reported: p.reported_debt, committed: p.committed }))
	},
	revenue_reality: {
		series: series.map((p) => ({ q: p.q, ttm_revenue: p.ttm_revenue, deferred: p.deferred, rpo: p.rpo, n: p.n })),
		ratio_series: series.map((p) => ({
			q: p.q,
			median_ratio: median(ind.map((c) => {
				const pt = c.series.find((x) => x.q === p.q)
				return pt && pt.ttm_revenue && pt.deferred !== null ? pt.deferred / pt.ttm_revenue : NaN
			}).filter((x) => Number.isFinite(x)))
		}))
	},
	expense_components: compSum,
	wall: wallSum,
	growth: {
		indexed: indexedSeries(series, ["ttm_revenue", "committed", "reported_debt", "deferred"]),
		cagr: {
			revenue: g((p) => p.ttm_revenue), committed: g((p) => p.committed),
			reported_debt: g((p) => p.reported_debt), deferred: g((p) => p.deferred),
			expenses: (() => {
				const cs = ind.map((c) => c.growth.expenses_cagr).filter((x): x is number => x !== null)
				return median(cs)
			})(),
			window: series.length ? [series[0].q, latest.q] : null
		}
	},
	declared_vs_actual: {
		yearly: dvaYears,
		adjusted_quarters: {
			n: ind.reduce((a, c) => a + c.adjusted_quarters.n, 0),
			of: ind.reduce((a, c) => a + c.adjusted_quarters.of, 0)
		}
	},
	flags: {
		by_type: [...flagCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
		notable: built.filter((c) => c!.in_industry)
			.flatMap((c) => c!.flags.filter((f) => ["circular_financing", "off_balance_sheet", "related_party_exposure"].includes(f.type))
				.slice(0, 1).map((f) => ({ ticker: c!.ticker, type: f.type, summary: f.summary }))).slice(0, 8)
	},
	categories: [...new Set(ind.map((c) => c.category))].map((label) => {
		const members = ind.filter((c) => c.category === label)
		return {
			label,
			tickers: members.map((c) => c.ticker),
			ttm_revenue: members.reduce((a, c) => a + (c.latest.ttm_revenue ?? 0), 0),
			committed: members.reduce((a, c) => a + (c.latest.committed ?? 0), 0),
			wall_next5: members.reduce((a, c) => a + c.wall.obligations[0].disclosed + c.wall.obligations[0].estimated, 0)
		}
	}).sort((a, b) => b.ttm_revenue - a.ttm_revenue),
	prose: null as Record<string, string> | null
}

const industryFacts = JSON.stringify({
	as_of: AS_OF,
	companies_in_industry: ind.length,
	total_companies_with_pages: built.length,
	filings: industry.stamp.filings,
	latest_quarter: latest.q,
	trailing_year_revenue: fmtMoney(latest.ttm_revenue),
	reported_debt: fmtMoney(latest.reported_debt),
	total_committed: fmtMoney(latest.committed),
	deferred_revenue: fmtMoney(latest.deferred),
	backlog: fmtMoney(latest.rpo),
	wall_next_5y: fmtMoney(industry.headline.wall_next5),
	wall_5_to_10y: fmtMoney(wallSum.obligations[1].disclosed + wallSum.obligations[1].estimated),
	wall_beyond_10y: fmtMoney(wallSum.obligations[2].disclosed + wallSum.obligations[2].estimated),
	undated_after_year_5: fmtMoney(wallSum.undated_after5),
	future_revenue_next_5y: fmtMoney(wallSum.future_revenue[0]),
	committed_vs_reported_debt: ratio(latest.committed, latest.reported_debt),
	backlog_vs_one_year_of_revenue: ratio(latest.rpo, latest.ttm_revenue),
	due_next_5y_vs_revenue_promised_next_5y: ratio(industry.headline.wall_next5, wallSum.future_revenue[0]),
	revenue_growth_per_year: fmtPct(industry.growth.cagr.revenue),
	committed_growth_per_year: fmtPct(industry.growth.cagr.committed),
	reported_debt_growth_per_year: fmtPct(industry.growth.cagr.reported_debt),
	deferred_growth_per_year: fmtPct(industry.growth.cagr.deferred),
	median_expense_growth_per_year: fmtPct(industry.growth.cagr.expenses),
	quarters_changed_by_reconciliation: `${industry.declared_vs_actual.adjusted_quarters.n} of ${industry.declared_vs_actual.adjusted_quarters.of}`,
	top_flag_types: industry.flags.by_type.slice(0, 6),
	notable_flags: industry.flags.notable,
	biggest_categories: industry.categories.slice(0, 3).map((c) => ({ label: c.label, trailing_year_revenue: fmtMoney(c.ttm_revenue) })),
	expense_component_latest: compSum.at(-1) ? {
		year: compSum.at(-1)!.year,
		cost_of_revenue: fmtMoney(compSum.at(-1)!.cost_of_revenue), rnd: fmtMoney(compSum.at(-1)!.rnd),
		sga: fmtMoney(compSum.at(-1)!.sga), tax: fmtMoney(compSum.at(-1)!.tax),
		stock_pay_inside_those_lines: fmtMoney(compSum.at(-1)!.sbc), capex_cash: fmtMoney(compSum.at(-1)!.capex)
	} : null,

}, dropEmpty, 1)

const industryTool: Tool = {
	name: "submit_prose",
	description: "Sections for the industry research paper",
	// No `intro` (it duplicated the hand-written masthead) and no `method` (the
	// page has a better hand-written fallback) — the page's {#if} guards handle absence.
	parameters: Type.Object({
		debt: Type.String({ description: "1-3 sentences adding what the section headline (which already states both totals) cannot: what drives the gap or how fast it grew, from FACTS only" }),
		revenue_reality: Type.String({ description: "1-3 sentences: the comparison between earned revenue and the deferred + backlog pile, using the FACTS ratio" }),
		components: Type.String({ description: "2-3 sentences: the one standout in where money is earned or spent — not a recitation of every line" }),
		wall: Type.String({ description: "1-3 sentences: the tension between what is due and the revenue promised for the same window. Skip empty bands." }),
		growth: Type.String({ description: "1-3 sentences: the single sharpest growth-rate comparison, stated plainly" }),
		declared: Type.String({ description: "1-3 sentences: how often reconciliation changed the as-filed numbers and the leading reason" })
	})
}
industry.prose = await checkedProse(PROSE_RULES, industryFacts, industryTool, "industry")

pending.set(join(OUT, "industry.json"), JSON.stringify(industry))
flush()
console.log(`wrote ${built.length} company files + industry.json (industry n=${ind.length}, series ${series[0]?.q}→${latest.q})`)
