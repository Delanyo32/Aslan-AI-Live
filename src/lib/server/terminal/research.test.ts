import { describe, test, expect } from "bun:test"
import { runDimensionResearch, buildOutputSchema, type ClassifyFn } from "./research"
import { TERMINAL_CONFIG } from "./config"
import type { AgentRun, ExaResults } from "./exa"
import type { RubricFramework, RubricRecipe } from "./rubrics/schema"
import type { companies } from "../db/schema/terminal"

type Company = typeof companies.$inferSelect

// ── fixtures ──────────────────────────────────────────────────────────────────

const searchRecipe: RubricRecipe = { primitive: "search", query_template: "{company} x", category: "news", days: 90 }

const framework = (
	signals: RubricRecipe[],
	falseSignals: RubricRecipe[] = []
): RubricFramework => ({
	version: "1.0.0",
	id: "F1",
	name: "Test dimension",
	question: "does it hold?",
	weight: 1,
	signals: signals.map((recipe, i) => ({
		id: `f1_sig${i}`,
		description: `signal ${i} description`,
		polarity: "both",
		weight: 1 / signals.length,
		recipe
	})),
	grade_anchors: { A: "a", C: "c", F: "f" },
	false_signals: falseSignals.map((recipe, i) => ({
		id: `f1_screen${i}`,
		description: `screen ${i}`,
		recipe,
		action: "cap:C"
	})),
	evidence_policy: { min_sources: 5, min_independent: 2, recency_days: 365 }
})

const company = (exaEntity: object | null = { url: "https://acme.com" }): Company =>
	({
		id: "c1",
		ticker: "ACME",
		name: "Acme Corp",
		exa_entity: exaEntity,
		is_us: true,
		alpaca_symbol: "ACME",
		sector: null,
		competitor_webset_id: null,
		monitor_state: null,
		created_at: new Date(),
		updated_at: new Date()
	}) as unknown as Company

const completedRun = (output: AgentRun["output"]): AgentRun => ({ id: "run1", status: "completed", output })

// ── tests ─────────────────────────────────────────────────────────────────────

describe("buildOutputSchema", () => {
	test("names every signal id (and every screen id)", () => {
		const fw = framework([searchRecipe, searchRecipe, searchRecipe], [searchRecipe])
		const json = JSON.stringify(buildOutputSchema(fw))
		for (const s of fw.signals) expect(json).toContain(s.id)
		for (const f of fw.false_signals) expect(json).toContain(f.id)
		// findings + screen_hits are the two top-level output properties
		const schema = buildOutputSchema(fw) as { properties: Record<string, unknown> }
		expect(Object.keys(schema.properties).sort()).toEqual(["findings", "screen_hits"])
	})
})

describe("agent path — evidence mapping", () => {
	const grounding: NonNullable<AgentRun["output"]>["grounding"] = [
		{
			field: "findings",
			citations: [
				{ url: "https://acme.com/press", title: "Own site" },
				{ url: "https://www.prnewswire.com/x", title: "PR wire" },
				{ url: "https://reuters.com/y", title: "Independent" }
			],
			confidence: "high"
		}
	]

	const run = async () =>
		runDimensionResearch(company(), framework([searchRecipe]), {
			createAgentRun: async () => ({ id: "run1", status: "running" }),
			pollAgentRun: async () => completedRun({ structured: { findings: [], screen_hits: [] }, grounding })
		})

	test("grounding → EvidenceItem with content_hash + correct company_controlled", async () => {
		const res = await run()
		const byDomain = new Map(res.evidence_items.map((e) => [e.source_domain, e]))

		expect(byDomain.get("acme.com")?.company_controlled).toBe(true) // company's own domain
		expect(byDomain.get("prnewswire.com")?.company_controlled).toBe(true) // PR wire
		expect(byDomain.get("reuters.com")?.company_controlled).toBe(false) // independent

		for (const e of res.evidence_items) {
			expect(e.content_hash).toMatch(/^[0-9a-f]{64}$/)
			expect(e.origin).toBe("report_run")
			expect(e.dimensions).toEqual(["F1"])
		}
		expect(res.searches_run).toBe(1)
	})
})

describe("agent path — finding hygiene + dedup", () => {
	test("zero-citation findings are dropped; screen hits are 'suspected'", async () => {
		const structured = {
			findings: [
				{ signal_id: "f1_sig0", direction: "supports", strength: 2, summary: "kept", citations: [{ url: "https://reuters.com/a" }] },
				{ signal_id: "f1_sig0", direction: "supports", strength: 3, summary: "dropped", citations: [] }
			],
			screen_hits: [
				{ pattern_id: "f1_screen0", summary: "seen", detail: "d", citations: [{ url: "https://reuters.com/b" }] },
				{ pattern_id: "unknown_pattern", summary: "no action", detail: "d", citations: [] }
			]
		}
		const res = await runDimensionResearch(company(), framework([searchRecipe], [searchRecipe]), {
			createAgentRun: async () => ({ id: "run1", status: "running" }),
			pollAgentRun: async () => completedRun({ structured, grounding: [] })
		})

		expect(res.findings.map((f) => f.summary)).toEqual(["kept"])
		// unknown pattern id has no code-owned action → dropped; known one stays suspected
		expect(res.screen_hits).toHaveLength(1)
		expect(res.screen_hits[0].status).toBe("suspected")
		expect(res.screen_hits[0].action).toBe("cap:C")
	})

	test("evidence items dedup by content_hash", async () => {
		const dupe = { url: "https://reuters.com/same", title: "t" }
		const grounding: NonNullable<AgentRun["output"]>["grounding"] = [
			{ field: "findings", citations: [dupe, dupe], confidence: "high" }
		]
		const structured = {
			findings: [{ signal_id: "f1_sig0", direction: "neutral", strength: 1, summary: "s", citations: [dupe] }],
			screen_hits: []
		}
		const res = await runDimensionResearch(company(), framework([searchRecipe]), {
			createAgentRun: async () => ({ id: "run1", status: "running" }),
			pollAgentRun: async () => completedRun({ structured, grounding })
		})
		// same url + (no published) + (no snippet) ⇒ one content_hash across 3 references
		expect(res.evidence_items).toHaveLength(1)
	})
})

describe("fallback path", () => {
	test("caps searches at config value and skips monitor_feed with a note", async () => {
		const monitor: RubricRecipe = { primitive: "monitor_feed", query_template: "{company} feed" }
		// 2 monitor_feed first, then many search recipes (more than the cap)
		const signals: RubricRecipe[] = [
			monitor,
			monitor,
			...Array.from({ length: TERMINAL_CONFIG.MAX_SEARCHES_PER_DIMENSION + 4 }, () => searchRecipe)
		]

		const searched: RubricRecipe[] = []
		const search = async (recipe: RubricRecipe): Promise<ExaResults> => {
			searched.push(recipe)
			return { results: [{ url: "https://reuters.com/n", title: "n", publishedDate: "2026-01-01" }] }
		}
		const classify: ClassifyFn = async () => ({ findings: [], screen_hits: [] })

		const res = await runDimensionResearch(company(), framework(signals), {
			createAgentRun: async () => {
				throw new Error("agent unavailable") // force fallback
			},
			terminalSearch: search as never,
			classify
		})

		expect(res.searches_run).toBe(TERMINAL_CONFIG.MAX_SEARCHES_PER_DIMENSION)
		expect(searched).toHaveLength(TERMINAL_CONFIG.MAX_SEARCHES_PER_DIMENSION)
		expect(searched.every((r) => r.primitive === "search")).toBe(true) // no monitor_feed searched
		expect(res.skipped).toContain("monitor_feed")
		expect(res.skipped).toContain("2")
	})

	test("no monitor_feed recipes ⇒ no skip note", async () => {
		const search = async (): Promise<ExaResults> => ({ results: [] })
		const classify: ClassifyFn = async () => ({ findings: [], screen_hits: [] })
		const res = await runDimensionResearch(company(), framework([searchRecipe, searchRecipe]), {
			createAgentRun: async () => {
				throw new Error("boom")
			},
			terminalSearch: search as never,
			classify
		})
		expect(res.skipped).toBeUndefined()
		expect(res.searches_run).toBe(2)
	})

	test("shared searchBudget caps total searches across dimensions", async () => {
		// More recipes than the per-dimension cap, so only the shared budget can stop it early.
		const many: RubricRecipe[] = Array.from(
			{ length: TERMINAL_CONFIG.MAX_SEARCHES_PER_DIMENSION + 4 },
			() => searchRecipe
		)
		let searched = 0
		const search = async (): Promise<ExaResults> => {
			searched++
			return { results: [] }
		}
		const classify: ClassifyFn = async () => ({ findings: [], screen_hits: [] })
		const budget = { remaining: 3 }
		const opts = {
			createAgentRun: async () => {
				throw new Error("agent unavailable") // force fallback
			},
			terminalSearch: search as never,
			classify,
			searchBudget: budget
		}

		const first = await runDimensionResearch(company(), framework(many), opts)
		expect(first.searches_run).toBe(3) // stopped at the shared budget, not the per-dim cap
		expect(budget.remaining).toBe(0)

		const second = await runDimensionResearch(company(), framework(many), opts)
		expect(second.searches_run).toBe(0) // budget already spent by the first dimension
		expect(searched).toBe(3) // 3 searches total across both dimensions
	})
})
