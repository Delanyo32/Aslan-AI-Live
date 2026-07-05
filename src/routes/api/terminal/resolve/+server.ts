// POST /api/terminal/resolve (WP2.2, §2.8 row 1). Two actions on one route so
// the client round-trips the exact candidate object:
//   { query }   → { candidates: ResolveCandidate[] }  (Exa company search ≤5
//                 candidates + Alpaca universe membership → is_us)
//   { confirm } → { company_id }  (upserts the chosen candidate into companies)

import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { logger } from "$lib/server/logger"
import { createDb } from "$lib/server/db/client"
import { companies } from "$lib/server/db/schema"
import { loadUSEquityUniverse } from "$lib/server/alpaca-market-data"
import { terminalSearch, type ExaResultItem } from "$lib/server/terminal/exa"
import { mapCandidates, type ResolveCandidate } from "$lib/server/terminal/resolve"
import { resolveUserId } from "$lib/server/terminal/runs"

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })
	if (!platform?.env.DB) return json({ error: "server_misconfigured" }, { status: 500 })

	let body: { query?: unknown; confirm?: unknown }
	try {
		body = await request.json()
	} catch {
		return json({ error: "invalid_body" }, { status: 400 })
	}

	// ── confirm: upsert the chosen candidate, return its companies id ──
	if (body.confirm !== undefined) {
		const c = body.confirm as Partial<ResolveCandidate>
		if (
			typeof c?.ticker !== "string" ||
			!c.ticker.trim() ||
			typeof c?.name !== "string" ||
			!c.name.trim() ||
			typeof c?.is_us !== "boolean"
		) {
			return json({ error: "invalid_candidate" }, { status: 400 })
		}
		const ticker = c.ticker.trim().toUpperCase()
		const name = c.name.trim()
		const db = createDb(platform.env.DB)
		const [company] = await db
			.insert(companies)
			.values({
				id: crypto.randomUUID(),
				ticker,
				name,
				exa_entity: c.exa_entity ?? undefined,
				is_us: c.is_us,
				alpaca_symbol: c.is_us ? ticker : null
			})
			.onConflictDoUpdate({
				target: companies.ticker,
				set: {
					name,
					exa_entity: c.exa_entity ?? undefined,
					is_us: c.is_us,
					alpaca_symbol: c.is_us ? ticker : null,
					updated_at: new Date()
				}
			})
			.returning({ id: companies.id })
		return json({ company_id: company.id })
	}

	// ── query: candidate search ──
	if (typeof body.query !== "string" || !body.query.trim()) {
		return json({ error: "query_required" }, { status: 400 })
	}
	const query = body.query.trim()

	const universe = await loadUSEquityUniverse()
	let results: ExaResultItem[] = []
	try {
		const res = await terminalSearch(
			{ primitive: "search", query_template: "{company}", category: "company" },
			query,
			{ numResults: 5 }
		)
		results = res.results ?? []
	} catch (e) {
		// Exa down ≠ resolve down: a direct ticker hit still resolves.
		logger.warn("terminal_resolve_exa_failed", { query, error: logger.serializeError(e) })
	}

	return json({ candidates: mapCandidates(query, results, universe) })
}
