// GET /api/stocks/list?category=graded|board&q= — browseable company lists for
// the picker's category tabs. Returns [{ symbol, name, is_us }] (cap 50), drawn
// from the authed user's own history (no Alpaca call, no Exa resolve).

import { json } from "@sveltejs/kit"
import { and, desc, eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { companies, terminalReports, watchlistEntries } from "$lib/server/db/schema"
import { resolveUserId } from "$lib/server/terminal/runs"

type Item = { symbol: string; name: string; is_us: boolean }

export const GET: RequestHandler = async ({ url, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })
	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })

	const db = createDb(platform.env.DB)
	const category = url.searchParams.get("category") ?? ""
	const q = (url.searchParams.get("q") ?? "").trim().toLowerCase()

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
