// Pure candidate mapping for POST /api/terminal/resolve (WP2.2, §2.8 row 1).
// Exa `category:"company"` results + the Alpaca US-equity universe →
// ResolveCandidate[] with `is_us` membership per candidate.

import type { AssetUniverse } from "$lib/server/alpaca-market-data"
import type { ExaResultItem } from "./exa"

export type ResolveCandidate = {
	ticker: string
	name: string
	is_us: boolean
	exa_entity?: object
}

const MAX_CANDIDATES = 5
// User-facing symbols: "AAPL", "BRK.B", "005930.KS".
const TICKER_RE = /^[A-Za-z0-9.\-]{1,12}$/

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

// ponytail: naive prefix scan over the ~11k-name universe ("Apple" matches
// "Apple Inc. Common Stock"). Min 5 normalized chars to avoid short-name false
// positives. Replace with a real name→symbol index if it misfires.
function universeMatch(name: string, universe: AssetUniverse): string | null {
	const n = normalize(name)
	if (n.length < 5) return null
	for (const [symbol, uName] of universe.names) {
		const u = normalize(uName)
		if (u === n || u.startsWith(n)) return symbol
	}
	return null
}

export function mapCandidates(
	query: string,
	results: ExaResultItem[],
	universe: AssetUniverse
): ResolveCandidate[] {
	const q = query.trim()
	const asSymbol = q.toUpperCase()
	const candidates: ResolveCandidate[] = []
	const byTicker = new Map<string, ResolveCandidate>()

	const add = (c: ResolveCandidate) => {
		const existing = byTicker.get(c.ticker)
		// Same ticker twice (direct hit + Exa result): keep one, merge exa_entity.
		if (existing) {
			existing.exa_entity ??= c.exa_entity
			return
		}
		byTicker.set(c.ticker, c)
		candidates.push(c)
	}

	// Direct ticker hit: the query itself is an Alpaca symbol.
	if (TICKER_RE.test(q) && universe.symbols.has(asSymbol)) {
		add({ ticker: asSymbol, name: universe.names.get(asSymbol) ?? asSymbol, is_us: true })
	}

	for (const r of results) {
		if (candidates.length >= MAX_CANDIDATES) break
		const name = r.title?.trim() || q
		const symbol = universeMatch(name, universe)
		// ponytail: no ticker source for unmatched (non-US) names — fall back to
		// the typed query as the user-facing symbol (right when the user typed
		// "TSM"/"005930.KS"; cosmetic for name queries, WP4.2 renders the name).
		add({ ticker: symbol ?? asSymbol, name, is_us: symbol !== null, exa_entity: r })
	}

	return candidates.slice(0, MAX_CANDIDATES)
}
