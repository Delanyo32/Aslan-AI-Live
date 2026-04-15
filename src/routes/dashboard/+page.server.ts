import { backtestReports } from "$lib/server/db/schema"
import { eq, and, desc, sql } from "drizzle-orm"
import type { PageServerLoad } from "./$types"

export type DashboardReport = {
	id: string
	slug: string
	query: string
	ticker_count: number
	total_return_pct: number
	date_from: string
	date_to: string
	created_at: Date
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	const { db } = locals

	const reports = await db
		.select({
			id:               backtestReports.id,
			slug:             backtestReports.slug,
			// SUBSTR works in both SQLite and PostgreSQL
			query:            sql<string>`SUBSTR(${backtestReports.query}, 1, 80)`,
			// json_array_length() for SQLite JSON arrays stored as TEXT
			ticker_count:     sql<number>`COALESCE(json_array_length(${backtestReports.confirmed_tickers}), 0)`,
			// json_extract() replaces PostgreSQL's -> / ->> JSONB operators
			total_return_pct: sql<number>`COALESCE(CAST(json_extract(${backtestReports.backtest_result}, '$.summary.total_return_pct') AS REAL), 0)`,
			date_from:        sql<string>`json_extract(${backtestReports.event_spec}, '$.date_range.start')`,
			date_to:          sql<string>`json_extract(${backtestReports.event_spec}, '$.date_range.end')`,
			created_at:       backtestReports.created_at,
		})
		.from(backtestReports)
		.where(
			and(
				eq(backtestReports.user_id, user.id),
				eq(backtestReports.is_public, true),
				eq(backtestReports.status, "complete")
			)
		)
		.orderBy(desc(backtestReports.created_at))

	// Coerce null values from json_extract() when JSON paths are missing or schema changes
	const safeReports = reports.map(r => ({
		...r,
		ticker_count:     r.ticker_count     ?? 0,
		total_return_pct: r.total_return_pct ?? 0,
		date_from:        r.date_from        ?? "",
		date_to:          r.date_to          ?? "",
	}))

	return {
		reports: safeReports,
		pendingQuery: url.searchParams.get('query') ?? null,
		rerunSlug:    url.searchParams.get('rerun')  ?? null,
	}
}
