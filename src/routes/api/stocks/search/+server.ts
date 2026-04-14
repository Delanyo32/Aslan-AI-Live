import { json } from "@sveltejs/kit"
import { loadUSEquityUniverse } from "$lib/server/alpaca-market-data"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get("q")?.trim() ?? ""
	if (q.length < 1) return json([])

	const universe = await loadUSEquityUniverse()
	const upper = q.toUpperCase()
	const lower = q.toLowerCase()

	const results: { symbol: string; name: string }[] = []
	for (const [symbol, name] of universe.names) {
		if (symbol.startsWith(upper) || name.toLowerCase().includes(lower)) {
			results.push({ symbol, name })
			if (results.length >= 10) break
		}
	}
	return json(results)
}
