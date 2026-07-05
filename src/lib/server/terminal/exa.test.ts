// Offline tests for the pure recipe→SDK-options mappers (no network). The SDK
// spreads these options straight into the wire body, so asserting the mapper
// output pins both the exa.search()/getContents() arguments and the §6 shape.
import { describe, test, expect } from "bun:test"
import { buildAgentRunRequest, buildSearchRequest, buildContentsRequest, parseMonitorWebhook } from "./exa"
import type { RubricRecipe } from "./rubrics/schema"

// §2.4 example recipe
const recipe: RubricRecipe = {
	primitive: "search",
	query_template: "{company} investors OR shareholders",
	category: "news",
	days: 90,
	contents: "highlights",
	domains: ["reuters.com", "ft.com"]
}

const NOW = new Date("2026-07-04T12:00:00Z")

// §6 dead params — must never appear anywhere in a built request
const BANNED = ["useAutoprompt", "numSentences", "highlightsPerUrl", "tokensNum", "includeUrls", "livecrawl"]
const allKeys = (v: unknown): string[] =>
	typeof v === "object" && v !== null
		? Object.entries(v).flatMap(([k, child]) => [k, ...allKeys(child)])
		: []

describe("buildSearchRequest", () => {
	test("interpolates {company}, nests contents, derives date window from days", () => {
		const req = buildSearchRequest(recipe, "Oracle", { now: NOW, numResults: 5 })
		expect(req.query).toBe("Oracle investors OR shareholders")
		expect(req.category).toBe("news")
		expect(req.numResults).toBe(5)
		expect(req.includeDomains).toEqual(["reuters.com", "ft.com"])
		expect(req.startPublishedDate).toBe("2026-04-05") // 90 days before NOW
		// §6: contents params nest inside `contents` on /search
		expect(req.contents).toEqual({ highlights: { maxCharacters: 1500 } })
		expect((req as Record<string, unknown>).highlights).toBeUndefined()
	})

	test("uses maxAgeHours (inside contents), never livecrawl or other dead params", () => {
		const req = buildSearchRequest(recipe, "Oracle", { now: NOW, maxAgeHours: 0 })
		expect(req.contents?.maxAgeHours).toBe(0)
		const keys = allKeys(req)
		for (const banned of BANNED) expect(keys).not.toContain(banned)
	})

	test("people category drops date filters (§6)", () => {
		const req = buildSearchRequest(
			{ primitive: "search", query_template: "{company} chief executive", category: "people", days: 30 },
			"Oracle",
			{ now: NOW }
		)
		expect(req.category).toBe("people")
		expect(req.startPublishedDate).toBeUndefined()
	})

	test("rejects categories outside the §6 enum and missing query_template", () => {
		expect(() =>
			buildSearchRequest({ primitive: "search", query_template: "{company}", category: "tweet" }, "Oracle")
		).toThrow(/§6 enum/)
		expect(() => buildSearchRequest({ primitive: "search" }, "Oracle")).toThrow(/query_template/)
	})
})

describe("buildContentsRequest", () => {
	test("contents params are top-level on /contents (no nesting), summary carries schema", () => {
		const schema = { type: "object", properties: { revenue: { type: "number" } } }
		const req = buildContentsRequest(["https://example.com/10k.pdf"], {
			summarySchema: schema,
			maxAgeHours: 168,
			subpages: 20
		})
		expect(req.urls).toEqual(["https://example.com/10k.pdf"])
		// §6: top-level, not nested under `contents`
		expect((req as Record<string, unknown>).contents).toBeUndefined()
		expect(req.summary).toEqual({ schema })
		expect(req.maxAgeHours).toBe(168)
		expect(req.subpages).toBe(20)
		const keys = allKeys(req)
		for (const banned of BANNED) expect(keys).not.toContain(banned)
	})

	test("recipe keyword maps: highlights top-level; default is text", () => {
		expect(buildContentsRequest(["https://a.com"], { contents: "highlights" }).highlights)
			.toEqual({ maxCharacters: 1500 })
		expect(buildContentsRequest(["https://a.com"]).text).toBe(true)
	})
})

describe("buildAgentRunRequest", () => {
	test("prompt in `query`; no `input` unless seeding; seed data nests as input.data OBJECT", () => {
		const schema = { type: "object" }
		const bare = buildAgentRunRequest({ query: "research Acme", outputSchema: schema, effort: "minimal" })
		expect(bare).toEqual({ query: "research Acme", outputSchema: schema, effort: "minimal" })

		const seed = [{ url: "https://reuters.com/a" }]
		const seeded = buildAgentRunRequest({ query: "q", outputSchema: schema, effort: "medium", data: seed })
		expect(seeded.input).toEqual({ data: seed }) // live schema: input must be an object, never a string
		expect(seeded.query).toBe("q")
	})
})

describe("parseMonitorWebhook", () => {
	const payload = {
		type: "monitor.run.completed",
		data: {
			id: "run_123",
			monitorId: "mon_456",
			status: "completed",
			output: {
				results: [
					{
						url: "https://www.reuters.com/article/acme-recall",
						title: "Acme recalls widgets",
						publishedDate: "2026-07-01",
						text: "Acme Corp said on Tuesday it would recall 10,000 widgets."
					},
					{ url: "https://ft.com/acme", title: null, highlights: ["Acme faces probe"] },
					{ title: "no url — dropped" }
				]
			}
		}
	}

	test("normalizes items to url/title/published_at/source/snippet, drops url-less rows", () => {
		const items = parseMonitorWebhook(payload)
		expect(items).toHaveLength(2)
		expect(items[0]).toEqual({
			url: "https://www.reuters.com/article/acme-recall",
			title: "Acme recalls widgets",
			published_at: "2026-07-01",
			source: "reuters.com", // www. stripped
			snippet: "Acme Corp said on Tuesday it would recall 10,000 widgets."
		})
		expect(items[1].published_at).toBeNull()
		expect(items[1].snippet).toBe("Acme faces probe") // falls back to first highlight
		expect(items[1].source).toBe("ft.com")
	})

	test("malformed payloads return [] instead of throwing", () => {
		expect(parseMonitorWebhook(null)).toEqual([])
		expect(parseMonitorWebhook({})).toEqual([])
		expect(parseMonitorWebhook({ data: { output: { results: "nope" } } })).toEqual([])
	})
})
