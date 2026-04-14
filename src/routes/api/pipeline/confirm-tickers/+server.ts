import { json } from "@sveltejs/kit"
import { confirmTickers } from "$lib/server/pipeline-sessions"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 })
	}

	const b = body as Record<string, unknown>

	if (!b.session_id || typeof b.session_id !== "string") {
		return json({ error: "session_id is required" }, { status: 400 })
	}
	if (!Array.isArray(b.confirmed_tickers) || b.confirmed_tickers.length === 0) {
		return json({ error: "confirmed_tickers must be a non-empty array" }, { status: 400 })
	}

	const ok = confirmTickers(b.session_id, b.confirmed_tickers as string[])
	if (!ok) {
		return json({ error: "session_not_found_or_expired" }, { status: 404 })
	}

	return json({ ok: true })
}
