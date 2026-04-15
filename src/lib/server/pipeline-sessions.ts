import type { EntryExitRule } from "$lib/types/pipeline"

type PendingSession = {
	tickerResolve?: (tickers: string[]) => void
	ruleResolve?: (rule: EntryExitRule) => void
	params?: unknown
	createdAt: number
}

// Module-level Map — shared across all requests in the same Node.js process.
const sessions = new Map<string, PendingSession>()

const TIMEOUT_MS = 5 * 60 * 1000
const TTL_MS = 10 * 60 * 1000

function purgeExpired(): void {
	const cutoff = Date.now() - TTL_MS
	for (const [id, s] of sessions) {
		if (s.createdAt < cutoff) sessions.delete(id)
	}
}

// Called by the SSE endpoint before emitting ticker_candidates.
// Registers the resolve callback so confirm-tickers can wake it up.
export function waitForTickers(sessionId: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		purgeExpired()

		const timer = setTimeout(() => {
			sessions.delete(sessionId)
			reject(new Error("timeout"))
		}, TIMEOUT_MS)

		const existing = sessions.get(sessionId)
		sessions.set(sessionId, {
			...(existing ?? { createdAt: Date.now() }),
			tickerResolve: (tickers) => {
				clearTimeout(timer)
				resolve(tickers)
			}
		})
	})
}

// Called by the SSE endpoint before emitting entry_exit_suggestions.
export function waitForRule(sessionId: string): Promise<EntryExitRule> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			sessions.delete(sessionId)
			reject(new Error("timeout"))
		}, TIMEOUT_MS)

		const existing = sessions.get(sessionId)
		sessions.set(sessionId, {
			...(existing ?? { createdAt: Date.now() }),
			ruleResolve: (rule) => {
				clearTimeout(timer)
				resolve(rule)
			}
		})
	})
}

// Called by POST /api/pipeline/confirm-tickers — resolves the waiting SSE promise.
export function confirmTickers(sessionId: string, tickers: string[]): boolean {
	const session = sessions.get(sessionId)
	if (!session?.tickerResolve) return false
	session.tickerResolve(tickers)
	return true
}

// Called by POST /api/pipeline/confirm-rule — resolves the waiting SSE promise.
export function confirmRule(sessionId: string, rule: EntryExitRule): boolean {
	const session = sessions.get(sessionId)
	if (!session?.ruleResolve) return false
	session.ruleResolve(rule)
	return true
}

// Called by POST /api/pipeline/run — stores large params so the GET SSE handler
// can retrieve them by session_id instead of putting them in the URL query string.
export function storePipelineParams(sessionId: string, params: unknown): void {
	purgeExpired()
	const existing = sessions.get(sessionId)
	sessions.set(sessionId, {
		...(existing ?? { createdAt: Date.now() }),
		params,
	})
}

export function getPipelineParams(sessionId: string): unknown | undefined {
	return sessions.get(sessionId)?.params
}
