// Board grid helpers (WP5.4). Pure functions over dimension_scores rows so the
// grid math is unit-testable without D1.

type ScoreRowLike = { dimension: string; score: number; created_at: Date }

// Groups append-only dimension_scores rows into { latest, prior } per dimension.
// `prior` feeds the trend arrow (§2.5.8 computeTrend); rows may arrive unsorted.
export function latestPerDimension<T extends ScoreRowLike>(
	rows: T[]
): Map<string, { latest: T; prior: T | null }> {
	const byDim = new Map<string, T[]>()
	for (const row of rows) {
		const list = byDim.get(row.dimension)
		if (list) list.push(row)
		else byDim.set(row.dimension, [row])
	}
	const out = new Map<string, { latest: T; prior: T | null }>()
	for (const [dim, list] of byDim) {
		list.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
		out.set(dim, { latest: list[list.length - 1], prior: list[list.length - 2] ?? null })
	}
	return out
}

const DEFAULT_WINDOW_DAYS = 30

// "Most deteriorating" sort key: the magnitude of negative score deltas across
// consecutive rows per dimension, counting a delta when its LATER row falls in
// the trailing window. Composite rows are excluded (they re-express the F1–F9
// moves and would double-count). Returns ≥ 0; higher = more deteriorating.
// Single row per dimension → 0; pure improvement → 0.
export function deteriorationScore(
	rows: ScoreRowLike[],
	opts: { now?: Date; windowDays?: number } = {}
): number {
	const now = opts.now ?? new Date()
	const cutoff = now.getTime() - (opts.windowDays ?? DEFAULT_WINDOW_DAYS) * 24 * 60 * 60 * 1000

	let total = 0
	for (const [, group] of groupSorted(rows)) {
		for (let i = 1; i < group.length; i++) {
			if (group[i].created_at.getTime() < cutoff) continue
			const delta = group[i].score - group[i - 1].score
			if (delta < 0) total += -delta
		}
	}
	return total
}

function groupSorted<T extends ScoreRowLike>(rows: T[]): Map<string, T[]> {
	const byDim = new Map<string, T[]>()
	for (const row of rows) {
		if (row.dimension === "composite") continue
		const list = byDim.get(row.dimension)
		if (list) list.push(row)
		else byDim.set(row.dimension, [row])
	}
	for (const list of byDim.values()) {
		list.sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
	}
	return byDim
}
