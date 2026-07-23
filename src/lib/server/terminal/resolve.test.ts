import { describe, test, expect } from "bun:test"
import { mapCandidates } from "./resolve"
import type { AssetUniverse } from "$lib/server/alpaca-market-data"
import type { ExaResultItem } from "./exa"

const universe: AssetUniverse = {
	symbols: new Set(["AAPL", "MSFT"]),
	names: new Map([
		["AAPL", "Apple Inc. Common Stock"],
		["MSFT", "Microsoft Corporation Common Stock"]
	]),
	meta: new Map()
}

const exa = (title: string | null, url = "https://ex.com"): ExaResultItem => ({ url, title })

describe("mapCandidates", () => {
	test("direct ticker hit is a US candidate with the universe name", () => {
		const [c] = mapCandidates("aapl", [], universe)
		expect(c).toEqual({ ticker: "AAPL", name: "Apple Inc. Common Stock", is_us: true })
	})

	test("exa result matching a universe name gets its symbol and is_us:true", () => {
		const [c] = mapCandidates("Microsoft", [exa("Microsoft Corporation")], universe)
		expect(c.ticker).toBe("MSFT")
		expect(c.is_us).toBe(true)
		expect(c.exa_entity).toBeDefined()
	})

	test("unmatched result is is_us:false with the query as fallback ticker", () => {
		const [c] = mapCandidates("005930.KS", [exa("Samsung Electronics")], universe)
		expect(c).toMatchObject({ ticker: "005930.KS", name: "Samsung Electronics", is_us: false })
	})

	test("direct hit and matching exa result merge into one candidate", () => {
		const out = mapCandidates("AAPL", [exa("Apple Inc.")], universe)
		expect(out).toHaveLength(1)
		expect(out[0].is_us).toBe(true)
		expect(out[0].exa_entity).toBeDefined()
	})

	test("caps at 5 candidates", () => {
		const results = Array.from({ length: 8 }, (_, i) => exa(`NoMatch Co ${i}`, `https://ex.com/${i}`))
		// distinct fallback tickers impossible (all share the query) → dedupe wins;
		// use matching names to force distinct tickers instead
		const big: AssetUniverse = {
			symbols: new Set(),
			names: new Map(Array.from({ length: 8 }, (_, i) => [`T${i}`, `NoMatch Co ${i} Common`])),
			meta: new Map()
		}
		expect(mapCandidates("nomatch", results, big)).toHaveLength(5)
	})

	test("short names never prefix-match the universe", () => {
		const [c] = mapCandidates("Appl", [exa("Appl")], universe)
		expect(c.is_us).toBe(false)
	})
})
