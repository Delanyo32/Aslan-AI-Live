import { eq, lt } from "drizzle-orm"
import { pipelineSessions } from "$lib/server/db/schema"
import type { EntryExitRule } from "$lib/types/pipeline"
import type { createDb } from "$lib/server/db/client"

type Db = ReturnType<typeof createDb>

const SESSION_TTL_MS = 15 * 60 * 1000
const TIMEOUT_MS     = 5  * 60 * 1000
const POLL_INTERVAL  = 1_500

function sleep(ms: number) {
	return new Promise<void>(r => setTimeout(r, ms))
}

// Called by POST /api/pipeline/run — persists params to D1 so the GET SSE handler
// can retrieve them by session_id regardless of which Worker instance handles each request.
export async function storePipelineParams(
	sessionId: string,
	userId: string,
	params: unknown,
	db: Db,
): Promise<void> {
	const now = Date.now()
	await db.delete(pipelineSessions).where(lt(pipelineSessions.expires_at, now))
	await db.insert(pipelineSessions).values({
		id:          sessionId,
		user_id:     userId,
		params_json: JSON.stringify(params),
		created_at:  now,
		expires_at:  now + SESSION_TTL_MS,
	})
}

export async function getPipelineParams(
	sessionId: string,
	_userId: string,
	db: Db,
): Promise<unknown | null> {
	const rows = await db
		.select({ params_json: pipelineSessions.params_json })
		.from(pipelineSessions)
		.where(eq(pipelineSessions.id, sessionId))
		.limit(1)
	return rows[0]?.params_json ? JSON.parse(rows[0].params_json) : null
}

// Polls D1 every 1.5s until confirmed_rule_json is set (by POST /api/pipeline/confirm-rule).
// Works across Worker instances — no shared memory required.
export async function waitForRule(
	sessionId: string,
	db: Db,
	timeoutMs = TIMEOUT_MS,
): Promise<EntryExitRule> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const rows = await db
			.select({ confirmed_rule_json: pipelineSessions.confirmed_rule_json })
			.from(pipelineSessions)
			.where(eq(pipelineSessions.id, sessionId))
			.limit(1)
		if (rows[0]?.confirmed_rule_json) {
			return JSON.parse(rows[0].confirmed_rule_json) as EntryExitRule
		}
		await sleep(POLL_INTERVAL)
	}
	throw new Error("timeout")
}

export async function waitForTickers(
	sessionId: string,
	db: Db,
	timeoutMs = TIMEOUT_MS,
): Promise<string[]> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const rows = await db
			.select({ confirmed_tickers_json: pipelineSessions.confirmed_tickers_json })
			.from(pipelineSessions)
			.where(eq(pipelineSessions.id, sessionId))
			.limit(1)
		if (rows[0]?.confirmed_tickers_json) {
			return JSON.parse(rows[0].confirmed_tickers_json) as string[]
		}
		await sleep(POLL_INTERVAL)
	}
	throw new Error("timeout")
}

export async function confirmRule(
	sessionId: string,
	rule: EntryExitRule,
	db: Db,
): Promise<boolean> {
	const result = await db
		.update(pipelineSessions)
		.set({ confirmed_rule_json: JSON.stringify(rule) })
		.where(eq(pipelineSessions.id, sessionId))
		.returning({ id: pipelineSessions.id })
	return result.length > 0
}

export async function confirmTickers(
	sessionId: string,
	tickers: string[],
	db: Db,
): Promise<boolean> {
	const result = await db
		.update(pipelineSessions)
		.set({ confirmed_tickers_json: JSON.stringify(tickers) })
		.where(eq(pipelineSessions.id, sessionId))
		.returning({ id: pipelineSessions.id })
	return result.length > 0
}
