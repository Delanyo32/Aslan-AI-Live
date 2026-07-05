// GET /board/drilldown/[company]/[dimension] (WP5.4). Owner-scoped drill-down
// for one (company, dimension) cell: full grade history (append-only rows,
// newest first) + the evidence trail tagged with that dimension. The board is
// always the owner's view, so flags come through with detail — no redaction.

import { json } from "@sveltejs/kit"
import { and, desc, eq, sql } from "drizzle-orm"
import { companies, dimensionScores, evidenceItems, watchlistEntries } from "$lib/server/db/schema"
import { resolveUserId } from "$lib/server/terminal/runs"
import { DIMENSION_IDS } from "$lib/types/terminal"
import type { RequestHandler } from "./$types"

const DIMENSIONS = new Set<string>([...DIMENSION_IDS, "composite"])

export const GET: RequestHandler = async ({ params, locals, platform, request }) => {
	const userId = resolveUserId(locals, platform, request)
	if (!userId) return json({ error: "unauthorized" }, { status: 401 })
	if (!DIMENSIONS.has(params.dimension)) return json({ error: "bad_dimension" }, { status: 400 })

	const db = locals.db

	// Owner-of-watchlist-entry check: only an active watcher of this company
	// gets its drill-down.
	const [entry] = await db
		.select({ id: watchlistEntries.id })
		.from(watchlistEntries)
		.where(
			and(
				eq(watchlistEntries.user_id, userId),
				eq(watchlistEntries.company_id, params.company),
				eq(watchlistEntries.active, true)
			)
		)
		.limit(1)
	if (!entry) return json({ error: "not_watching" }, { status: 403 })

	const [company] = await db
		.select({ ticker: companies.ticker, name: companies.name })
		.from(companies)
		.where(eq(companies.id, params.company))
		.limit(1)
	if (!company) return json({ error: "not_found" }, { status: 404 })

	const history = await db
		.select()
		.from(dimensionScores)
		.where(
			and(
				eq(dimensionScores.company_id, params.company),
				eq(dimensionScores.dimension, params.dimension)
			)
		)
		.orderBy(desc(dimensionScores.created_at))

	// dimensions is a JSON text array ('["F7","F9"]'); LIKE on the quoted id is
	// exact enough — ids are fixed-shape tokens that can't substring-collide.
	const evidence =
		params.dimension === "composite"
			? []
			: await db
					.select({
						id: evidenceItems.id,
						url: evidenceItems.url,
						title: evidenceItems.title,
						source_domain: evidenceItems.source_domain,
						published_at: evidenceItems.published_at,
						snippet: evidenceItems.snippet,
						origin: evidenceItems.origin,
						created_at: evidenceItems.created_at
					})
					.from(evidenceItems)
					.where(
						and(
							eq(evidenceItems.company_id, params.company),
							sql`${evidenceItems.dimensions} LIKE ${`%"${params.dimension}"%`}`
						)
					)
					.orderBy(desc(evidenceItems.created_at))
					.limit(100)

	return json({
		company,
		dimension: params.dimension,
		history: history.map((h) => ({
			id: h.id,
			grade: h.grade,
			score: h.score,
			confidence: h.confidence,
			flags: h.flags,
			citations: h.citations,
			evidence_hash: h.evidence_hash,
			rubric_version: h.rubric_version,
			report_id: h.report_id,
			created_at: h.created_at.toISOString()
		})),
		evidence: evidence.map((e) => ({
			...e,
			published_at: e.published_at?.toISOString() ?? null,
			created_at: e.created_at.toISOString()
		}))
	})
}
