import { backtestReports } from "./schema"
import { eq, and, sql } from "drizzle-orm"
import type { BacktestReportRow } from "$lib/types/pipeline"
import type { createDb } from "./client"

export type { BacktestReportRow }

type Db = ReturnType<typeof createDb>

// ── Slug generation ──────────────────────────────────────────────────────────

const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

function generateSlug(): string {
	return Array.from(
		{ length: 6 },
		() => SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]
	).join("")
}

function isUniqueConstraintError(e: unknown): boolean {
	const msg = (e as Error)?.message ?? ""
	// SQLite: "UNIQUE constraint failed: ..."
	// PostgreSQL: code 23505 (kept for compatibility during transition)
	return msg.includes("UNIQUE constraint failed") || (e as { code?: string })?.code === "23505"
}

// ── Repository functions ──────────────────────────────────────────────────────

export async function createReport(db: Db, data: {
	query: string
	event_spec: object
	exa_search: object
	rule: object
	confirmed_tickers: string[]
	occurrences: object[]
	impact_windows: object[]
	backtest_result: object
	low_confidence_events?: object[]
	user_id?: string | null
}): Promise<BacktestReportRow> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const slug = generateSlug()
		try {
			const [row] = await db
				.insert(backtestReports)
				.values({
					id:                    crypto.randomUUID(),
					slug,
					user_id:               data.user_id ?? null,
					query:                 data.query,
					event_spec:            data.event_spec,
					exa_search:            data.exa_search,
					rule:                  data.rule,
					confirmed_tickers:     data.confirmed_tickers,
					occurrences:           data.occurrences,
					impact_windows:        data.impact_windows,
					backtest_result:       data.backtest_result,
					low_confidence_events: data.low_confidence_events ?? [],
					status:                "complete",
				})
				.returning()
			return row as unknown as BacktestReportRow
		} catch (e: unknown) {
			if (isUniqueConstraintError(e) && attempt < 4) continue
			throw e
		}
	}
	throw new Error("Failed to generate a unique slug after 5 attempts")
}

// Returns the report only if status = "complete", regardless of is_public — used for public/owner viewing
export async function getReportBySlugIfComplete(db: Db, slug: string): Promise<BacktestReportRow | null> {
	const [row] = await db
		.select()
		.from(backtestReports)
		.where(
			and(
				eq(backtestReports.slug, slug),
				eq(backtestReports.status, "complete")
			)
		)
	return (row as unknown as BacktestReportRow) ?? null
}

// Returns any report by slug regardless of status — used for management operations (delete, visibility)
export async function getReportBySlug(db: Db, slug: string): Promise<BacktestReportRow | null> {
	const [row] = await db
		.select()
		.from(backtestReports)
		.where(eq(backtestReports.slug, slug))
	return (row as unknown as BacktestReportRow) ?? null
}

export async function updateReportStatus(db: Db, id: string, status: string): Promise<void> {
	await db
		.update(backtestReports)
		.set({ status, updated_at: new Date() })
		.where(eq(backtestReports.id, id))
}

export async function setResearchNarrative(db: Db, id: string, narrative: string): Promise<void> {
	await db
		.update(backtestReports)
		.set({ research_narrative: narrative, updated_at: new Date() })
		.where(eq(backtestReports.id, id))
}

export async function incrementViewCount(db: Db, id: string): Promise<void> {
	await db
		.update(backtestReports)
		.set({ view_count: sql`${backtestReports.view_count} + 1` })
		.where(eq(backtestReports.id, id))
}
