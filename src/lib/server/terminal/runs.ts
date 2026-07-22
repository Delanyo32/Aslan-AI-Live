// Shared helpers for the terminal run routes (WP2.2): dev auth bypass, §2.8
// credit pre-check payload, and the terminal_runs insert + DO /start sequence
// used by both POST /api/terminal/run and POST /api/terminal/report/[slug]/rerun.

import { json } from "@sveltejs/kit"
import { eq } from "drizzle-orm"
import { profiles, companies, terminalRuns } from "$lib/server/db/schema"
import { terminalCreditCost } from "$lib/server/durable-objects/TerminalReportRunner"
import type { createDb } from "$lib/server/db/client"
import type { DurableObjectNamespace } from "@cloudflare/workers-types"

type Db = ReturnType<typeof createDb>
export type CompanyRow = typeof companies.$inferSelect

// ponytail: dev-only auth bypass (kept from WP2.1). Gated on the DEV_AUTH_BYPASS
// platform var, which exists only in .dev.vars — never set it in production.
// Lets curl acceptance runs hit the terminal routes without a session cookie.
export function resolveUserId(
	locals: App.Locals,
	platform: App.Platform | undefined,
	request: Request
): string | null {
	if (locals.user) return locals.user.id
	if (platform?.env.DEV_AUTH_BYPASS === "1") return request.headers.get("x-dev-user") || "dev-user"
	return null
}

// §2.8 402 payload. Null when the balance covers the cost.
export function insufficientCredits(
	available: number,
	required: number
): { error: "insufficient_credits"; required: number; available: number } | null {
	return available >= required ? null : { error: "insufficient_credits", required, available }
}

// Credit pre-check → terminal_runs insert → DO /start → 202 {session_id}.
// The DO reads its debit amount from `credit_cost` (computed here via
// terminalCreditCost so reruns start at CREDITS_RERUN) and the ledger reason
// from `reason`; the actual atomic debit happens in its persisting stage.
export async function startTerminalRun(
	db: Db,
	ns: DurableObjectNamespace,
	opts: { userId: string; company: CompanyRow; isRerun: boolean }
): Promise<Response> {
	const creditCost = terminalCreditCost(opts.isRerun)

	const [user] = await db
		.select({ credits: profiles.credits })
		.from(profiles)
		.where(eq(profiles.user_id, opts.userId))
	// ponytail: no user row (dev-bypass id) skips the pre-check; the DO's atomic
	// debit-with-refund at persist time is the real gate.
	if (user) {
		const short = insufficientCredits(user.credits ?? 0, creditCost)
		if (short) return json(short, { status: 402 })
	}

	const sessionId = crypto.randomUUID()
	const now = Date.now()
	await db.insert(terminalRuns).values({
		session_id: sessionId,
		user_id: opts.userId,
		company_id: opts.company.id,
		status: "pending",
		stage: "pending",
		created_at: now,
		updated_at: now
	})

	const stub = ns.get(ns.idFromName(sessionId))
	const doRes = await stub.fetch("https://terminal-report-runner/start", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			session_id: sessionId,
			user_id: opts.userId,
			company: opts.company,
			credit_cost: creditCost,
			is_rerun: opts.isRerun,
			reason: opts.isRerun ? "terminal_rerun" : "terminal_report"
		})
	})
	if (!doRes.ok) {
		return new Response(await doRes.text(), {
			status: doRes.status,
			headers: { "Content-Type": doRes.headers.get("content-type") ?? "application/json" }
		})
	}

	return json({ ok: true, session_id: sessionId, company_id: opts.company.id }, { status: 202 })
}
