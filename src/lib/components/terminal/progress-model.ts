// Pure SSE-event interpretation for TerminalProgress.svelte. Extracted so the
// load-bearing bits — the §2.3 stage→display mapping, the per-dimension log
// parsing, and the replay-idempotency guard — are unit-testable without a DOM.

// §2.3 TerminalStage name → index into DISPLAY_STAGES. Two names collapse:
//   grading → "Screening & grading" (grading runs the false-signal screens then
//     grades; there is no separate screening stage in §2.3),
//   synthesizing + persisting → "Writing report".
// researching re-emits once per dimension (9×) → all map to index 2; the counter
// comes from the F-log lines, not from stage_started.
export const STAGE_TO_DISPLAY: Record<string, number> = {
	resolving: 0,
	competitor_set: 1,
	researching: 2,
	extracting: 3,
	grading: 4,
	reconciling: 5,
	synthesizing: 6,
	persisting: 6
}

export const DISPLAY_STAGES = [
	"Resolving company",
	"Building competitor set",
	"Researching 9 dimensions",
	"Extracting fundamentals",
	"Screening & grading",
	"Reconciling price",
	"Writing report"
]

// Per-dimension progress lines look like "F3 Competitive Landscape: 7 findings,
// 21 evidence items". Returns the dimension id ("F3") or null.
export function dimensionFromLogLine(message: string): string | null {
	const m = /^(F\d)\b/.exec(message)
	return m ? m[1] : null
}

// SSE frames carry a monotonic `id:`. After a wrangler idle-drop the browser
// reconnects and the DO replays buffered events by id — so any id we've already
// processed is a replay to drop once, here. Non-numeric/absent ids are never
// replays (nothing to compare against).
export function isReplay(lastEventId: string, maxSeenId: number): boolean {
	const id = Number(lastEventId)
	if (!Number.isFinite(id) || id <= 0) return false
	return id <= maxSeenId
}
