import { error } from "@sveltejs/kit"
import { getTerminalReportBySlug, getCompositeScoreHistory } from "$lib/server/db/terminal-reports"
import { redactForPublic } from "$lib/types/terminal"
import { followThroughRate } from "$lib/server/terminal/ledger"
import { buildReportPdf } from "$lib/server/pdf/report-pdf"
import type { RequestHandler } from "./$types"

// Load the brand woff fonts from static/fonts via the ASSETS binding. Returns
// null when unavailable so the PDF builder falls back to StandardFonts.
function assetLoader(assets: App.Platform["env"]["ASSETS"] | undefined, origin: string) {
	return async (path: string): Promise<Uint8Array | null> => {
		if (!assets) return null
		const res = await assets.fetch(new URL(path, origin))
		if (!res.ok) return null
		return new Uint8Array(await res.arrayBuffer())
	}
}

async function loadLedger(db: App.Locals["db"], companyId: string) {
	try {
		const r = await followThroughRate(db, companyId)
		return { ftr: r.ftr, onTime: r.counts.on_time, late: r.counts.late, unaccounted: r.counts.unaccounted, total: r.counts.total }
	} catch {
		return null
	}
}

function pdfResponse(bytes: Uint8Array, ticker: string): Response {
	const filename = `${ticker}-value-reality-report.pdf`.replace(/[^\w.-]+/g, "-")
	// pdf-lib returns Uint8Array<ArrayBufferLike>; workers-types BodyInit wants a
	// concrete BufferSource — the cast reconciles them (bytes are already copied).
	return new Response(bytes as BodyInit, {
		headers: {
			"content-type": "application/pdf",
			"content-disposition": `attachment; filename="${filename}"`,
			"cache-control": "private, max-age=0, must-revalidate"
		}
	})
}

export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
	const load = assetLoader(platform?.env.ASSETS, url.origin)
	const { db } = locals
	const report = await getTerminalReportBySlug(db, params.slug)
	if (!report) throw error(404, "Report not found")

	const isOwner = !!locals.user && locals.user.id === report.user_id
	if (!report.is_public && !isOwner) throw error(404, "Report not found")

	const payload = isOwner ? report : redactForPublic(report)
	const ledger = await loadLedger(db, report.company_id)
	const scoreHistory = await getCompositeScoreHistory(db, report.company_id)

	const bytes = await buildReportPdf(payload, { isOwner, ledger, load, scoreHistory })
	return pdfResponse(bytes, report.company.ticker)
}
