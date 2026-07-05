// Evidence triage (WP5.3, §2.3 `triageEvidence`). ONE structured LLM call
// classifies a newly-collected evidence item for the watchlist: relevance, the
// frameworks it bears on, materiality, and any dated commitment for the ledger.
//
// Two post-hoc guards, because false positives are expensive downstream:
//   - unknown dimension ids are dropped (schema can't know the F1..F9 set here);
//   - `red_flag` is RESERVED for the F9-screen classes (§2.4). If the model says
//     red_flag but the item's text matches none of those classes by keyword scan,
//     we downgrade to `material` — a false red_flag triggers an immediate rescore
//     (§5 invariant 4: red-flag evidence bypasses the batch), which is costly.
// The `reason` is scrubbed through checkLanguageCompliance; a violation is replaced
// with a code-templated neutral line — alerts never publish accusatory text (§5.6).
//
// Fail-open: on LLM failure after one retry we return a "minor" result so the
// evidence is still stored and batched, never lost, and never causes a rescore.

import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import type { Company, DimensionId, EvidenceItem, TriageResult } from "$lib/types/terminal"
import { FRAMEWORKS } from "./rubrics"
import { checkLanguageCompliance } from "./synthesis"

const VALID_DIMENSIONS = new Set<DimensionId>(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"])
const VALID_MATERIALITY = new Set(["red_flag", "material", "minor", "none"])

// Raw model output before post-hoc validation. `dimensions`/`materiality` may hold
// values outside the valid sets; `commitment` is already in TriageResult's shape.
export type RawTriageOutput = {
	relevant: boolean
	dimensions: string[]
	materiality: string
	commitment: { what: string; promised_date: string | null } | null
	reason: string
}

// (systemPrompt, userPrompt) → raw output. Injectable so tests run offline.
export type TriageCaller = (systemPrompt: string, userPrompt: string) => Promise<RawTriageOutput>

// §5 invariant 4 fail-open shape: stored, batched, never rescored.
const FALLBACK: TriageResult = {
	relevant: true,
	dimensions: [],
	materiality: "minor",
	commitment: null,
	reason: "triage unavailable — stored for next batch"
}

// Red-flag keyword classes (§2.4 F9 screen + recalls/investigations). The guard
// only ever *keeps* a red_flag the model already assigned, so these are kept
// permissive on purpose — they exist to strip red_flag off obviously-routine
// items (launches, hires, partnerships), not to independently detect red flags.
function matchesRedFlagClass(text: string): boolean {
	const t = text.toLowerCase()
	// auditor events: resignation / qualified opinion / material weakness / delayed filing
	if (t.includes("auditor") && /resign|quit|depart|dismiss|withdr|qualif|material weakness|delay|late fil|going concern/.test(t)) return true
	if (/\bqualified opinion\b/.test(t)) return true
	if (/\bmaterial weakness\b/.test(t)) return true
	if (/\bgoing concern\b/.test(t)) return true
	if (/\bnt 10-[kq]\b|late filing|delayed (annual|quarterly|10-|financial)|failure to file|non-?timely filing/.test(t)) return true
	// round-trip revenue
	if (/round[\s-]?trip/.test(t)) return true
	// restatements (restate/restates/restated/restatement/restatements/restating)
	if (/restat(e|ing)/.test(t)) return true
	// product recalls
	if (/\brecall(s|ed|ing)?\b/.test(t)) return true
	// formal investigations
	if (/\b(investigation|probe|inquiry|subpoena)\b|wells notice|formal order/.test(t)) return true
	return false
}

function neutralReason(materiality: string, dimensions: DimensionId[]): string {
	const scope = dimensions.length ? dimensions.join(", ") : "no framework"
	return `${materiality} evidence for ${scope}; see cited source`
}

// F1..F9 with their one-line questions, for the triage prompt (§2.4 questions).
const DIMENSION_LINES = (["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"] as DimensionId[])
	.map((id) => `${id} (${FRAMEWORKS[id].name}): ${FRAMEWORKS[id].question}`)
	.join("\n")

function systemPrompt(): string {
	return (
		`You are the evidence-triage agent for the Aslan Terminal, a company-health monitoring service. ` +
		`Given ONE newly-collected evidence item about a company, classify it for the watchlist.\n\n` +
		`The nine health frameworks (dimension id — question):\n${DIMENSION_LINES}\n\n` +
		`Return, via submit_triage:\n` +
		`- relevant: true only if the item bears on the company's health under one or more frameworks.\n` +
		`- dimensions: the framework ids (F1..F9) the item is evidence for; empty if none apply.\n` +
		`- materiality:\n` +
		`    red_flag — RESERVED. Use ONLY for: an auditor event (auditor resignation, qualified opinion, ` +
		`material weakness, or a delayed/late filing), a round-trip-revenue indication, a financial restatement, ` +
		`a product recall, or a formal investigation. NEVER use red_flag for routine news, product launches, ` +
		`partnerships, hires, or ordinary results.\n` +
		`    material — a substantive development that changes the picture on a framework.\n` +
		`    minor — relevant but small or incremental.\n` +
		`    none — not relevant to company health.\n` +
		`- commitment: set has_commitment true ONLY when the item announces a specific dated or dateable promise ` +
		`(ship / deliver / launch / complete X by a time). Give the promised action (commitment_what) and its ` +
		`date (commitment_date, ISO YYYY-MM-DD, or empty string if not stated).\n` +
		`- reason: ONE line. An evidence-language observation of what the source reports — never an accusation or ` +
		`judgment. Do not use words like fraud, scam, scheme, lying, or hiding.\n\n` +
		`Call submit_triage exactly once.`
	)
}

function userPrompt(company: Company, item: EvidenceItem): string {
	return [
		`Company: ${company.name} (${company.ticker})${company.sector ? `, sector ${company.sector}` : ""}`,
		``,
		`Evidence item:`,
		`  title: ${item.title ?? "(untitled)"}`,
		`  source: ${item.source_domain}`,
		`  published: ${item.published_at ?? "unknown"}`,
		`  snippet: ${item.snippet ?? "(none)"}`
	].join("\n")
}

// Real LLM path: single structured pi-ai tool call. getAiModel is imported lazily —
// it reads $env at module load, which the offline test runner cannot resolve, and
// this path never runs when a caller is injected (synthesis.ts uses the same shape).
async function defaultCaller(system: string, user: string): Promise<RawTriageOutput> {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_triage",
		description: "Submit the triage classification for the evidence item. Call exactly once.",
		parameters: Type.Object({
			relevant: Type.Boolean({ description: "Does the item bear on the company's health under any framework?" }),
			dimensions: Type.Array(Type.String(), {
				description: "Framework ids the item is evidence for; each one of F1,F2,F3,F4,F5,F6,F7,F8,F9. Empty if none."
			}),
			materiality: Type.Union(
				[Type.Literal("red_flag"), Type.Literal("material"), Type.Literal("minor"), Type.Literal("none")],
				{ description: "red_flag is reserved for auditor events, round-trip revenue, restatements, recalls, investigations" }
			),
			has_commitment: Type.Boolean({ description: "true only if the item announces a specific dated/dateable promise" }),
			commitment_what: Type.String({ description: "the promised action, empty string if none" }),
			commitment_date: Type.String({ description: "ISO date YYYY-MM-DD of the promise if stated, else empty string" }),
			reason: Type.String({ description: "one-line evidence-language observation, never an accusation" })
		})
	}
	const context: Context = {
		systemPrompt: system,
		messages: [{ role: "user", content: user, timestamp: Date.now() }],
		tools: [submit]
	}
	const response = await complete(getAiModel(), context)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during triage")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_triage")
	if (!call) throw new Error("triage: model did not submit a classification")
	const out = validateToolCall([submit], call) as {
		relevant: boolean
		dimensions: string[]
		materiality: string
		has_commitment: boolean
		commitment_what: string
		commitment_date: string
		reason: string
	}
	const what = out.commitment_what?.trim() ?? ""
	return {
		relevant: out.relevant,
		dimensions: out.dimensions ?? [],
		materiality: out.materiality,
		commitment: out.has_commitment && what ? { what, promised_date: out.commitment_date?.trim() || null } : null,
		reason: out.reason ?? ""
	}
}

/**
 * §2.3 triageEvidence. One structured LLM call → TriageResult, with the post-hoc
 * dimension-id filter, red_flag downgrade guard, and evidence-language scrub.
 * Fails open (a stored, batched "minor" result) after one retry.
 */
export async function triageEvidence(
	company: Company,
	item: EvidenceItem,
	caller: TriageCaller = defaultCaller
): Promise<TriageResult> {
	const system = systemPrompt()
	const user = userPrompt(company, item)

	let raw: RawTriageOutput
	try {
		raw = await caller(system, user)
	} catch {
		try {
			raw = await caller(system, user)
		} catch {
			return FALLBACK
		}
	}

	// Drop unknown dimension ids — the schema can't enforce the F1..F9 set.
	const dimensions = raw.dimensions.filter((d): d is DimensionId => VALID_DIMENSIONS.has(d as DimensionId))

	let materiality = (VALID_MATERIALITY.has(raw.materiality) ? raw.materiality : "minor") as TriageResult["materiality"]

	// red_flag is reserved (§2.4): keep it only if the item text matches a reserved
	// class; otherwise downgrade — false red_flags force an expensive immediate rescore.
	if (materiality === "red_flag" && !matchesRedFlagClass(`${item.title ?? ""} ${item.snippet ?? ""}`))
		materiality = "material"

	const commitment =
		raw.commitment && raw.commitment.what.trim()
			? { what: raw.commitment.what.trim(), promised_date: raw.commitment.promised_date }
			: null

	// Never publish accusatory text in an alert — replace violations with a neutral line.
	let reason = raw.reason?.trim() ?? ""
	if (!reason || checkLanguageCompliance(reason).length > 0) reason = neutralReason(materiality, dimensions)

	return { relevant: raw.relevant, dimensions, materiality, commitment, reason }
}
