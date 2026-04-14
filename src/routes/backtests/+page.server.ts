import { backtestReports } from "$lib/server/db/schema/app"
import { eq, and, desc } from "drizzle-orm"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = locals

	const reports = await db
		.select({
			slug:              backtestReports.slug,
			query:             backtestReports.query,
			confirmed_tickers: backtestReports.confirmed_tickers,
			backtest_result:   backtestReports.backtest_result,
			created_at:        backtestReports.created_at,
		})
		.from(backtestReports)
		.where(and(eq(backtestReports.is_public, true), eq(backtestReports.status, "complete")))
		.orderBy(desc(backtestReports.created_at))
		.limit(24)

	return { reports, user: locals.user ?? null }
}
