import { error } from "@sveltejs/kit"
import { getTerminalReportBySlug, incrementTerminalViewCount, getCompositeScoreHistory } from "$lib/server/db/terminal-reports"
import { redactForPublic } from "$lib/types/terminal"
import { followThroughRate } from "$lib/server/terminal/ledger"
import type { TerminalReportWithCompany } from "$lib/server/db/terminal-reports"
import type { PageServerLoad } from "./$types"

// LedgerStats display shape — counts + FTR only; ledger check_evidence (owner-only,
// §2.9) never crosses to the client.
async function loadLedger(db: App.Locals["db"], companyId: string) {
	const r = await followThroughRate(db, companyId)
	return { ftr: r.ftr, onTime: r.counts.on_time, late: r.counts.late, unaccounted: r.counts.unaccounted, total: r.counts.total }
}

function buildMeta(report: TerminalReportWithCompany, href: string) {
	const c = report.composite
	return {
		title: `${report.company.name} — Aslan Report`,
		description: c
			? `Aslan Score ${c.grade} · ${c.score}/100 · ${report.company.ticker}`
			: `${report.company.ticker} — nine-framework equity intelligence report`,
		url: href
	}
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { db } = locals

	// ponytail: remove-when-real-data — dev fixture so the UI is verifiable before
	// any terminal_reports row exists. `?public=1` forces the non-owner redaction path.
	if (import.meta.env.DEV && params.slug === "__fixture__") {
		const { fixtureReport } = await import("./fixture")
		const isOwner = url.searchParams.get("public") !== "1"
		const report = isOwner ? fixtureReport : redactForPublic(fixtureReport)
		return { report, isOwner, ledger: null, scoreHistory: [], meta: buildMeta(fixtureReport, url.href) }
	}

	const report = await getTerminalReportBySlug(db, params.slug)
	if (!report) throw error(404, "Report not found")

	const isOwner = !!locals.user && locals.user.id === report.user_id

	// Private report: only the owner may view it
	if (!report.is_public && !isOwner) throw error(404, "Report not found")

	// Increment view count only for anonymous public visitors
	if (!isOwner && !locals.user) {
		incrementTerminalViewCount(db, report.slug).catch(() => {})
	}

	// §2.9: non-owners get grades/scores/verdict but no screen-hit detail,
	// no suspected hits, no extraction disagreements.
	const payload = isOwner ? report : redactForPublic(report)
	const ledger = await loadLedger(db, report.company_id)
	// Composite grade trend (grade data — safe for public shares); chart renders only ≥2 points.
	const scoreHistory = await getCompositeScoreHistory(db, report.company_id)

	return { report: payload, isOwner, ledger, scoreHistory, meta: buildMeta(report, url.href) }
}
