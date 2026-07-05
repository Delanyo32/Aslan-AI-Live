#!/usr/bin/env bun
// WP7.2 — Exa API-behavior suite. Live, manually-run assertions of every Exa
// behavior exa.ts (WP1.1) depends on. Pins the §6 gotchas + the `// assumption:`
// comments in src/lib/server/terminal/exa.ts against the real API — docs drift.
//
//   bun scripts/exa-smoke.ts        (reads EXA_API_KEY from env or .dev.vars)
//
// Not in CI. Run before any Exa-touching deploy. Exits 1 if any assertion FAILs.
// Budget: cheapest search type, numResults 1, one minimal agent run, count:1
// webset — the whole suite costs well under $1.

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Exa, { ExaError } from "exa-js"
// Reuse the ACTUAL shipped builders so this suite verifies exa.ts's real request
// shaping against the live API, not a re-typed copy of it. (import type is erased
// by bun; the $env dynamic import inside exa.ts only fires if an executor is called,
// which we never do here — we drive our own Exa instance.)
import { buildAgentRunRequest, buildSearchRequest, buildContentsRequest } from "../src/lib/server/terminal/exa"
import type { RubricRecipe } from "../src/lib/server/terminal/rubrics/schema"

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, "..")

// ── env: hand-rolled dotenv parse of .dev.vars (bun auto-loads .env, not .dev.vars) ──
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

const API_KEY = process.env.EXA_API_KEY
if (!API_KEY) {
	console.error("FAIL setup — EXA_API_KEY not set (checked process.env and .dev.vars)")
	process.exit(1)
}
const exa = new Exa(API_KEY)

// ── tiny harness (continue on failure) ───────────────────────────────────────
type Result = { name: string; pass: boolean; detail: string }
const results: Result[] = []
function check(name: string, pass: boolean, detail = ""): void {
	results.push({ name, pass, detail })
	console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
}
async function step(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn()
	} catch (e) {
		check(name, false, `threw: ${errMsg(e)}`)
	}
}
function errMsg(e: unknown): string {
	if (e instanceof ExaError) return `ExaError ${e.statusCode}: ${e.message}`
	if (e instanceof Error) return e.message
	return String(e)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const cheapSearch = (body: Record<string, unknown>) => ({ ...body, type: "fast", numResults: 1 })

// Raw fetch — the SDK collapses structured error bodies to "[object Object]"; for
// the agent endpoint we want the exact schema-validation detail (drift intel).
async function raw(
	endpoint: string,
	method: string,
	body?: unknown
): Promise<{ status: number; ok: boolean; json: any }> {
	const res = await fetch(`https://api.exa.ai${endpoint}`, {
		method,
		headers: { "x-api-key": API_KEY!, "content-type": "application/json" },
		body: body ? JSON.stringify(body) : undefined
	})
	const text = await res.text()
	let json: any
	try { json = JSON.parse(text) } catch { json = text }
	return { status: res.status, ok: res.ok, json }
}
const rawErr = (j: any): string =>
	typeof j?.error === "object" ? `${j.error.message ?? ""} ${j.error.detail ?? ""}`.trim() : (j?.error ?? JSON.stringify(j)).toString()

// ── 1. every search category we use is accepted ──────────────────────────────
async function assertCategories(): Promise<void> {
	const cases: { cat: RubricRecipe["category"]; q: string }[] = [
		{ cat: "company", q: "Apple" }, // §6: singular-form for company/people
		{ cat: "news", q: "Apple earnings" },
		{ cat: "financial report", q: "Apple annual report 10-K" },
		{ cat: "people", q: "Tim Cook" }
	]
	for (const { cat, q } of cases) {
		const recipe: RubricRecipe = { primitive: "search", query_template: q, category: cat }
		const body = cheapSearch(buildSearchRequest(recipe, q))
		try {
			const res = await exa.request<{ results?: unknown[] }>("/search", "POST", body)
			check(`category:${cat}`, true, `accepted, ${res.results?.length ?? 0} result(s)`)
		} catch (e) {
			check(`category:${cat}`, false, errMsg(e))
		}
	}
}

// ── 2. maxAgeHours accepted; legacy livecrawl rejected-or-ignored (report which) ──
async function assertMaxAgeHours(): Promise<void> {
	const recipe: RubricRecipe = { primitive: "search", query_template: "Apple news", category: "news", contents: "text" }
	const body = cheapSearch(buildSearchRequest(recipe, "Apple news", { maxAgeHours: 24 }))
	try {
		await exa.request("/search", "POST", body)
		check("maxAgeHours accepted", true, "contents.maxAgeHours=24 accepted on /search")
	} catch (e) {
		check("maxAgeHours accepted", false, errMsg(e))
	}
}
async function assertLegacyLivecrawl(): Promise<void> {
	// Send the deprecated param the way the old API took it (top-level + contents-level).
	const body = {
		query: "Apple news",
		type: "fast",
		numResults: 1,
		livecrawl: "always",
		contents: { text: true, livecrawl: "always" }
	}
	try {
		await exa.request("/search", "POST", body)
		// Informational assumption — either outcome is fine; we record the drift.
		check("legacy livecrawl", true, "IGNORED (200) — Exa silently drops the deprecated param")
	} catch (e) {
		if (e instanceof ExaError)
			check("legacy livecrawl", true, `REJECTED (${e.statusCode}) — ${e.message}`)
		else check("legacy livecrawl", false, errMsg(e))
	}
}

// ── 3. contents nesting: contents.highlights on /search, top-level highlights on /contents ──
async function assertContentsNesting(): Promise<void> {
	let url = "https://www.apple.com/"
	try {
		const recipe: RubricRecipe = { primitive: "search", query_template: "Apple", category: "news", contents: "highlights" }
		const body = cheapSearch(buildSearchRequest(recipe, "Apple"))
		const nested = (body.contents as Record<string, unknown> | undefined)?.highlights !== undefined
		const res = await exa.request<{ results?: { url: string; highlights?: string[] }[] }>("/search", "POST", body)
		check("/search contents.highlights", nested && Array.isArray(res.results),
			`nested under contents=${nested}, ${res.results?.length ?? 0} result(s)`)
		if (res.results?.[0]?.url) url = res.results[0].url
	} catch (e) {
		check("/search contents.highlights", false, errMsg(e))
	}
	try {
		const body = buildContentsRequest([url], { contents: "highlights" })
		const topLevel = (body as Record<string, unknown>).highlights !== undefined && !("contents" in body)
		const res = await exa.request<{ results?: unknown[] }>("/contents", "POST", body)
		check("/contents top-level highlights", topLevel && Array.isArray(res.results),
			`top-level=${topLevel}, ${res.results?.length ?? 0} result(s)`)
	} catch (e) {
		check("/contents top-level highlights", false, errMsg(e))
	}
}

// ── 4. Agent API: create → poll → result shape + output.grounding; status vocab ──
const KNOWN_AGENT_STATUSES = new Set(["pending", "running", "completed", "failed", "canceled", "cancelled"])
const AGENT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["ticker"],
	properties: {
		// §6: Connect routing is driven by field descriptions naming the source.
		ticker: { type: "string", description: "Apple Inc.'s primary stock ticker symbol as listed on its stock exchange" }
	}
}
const AGENT_PROMPT = "What is Apple Inc.'s primary stock ticker symbol and the exchange it trades on?"

async function assertAgentRun(): Promise<void> {
	// Create with the EXACT body exa.ts ships (buildAgentRunRequest — the same pure
	// builder createAgentRun uses), so this check pins the shipped shape, not a copy.
	// raw() instead of the SDK to keep schema-validation detail on rejection.
	const created = await raw("/agent/runs", "POST",
		buildAgentRunRequest({ query: AGENT_PROMPT, outputSchema: AGENT_SCHEMA, effort: "minimal" }))
	check("agent create — exa.ts shape", created.ok && !!created.json?.id,
		created.ok
			? `accepted, id=${created.json.id}, initial status=${created.json.status ?? "?"}`
			: `REJECTED (${created.status}) — DRIFT: ${rawErr(created.json)}`)
	if (!created.ok || !created.json?.id) return

	const observed = new Set<string>()
	if (created.json.status) observed.add(created.json.status)
	let final: any = null
	const deadline = Date.now() + 6 * 60_000
	let delay = 4_000
	let lastStatus = created.json.status
	while (Date.now() < deadline) {
		const run = (await raw(`/agent/runs/${created.json.id}`, "GET")).json
		if (run?.status) observed.add(run.status)
		if (run?.status !== lastStatus) {
			console.log(`     agent status → ${run?.status}`)
			lastStatus = run?.status
		}
		if (run?.status === "completed") { final = run; break }
		if (run?.status && KNOWN_AGENT_STATUSES.has(run.status) && run.status !== "pending" && run.status !== "running") {
			final = run // terminal failure state
			break
		}
		await sleep(delay)
		delay = Math.min(Math.round(delay * 1.5), 20_000)
	}

	console.log(`     observed agent statuses: [${[...observed].join(", ")}]`)
	const unknown = [...observed].filter((s) => !KNOWN_AGENT_STATUSES.has(s))
	check("agent status vocab ⊆ exa.ts expectations", unknown.length === 0,
		unknown.length ? `UNEXPECTED: [${unknown.join(", ")}] — exa.ts poll would mishandle` : `observed [${[...observed].join(", ")}] all known`)

	check("agent run reached completed", final?.status === "completed", `final status=${final?.status ?? "timeout"}`)
	const outKeys = final?.output ? Object.keys(final.output) : []
	check("agent result.output present", final?.output != null,
		final?.output != null ? `output keys=[${outKeys.join(",")}]` : "no output object")
	// research.ts reads output.structured (schema-shaped result) with output.text fallback
	check("agent output.structured present", final?.output?.structured != null,
		final?.output?.structured != null ? "structured result present" : `structured=${JSON.stringify(final?.output?.structured) ?? "absent"}`)
	const grounding = final?.output?.grounding
	check("agent output.grounding present", Array.isArray(grounding) && grounding.length > 0,
		Array.isArray(grounding) ? `${grounding.length} grounding entr(ies)` : `grounding=${JSON.stringify(grounding) ?? "absent"}`)
}

// ── 5. Monitor + Webset create/delete (try/finally cleanup — delete even on failure) ──
const DUMMY_HOOK = "https://example.com/hook" // per brief
// Resolvable public host; Exa's SSRF validator rejects RFC2606 reserved domains
// (example.com). Never triggered — the monitor is deleted immediately.
const FALLBACK_HOOK = "https://hooks.slack.com/services/T00000000/B00000000/xxxxxxxxxxxxxxxxxxxxxxxx"

async function assertMonitorLifecycle(): Promise<void> {
	const mk = (url: string) =>
		exa.monitors.create({
			search: { query: "Apple news deal executive recall investigation" },
			trigger: { type: "interval", period: "1d" }, // §6 cadence, exa.ts createMonitor shape
			webhook: { url, events: ["monitor.run.completed"] }
		})
	let id: string | undefined
	try {
		let m
		let usedFallback = false
		try {
			m = await mk(DUMMY_HOOK)
		} catch (e) {
			if (e instanceof ExaError && /webhook/i.test(e.message)) {
				console.log(`     note: ${DUMMY_HOOK} REJECTED by SSRF validator (${e.message}); retrying with a public host`)
				usedFallback = true
				m = await mk(FALLBACK_HOOK)
			} else throw e
		}
		id = m.id
		check("monitor create", !!m.id, `id=${m.id ?? "none"}${usedFallback ? " (example.com rejected → public host)" : ""}`)
		check("monitor webhookSecret", true, m.webhookSecret ? "present" : "absent") // never print the value
	} catch (e) {
		check("monitor create", false, errMsg(e))
	} finally {
		if (id) {
			try {
				await exa.monitors.delete(id)
				check("monitor delete (cleanup)", true, `deleted ${id}`)
			} catch (e) {
				check("monitor delete (cleanup)", false, `LEAKED ${id}: ${errMsg(e)}`)
			}
		}
	}
}
async function assertWebsetLifecycle(): Promise<void> {
	let id: string | undefined
	try {
		const w = await exa.websets.create({
			search: { query: "Company that is a direct competitor of Apple", count: 1, entity: { type: "company" } },
			metadata: { purpose: "exa_smoke_test" }
		})
		id = w.id
		check("webset create", !!w.id, `id=${w.id ?? "none"}`)
	} catch (e) {
		check("webset create", false, errMsg(e))
	} finally {
		if (id) {
			try {
				await exa.websets.delete(id)
				check("webset delete (cleanup)", true, `deleted ${id}`)
			} catch (e) {
				check("webset delete (cleanup)", false, `LEAKED ${id}: ${errMsg(e)}`)
			}
		}
	}
}

// ── 6. tweet category → expect rejection (confirms §6 removal) ────────────────
async function assertTweetRejected(): Promise<void> {
	// Bypass exa.ts's builder (which refuses tweet locally) — hit the live API raw.
	const body = { query: "Apple", category: "tweet", type: "fast", numResults: 1 }
	try {
		await exa.request("/search", "POST", body)
		check("tweet category rejected", false, "ACCEPTED (200) — tweet category still live, exa.ts CATEGORIES drift")
	} catch (e) {
		if (e instanceof ExaError) check("tweet category rejected", true, `rejected (${e.statusCode})`)
		else check("tweet category rejected", false, errMsg(e))
	}
}

// ── run all ──────────────────────────────────────────────────────────────────
const started = Date.now()
console.log("Exa API-behavior suite (WP7.2) — live checks\n")
await step("category acceptance", assertCategories)
await step("maxAgeHours", assertMaxAgeHours)
await step("legacy livecrawl", assertLegacyLivecrawl)
await step("contents nesting", assertContentsNesting)
await step("agent run", assertAgentRun)
await step("monitor lifecycle", assertMonitorLifecycle)
await step("webset lifecycle", assertWebsetLifecycle)
await step("tweet rejection", assertTweetRejected)

// ── summary ──────────────────────────────────────────────────────────────────
const elapsed = ((Date.now() - started) / 1000).toFixed(1)
const failed = results.filter((r) => !r.pass)
const width = Math.max(...results.map((r) => r.name.length))
console.log("\n─── summary " + "─".repeat(Math.max(0, width - 4)))
for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`)
console.log("─".repeat(width + 12))
console.log(`  ${results.length - failed.length}/${results.length} passed · ${elapsed}s elapsed`)
if (failed.length) console.log(`  ${failed.length} FAILED: ${failed.map((r) => r.name).join(", ")}`)
process.exit(failed.length ? 1 : 0)
