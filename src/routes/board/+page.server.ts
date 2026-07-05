import { redirect } from "@sveltejs/kit"
import { and, desc, eq, inArray } from "drizzle-orm"
import {
	authUser,
	companies,
	dimensionScores,
	terminalAlerts,
	terminalReports,
	watchlistEntries
} from "$lib/server/db/schema"
import { latestPerDimension, deteriorationScore } from "$lib/server/terminal/board"
import { computeTrend } from "$lib/server/terminal/scoring"
import { resolveUserId } from "$lib/server/terminal/runs"
import { TERMINAL_CONFIG } from "$lib/server/terminal/config"
import type { PageServerLoad } from "./$types"

// One cell of the grid: the latest dimension_scores row + its trend arrow.
export type BoardCell = {
	grade: string
	score: number
	confidence: string
	trend: "up" | "down" | "flat" | "new"
}

export type BoardRow = {
	company: { id: string; ticker: string; name: string; is_us: boolean }
	// "composite" | "F1"…"F9" → latest cell; missing dimension → absent key.
	cells: Record<string, BoardCell>
	deterioration: number // 30d negative-delta magnitude (board.ts), sort key
	latest_slug: string | null // newest complete report owned by this user
}

// Auth guard mirrors terminal/+page.server.ts; resolveUserId keeps the same
// dev-bypass the run routes use so local acceptance can act as the seeded user.
export const load: PageServerLoad = async ({ locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) throw redirect(302, "/auth/login")
	if (locals.user && locals.user.emailVerified === false) throw redirect(302, "/auth/check-email")

	const db = locals.db

	// Active watchlist joined to companies — the board's row set.
	const entries = await db
		.select({ company: companies })
		.from(watchlistEntries)
		.innerJoin(companies, eq(watchlistEntries.company_id, companies.id))
		.where(and(eq(watchlistEntries.user_id, userId), eq(watchlistEntries.active, true)))

	const companyIds = entries.map((e) => e.company.id)

	// ponytail: full dimension_scores history per watched company in one query —
	// latest+prior+30d window all come from the same rows. Window the query when
	// watchlists/history get big.
	const scores = companyIds.length
		? await db
				.select({
					company_id: dimensionScores.company_id,
					dimension: dimensionScores.dimension,
					grade: dimensionScores.grade,
					score: dimensionScores.score,
					confidence: dimensionScores.confidence,
					created_at: dimensionScores.created_at
				})
				.from(dimensionScores)
				.where(inArray(dimensionScores.company_id, companyIds))
		: []

	// Newest complete report per company owned by this user (rerun is owner-only).
	const reports = companyIds.length
		? await db
				.select({
					company_id: terminalReports.company_id,
					slug: terminalReports.slug,
					created_at: terminalReports.created_at
				})
				.from(terminalReports)
				.where(
					and(
						eq(terminalReports.user_id, userId),
						eq(terminalReports.status, "complete"),
						inArray(terminalReports.company_id, companyIds)
					)
				)
				.orderBy(desc(terminalReports.created_at))
		: []
	const latestSlug = new Map<string, string>()
	for (const r of reports) if (!latestSlug.has(r.company_id)) latestSlug.set(r.company_id, r.slug)

	const rows: BoardRow[] = entries.map(({ company }) => {
		const companyScores = scores.filter((s) => s.company_id === company.id)
		const cells: Record<string, BoardCell> = {}
		for (const [dim, { latest, prior }] of latestPerDimension(companyScores)) {
			cells[dim] = {
				grade: latest.grade,
				score: latest.score,
				confidence: latest.confidence,
				trend: computeTrend(latest.score, prior?.score ?? null)
			}
		}
		return {
			company: { id: company.id, ticker: company.ticker, name: company.name, is_us: company.is_us },
			cells,
			deterioration: deteriorationScore(companyScores),
			latest_slug: latestSlug.get(company.id) ?? null
		}
	})

	// Alerts feed, newest first. ponytail: unread counted from the loaded page
	// (50 covers the badge at watchlist scale); COUNT(*) query when it doesn't.
	const alerts = await db
		.select()
		.from(terminalAlerts)
		.where(eq(terminalAlerts.user_id, userId))
		.orderBy(desc(terminalAlerts.created_at))
		.limit(50)

	const companyName = new Map(entries.map((e) => [e.company.id, e.company.ticker]))

	// Fresh balance for the run/rerun confirm dialogs (terminal/+page.server.ts pattern).
	const [balance] = await db
		.select({ credits: authUser.credits })
		.from(authUser)
		.where(eq(authUser.id, userId))
		.limit(1)

	return {
		rows,
		alerts: alerts.map((a) => ({
			id: a.id,
			company_ticker: companyName.get(a.company_id) ?? "—",
			dimension: a.dimension,
			old_grade: a.old_grade,
			new_grade: a.new_grade,
			reason: a.reason,
			read: a.read,
			created_at: a.created_at.toISOString()
		})),
		unread: alerts.filter((a) => !a.read).length,
		credits: balance?.credits ?? 0,
		costs: {
			rerun: TERMINAL_CONFIG.CREDITS_RERUN,
			report: TERMINAL_CONFIG.CREDITS_DEEP_REPORT,
			watchMonthly: TERMINAL_CONFIG.CREDITS_WATCHLIST_MONTHLY
		}
	}
}
