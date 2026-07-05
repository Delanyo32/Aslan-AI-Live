import { terminalReports, companies } from "./schema"
import { eq, and, sql } from "drizzle-orm"
import { withUniqueSlug } from "./slug"
import type {
	Citation,
	CompositeScore,
	DimensionGrade,
	ExtractionResult,
	ReconciliationVerdict,
	TerminalReportRow
} from "$lib/types/terminal"
import type { createDb } from "./client"

type Db = ReturnType<typeof createDb>

// Insert a completed terminal report, retrying on slug collision (withUniqueSlug,
// the reports.ts pattern). Status is "complete": the DO only persists at the
// end of a successful run.
export async function createTerminalReport(
	db: Db,
	data: {
		user_id: string | null
		company_id: string
		rubric_version: string
		composite: CompositeScore
		dimensions: DimensionGrade[]
		extraction: ExtractionResult | null
		verdict: ReconciliationVerdict | null
		bear_bull: { bear: string; bull: string }
		narrative: string
		citations: Citation[]
		evidence_snapshot_hash: string
		credit_cost: number
	}
): Promise<{ id: string; slug: string }> {
	return withUniqueSlug(async (slug) => {
		const [row] = await db
			.insert(terminalReports)
			.values({
				id: crypto.randomUUID(),
				slug,
				user_id: data.user_id,
				company_id: data.company_id,
				status: "complete",
				rubric_version: data.rubric_version,
				composite: data.composite,
				dimensions: data.dimensions,
				extraction: data.extraction ?? undefined,
				verdict: data.verdict ?? undefined,
				bear_bull: data.bear_bull,
				narrative: data.narrative,
				citations: data.citations,
				evidence_snapshot_hash: data.evidence_snapshot_hash,
				credit_cost: data.credit_cost
			})
			.returning({ id: terminalReports.id, slug: terminalReports.slug })
		return row
	})
}

// Report row plus the joined company identity the page/OG meta needs.
export type TerminalReportWithCompany = TerminalReportRow & {
	company: { id: string; name: string; ticker: string; is_us: boolean }
}

// Returns the report only if status = "complete", regardless of is_public —
// owner/public viewing is enforced by the page. Mirrors reports.ts.
export async function getTerminalReportBySlug(
	db: Db,
	slug: string
): Promise<TerminalReportWithCompany | null> {
	const [row] = await db
		.select({ report: terminalReports, company: companies })
		.from(terminalReports)
		.innerJoin(companies, eq(terminalReports.company_id, companies.id))
		.where(and(eq(terminalReports.slug, slug), eq(terminalReports.status, "complete")))
	if (!row) return null
	return {
		...(row.report as unknown as TerminalReportRow),
		company: {
			id: row.company.id,
			name: row.company.name,
			ticker: row.company.ticker,
			is_us: row.company.is_us
		}
	}
}

export async function incrementTerminalViewCount(db: Db, slug: string): Promise<void> {
	await db
		.update(terminalReports)
		.set({ view_count: sql`${terminalReports.view_count} + 1` })
		.where(eq(terminalReports.slug, slug))
}
