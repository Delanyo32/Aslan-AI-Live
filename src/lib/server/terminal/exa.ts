// Exa terminal client (WP1.1, SPEC v0.3 §3) — recipe→options mappers + SDK executors.
//
// SDK coverage (exa-js 2.11): websets + monitors go through the SDK clients
// (`exa.websets`, `exa.monitors`); search + contents through the SDK's native
// `exa.search()` / `exa.getContents()`. The SDK spreads its options straight
// into the wire body ({ query|urls, ...options }), so the PURE mappers below
// (buildSearchRequest / buildContentsRequest) are both the unit-testable shape
// AND the SDK arguments. Only the Agent API stays on raw `exa.request()` — the
// SDK has no /agent/runs client (its `research` client hits /research/v1, a
// different API).
//
// §6 gotchas honored here:
//   - contents params nest inside `contents` on /search, are top-level on /contents
//   - `maxAgeHours` (0 = force livecrawl, -1 = cache only); never `livecrawl`
//   - never emit useAutoprompt / numSentences / highlightsPerUrl / tokensNum / includeUrls
//   - categories limited to the §6 enum (no `tweet`, no `pdf`)
//   - `people` category supports no date/text filters
//   - singular-form queries for company/people are the CALLER's (recipe author's)
//     responsibility — builders interpolate verbatim.

import Exa from "exa-js"
import { hostOf } from "$lib/utils"
import type { RubricRecipe } from "./rubrics/schema"

// House rule 1: env at call time. Dynamic import (not top-level) so this module
// stays loadable under `bun test`, which has no resolver for $env virtual modules.
async function getExa(): Promise<Exa> {
	const { env } = await import("$env/dynamic/private")
	return new Exa(env.EXA_API_KEY)
}

// ── pure recipe→options mappers ──────────────────────────────────────────────

export type ExaCategory =
	| "company" | "news" | "financial report" | "research paper" | "personal site" | "people"

const CATEGORIES = new Set<string>([
	"company", "news", "financial report", "research paper", "personal site", "people"
])

const HIGHLIGHT_MAX_CHARS = 1500 // matches exa-events.ts

export type ContentsParams = {
	text?: true | { maxCharacters?: number }
	highlights?: { query?: string; maxCharacters?: number }
	summary?: { query?: string; schema?: Record<string, unknown> }
	maxAgeHours?: number
	subpages?: number
}

export type ExaSearchRequest = {
	query: string
	category?: ExaCategory
	numResults?: number
	includeDomains?: string[]
	startPublishedDate?: string
	contents?: ContentsParams
}

export type ExaContentsRequest = { urls: string[] } & ContentsParams

// Replaces {company} (and any other provided key) in a recipe query template.
function interpolate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match)
}

const isoDaysAgo = (days: number, now: Date): string =>
	new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)

function contentsFromKeyword(keyword: string): ContentsParams {
	if (keyword === "highlights") return { highlights: { maxCharacters: HIGHLIGHT_MAX_CHARS } }
	if (keyword === "summary") return { summary: {} }
	if (keyword === "text") return { text: true }
	throw new Error(`unsupported recipe contents "${keyword}" (expected highlights | summary | text)`)
}

export function buildSearchRequest(
	recipe: RubricRecipe,
	company: string,
	opts: { numResults?: number; maxAgeHours?: number; now?: Date } = {}
): ExaSearchRequest {
	if (!recipe.query_template)
		throw new Error(`recipe (primitive: ${recipe.primitive}) has no query_template`)

	const req: ExaSearchRequest = { query: interpolate(recipe.query_template, { company }) }

	if (recipe.category !== undefined) {
		if (!CATEGORIES.has(recipe.category))
			throw new Error(`category "${recipe.category}" is not in the §6 enum`)
		req.category = recipe.category as ExaCategory
	}
	if (opts.numResults !== undefined) req.numResults = opts.numResults
	if (recipe.domains?.length) req.includeDomains = recipe.domains
	// §6: `people` supports no date filters
	if (recipe.days !== undefined && req.category !== "people")
		req.startPublishedDate = isoDaysAgo(recipe.days, opts.now ?? new Date())

	// §6: on /search, contents params must nest inside `contents`
	const contents: ContentsParams = recipe.contents ? contentsFromKeyword(recipe.contents) : {}
	if (opts.maxAgeHours !== undefined) contents.maxAgeHours = opts.maxAgeHours
	if (Object.keys(contents).length > 0) req.contents = contents

	return req
}

export function buildContentsRequest(
	urls: string[],
	opts: {
		contents?: string // recipe keyword: highlights | summary | text (default text)
		summaryQuery?: string
		summarySchema?: Record<string, unknown>
		textMaxCharacters?: number // API max 1_000_000 (WP1.4 filing-text extraction)
		maxAgeHours?: number
		subpages?: number // callers cap at TERMINAL_CONFIG.EXTRACTION_FILING_PAGES
	} = {}
): ExaContentsRequest {
	// §6: on /contents, text/highlights/summary are TOP-LEVEL — no `contents` nesting
	const keyword = opts.contents ?? (opts.summarySchema || opts.summaryQuery ? "summary" : "text")
	const req: ExaContentsRequest = { urls, ...contentsFromKeyword(keyword) }
	if (req.summary) {
		if (opts.summaryQuery) req.summary.query = opts.summaryQuery
		if (opts.summarySchema) req.summary.schema = opts.summarySchema
	}
	if (req.text && opts.textMaxCharacters !== undefined)
		req.text = { maxCharacters: opts.textMaxCharacters }
	if (opts.maxAgeHours !== undefined) req.maxAgeHours = opts.maxAgeHours
	if (opts.subpages !== undefined) req.subpages = opts.subpages
	return req
}

// ── SDK executors ────────────────────────────────────────────────────────────

export type ExaResultItem = {
	url: string
	title: string | null
	publishedDate?: string
	highlights?: string[]
	summary?: string
	text?: string
}
export type ExaResults = { results: ExaResultItem[] }

export async function terminalSearch(
	recipe: RubricRecipe,
	company: string,
	opts?: { numResults?: number; maxAgeHours?: number }
): Promise<ExaResults> {
	const { query, contents, ...options } = buildSearchRequest(recipe, company, opts)
	const exa = await getExa()
	// An explicit `contents: undefined` keeps the SDK from injecting its default
	// text contents when the recipe asked for none (§6 wire-shape parity).
	return contents
		? exa.search(query, { ...options, contents })
		: exa.search(query, { ...options, contents: undefined })
}

export async function terminalContents(
	urls: string[],
	opts?: Parameters<typeof buildContentsRequest>[1]
): Promise<ExaResults> {
	const { urls: reqUrls, ...contents } = buildContentsRequest(urls, opts)
	const exa = await getExa()
	return exa.getContents(reqUrls, contents)
}

// Base-plan poll: a raw exa.search — NOT a Websets monitor, so it works without an
// Exa Pro plan (monitors 401 without Pro). Returns a parseMonitorWebhook-shaped
// payload so CompanyMonitor /ingest consumes poll hits exactly like a monitor
// webhook (same triage, content_hash dedupe, and rescore-queue path).
export async function pollSearch(
	query: string,
	opts: { numResults?: number; category?: ExaCategory; includeDomains?: string[]; startPublishedDate?: string } = {}
): Promise<{ output: ExaResults }> {
	const exa = await getExa()
	const options: Record<string, unknown> = {
		numResults: opts.numResults ?? 10,
		contents: { text: true } // parseMonitorWebhook reads text as the snippet fallback
	}
	if (opts.category) options.category = opts.category
	if (opts.includeDomains?.length) options.includeDomains = opts.includeDomains
	if (opts.startPublishedDate) options.startPublishedDate = opts.startPublishedDate
	const res = (await exa.search(query, options)) as ExaResults
	return { output: { results: res.results ?? [] } }
}

// ── Agent API (POST /agent/runs — not in exa-js 2.11, raw via exa.request) ───

export type AgentEffort = "minimal" | "low" | "medium" | "high" | "xhigh"

export type AgentGroundingEntry = {
	field: string
	citations: { url: string; title: string | null }[]
	confidence: "low" | "medium" | "high"
}

export type AgentRun = {
	id: string
	// Live vocab (WP7.2 smoke, 2026-07-04): create returns "running", then
	// "completed"; poll tolerates "pending" + failure states regardless.
	status: string
	// Live shape (WP7.2): completed runs carry output.text (prose), output.structured
	// (the outputSchema-shaped result) and output.grounding. No `output.content` exists.
	output?: { text?: string; structured?: unknown; grounding?: AgentGroundingEntry[] | null } | null
	error?: string | null
}

export type AgentRunParams = {
	query: string // the prompt/instructions — live schema requires `query` (string)
	outputSchema: Record<string, unknown>
	effort: AgentEffort
	data?: unknown // seed records → body `input.data`; `input` must be an OBJECT, never a string
	dataSources?: string[]
}

// PURE. Wire shape pinned live by scripts/exa-smoke.ts, which builds its probe
// body with this same function — exa.ts and the smoke suite cannot drift apart.
export function buildAgentRunRequest(params: AgentRunParams): Record<string, unknown> {
	const body: Record<string, unknown> = {
		query: params.query,
		outputSchema: params.outputSchema,
		effort: params.effort
	}
	if (params.data !== undefined) body.input = { data: params.data }
	if (params.dataSources?.length) body.dataSources = params.dataSources
	return body
}

export async function createAgentRun(params: AgentRunParams): Promise<AgentRun> {
	const exa = await getExa()
	return exa.request<AgentRun>("/agent/runs", "POST", buildAgentRunRequest(params))
}

const AGENT_MAX_MS = 3_600_000 // §6: 1h max runtime
const TERMINAL_STATUSES = new Set(["failed", "canceled", "cancelled"])

export async function pollAgentRun(
	id: string,
	opts: { timeoutMs?: number } = {}
): Promise<AgentRun> {
	const timeoutMs = Math.min(opts.timeoutMs ?? AGENT_MAX_MS, AGENT_MAX_MS)
	const deadline = Date.now() + timeoutMs
	const exa = await getExa()
	let delay = 5_000 // backoff 5s → 30s

	for (;;) {
		const run = await exa.request<AgentRun>(`/agent/runs/${id}`, "GET")
		if (run.status === "completed") return run
		if (TERMINAL_STATUSES.has(run.status))
			throw new Error(`Exa agent run ${id} ${run.status}${run.error ? `: ${run.error}` : ""}`)
		if (Date.now() + delay > deadline)
			throw new Error(`Exa agent run ${id} timed out after ${timeoutMs}ms`)
		await new Promise((resolve) => setTimeout(resolve, delay))
		delay = Math.min(Math.round(delay * 1.5), 30_000)
	}
}

// ── Websets (exa.websets SDK client; WP2.1 competitor_set stage) ─────────────

export async function createCompetitorWebset(company: string): Promise<{ id: string }> {
	const exa = await getExa()
	const webset = await exa.websets.create({
		search: {
			// §6: singular-form phrasing for company-entity searches
			query: `Company that is a direct competitor of ${company}`,
			count: 10,
			entity: { type: "company" }
		},
		metadata: { purpose: "competitor_set", company }
	})
	return { id: webset.id }
}

export async function deleteWebset(id: string): Promise<void> {
	const exa = await getExa()
	await exa.websets.delete(id)
}

// ── Monitors (exa.monitors SDK client; WP5.1 watch/unwatch) ──────────────────

export async function createMonitor(params: {
	query: string
	cadence: string // "1h" | "6h" | "1d" | "7d" — §6 min cadence 1h; values from TERMINAL_CONFIG
	webhookUrl: string
	includeDomains?: string[]
}): Promise<{ id: string; webhookSecret: string }> {
	const exa = await getExa()
	const created = await exa.monitors.create({
		search: {
			query: params.query,
			...(params.includeDomains?.length ? { includeDomains: params.includeDomains } : {})
		},
		// assumption: interval `period` accepts the §6 cadence strings — WP7.2 pins this.
		trigger: { type: "interval", period: params.cadence },
		webhook: { url: params.webhookUrl, events: ["monitor.run.completed"] }
	})
	return { id: created.id, webhookSecret: created.webhookSecret }
}

export async function deleteMonitor(id: string): Promise<void> {
	const exa = await getExa()
	await exa.monitors.delete(id)
}

// ── Monitor webhook parsing (trust boundary: parse defensively) ──────────────

export type MonitorWebhookItem = {
	url: string
	title: string | null
	published_at: string | null
	source: string // hostname, www. stripped
	snippet: string | null
}

/** Non-empty string or null. Shared with research.ts (same defensive parses). */
export const strOrNull = (v: unknown): string | null =>
	typeof v === "string" && v.length > 0 ? v : null

// assumption: webhook payload is { type: "monitor.run.completed", data: <run> } with
// run.output.results[] rows carrying url/title/publishedDate + text|snippet|summary|
// highlights (SearchMonitorRunOutput in exa-js typings). Isolated here so the WP7.2
// smoke suite catches payload drift in one place. Rows without a url are dropped.
export function parseMonitorWebhook(payload: unknown): MonitorWebhookItem[] {
	const p = payload as {
		data?: { output?: { results?: unknown } }
		output?: { results?: unknown }
	} | null
	const results = p?.data?.output?.results ?? p?.output?.results
	if (!Array.isArray(results)) return []

	const items: MonitorWebhookItem[] = []
	for (const row of results) {
		if (typeof row !== "object" || row === null) continue
		const rec = row as Record<string, unknown>
		const url = strOrNull(rec.url)
		if (!url) continue
		const highlights = Array.isArray(rec.highlights)
			? rec.highlights.filter((h): h is string => typeof h === "string")
			: []
		items.push({
			url,
			title: strOrNull(rec.title),
			published_at: strOrNull(rec.publishedDate) ?? strOrNull(rec.published_at) ?? strOrNull(rec.publishedAt),
			source: hostOf(url) ?? "",
			snippet: strOrNull(rec.snippet) ?? strOrNull(rec.text) ?? strOrNull(rec.summary) ?? highlights[0] ?? null
		})
	}
	return items
}
