// WP5.2 helpers shared by the Exa webhook + alerts routes. Pure logic lives
// here (route files stay thin) so bun test can cover it without a Worker.

import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { companies, terminalAlerts } from "$lib/server/db/schema"
import type { createDb } from "$lib/server/db/client"

type Db = ReturnType<typeof createDb>

/**
 * Webhook URL-token check. An unset/empty configured token never matches —
 * a missing EXA_WEBHOOK_TOKEN must fail closed, not turn the route public.
 */
export function webhookTokenValid(given: string | undefined, expected: string | undefined): boolean {
	return typeof expected === "string" && expected.length > 0 && given === expected
}

/**
 * Exa monitor webhook payload → monitor id. Assumed shape (pinned by the WP7.2
 * smoke suite alongside parseMonitorWebhook): { type: "monitor.run.completed",
 * data: { monitorId, ... } }, with defensive fallbacks for top-level/snake ids.
 */
export function extractMonitorId(payload: unknown): string | null {
	const p = payload as {
		data?: { monitorId?: unknown; monitor_id?: unknown }
		monitorId?: unknown
		monitor_id?: unknown
	} | null
	const cand = p?.data?.monitorId ?? p?.data?.monitor_id ?? p?.monitorId ?? p?.monitor_id
	return typeof cand === "string" && cand.length > 0 ? cand : null
}

/**
 * Does a companies.monitor_state blob own this monitor id? Only the three
 * *_monitor_id fields count — never the *_secret fields.
 */
export function monitorStateHasId(state: unknown, monitorId: string): boolean {
	if (state === null || typeof state !== "object") return false
	const s = state as Record<string, unknown>
	return (
		s.news_monitor_id === monitorId ||
		s.policy_monitor_id === monitorId ||
		s.competitor_monitor_id === monitorId
	)
}

// ponytail: full scan over companies with a monitor_state, matched in JS —
// monitor_state is a JSON column and only watched companies have one, so this
// is a handful of rows at v1 scale. Add a monitor_id → company_id lookup table
// if the watchlist ever grows past a few hundred companies.
export async function findCompanyByMonitorId(
	db: Db,
	monitorId: string
): Promise<typeof companies.$inferSelect | null> {
	const rows = await db.select().from(companies).where(isNotNull(companies.monitor_state))
	return rows.find((r) => monitorStateHasId(r.monitor_state, monitorId)) ?? null
}

/** Owner-scoped mark-read: only rows belonging to userId flip. Returns the count updated. */
export async function markAlertsRead(db: Db, userId: string, ids: string[]): Promise<number> {
	if (ids.length === 0) return 0
	const updated = await db
		.update(terminalAlerts)
		.set({ read: true })
		.where(and(eq(terminalAlerts.user_id, userId), inArray(terminalAlerts.id, ids)))
		.returning({ id: terminalAlerts.id })
	return updated.length
}
