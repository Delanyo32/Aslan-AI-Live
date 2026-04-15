import { error } from "@sveltejs/kit"
import { getReportBySlugIfComplete, incrementViewCount } from "$lib/server/db/reports"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ params, cookies, locals, url }) => {
	const { db } = locals

	// Fetch the report regardless of is_public so owners can view private reports
	const report = await getReportBySlugIfComplete(db, params.id)

	if (!report) {
		throw error(404, "Report not found")
	}

	const isOwner = !!locals.user && locals.user.id === report.user_id

	// Private report: only the owner may view it
	if (!report.is_public && !isOwner) {
		throw error(404, "Report not found")
	}

	// Determine view context
	const hasCookie = cookies.get(`report_access_${params.id}`) === "1"

	type ViewContext = "owner" | "email_access" | "public_link"
	let viewContext: ViewContext
	if (isOwner || !!locals.user) {
		viewContext = "owner"
	} else if (hasCookie) {
		viewContext = "email_access"
	} else {
		viewContext = "public_link"
	}

	// Increment view count only for anonymous public visitors
	if (viewContext === "public_link") {
		incrementViewCount(db, report.id).catch(() => {})
	}

	// Build OG meta — uses P&L, not disclaimer text (PRD §5.3)
	const pct = report.backtest_result.summary.total_return_pct * 100
	const pctStr = (pct >= 0 ? "+" : "") + pct.toFixed(0) + "%"
	const n = report.backtest_result.summary.event_count
	const tickerCount = report.confirmed_tickers.length
	const series = report.backtest_result.portfolio_series
	let dateRange = ""
	if (series.length >= 2) {
		const fmt = (iso: string) => {
			const d = new Date(iso + "T00:00:00Z")
			return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
		}
		dateRange = `${fmt(series[0].date)} – ${fmt(series[series.length - 1].date)}`
	}

	const querySnippet = report.query.slice(0, 60)
	const meta = {
		title: `"${querySnippet}${report.query.length > 60 ? "..." : ""}" — Aslan Finance`,
		description: `${pctStr} across ${n} event${n !== 1 ? "s" : ""} | ${tickerCount} ticker${tickerCount !== 1 ? "s" : ""} | ${dateRange}`,
		url: url.href,
	}

	const ref = url.searchParams.get('ref')
	const backTo = ref === 'backtests' ? '/' : (viewContext === 'owner' ? '/dashboard' : '/')

	return { report, viewContext, backTo, meta, low_confidence_events: report.low_confidence_events ?? [], userCredits: locals.user?.credits ?? null }
}
