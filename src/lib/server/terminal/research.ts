// Per-dimension evidence gathering (WP1.2, SPEC v0.3 §3). One Exa agent run per
// dimension is the primary path; a direct-recipe + one-LLM-classify pass is the
// fallback when the agent run throws or times out.
//
// Numbers, caps, and grades live in scoring.ts — this module only gathers and
// shapes evidence. It sets `company_controlled` (§2.5.4) and `content_hash`
// (§2.5.5) on each EvidenceItem, drops zero-citation findings, and leaves all
// screen hits at status "suspected" (confirmation happens in screens.ts).

import { Type, complete, validateToolCall, type Tool, type Context, type ToolCall } from "@mariozechner/pi-ai"
import { hostOf } from "$lib/utils"
import { TERMINAL_CONFIG } from "./config"
import {
	createAgentRun,
	pollAgentRun,
	strOrNull,
	terminalSearch,
	type AgentEffort,
	type ExaResultItem
} from "./exa"
// WP1.3 exports (landing in parallel): PR-wire domain set + the content hash.
import { COMPANY_CONTROLLED_DOMAINS, contentHash } from "./scoring"
import type { RubricFramework } from "./rubrics/schema"
import type {
	Citation,
	Company,
	DimensionEvidence,
	EvidenceItem,
	ScreenHit,
	SignalFinding
} from "$lib/types/terminal"

// DimensionEvidence (a frozen contract) has no place for a skip note, so the
// return type widens with one optional field; still assignable to
// DimensionEvidence for every downstream consumer.
export type DimensionResearchResult = DimensionEvidence & { skipped?: string }

// Loose shapes the LLM / agent returns before finalization.
type RawCitation = {
	url?: unknown
	title?: unknown
	published_at?: unknown
	publishedDate?: unknown
	snippet?: unknown
	text?: unknown
	summary?: unknown
}
type RawFinding = {
	signal_id?: unknown
	direction?: unknown
	strength?: unknown
	summary?: unknown
	citations?: RawCitation[]
}
type RawScreenHit = {
	pattern_id?: unknown
	summary?: unknown
	detail?: unknown
	citations?: RawCitation[]
}
type ClassifyOutput = { findings: RawFinding[]; screen_hits: RawScreenHit[] }
export type ClassifyInput = { company: Company; framework: RubricFramework; results: ExaResultItem[] }
export type ClassifyFn = (input: ClassifyInput) => Promise<ClassifyOutput>

export type ResearchOpts = {
	seedItems?: EvidenceItem[] // passed into the agent run's input.data for incremental rescores
	// Injectable callers so tests run without network. Default to the real impls.
	createAgentRun?: typeof createAgentRun
	pollAgentRun?: typeof pollAgentRun
	terminalSearch?: typeof terminalSearch
	classify?: ClassifyFn
}

// ── helpers ──────────────────────────────────────────────────────────────────

const DIRECTIONS = new Set(["supports", "undermines", "neutral"])
const coerceDirection = (d: unknown): SignalFinding["direction"] => {
	const s = String(d).toLowerCase()
	return DIRECTIONS.has(s) ? (s as SignalFinding["direction"]) : "neutral"
}
const coerceStrength = (v: unknown): 1 | 2 | 3 => {
	const n = Math.round(Number(v))
	return n === 2 || n === 3 ? n : 1
}

function toCitation(raw: RawCitation): Citation | null {
	const url = strOrNull(raw.url)
	if (!url) return null
	return {
		url,
		title: strOrNull(raw.title),
		source_domain: hostOf(url) ?? "",
		published_at: strOrNull(raw.published_at) ?? strOrNull(raw.publishedDate),
		snippet: strOrNull(raw.snippet) ?? strOrNull(raw.text) ?? strOrNull(raw.summary)
	}
}

// §2.5.4 independence: an item is company-controlled when its domain is a PR
// wire (from scoring.ts) or one of the company's own domains.
function isControlled(domain: string, companyDomains: ReadonlySet<string>): boolean {
	const d = domain.toLowerCase()
	return COMPANY_CONTROLLED_DOMAINS.has(d) || companyDomains.has(d)
}

// ponytail: heuristic — Exa's company entity has no stable schema, so scan the
// likely url/domain fields (top-level + `properties`). Upgrade path: read the
// entity's canonical homepage field once WP7.2 pins the entity shape.
const URL_KEYS = new Set([
	"url",
	"website",
	"websiteurl",
	"homepage",
	"homepageurl",
	"domain",
	"weburl",
	"site"
])
function deriveCompanyDomains(company: Company): Set<string> {
	const out = new Set<string>()
	const add = (v: unknown) => {
		if (typeof v !== "string" || !v) return
		const host = v.includes("://") ? hostOf(v) : v.replace(/^www\./, "").toLowerCase()
		if (host) out.add(host)
	}
	const scan = (obj: unknown) => {
		if (!obj || typeof obj !== "object") return
		for (const [k, v] of Object.entries(obj as Record<string, unknown>))
			if (URL_KEYS.has(k.toLowerCase())) add(v)
	}
	scan(company.exa_entity)
	scan((company.exa_entity as { properties?: unknown } | null)?.properties)
	return out
}

// ── finalization (shared by both paths) ──────────────────────────────────────

function finalizeFindings(raws: RawFinding[] | undefined): SignalFinding[] {
	const out: SignalFinding[] = []
	for (const r of raws ?? []) {
		const citations = (r.citations ?? [])
			.map(toCitation)
			.filter((c): c is Citation => c !== null)
		if (citations.length === 0) continue // §2.5.2 — drop zero-citation findings
		out.push({
			signal_id: String(r.signal_id ?? ""),
			direction: coerceDirection(r.direction),
			strength: coerceStrength(r.strength),
			summary: strOrNull(r.summary) ?? "",
			citations
		})
	}
	return out
}

// Screen hits arrive "suspected"; the action is code-owned (from the rubric),
// so an unrecognized pattern_id is dropped rather than trusted.
function finalizeScreenHits(raws: RawScreenHit[] | undefined, framework: RubricFramework): ScreenHit[] {
	const actionOf = new Map(framework.false_signals.map((f) => [f.id, f.action]))
	const out: ScreenHit[] = []
	for (const r of raws ?? []) {
		const pattern_id = String(r.pattern_id ?? "")
		const action = actionOf.get(pattern_id)
		if (!action) continue
		out.push({
			pattern_id,
			status: "suspected",
			summary: strOrNull(r.summary) ?? "",
			detail: strOrNull(r.detail) ?? "",
			citations: (r.citations ?? []).map(toCitation).filter((c): c is Citation => c !== null),
			action
		})
	}
	return out
}

// §2.5.5 content_hash + §2.5.4 company_controlled; deduped by content_hash.
async function toEvidenceItems(
	raws: RawCitation[],
	framework: RubricFramework,
	companyDomains: ReadonlySet<string>
): Promise<EvidenceItem[]> {
	const byHash = new Map<string, EvidenceItem>()
	for (const raw of raws) {
		const c = toCitation(raw)
		if (!c) continue
		const content_hash = await contentHash(c)
		if (byHash.has(content_hash)) continue
		byHash.set(content_hash, {
			...c,
			id: crypto.randomUUID(),
			content_hash,
			origin: "report_run",
			dimensions: [framework.id],
			company_controlled: isControlled(c.source_domain, companyDomains)
		})
	}
	return [...byHash.values()]
}

// ── primary: one Exa agent run ────────────────────────────────────────────────

const CITATION_SCHEMA = {
	type: "object",
	properties: {
		url: { type: "string" },
		title: { type: ["string", "null"] },
		published_at: { type: ["string", "null"], description: "ISO date the source was published" },
		snippet: { type: ["string", "null"], description: "short quoted evidence excerpt" }
	},
	required: ["url"]
}

/**
 * Build the agent `outputSchema` = {findings, screen_hits} from the framework.
 * Each property description names the signal/pattern id + description so the
 * agent grounds per-signal (and Exa Connect partner routing keys off these).
 */
export function buildOutputSchema(framework: RubricFramework): Record<string, unknown> {
	const signalList = framework.signals.map((s) => `${s.id}: ${s.description}`).join("; ")
	const screenList = framework.false_signals.map((f) => `${f.id}: ${f.description}`).join("; ")
	return {
		type: "object",
		properties: {
			findings: {
				type: "array",
				description: `One entry per grounded observation. Question: ${framework.question}`,
				items: {
					type: "object",
					properties: {
						signal_id: {
							type: "string",
							description: `The rubric signal this observation addresses. One of — ${signalList}`
						},
						direction: {
							type: "string",
							enum: ["supports", "undermines", "neutral"],
							description: "Whether the evidence supports, undermines, or is neutral to health."
						},
						strength: { type: "number", enum: [1, 2, 3], description: "1 weak, 2 clear, 3 strong" },
						summary: {
							type: "string",
							description: "One sentence in evidence language — a cited observation, never an accusation."
						},
						citations: {
							type: "array",
							items: CITATION_SCHEMA,
							description: "At least one source URL; a finding with no citation is discarded."
						}
					},
					required: ["signal_id", "direction", "strength", "summary", "citations"]
				}
			},
			screen_hits: {
				type: "array",
				description: "False-signal screen matches observed in the evidence.",
				items: {
					type: "object",
					properties: {
						pattern_id: {
							type: "string",
							description: `The false-signal pattern observed. One of — ${screenList}`
						},
						summary: { type: "string", description: "Evidence-language observation of the pattern." },
						detail: { type: "string", description: "Longer owner-only narrative of what was observed." },
						citations: { type: "array", items: CITATION_SCHEMA }
					},
					required: ["pattern_id", "summary", "citations"]
				}
			}
		},
		required: ["findings", "screen_hits"]
	}
}

function buildInstructions(company: Company, framework: RubricFramework): string {
	const signals = framework.signals.map((s) => `- ${s.id}: ${s.description}`).join("\n")
	const screens = framework.false_signals.map((f) => `- ${f.id}: ${f.description}`).join("\n")
	return (
		`Research ${company.name} (${company.ticker}) for the equity-health dimension "${framework.name}".\n` +
		`Question: ${framework.question}\n\n` +
		`Investigate each signal and report grounded observations:\n${signals}\n\n` +
		`Screen for these false-signal patterns and report any you observe:\n${screens}\n\n` +
		`Rules: every finding needs at least one citation (a source URL) or it is discarded. ` +
		`Use evidence language — state what a source shows, never accuse. ` +
		`No price targets, analyst estimates, or sell-side ratings as inputs or citations.`
	)
}

function parseAgentOutput(content: unknown): ClassifyOutput {
	let obj: unknown = content
	if (typeof content === "string") {
		try {
			obj = JSON.parse(content)
		} catch {
			obj = {}
		}
	}
	const o = (obj ?? {}) as { findings?: unknown; screen_hits?: unknown }
	return {
		findings: Array.isArray(o.findings) ? (o.findings as RawFinding[]) : [],
		screen_hits: Array.isArray(o.screen_hits) ? (o.screen_hits as RawScreenHit[]) : []
	}
}

async function agentResearch(
	company: Company,
	framework: RubricFramework,
	opts: ResearchOpts,
	createRun: typeof createAgentRun,
	pollRun: typeof pollAgentRun
): Promise<DimensionResearchResult> {
	const companyDomains = deriveCompanyDomains(company)

	const run = await createRun({
		query: buildInstructions(company, framework),
		outputSchema: buildOutputSchema(framework),
		effort: TERMINAL_CONFIG.AGENT_EFFORT_DIMENSION as AgentEffort,
		...(opts.seedItems?.length ? { data: opts.seedItems } : {}) // → input.data
	})
	const done = await pollRun(run.id)

	// output.structured is the outputSchema-shaped result; text is the prose fallback.
	const raw = parseAgentOutput(done.output?.structured ?? done.output?.text)
	const findings = finalizeFindings(raw.findings)
	const screen_hits = finalizeScreenHits(raw.screen_hits, framework)

	const grounding: RawCitation[] = (done.output?.grounding ?? []).flatMap((g) => g.citations ?? [])
	const pool: RawCitation[] = [
		...grounding,
		...findings.flatMap((f) => f.citations),
		...screen_hits.flatMap((h) => h.citations)
	]
	const evidence_items = await toEvidenceItems(pool, framework, companyDomains)

	return { dimension: framework.id, findings, screen_hits, evidence_items, searches_run: 1 }
}

// ── fallback: direct recipe execution + one classify pass ─────────────────────

const resultToRaw = (r: ExaResultItem): RawCitation => ({
	url: r.url,
	title: r.title,
	publishedDate: r.publishedDate,
	snippet: r.highlights?.[0] ?? r.summary ?? r.text ?? null
})

async function fallbackResearch(
	company: Company,
	framework: RubricFramework,
	search: typeof terminalSearch,
	classify: ClassifyFn
): Promise<DimensionResearchResult> {
	const companyDomains = deriveCompanyDomains(company)
	const cap = TERMINAL_CONFIG.MAX_SEARCHES_PER_DIMENSION
	const recipes = [
		...framework.signals.map((s) => s.recipe),
		...framework.false_signals.map((f) => f.recipe)
	]

	const results: ExaResultItem[] = []
	let searches_run = 0
	let skippedMonitor = 0
	for (const recipe of recipes) {
		if (recipe.primitive === "monitor_feed") {
			skippedMonitor++ // watchlist input — not run in report runs (§ WP1.2)
			continue
		}
		if (searches_run >= cap) break
		searches_run++
		try {
			const res = await search(recipe, company.name)
			results.push(...res.results)
		} catch {
			// a failed search still consumed its budget; keep gathering the rest
		}
	}

	const { findings: rawF, screen_hits: rawS } = await classify({ company, framework, results })
	const findings = finalizeFindings(rawF)
	const screen_hits = finalizeScreenHits(rawS, framework)

	const pool: RawCitation[] = [
		...results.map(resultToRaw),
		...findings.flatMap((f) => f.citations),
		...screen_hits.flatMap((h) => h.citations)
	]
	const evidence_items = await toEvidenceItems(pool, framework, companyDomains)

	const out: DimensionResearchResult = {
		dimension: framework.id,
		findings,
		screen_hits,
		evidence_items,
		searches_run
	}
	if (skippedMonitor > 0)
		out.skipped = `${skippedMonitor} monitor_feed recipe(s) skipped (watchlist inputs, not run in report runs)`
	return out
}

// ── default LLM classifier for the fallback path ──────────────────────────────

const defaultClassify: ClassifyFn = async ({ company, framework, results }) => {
	const signalList = framework.signals.map((s) => `${s.id} (${s.description})`).join("; ")
	const screenList = framework.false_signals.map((f) => `${f.id} (${f.description})`).join("; ")

	const citationT = Type.Object({
		url: Type.String(),
		title: Type.Optional(Type.String()),
		published_at: Type.Optional(Type.String({ description: "ISO date" })),
		snippet: Type.Optional(Type.String())
	})
	const submitTool: Tool = {
		name: "submit_classification",
		description: "Classify the search results into signal findings and false-signal screen hits.",
		parameters: Type.Object({
			findings: Type.Array(
				Type.Object({
					signal_id: Type.String({ description: `one of — ${signalList}` }),
					direction: Type.String({ description: "supports | undermines | neutral" }),
					strength: Type.Number({ description: "1 weak, 2 clear, 3 strong" }),
					summary: Type.String({ description: "one-sentence evidence-language observation" }),
					citations: Type.Array(citationT, { description: "at least one result URL" })
				})
			),
			screen_hits: Type.Array(
				Type.Object({
					pattern_id: Type.String({ description: `one of — ${screenList}` }),
					summary: Type.String({ description: "evidence-language observation of the pattern" }),
					detail: Type.String({ description: "owner-only narrative" }),
					citations: Type.Array(citationT)
				})
			)
		})
	}

	const ctx: Context = {
		systemPrompt:
			`You classify raw search results into rubric signal findings and false-signal screen ` +
			`hits for the equity-health dimension "${framework.name}". Question: ${framework.question} ` +
			`Use evidence language — observations backed by citations, never accusations. A finding ` +
			`needs at least one citation (a result URL) or it is dropped. Assign each finding to one ` +
			`signal id and each screen hit to one false-signal pattern id. No price targets, ` +
			`analyst estimates, or ratings.`,
		messages: [
			{
				role: "user",
				content: JSON.stringify({
					company: { name: company.name, ticker: company.ticker },
					signals: signalList,
					false_signals: screenList,
					results: results.map((r) => ({
						url: r.url,
						title: r.title,
						published: r.publishedDate ?? null,
						snippet: r.highlights?.[0] ?? r.summary ?? r.text ?? null
					}))
				}),
				timestamp: Date.now()
			}
		],
		tools: [submitTool]
	}

	try {
		// Lazy import: ../ai reads $env/dynamic/private, unavailable at module load
		// under bun test — matches scoring.ts. Tests inject `classify` and skip this.
		const { getAiModel } = await import("../ai")
		const response = await complete(getAiModel(), ctx)
		if (response.stopReason === "error") return { findings: [], screen_hits: [] }
		const call = response.content.find((b): b is ToolCall => b.type === "toolCall")
		if (!call) return { findings: [], screen_hits: [] }
		return validateToolCall([submitTool], call) as ClassifyOutput
	} catch {
		return { findings: [], screen_hits: [] }
	}
}

// ── entry point ───────────────────────────────────────────────────────────────

/**
 * Gather one dimension's evidence. Primary path: a single Exa agent run.
 * Fallback (agent throws/times out): direct recipe searches capped at
 * MAX_SEARCHES_PER_DIMENSION + one classify pass.
 */
export async function runDimensionResearch(
	company: Company,
	framework: RubricFramework,
	opts: ResearchOpts = {}
): Promise<DimensionResearchResult> {
	const createRun = opts.createAgentRun ?? createAgentRun
	const pollRun = opts.pollAgentRun ?? pollAgentRun
	const search = opts.terminalSearch ?? terminalSearch
	const classify = opts.classify ?? defaultClassify

	try {
		return await agentResearch(company, framework, opts, createRun, pollRun)
	} catch {
		return await fallbackResearch(company, framework, search, classify)
	}
}
