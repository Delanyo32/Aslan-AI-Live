// GET /api/stocks/list?category=graded|board&q= — browseable company lists for
// the picker's category tabs. Returns [{ symbol, name, is_us }] (cap 50), drawn
// from the authed user's own history (no Alpaca call, no Exa resolve).

import { json } from "@sveltejs/kit"
import { and, desc, eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { companies, terminalReports, watchlistEntries } from "$lib/server/db/schema"
import { loadUSEquityUniverse, fetchScreener } from "$lib/server/alpaca-market-data"
import type { AssetMeta } from "$lib/server/screener-filter"
import { isRealCompany } from "$lib/server/screener-filter"
import { resolveUserId } from "$lib/server/terminal/runs"

type Item = { symbol: string; name: string; is_us: boolean }

const LIMIT = 50

// Universe-backed categories: a predicate over each asset's meta.
const UNIVERSE_CATS: Record<string, (m: AssetMeta) => boolean> = {
	major:  (m) => isRealCompany(m), // optionable operating companies on major exchanges
	nasdaq: (m) => m.type === "stock" && m.exchange === "NASDAQ",
	nyse:   (m) => m.type === "stock" && m.exchange === "NYSE",
	amex:   (m) => m.type === "stock" && m.exchange === "AMEX",
	etf:    (m) => m.type === "etf"
}

export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })
	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })

	const db = createDb(platform.env.DB)
	const category = url.searchParams.get("category") ?? ""
	const q = (url.searchParams.get("q") ?? "").trim().toLowerCase()
	const matchesQ = (symbol: string, name: string) =>
		!q || symbol.toLowerCase().startsWith(q) || name.toLowerCase().includes(q)

	// ── Universe categories (exchange / companies / ETFs) ──
	if (category in UNIVERSE_CATS) {
		const universe = await loadUSEquityUniverse()
		const pred = UNIVERSE_CATS[category]
		const matched: Item[] = []
		for (const [symbol, meta] of universe.meta) {
			if (!pred(meta)) continue
			const name = universe.names.get(symbol) ?? symbol
			if (!matchesQ(symbol, name)) continue
			matched.push({ symbol, name, is_us: true })
		}
		matched.sort((a, b) => a.symbol.localeCompare(b.symbol))
		return json(matched.slice(0, LIMIT))
	}

	// ── Movers (screener: gainers + losers + most-active, deduped, pre-ranked) ──
	if (category === "movers") {
		const s = await fetchScreener(LIMIT)
		const seen = new Set<string>()
		const out: Item[] = []
		for (const r of [...s.gainers, ...s.losers, ...s.most_actives]) {
			if (seen.has(r.symbol)) continue
			seen.add(r.symbol)
			if (!matchesQ(r.symbol, r.name)) continue
			out.push({ symbol: r.symbol, name: r.name, is_us: true })
			if (out.length >= LIMIT) break
		}
		return json(out)
	}

	// ── History categories (DB) ──
	let raw: { ticker: string; name: string; is_us: boolean }[]
	if (category === "graded") {
		// Companies this user has a completed report for, most-recent first.
		raw = await db
			.select({ ticker: companies.ticker, name: companies.name, is_us: companies.is_us })
			.from(terminalReports)
			.innerJoin(companies, eq(terminalReports.company_id, companies.id))
			.where(and(eq(terminalReports.user_id, userId), eq(terminalReports.status, "complete")))
			.orderBy(desc(terminalReports.created_at))
	} else if (category === "board") {
		raw = await db
			.select({ ticker: companies.ticker, name: companies.name, is_us: companies.is_us })
			.from(watchlistEntries)
			.innerJoin(companies, eq(watchlistEntries.company_id, companies.id))
			.where(and(eq(watchlistEntries.user_id, userId), eq(watchlistEntries.active, true)))
			.orderBy(desc(watchlistEntries.created_at))
	} else {
		return json({ error: "unknown_category" }, { status: 400 })
	}

	// Dedupe by ticker (a company can have many reports), keeping first (newest).
	const seen = new Set<string>()
	const items: Item[] = []
	for (const r of raw) {
		if (seen.has(r.ticker)) continue
		seen.add(r.ticker)
		if (q && !(r.ticker.toLowerCase().startsWith(q) || r.name.toLowerCase().includes(q))) continue
		items.push({ symbol: r.ticker, name: r.name, is_us: r.is_us })
		if (items.length >= 50) break
	}
	return json(items)
}
