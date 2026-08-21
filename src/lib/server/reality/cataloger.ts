// Cataloger (PLAN Phase 4). Reads one filing's text and writes ledger entries.
// Three jobs, composed by the RealityRunner DO:
//   - stripFilingHtml: raw archive HTML → clean text (drops the <ix:header>
//     inline-XBRL dump — probe: one 333KB block held all the tag soup).
//   - catalogSoftLayer: ONE whole-document LLM pass for the buried layer —
//     conditions, commitments, due dates, related parties. Never headline
//     numbers (those are the XBRL spine's job).
//   - pickResultsDocs + extractSixKFigures: the no-XBRL path for 6-Ks —
//     classify which docs carry quarterly results, then double-pass number
//     extraction (two independently-worded prompts, keep only 1%-agreement;
//     extraction.ts discipline).
//
// Number discipline (2026-08-18 audit): the model reports every figure EXACTLY
// as printed plus the printed scale/date-window; code does all multiplication
// and all date arithmetic. The model never computes a number.
//
// LLM surfaces are injectable; the default callers lazy-import ../ai (house
// pattern — ai.ts reads $env at module load, unavailable under bun test).

import { Type, complete, validateToolCall, type Context, type Tool, type ToolCall } from "@mariozechner/pi-ai"
import { REALITY_CONFIG } from "./config"
import { CONCEPT_MAP, addYears, sha256hex, type LedgerEntryInsert } from "./xbrl"

export type FilingMeta = {
	cik: string
	accession: string
	form: string
	report_date: string | null // sec_filings.report_date, the fallback period
}

// ── HTML → text ──────────────────────────────────────────────────────────────

const ENTITIES: [RegExp, string][] = [
	[/&#160;|&nbsp;/g, " "],
	[/&#8217;|&rsquo;/g, "'"],
	[/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"'],
	[/&#8211;|&#8212;|&ndash;|&mdash;/g, "-"],
	[/&amp;/g, "&"],
	[/&#\d+;|&[a-z]+;/gi, " "]
]

/** Archive HTML → readable text. Removes the ix:header XBRL dump, scripts,
 *  styles, then all tags; decodes the common entities. */
export function stripFilingHtml(html: string): string {
	let s = html
		.replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]+>/g, " ")
	for (const [re, to] of ENTITIES) s = s.replace(re, to)
	return s.replace(/\s+/g, " ").trim()
}

// ── shared validation ────────────────────────────────────────────────────────

const KINDS = new Set(["revenue", "expense", "obligation", "contingent_revenue", "context", "financing"])
const CERTAINTIES = new Set(["actual", "committed", "conditional"])
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const YEAR_ONLY = /^\d{4}$/
const unitOk = (u: string): boolean => /^[A-Z]{3}$/.test(u) || u === "shares"

// The model reports numbers exactly as printed; code owns the multiplication.
const SCALE_FACTOR: Record<string, number> = { units: 1, thousands: 1e3, millions: 1e6, billions: 1e9 }
const VALUE_TYPES = new Set(["currency", "shares", "percent", "per_share"])
// Payment-window labels → years past the statement date. gt5y lands at the
// 5-year boundary, matching the XBRL "after year five" bucket (never spread).
const WINDOW_YEARS: Record<string, number> = { lt1y: 1, y1_3: 3, y3_5: 5, gt5y: 5 }

// Models copy the filing's own currency spelling; normalize the known aliases
// so one figure never splits across two unit strings (TSM prints "NTD", its
// XBRL says "TWD").
const UNIT_ALIASES: Record<string, string> = { NTD: "TWD" }
export const normUnit = (u: string | null): string | null => {
	if (!u) return null
	const up = u.toUpperCase()
	if (up === "SHARES") return "shares"
	return UNIT_ALIASES[up] ?? up
}

const strOrNull = (v: unknown): string | null =>
	typeof v === "string" && v.trim().length > 0 ? v.trim() : null

// Deterministic self-consistency: when the evidence line itself prints exactly
// one "X million/billion/trillion" quantity, the stored amount must live within
// 100x of it. Kills the double-expansion mangles ("$5.0 billion" stored as
// 5e12) and year-as-amount slips ("notes due 2025" stored as 2025) that the
// prompt alone does not fully stop. Ambiguous evidence never rejects.
const NOTE_MONEY = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(million|billion|trillion)/gi
const NOTE_SCALE: Record<string, number> = { million: 1e6, billion: 1e9, trillion: 1e12 }
export function noteConsistent(amount: number, notes: string | null): boolean {
	if (!notes) return true
	const matches = [...notes.matchAll(NOTE_MONEY)]
	if (matches.length !== 1) return true
	const stated = parseFloat(matches[0][1].replace(/,/g, "")) * NOTE_SCALE[matches[0][2].toLowerCase()]
	const ratio = Math.abs(amount) / stated
	return ratio >= 0.01 && ratio <= 100
}

const numOrNull = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) ? v : null

// ── soft-layer pass (all statement forms) ────────────────────────────────────

export type RawSoftEntry = {
	value?: unknown
	value_high?: unknown
	scale?: unknown
	value_type?: unknown
	unit?: unknown
	kind?: unknown
	certainty?: unknown
	period_end?: unknown
	date_role?: unknown
	date?: unknown
	due_window?: unknown
	counterparty?: unknown
	related_party?: unknown
	source_location?: unknown
	notes?: unknown
}
export type SoftCaller = (systemPrompt: string, userPrompt: string) => Promise<{ entries: RawSoftEntry[] }>

const SOFT_SYSTEM =
	`You catalog claims from one SEC filing into a ledger. The filing's headline statement ` +
	`numbers are already cataloged from XBRL — do NOT re-extract income-statement or ` +
	`balance-sheet line items. Your job is the buried layer: purchase and other commitments, ` +
	`debt facilities and maturities, lease schedules, contingencies and loss liabilities, ` +
	`deferred or conditional revenue terms, guarantees, related-party dealings (including ` +
	`personal loans involving officers), and subsequent events with amounts. Also hunt two ` +
	`patterns that hide obligations and inflate revenue quality:\n` +
	`- off-balance-sheet structures: build-to-suit or sole-tenant financing deals, ` +
	`not-yet-commenced leases, guarantees to lenders, and unconsolidated entities the ` +
	`company backstops — catalog each disclosed amount as an obligation.\n` +
	`- financing provided to customers or buyers: loans, notes receivable, prepayments, ` +
	`equity investments in customers, or guarantees of a customer's debt — kind "financing", ` +
	`with the counterparty named. Also catalog customer-concentration disclosures ("one ` +
	`customer was X% of revenue/receivables") as percent observations.\n\n` +
	`You identify numbers; you NEVER compute one. For each distinct claim output:\n` +
	`- value: the number EXACTLY as printed. "$61.3 million" is value 61.3. A bare ` +
	`"$152,300,000" is value 152300000. A table cell 5,596.1 is value 5596.1. Never ` +
	`multiply, never expand a scale convention, never total rows yourself.\n` +
	`- scale: the printed convention that applies to that number — "units", "thousands", ` +
	`"millions", or "billions". "$61.3 million" → millions; a table headed "in thousands" ` +
	`→ thousands; a fully written-out number → units. Code multiplies value by scale.\n` +
	`- value_high: when the text prints a range ("between 26.1 and 26.9", "410 to 700"), ` +
	`value is the LOW end and value_high the high end at the same scale; 0 when there is ` +
	`no range. Never pick one end silently and never invent a midpoint.\n` +
	`- value_type: "currency" for money totals; "shares" for share counts; "percent" for ` +
	`percentage disclosures ("one customer was 21% of revenue" → value 21, percent); ` +
	`"per_share" for per-share amounts (a dividend per share, an exercise price). Percent ` +
	`and per-share figures are observations, not totals — still catalog them.\n` +
	`- unit: ISO currency code ("USD", "EUR"...), or "shares" for share counts.\n` +
	`- kind (revenue | expense | obligation | contingent_revenue | financing) and certainty ` +
	`(actual = recognized and unconditional; committed = firm obligation, cash not yet ` +
	`moved; conditional = depends on events or judgment).\n` +
	`- period_end: ISO date of the period the claim belongs to — the filing's period end ` +
	`unless the text says otherwise.\n\n` +
	`Dates: you never compute a date. date_role is "due" for money owed in the future, ` +
	`"event" for something that already happened (an acquisition closed, a payment made, a ` +
	`redemption completed), or "" for no date. When the text prints the calendar date, copy ` +
	`it into date ("YYYY-MM-DD", or "YYYY" when only a year like "fiscal 2027" is printed). ` +
	`When the text gives a window instead — "less than 1 year" or "within the next 12 ` +
	`months" (lt1y), "1-3 years" (y1_3), "3-5 years" (y3_5), "more than 5 years" (gt5y) — ` +
	`put the label in due_window and leave date empty. Code turns windows into dates. When ` +
	`a filing prints a payment or maturity table with period columns, emit one entry PER ` +
	`COLUMN with that column's due_window or printed year — never collapse a schedule into ` +
	`one total.\n\n` +
	`Also output counterparty + related_party when the text names one, source_location ` +
	`(the note or section it came from), and notes: ONE line of evidence language — state ` +
	`what the filing says, never accuse. Catalog unfavorable items with the same care as ` +
	`favorable ones. Do not net amounts. Do not skip small items that involve related ` +
	`parties. Never output a number the text does not print. Call submit_entries exactly once.`

async function defaultSoftCaller(system: string, user: string): Promise<{ entries: RawSoftEntry[] }> {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_entries",
		description: "Submit every cataloged claim. Call exactly once.",
		parameters: Type.Object({
			entries: Type.Array(
				Type.Object({
					value: Type.Number({ description: "the number exactly as printed — never multiplied or expanded" }),
					value_high: Type.Number({ description: "high end of a printed range at the same scale; 0 when not a range" }),
					scale: Type.String({ description: '"units" | "thousands" | "millions" | "billions" — the printed convention' }),
					value_type: Type.String({ description: '"currency" | "shares" | "percent" | "per_share"' }),
					unit: Type.String({ description: 'ISO currency code ("USD", "EUR"...) or "shares"' }),
					kind: Type.String({ description: "revenue | expense | obligation | contingent_revenue | financing (money lent to / invested in others)" }),
					certainty: Type.String({ description: "actual | committed | conditional" }),
					period_end: Type.String({ description: "ISO date the claim belongs to" }),
					date_role: Type.String({ description: '"due" (owed in the future) | "event" (already happened) | "" (no date)' }),
					date: Type.String({ description: 'the printed date: "YYYY-MM-DD", or "YYYY" when only a year is printed, else ""' }),
					due_window: Type.String({ description: '"lt1y" | "y1_3" | "y3_5" | "gt5y" when the text states a window, else ""' }),
					counterparty: Type.String({ description: "named party, else empty string" }),
					related_party: Type.Boolean({ description: "true when the text ties the claim to a related party" }),
					source_location: Type.String({ description: "note/section, e.g. 'Note 13 Commitments'" }),
					notes: Type.String({ description: "one line, evidence language, never an accusation" })
				}),
				{ description: "empty if the document contains no soft-layer claims" }
			)
		})
	}
	const ctx: Context = {
		systemPrompt: system,
		messages: [{ role: "user", content: user, timestamp: Date.now() }],
		tools: [submit]
	}
	const response = await complete(getAiModel(REALITY_CONFIG.MODEL_CATALOGER), ctx)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during soft catalog")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_entries")
	if (!call) throw new Error("cataloger: model did not submit entries")
	return validateToolCall([submit], call) as { entries: RawSoftEntry[] }
}

/**
 * One filing's soft-layer catalog pass. Returns validated inserts (origin
 * "ai"); malformed rows are dropped, never repaired. The model reports values
 * as printed; THIS function does the scale multiplication and date arithmetic.
 * Idempotency is two-layer: the DO skips filings that already have ai rows,
 * and (cik, content_hash) dedupes near-identical claims within/across runs.
 */
export async function catalogSoftLayer(
	meta: FilingMeta,
	text: string,
	caller: SoftCaller = defaultSoftCaller
): Promise<LedgerEntryInsert[]> {
	const user =
		`Filing: ${meta.form}, accession ${meta.accession}, period end ${meta.report_date ?? "unknown"}.\n\n` +
		`<filing>\n${text}\n</filing>`
	const { entries } = await caller(SOFT_SYSTEM, user)

	const out: LedgerEntryInsert[] = []
	for (const r of entries ?? []) {
		const value = numOrNull(r.value)
		const rawHigh = numOrNull(r.value_high) ?? 0
		const scale = strOrNull(r.scale)
		let value_type = strOrNull(r.value_type) ?? "currency"
		let unit = normUnit(strOrNull(r.unit))
		let kind = strOrNull(r.kind)
		let certainty = strOrNull(r.certainty)
		let period_end = strOrNull(r.period_end)
		if (period_end && !ISO_DAY.test(period_end)) period_end = null
		period_end ??= meta.report_date
		if (value === null || value === 0 || !period_end || !VALUE_TYPES.has(value_type)) continue

		// Percent and per-share figures are observations, not monetary claims:
		// they route to kind "context" so they can never enter an amount sum
		// (value_type marks them for every reader).
		if (value_type === "percent") {
			kind = "context"
			certainty = "actual"
			unit = "PCT"
		} else if (value_type === "per_share") {
			kind = "context"
			certainty = "actual"
			if (!unit || !/^[A-Z]{3}$/.test(unit)) continue // a per-share amount needs its currency
		} else {
			if (!unit || !unitOk(unit)) continue
			if (unit === "shares") value_type = "shares"
			else if (value_type === "shares") continue // a share count in a currency unit is malformed
			if (!kind || !KINDS.has(kind) || kind === "context") continue // soft rows are claims, not context
			if (!certainty || !CERTAINTIES.has(certainty)) continue
		}

		// Code owns the multiplication. Percent / per-share are always as printed.
		const factor = value_type === "percent" || value_type === "per_share" ? 1 : SCALE_FACTOR[scale ?? ""]
		if (factor === undefined) continue // no stated scale → the number is unverifiable
		let amount = value * factor
		const amount_high = rawHigh > value ? rawHigh * factor : null
		// Extraction copies parenthesized income-statement presentation; an
		// expense claim is a magnitude, so normalize to positive.
		if (kind === "expense" && amount < 0) amount = -amount

		const noteText = strOrNull(r.notes)
		if (value_type === "currency" && !noteConsistent(amount, noteText)) continue

		// Dates: the model identified role + printed text; code computes ISO days.
		const role = strOrNull(r.date_role)
		const printed = strOrNull(r.date)
		const window = strOrNull(r.due_window)
		let due_date: string | null = null
		let inferred_due = false
		let event_date: string | null = null
		if (role === "event") {
			event_date = printed && ISO_DAY.test(printed) ? printed : null
		} else if (role === "due" && kind !== "context") {
			if (window && WINDOW_YEARS[window] !== undefined) {
				due_date = addYears(period_end, WINDOW_YEARS[window])
				inferred_due = true
			} else if (printed && ISO_DAY.test(printed)) {
				due_date = printed
			} else if (printed && YEAR_ONLY.test(printed)) {
				due_date = `${printed}-12-31`
				inferred_due = true
			}
			// A "due" date in the past is an event the model mislabeled — drop the date.
			if (due_date && due_date < period_end) {
				due_date = null
				inferred_due = false
			}
		}

		out.push({
			id: crypto.randomUUID(),
			cik: meta.cik,
			accession: meta.accession,
			amount,
			amount_high,
			value_type,
			unit,
			kind,
			certainty,
			period_start: null,
			period_end,
			fiscal_year: null,
			fiscal_period: null,
			due_date,
			inferred_due,
			event_date,
			counterparty: strOrNull(r.counterparty),
			related_party: r.related_party === true,
			taxonomy_tag: null,
			source_location: strOrNull(r.source_location) ?? "unspecified",
			notes: noteText,
			origin: "ai",
			content_hash: await sha256hex(
				`ai|${meta.accession}|${kind}|${amount}|${unit}|${period_end}|${due_date ?? ""}`
			)
		})
	}
	return out
}

// ── 6-K path: classify docs, then double-pass figure extraction ──────────────

export type SixKDoc = { name: string; head: string } // head = first ~2KB of stripped text
export type ClassifyCaller = (docs: SixKDoc[]) => Promise<number[]>

async function defaultClassifyCaller(docs: SixKDoc[]): Promise<number[]> {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_classification",
		description: "Submit which documents carry quarterly results. Call exactly once.",
		parameters: Type.Object({
			results_docs: Type.Array(Type.Number(), {
				description:
					"0-based indexes of documents that are quarterly-results material (financial statements " +
					"or a results press release). Empty if none — AGM notices, transmittals, presentations do not count."
			})
		})
	}
	const ctx: Context = {
		systemPrompt:
			"You classify the documents inside one SEC 6-K filing. Identify which, if any, carry " +
			"quarterly financial results (statement tables or a results press release with figures).",
		messages: [
			{
				role: "user",
				content: JSON.stringify(docs.map((d, i) => ({ index: i, name: d.name, head: d.head }))),
				timestamp: Date.now()
			}
		],
		tools: [submit]
	}
	const response = await complete(getAiModel(REALITY_CONFIG.MODEL_CLASSIFIER), ctx)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during 6-K classify")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_classification")
	if (!call) return []
	const out = validateToolCall([submit], call) as { results_docs: number[] }
	return (out.results_docs ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < docs.length)
}

/** Which docs in a 6-K are quarterly-results material (probe: exhibit names are
 *  unstable across years, so filenames can't route). [] ⇒ catalog no-op. */
export function pickResultsDocs(docs: SixKDoc[], caller: ClassifyCaller = defaultClassifyCaller): Promise<number[]> {
	if (docs.length === 0) return Promise.resolve([])
	return caller(docs)
}

// The internal concepts a quarterly results release can realistically print.
const SIXK_CONCEPTS = CONCEPT_MAP.filter((c) =>
	["revenue", "cost_of_revenue", "gross_profit", "rnd_expense", "sales_marketing", "general_admin",
		"operating_income", "net_income", "income_tax", "ocf", "capex", "cash", "inventory",
		"deferred_rev_current", "debt_short", "debt_long"].includes(c.internal)
)
const SIXK_CONCEPT_NAMES = SIXK_CONCEPTS.map((c) => c.internal)
const SIXK_SPEC = new Map(SIXK_CONCEPTS.map((c) => [c.internal, c]))

export type RawSixKFigure = {
	concept?: unknown
	value?: unknown
	scale?: unknown
	currency?: unknown
	period_start?: unknown
	period_end?: unknown
}
export type SixKExtractCaller = (prompt: string, text: string) => Promise<{ figures: RawSixKFigure[] }>

// Two independently-worded passes (extraction.ts discipline: agreement means
// the number is robust to the prompt, not memorised). Both report values AS
// PRINTED plus the table's scale; code multiplies — so a shared "expand it
// yourself" mistake is impossible, and a scale disagreement between passes
// surfaces as a dropped figure instead of a silently wrong one.
export const SIXK_PASSES: readonly string[] = [
	`You are given a quarterly results document from a foreign SEC filer. Extract these ` +
		`figures wherever the document prints them: ${SIXK_CONCEPT_NAMES.join(", ")}. Results ` +
		`tables often print a quarter column and a cumulative (half-year or nine-month) column ` +
		`side by side — extract EVERY period column separately, each labeled with its own ` +
		`period_start and period_end (ISO dates read from the column heading). Report value ` +
		`EXACTLY as the table prints it (a cell showing 5,596.1 is value 5596.1) and report ` +
		`the table's stated presentation scale separately as scale ("units", "thousands", ` +
		`"millions", or "billions") — never multiply them yourself. Include the currency the ` +
		`document states. Balance-sheet items (cash, inventory, deferred revenue, debt) take ` +
		`the period's end date as both start and end. Omit any figure the document does not ` +
		`print — never write 0 for a missing figure. Call submit_figures exactly once.`,
	`The user message contains a foreign company's interim results filing. For each of the ` +
		`following line items, report every occurrence the filing states, one row per reporting ` +
		`period shown in the tables (quarterly and cumulative columns are separate rows, with the ` +
		`exact dates each column covers as period_start/period_end): ${SIXK_CONCEPT_NAMES.join(", ")}. ` +
		`Copy each number digit-for-digit as displayed into value, and name the presentation ` +
		`scale of its table in scale ("units", "thousands", "millions", or "billions") — do not ` +
		`convert or expand anything. Name the currency printed on the statements. For ` +
		`point-in-time balance items use the balance date for both period fields. Leave out ` +
		`entirely any line item the filing does not print; a zero placeholder is wrong. Submit ` +
		`through submit_figures, one call only.`
]

async function defaultSixKExtract(prompt: string, text: string): Promise<{ figures: RawSixKFigure[] }> {
	const { getAiModel } = await import("../ai")
	const submit: Tool = {
		name: "submit_figures",
		description: "Submit every extracted figure. Call exactly once.",
		parameters: Type.Object({
			figures: Type.Array(
				Type.Object({
					concept: Type.String({ description: `one of: ${SIXK_CONCEPT_NAMES.join(", ")}` }),
					value: Type.Number({ description: "the number exactly as displayed in the table — never expanded; omit the row rather than 0" }),
					scale: Type.String({ description: '"units" | "thousands" | "millions" | "billions" — the table\'s stated scale' }),
					currency: Type.String({ description: 'ISO code the document states, e.g. "EUR", "TWD"' }),
					period_start: Type.String({ description: "ISO date the period starts (balance date for instants)" }),
					period_end: Type.String({ description: "ISO date the period ends" })
				})
			)
		})
	}
	const ctx: Context = {
		systemPrompt: prompt,
		messages: [{ role: "user", content: `<document>\n${text}\n</document>`, timestamp: Date.now() }],
		tools: [submit]
	}
	const response = await complete(getAiModel(REALITY_CONFIG.MODEL_CATALOGER), ctx)
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "LLM error during 6-K extraction")
	const call = response.content.find((b): b is ToolCall => b.type === "toolCall" && b.name === "submit_figures")
	if (!call) throw new Error("6-K extraction: model did not submit figures")
	return validateToolCall([submit], call) as { figures: RawSixKFigure[] }
}

type SixKFigure = { concept: string; amount: number; currency: string; period_start: string; period_end: string }

function validSixKRows(raw: { figures: RawSixKFigure[] }): Map<string, SixKFigure> {
	const map = new Map<string, SixKFigure>()
	for (const r of raw.figures ?? []) {
		const concept = strOrNull(r.concept)
		const currency = normUnit(strOrNull(r.currency))
		const start = strOrNull(r.period_start)
		const end = strOrNull(r.period_end)
		const value = numOrNull(r.value)
		const factor = SCALE_FACTOR[strOrNull(r.scale) ?? ""]
		if (!concept || !SIXK_SPEC.has(concept)) continue
		if (value === null || value === 0) continue // 0 = not-found placeholder
		if (factor === undefined) continue // no stated scale → unverifiable
		if (!currency || !/^[A-Z]{3}$/.test(currency)) continue
		if (!start || !ISO_DAY.test(start) || !end || !ISO_DAY.test(end)) continue
		// Code multiplies. Same magnitude rule as XBRL ingestion: expense concepts
		// print in parentheses; income_tax keeps its sign (a benefit is real economics).
		const spec = SIXK_SPEC.get(concept)!
		const expanded = value * factor
		const amount = spec.kind === "expense" && concept !== "income_tax" ? Math.abs(expanded) : expanded
		const key = `${concept}|${currency}|${start}|${end}`
		if (!map.has(key)) map.set(key, { concept, amount, currency, period_start: start, period_end: end })
	}
	return map
}

const agree = (x: number, y: number): boolean =>
	Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)) <= 0.01

export type SixKExtraction = {
	entries: LedgerEntryInsert[]
	disagreements: { concept: string; period_end: string; values: [number, number] }[]
}

/**
 * Double-pass 6-K figure extraction over one results document. A figure
 * survives only when both passes agree within 1% on the same (concept,
 * currency, period); disagreements are surfaced, never averaged (§ extraction.ts).
 * Amounts compared here are already code-expanded, so a scale disagreement
 * between the passes lands in `disagreements`, never in the ledger.
 */
export async function extractSixKFigures(
	meta: FilingMeta,
	docName: string,
	text: string,
	caller: SixKExtractCaller = defaultSixKExtract
): Promise<SixKExtraction> {
	const a = validSixKRows(await caller(SIXK_PASSES[0], text))
	const b = validSixKRows(await caller(SIXK_PASSES[1], text))

	const entries: LedgerEntryInsert[] = []
	const disagreements: SixKExtraction["disagreements"] = []
	for (const [key, fa] of a) {
		const fb = b.get(key)
		if (!fb) continue // one-pass figures are unconfirmed → dropped
		if (!agree(fa.amount, fb.amount)) {
			disagreements.push({ concept: fa.concept, period_end: fa.period_end, values: [fa.amount, fb.amount] })
			continue
		}
		const spec = SIXK_SPEC.get(fa.concept)!
		const instant = fa.period_start === fa.period_end
		entries.push({
			id: crypto.randomUUID(),
			cik: meta.cik,
			accession: meta.accession,
			amount: fa.amount, // pass A's value; never averaged
			value_type: "currency",
			unit: fa.currency,
			kind: spec.kind,
			certainty: spec.certainty,
			period_start: instant ? null : fa.period_start,
			period_end: fa.period_end,
			fiscal_year: null,
			fiscal_period: null,
			taxonomy_tag: `6k:${fa.concept}`,
			source_location: `6k:${docName}`,
			origin: "ai",
			content_hash: await sha256hex(
				`6k|${fa.concept}|${fa.currency}|${instant ? "" : fa.period_start}|${fa.period_end}|${fa.amount}`
			)
		})
	}
	return { entries, disagreements }
}
