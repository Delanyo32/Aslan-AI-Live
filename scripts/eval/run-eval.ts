#!/usr/bin/env bun
// WP7.1 — Eval harness (SPEC v0.3 §3 WP7.1, §2.6 VERDICT_BETA gate, §5 invariants 3/4/6).
//
//   bun scripts/eval/run-eval.ts                       (all three sections)
//   bun scripts/eval/run-eval.ts --section=extraction  (one section; repeatable)
//   bun scripts/eval/run-eval.ts --company=AAPL         (filter extraction to one ticker)
//
// Three sections, each a summary table; exit 1 if any RUN section fails its threshold:
//   1. extraction — real extractFundamentals vs hand-verified truth.json; % of truth
//      figures matched within 1% relative. ≥98% is the manual VERDICT_BETA gate (§2.6).
//      Reports the measured number; NEVER auto-flips the config.
//   2. stability  — deterministic grading path run twice on fixed evidence; grade,
//      score, confidence, evidence_hash must be identical, and identical across a
//      reordering of the evidence set. Asserts §5 invariant 4 mechanically.
//   3. language   — checkLanguageCompliance over known-bad fixtures (must CATCH) and
//      the real persisted report g69bow (must be CLEAN). Asserts §5 invariant 6.
//
// Real Exa spend in section 1 (≈ cents/company, approved). Sections 2/3 are offline
// except the read-only local-D1 read in 3(b).

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Exa from "exa-js"

import { getModel } from "@mariozechner/pi-ai"
import { extractFundamentals, makeExtractionLLM, type ExaCaller } from "../../src/lib/server/terminal/extraction"
import { gradeDimension } from "../../src/lib/server/terminal/scoring"
import { checkLanguageCompliance } from "../../src/lib/server/terminal/synthesis"
import { buildContentsRequest, buildSearchRequest, type ExaResults } from "../../src/lib/server/terminal/exa"
import type { RubricFramework, RubricRecipe } from "../../src/lib/server/terminal/rubrics/schema"
import type { DimensionEvidence, DimensionGrade, EvidenceItem, ScreenHit, SignalFinding } from "../../src/lib/types/terminal"
import type { companies } from "../../src/lib/server/db/schema/terminal"

type Company = typeof companies.$inferSelect

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, "..", "..")

// ── env: hand-rolled .dev.vars parse (bun auto-loads .env, not .dev.vars) — mirrors exa-smoke.ts ──
function loadDevVars(path: string): void {
	if (!existsSync(path)) return
	for (const raw of readFileSync(path, "utf8").split("\n")) {
		const line = raw.trim()
		if (!line || line.startsWith("#")) continue
		const eq = line.indexOf("=")
		if (eq === -1) continue
		const key = line.slice(0, eq).trim()
		let val = line.slice(eq + 1).trim()
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
			val = val.slice(1, -1)
		if (!(key in process.env)) process.env[key] = val
	}
}
loadDevVars(resolve(REPO, ".dev.vars"))

// ── args (hand-rolled per brief) ──────────────────────────────────────────────
const argv = process.argv.slice(2)
const sectionsArg = new Set<string>()
let companyFilter: string | null = null
for (const a of argv) {
	if (a.startsWith("--section=")) sectionsArg.add(a.slice("--section=".length).trim())
	else if (a.startsWith("--company=")) companyFilter = a.slice("--company=".length).trim().toUpperCase()
	else console.log(`(ignoring unknown arg: ${a})`)
}
const shouldRun = (name: string) => sectionsArg.size === 0 || sectionsArg.has(name)

// ── tiny output helpers ───────────────────────────────────────────────────────
type SectionResult = { name: string; pass: boolean; detail: string }
const sections: SectionResult[] = []
const hr = (n = 78) => console.log("─".repeat(n))
function header(title: string): void {
	console.log("")
	hr()
	console.log(`  ${title}`)
	hr()
}
function table(rows: string[][], headers: string[]): void {
	const all = [headers, ...rows]
	const widths = headers.map((_, c) => Math.max(...all.map((r) => (r[c] ?? "").length)))
	const fmt = (r: string[]) => r.map((cell, c) => (cell ?? "").padEnd(widths[c])).join("  ")
	console.log("  " + fmt(headers))
	console.log("  " + widths.map((w) => "─".repeat(w)).join("  "))
	for (const r of rows) console.log("  " + fmt(r))
}

// ── data files ────────────────────────────────────────────────────────────────
const companiesJson = JSON.parse(readFileSync(resolve(__dir, "companies.json"), "utf8"))
const truthJson = JSON.parse(readFileSync(resolve(__dir, "truth.json"), "utf8"))
const nameByTicker = new Map<string, string>()
for (const c of companiesJson.companies) nameByTicker.set(c.ticker, c.name)

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — extraction accuracy
// ══════════════════════════════════════════════════════════════════════════════

const EXTRACTION_THRESHOLD = 98 // ≥98% flips VERDICT_BETA (manual config change, §2.6)
const SCALES = [1, 1e3, 1e6, 1e9] // extractor may report in the filing's thousands/millions convention

function relError(truth: number, got: number): number {
	if (truth === 0) return Math.abs(got) <= 0.01 ? 0 : Infinity
	return Math.abs(truth - got) / Math.abs(truth)
}
// %: direct 1% relative. money/shares: scale the extracted value up to full units,
// keep the best-fitting scale, and disclose it — a genuine value error still fails.
function matchFigure(truthVal: number, unit: string, gotVal: number): { ok: boolean; scale: number; relErr: number } {
	if (unit === "%") {
		const relErr = relError(truthVal, gotVal)
		return { ok: relErr <= 0.01, scale: 1, relErr }
	}
	let best = { ok: false, scale: 1, relErr: Infinity }
	for (const s of SCALES) {
		const relErr = relError(truthVal, gotVal * s)
		if (relErr < best.relErr) best = { ok: relErr <= 0.01, scale: s, relErr }
	}
	return best
}
const normPeriod = (p: string) => p.toUpperCase().replace(/[\s-]/g, "")
const human = (n: number): string =>
	Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(3)}e9` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(3)}e6` : `${n}`

function fakeCompany(ticker: string, name: string): Company {
	return {
		id: `eval-${ticker}`, ticker, name, exa_entity: null, is_us: true, alpaca_symbol: ticker,
		sector: null, competitor_webset_id: null, monitor_state: null,
		created_at: new Date(), updated_at: new Date()
	} as Company
}

async function runExtraction(): Promise<SectionResult> {
	header("SECTION 1 — Extraction accuracy (real Exa; truth = latest 10-K on SEC EDGAR)")

	// verified companies from truth.json (skip unverified), honoring --company.
	const verified = Object.entries<any>(truthJson.companies)
		.filter(([, v]) => !v.unverified && v.figures)
		.filter(([tk]) => !companyFilter || tk === companyFilter)
		.map(([tk]) => tk)

	if (verified.length === 0) {
		const msg = companyFilter
			? `no verified truth for ${companyFilter} — nothing to score (skipped)`
			: "no verified companies in truth.json (skipped)"
		console.log(`  ${msg}`)
		return { name: "extraction", pass: true, detail: msg }
	}

	const apiKey = process.env.EXA_API_KEY
	if (!apiKey) {
		console.log("  FAIL — EXA_API_KEY not set (checked process.env and .dev.vars)")
		return { name: "extraction", pass: false, detail: "EXA_API_KEY missing" }
	}

	if (!process.env.OPENROUTER_API_KEY) {
		console.log("  FAIL — OPENROUTER_API_KEY not set (extraction passes run on getAiModel's model)")
		return { name: "extraction", pass: false, detail: "OPENROUTER_API_KEY missing" }
	}

	const exa = new Exa(apiKey)
	const caller: ExaCaller = {
		search: (recipe, name, opts) => exa.request<ExaResults>("/search", "POST", buildSearchRequest(recipe, name, opts)),
		contents: (urls, opts) => exa.request<ExaResults>("/contents", "POST", buildContentsRequest(urls, opts))
	}
	// Inject the LLM: ai.ts imports $env at module load, unresolvable under bun
	// scripts — same model id as production (wrangler.toml OPENROUTER_DEFAULT_MODEL).
	const modelId = process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-5.4-mini"
	const model = getModel("openrouter", modelId as Parameters<typeof getModel>[1])
	if (!model) {
		console.log(`  FAIL — unknown model "${modelId}"`)
		return { name: "extraction", pass: false, detail: `unknown model ${modelId}` }
	}
	const extractionLLM = makeExtractionLLM(model)

	let totalFigures = 0
	let totalMatched = 0
	const perCompany: string[][] = []

	for (const ticker of verified) {
		const name = nameByTicker.get(ticker) ?? ticker
		const truthFigs = truthJson.companies[ticker].figures as Record<string, any>
		console.log(`\n  ── ${ticker} (${name}) — extracting …`)

		let extraction
		try {
			const t0 = Date.now()
			extraction = await extractFundamentals(fakeCompany(ticker, name), caller, extractionLLM)
			console.log(`     extracted in ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
				`${extraction.figures.length} agreed figure(s), ${extraction.disagreements.length} disagreement(s), ` +
				`confidence=${extraction.confidence}, dropped_unsourced=${extraction.dropped_unsourced ?? 0}`)
		} catch (e) {
			console.log(`     ERROR extracting ${ticker}: ${e instanceof Error ? e.message : String(e)}`)
			// count the company's verified figures as unmatched (extraction failed).
			for (const [fig, t] of Object.entries(truthFigs)) if (!t.unverified) totalFigures++
			perCompany.push([ticker, "ERR", "extraction threw", "—"])
			continue
		}

		const disagreedNames = new Set(extraction.disagreements.map((d) => d.name))
		const rows: string[][] = []
		let matched = 0
		let scored = 0

		for (const [figName, t] of Object.entries(truthFigs)) {
			if (t.unverified) {
				rows.push([figName + (t.derived ? " (d)" : ""), "unverified", "—", "—", "—", "SKIP"])
				continue
			}
			scored++
			totalFigures++
			const marker = t.derived ? " (d)" : ""

			// candidate extracted figures for this name; prefer period match, else best-fit.
			const sameName = extraction.figures.filter((f) => f.name === figName)
			const periodMatch = sameName.filter((f) => normPeriod(f.period) === normPeriod(t.period))
			const pool = periodMatch.length ? periodMatch : sameName

			if (pool.length === 0) {
				const status = disagreedNames.has(figName) ? "DISAGREED" : "MISSING"
				rows.push([figName + marker, `${human(t.value)} ${t.unit}`, "—", "—", "—", status])
				continue
			}

			// pick the best-matching candidate (gives extraction the benefit of the doubt on period).
			let bestCand = pool[0]
			let bestM = matchFigure(t.value, t.unit, pool[0].value)
			for (const f of pool.slice(1)) {
				const m = matchFigure(t.value, t.unit, f.value)
				if (m.relErr < bestM.relErr) { bestM = m; bestCand = f }
			}

			const periodNote = normPeriod(bestCand.period) === normPeriod(t.period) ? "" : `~${bestCand.period}`
			const scaleNote = t.unit === "%" ? "" : bestM.scale === 1 ? "×1" : `×${human(bestM.scale)}`
			const gotStr = `${human(bestCand.value)} ${bestCand.unit}${periodNote ? " " + periodNote : ""}`
			const errStr = bestM.relErr === Infinity ? "inf" : `${(bestM.relErr * 100).toFixed(2)}%`
			if (bestM.ok) matched++
			rows.push([figName + marker, `${human(t.value)} ${t.unit}`, gotStr, scaleNote, errStr, bestM.ok ? "MATCH" : "MISMATCH"])
		}

		totalMatched += matched
		console.log("")
		table(rows, ["figure", "truth", "extracted", "scale", "relErr", "status"])
		const pct = scored ? ((matched / scored) * 100).toFixed(1) : "n/a"
		console.log(`     ${ticker}: ${matched}/${scored} matched (${pct}%)   [(d)=derived, likely legitimate mismatch]`)
		perCompany.push([ticker, `${matched}/${scored}`, `${pct}%`, extraction.confidence])
	}

	const pct = totalFigures ? (totalMatched / totalFigures) * 100 : 0
	console.log("")
	table(perCompany, ["company", "matched", "pct", "extract_conf"])
	console.log("")
	console.log(`  MEASURED EXTRACTION ACCURACY: ${totalMatched}/${totalFigures} = ${pct.toFixed(2)}%`)
	console.log(`  VERDICT_BETA gate: ≥${EXTRACTION_THRESHOLD}% would flip VERDICT_BETA (MANUAL config change — this harness never flips it).`)
	const pass = pct >= EXTRACTION_THRESHOLD
	console.log(`  section threshold (≥${EXTRACTION_THRESHOLD}%): ${pass ? "PASS" : "FAIL"} — the number is the deliverable; a low result is a finding, not a failure to hide.`)
	return { name: "extraction", pass, detail: `${pct.toFixed(2)}% (${totalMatched}/${totalFigures})` }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — grade stability (§5 invariant 4)
// ══════════════════════════════════════════════════════════════════════════════

const STUB_WRITER = async () => "STUB SUMMARY — fixed prose so grading is fully deterministic."

function fxFramework(): RubricFramework {
	return {
		version: "1.0.0", id: "F1", name: "Fixture framework", question: "Fixture question?", weight: 1,
		signals: [
			{ id: "s1", description: "signal one", polarity: "both", weight: 0.5, recipe: { primitive: "search", query_template: "{company}" } },
			{ id: "s2", description: "signal two", polarity: "both", weight: 0.5, recipe: { primitive: "search", query_template: "{company}" } }
		],
		grade_anchors: { A: "anchor A", C: "anchor C", F: "anchor F" },
		false_signals: [
			{ id: "fs1", description: "false signal one", recipe: { primitive: "search", query_template: "{company}" }, action: "cap:C" }
		],
		evidence_policy: { min_sources: 5, min_independent: 2, recency_days: 365 }
	}
}

function ev(id: string, domain: string, controlled = false): EvidenceItem {
	return {
		id, url: `https://${domain}/${id}`, title: `title ${id}`, source_domain: domain,
		published_at: "2026-06-01", snippet: `snippet ${id}`, content_hash: `hash-${id}`,
		origin: "report_run", dimensions: ["F1"], company_controlled: controlled
	}
}
function cite(item: EvidenceItem) {
	return { url: item.url, title: item.title, source_domain: item.source_domain, published_at: item.published_at, snippet: item.snippet }
}

function fixtureClean(): DimensionEvidence {
	const items = [ev("a", "reuters.com"), ev("b", "bloomberg.com"), ev("c", "ft.com"), ev("d", "wsj.com"), ev("e", "sec.gov"), ev("f", "nytimes.com")]
	return {
		dimension: "F1",
		findings: [
			{ signal_id: "s1", direction: "supports", strength: 2, summary: "cited support one", citations: [cite(items[0]), cite(items[1])] },
			{ signal_id: "s2", direction: "supports", strength: 2, summary: "cited support two", citations: [cite(items[2])] }
		],
		screen_hits: [],
		evidence_items: items,
		searches_run: 3
	}
}
function fixtureConfirmedHit(): DimensionEvidence {
	const items = [ev("g", "reuters.com"), ev("h", "bloomberg.com"), ev("i", "ft.com"), ev("j", "sec.gov")]
	const hitCites = [cite(items[0]), cite(items[2])] // 2 independent domains → confirmed-eligible
	return {
		dimension: "F1",
		findings: [
			{ signal_id: "s1", direction: "supports", strength: 3, summary: "strong support that would otherwise push to an A", citations: [cite(items[1])] }
		],
		screen_hits: [
			{ pattern_id: "fs1", status: "confirmed", summary: "cited observation exercising the cap:C screen", detail: "owner-only detail", citations: hitCites, action: "cap:C" }
		],
		evidence_items: items,
		searches_run: 2
	}
}

async function gradeKey(evidence: DimensionEvidence, fw: RubricFramework): Promise<DimensionGrade> {
	return gradeDimension(evidence, fw, null, STUB_WRITER)
}
const gradeTuple = (g: DimensionGrade) => `${g.grade}|${g.score}|${g.confidence}|${g.evidence_hash}`

async function runStability(): Promise<SectionResult> {
	header("SECTION 2 — Grade stability (§5 invariant 4: a grade is pinned to its evidence_hash)")
	const fw = fxFramework()
	const rows: string[][] = []
	let allPass = true

	const fixtures: { label: string; ev: DimensionEvidence; expect?: (g: DimensionGrade) => string | null }[] = [
		{ label: "clean-positive", ev: fixtureClean() },
		{
			label: "confirmed-cap:C",
			ev: fixtureConfirmedHit(),
			expect: (g) => (g.score <= 69 ? null : `cap:C not applied — score ${g.score} > 69`)
		}
	]

	// 1) run each fixture twice → identical grade/score/confidence/evidence_hash.
	for (const fx of fixtures) {
		const a = await gradeKey(fx.ev, fw)
		const b = await gradeKey(fx.ev, fw)
		const stable = gradeTuple(a) === gradeTuple(b)
		let extra: string | null = null
		if (fx.expect) extra = fx.expect(a)
		const pass = stable && !extra
		allPass = allPass && pass
		rows.push([
			fx.label, "run×2 identical",
			`${a.grade} ${a.score} ${a.confidence}`,
			`${a.evidence_hash.slice(0, 12)}…`,
			pass ? "PASS" : `FAIL ${extra ?? "(differed across runs)"}`
		])
	}

	// 2) reorder invariance: same evidence set, items + findings reversed → identical everything.
	const base = fixtureClean()
	const reordered: DimensionEvidence = {
		...base,
		evidence_items: [...base.evidence_items].reverse(),
		findings: [...base.findings].reverse()
	}
	const g1 = await gradeKey(base, fw)
	const g2 = await gradeKey(reordered, fw)
	const hashSame = g1.evidence_hash === g2.evidence_hash
	const tupleSame = gradeTuple(g1) === gradeTuple(g2)
	const reorderPass = hashSame && tupleSame
	allPass = allPass && reorderPass
	rows.push([
		"clean-positive", "reorder-invariant",
		`${g2.grade} ${g2.score} ${g2.confidence}`,
		`${g2.evidence_hash.slice(0, 12)}…`,
		reorderPass ? "PASS" : `FAIL (hashSame=${hashSame} tupleSame=${tupleSame})`
	])

	console.log("")
	table(rows, ["fixture", "check", "grade", "evidence_hash", "result"])
	console.log(`\n  ${allPass ? "PASS" : "FAIL"} — deterministic grading path is reproducible and evidence-order independent.`)
	return { name: "stability", pass: allPass, detail: allPass ? "all checks reproducible" : "non-deterministic grading detected" }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — language compliance (§5 invariant 6)
// ══════════════════════════════════════════════════════════════════════════════

function readG69bow(): { narrative: string; bear: string; bull: string; flags: string[] } | { error: string } {
	try {
		const out = execFileSync(
			"bunx",
			["wrangler", "d1", "execute", "aslan-ai", "--local", "--json", "--command",
				"SELECT narrative, bear_bull, dimensions FROM terminal_reports WHERE slug='g69bow'"],
			{ cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 }
		)
		// wrangler --json prints a clean JSON array to stdout; be defensive about any banner.
		const start = out.indexOf("[")
		const parsed = JSON.parse(out.slice(start))
		const row = parsed?.[0]?.results?.[0]
		if (!row) return { error: "g69bow not found in local D1" }
		const bearBull = typeof row.bear_bull === "string" ? JSON.parse(row.bear_bull) : (row.bear_bull ?? {})
		const dims = typeof row.dimensions === "string" ? JSON.parse(row.dimensions) : (row.dimensions ?? [])
		const flags: string[] = []
		for (const d of dims ?? []) for (const f of d.flags ?? []) if (f?.summary) flags.push(f.summary)
		return { narrative: row.narrative ?? "", bear: bearBull.bear ?? "", bull: bearBull.bull ?? "", flags }
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) }
	}
}

async function runLanguage(): Promise<SectionResult> {
	header("SECTION 3 — Language compliance (§5 invariant 6: cited observations, never accusations)")
	let allPass = true

	// (a) known-bad fixtures — a CATCH is a PASS; plus one compliant control (must stay clean).
	const badFixtures: { label: string; text: string }[] = [
		{ label: "accusation: fraud", text: "The company committed fraud by inflating revenue in the period." },
		{ label: "accusation: is hiding", text: "Management is hiding mounting losses inside an offshore entity." },
		{ label: "accusation: pump and dump / scheme", text: "The promotion looks like a pump and dump scheme timed to the raise." },
		{ label: "accusation: cooking the books", text: "Short sellers say the CFO is cooking the books ahead of the lockup." },
		{ label: "accusation: fake deal", text: "The announced partnership was a fake deal booked only to inflate the order book." }
	]
	const control = {
		label: "compliant control (must stay clean)",
		text: "Reuters reported the auditor issued a qualified opinion; the cited escrow balance could not be independently confirmed by the reviewed filings."
	}

	const aRows: string[][] = []
	for (const fx of badFixtures) {
		const found = checkLanguageCompliance(fx.text)
		const caught = found.length > 0
		allPass = allPass && caught
		aRows.push([fx.label, caught ? `caught: ${found.join(", ")}` : "NOT CAUGHT", caught ? "PASS" : "FAIL"])
	}
	{
		const found = checkLanguageCompliance(control.text)
		const clean = found.length === 0
		allPass = allPass && clean
		aRows.push([control.label, clean ? "clean" : `false-positive: ${found.join(", ")}`, clean ? "PASS" : "FAIL"])
	}
	console.log("\n  (a) fixtures — known-bad framings must be CAUGHT; compliant control must stay CLEAN:")
	console.log("")
	table(aRows, ["fixture", "result", "status"])

	// (b) real persisted report g69bow — every generated field must be CLEAN.
	console.log("\n  (b) real persisted report g69bow (local D1) — expect ZERO violations:")
	const real = readG69bow()
	const bRows: string[][] = []
	if ("error" in real) {
		console.log(`     WARN — could not read g69bow: ${real.error}`)
		bRows.push(["g69bow read", real.error, "SKIP"])
		// a missing local row is an environment gap, not a language failure — do not gate on it.
	} else {
		const fieldChecks: { label: string; text: string }[] = [
			{ label: "narrative", text: real.narrative },
			{ label: "bear_bull.bear", text: real.bear },
			{ label: "bear_bull.bull", text: real.bull },
			...real.flags.map((f, i) => ({ label: `flag[${i}].summary`, text: f }))
		]
		if (real.flags.length === 0) bRows.push(["flags", "no screen flags on this report", "n/a"])
		for (const fc of fieldChecks) {
			const found = checkLanguageCompliance(fc.text)
			const clean = found.length === 0
			allPass = allPass && clean
			bRows.push([fc.label, `${fc.text.length} chars`, clean ? "CLEAN" : `VIOLATION: ${found.join(", ")}`])
		}
	}
	console.log("")
	table(bRows, ["field", "size/detail", "status"])

	console.log(`\n  ${allPass ? "PASS" : "FAIL"} — banned framings caught in fixtures; real report content compliant.`)
	return { name: "language", pass: allPass, detail: allPass ? "fixtures caught, real content clean" : "language check failed" }
}

// ══════════════════════════════════════════════════════════════════════════════
// run
// ══════════════════════════════════════════════════════════════════════════════

console.log("Aslan Terminal — WP7.1 eval harness")
console.log(`sections: ${sectionsArg.size ? [...sectionsArg].join(", ") : "extraction, stability, language"}` +
	(companyFilter ? ` · company filter: ${companyFilter}` : ""))

if (shouldRun("stability")) sections.push(await runStability())
if (shouldRun("language")) sections.push(await runLanguage())
if (shouldRun("extraction")) sections.push(await runExtraction()) // last: it's the slow, live-spend one

header("SUMMARY")
console.log("")
table(sections.map((s) => [s.name, s.pass ? "PASS" : "FAIL", s.detail]), ["section", "result", "detail"])
const failed = sections.filter((s) => !s.pass)
console.log("")
console.log(`  ${sections.length - failed.length}/${sections.length} sections passed`)
if (failed.length) console.log(`  FAILED: ${failed.map((s) => s.name).join(", ")}`)
process.exit(failed.length ? 1 : 0)
