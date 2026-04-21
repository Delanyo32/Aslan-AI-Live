import { eq, lt } from "drizzle-orm"
import { pipelineSessions } from "$lib/server/db/schema"
import type { createDb } from "$lib/server/db/client"

type Db = ReturnType<typeof createDb>

const SESSION_TTL_MS = 15 * 60 * 1000

// Legacy D1-backed session store. The live /api/pipeline/run flow is now owned
// by the PipelineRunner Durable Object, which holds its own state per session_id
// and does not poll this table. These helpers remain for any auxiliary endpoints
// still writing to pipeline_sessions (e.g. /api/pipeline/confirm-tickers).

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
