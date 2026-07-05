// Watchlist routes (WP5.2, §2.8 row 7). POST/DELETE {company_id} → forward to
// the company's CompanyMonitor DO /watch | /unwatch with the authed user id.
// The DO owns the side effects (watchlist_entries upsert, first-watcher monitor
// bootstrap, last-unwatch teardown); these routes just authenticate and proxy.

import { json } from "@sveltejs/kit"
import { and, eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"
import { createDb } from "$lib/server/db/client"
import { companies, watchlistEntries } from "$lib/server/db/schema"
import { resolveUserId } from "$lib/server/terminal/runs"
import { logger } from "$lib/server/logger"
import type { DurableObjectNamespace } from "@cloudflare/workers-types"

// Shared prologue: auth → body → bindings → company row. Returns a Response on
// any failure so the handlers stay two lines each.
async function prepare(
	event: Parameters<RequestHandler>[0]
): Promise<
	| { fail: Response }
	| {
			fail?: undefined
			userId: string
			db: ReturnType<typeof createDb>
			ns: DurableObjectNamespace
			company: typeof companies.$inferSelect
	  }
> {
	const { request, locals, platform } = event
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return { fail: json({ error: "unauthorized" }, { status: 401 }) }

	let body: { company_id?: unknown }
	try {
		body = await request.json()
	} catch {
		return { fail: json({ error: "invalid_body" }, { status: 400 }) }
	}
	if (typeof body.company_id !== "string" || !body.company_id) {
		return { fail: json({ error: "company_id_required" }, { status: 400 }) }
	}

	const ns = platform?.env.COMPANY_MONITOR
	if (!ns || !platform?.env.DB) {
		logger.error("company_monitor_binding_missing", {})
		return { fail: json({ error: "server_misconfigured" }, { status: 500 }) }
	}
	const db = createDb(platform.env.DB)

	const [company] = await db.select().from(companies).where(eq(companies.id, body.company_id))
	if (!company) return { fail: json({ error: "company_not_found" }, { status: 404 }) }

	return { userId, db, ns, company }
}

async function callMonitor(
	ns: DurableObjectNamespace,
	companyId: string,
	path: "/watch" | "/unwatch",
	userId: string
): Promise<Response> {
	const stub = ns.get(ns.idFromName(companyId))
	return (await stub.fetch(`https://company-monitor${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ user_id: userId, company_id: companyId })
	})) as unknown as Response
}

export const POST: RequestHandler = async (event) => {
	const p = await prepare(event)
	if (p.fail) return p.fail

	const doRes = await callMonitor(p.ns, p.company.id, "/watch", p.userId)
	if (!doRes.ok) {
		return new Response(await doRes.text(), { status: doRes.status, headers: { "Content-Type": "application/json" } })
	}

	// The DO upserted the row; return the entry state so the UI can render it.
	const [entry] = await p.db
		.select()
		.from(watchlistEntries)
		.where(and(eq(watchlistEntries.user_id, p.userId), eq(watchlistEntries.company_id, p.company.id)))
		.limit(1)
	return json({ ok: true, watching: true, entry: entry ?? null })
}

export const DELETE: RequestHandler = async (event) => {
	const p = await prepare(event)
	if (p.fail) return p.fail

	const doRes = await callMonitor(p.ns, p.company.id, "/unwatch", p.userId)
	// DO responds {ok, watching:false, remaining_active} — pass it through.
	return new Response(await doRes.text(), {
		status: doRes.status,
		headers: { "Content-Type": "application/json" }
	})
}
