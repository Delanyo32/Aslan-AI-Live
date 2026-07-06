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
import type { CompositeScore } from "$lib/types/terminal"
import type { PageServerLoad } from "./$types"
import { redirect } from "@sveltejs/kit"

// One cell of the board grid: latest dimension_scores row + its trend arrow.
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
	deterioration: number // 30d negative-delta magnitude, sort key
	latest_slug: string | null // newest complete report owned by this user
	flagged: boolean // latest report carries a confirmed red-flag (composite.red_banner)
}

// A recent-report card: the report's own composite snapshot (stored on the row),
// so no dimension_scores join is needed.
export type RecentReport = {
	slug: string
	ticker: string
	name: string
	is_us: boolean
	grade: string
	score: number
	confidence: string
	red_banner: boolean
	is_public: boolean
	view_count: number
	created_at: string
}

// The terminal home. Absorbs the standalone board (folded into /dashboard):
// the living watchlist, the alerts feed, and the analyst's recent reports.
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
	// latest+prior+30d window all come from the same rows. Window when big.
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

	// Newest complete report per watched company owned by this user.
	const watchedReports = companyIds.length
		? await db
				.select({
					company_id: terminalReports.company_id,
					slug: terminalReports.slug,
					composite: terminalReports.composite,
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
	// First row per company is the newest (ordered desc) — its slug + red-flag.
	const latestSlug = new Map<string, string>()
	const flaggedByCompany = new Map<string, boolean>()
	for (const r of watchedReports) {
		if (latestSlug.has(r.company_id)) continue
		latestSlug.set(r.company_id, r.slug)
		flaggedByCompany.set(r.company_id, ((r.composite ?? null) as CompositeScore | null)?.red_banner ?? false)
	}

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
			latest_slug: latestSlug.get(company.id) ?? null,
			flagged: flaggedByCompany.get(company.id) ?? false
		}
	})

	// Recent reports across all companies (not just watched) — the analyst's
	// research trail. composite is stored on the report row, so no join needed.
	const reportRows = await db
		.select({
			slug: terminalReports.slug,
			composite: terminalReports.composite,
			is_public: terminalReports.is_public,
			view_count: terminalReports.view_count,
			created_at: terminalReports.created_at,
			ticker: companies.ticker,
			name: companies.name,
			is_us: companies.is_us
		})
		.from(terminalReports)
		.innerJoin(companies, eq(terminalReports.company_id, companies.id))
		.where(and(eq(terminalReports.user_id, userId), eq(terminalReports.status, "complete")))
		.orderBy(desc(terminalReports.created_at))
		.limit(6)

	const recentReports: RecentReport[] = reportRows.map((r) => {
		const c = (r.composite ?? null) as CompositeScore | null
		return {
			slug: r.slug,
			ticker: r.ticker,
			name: r.name,
			is_us: r.is_us,
			grade: c?.grade ?? "—",
			score: c?.score ?? 0,
			confidence: c?.confidence ?? "low",
			red_banner: c?.red_banner ?? false,
			is_public: r.is_public,
			view_count: r.view_count,
			created_at: r.created_at.toISOString()
		}
	})

	// Alerts feed, newest first (50 covers the badge at watchlist scale).
	const alerts = await db
		.select()
		.from(terminalAlerts)
		.where(eq(terminalAlerts.user_id, userId))
		.orderBy(desc(terminalAlerts.created_at))
		.limit(50)

	const tickerById = new Map(entries.map((e) => [e.company.id, e.company.ticker]))

	// Fresh balance for the run/rerun/watch confirm dialogs.
	const [balance] = await db
		.select({ credits: authUser.credits })
		.from(authUser)
		.where(eq(authUser.id, userId))
		.limit(1)

	return {
		rows,
		recentReports,
		alerts: alerts.map((a) => ({
			id: a.id,
			company_ticker: tickerById.get(a.company_id) ?? "—",
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
