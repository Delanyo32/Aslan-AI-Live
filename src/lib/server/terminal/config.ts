// All Aslan Terminal tunables in one place (§2.6 of SPEC v0.3).
// v1 defaults are placeholder economics from v0.2 §8 — deep report ≈ $2 cost,
// watchlist ≈ $3.50/mo. Revisit against real usage post-Milestone A.

export const TERMINAL_CONFIG = {
	CREDITS_DEEP_REPORT: 5,
	CREDITS_RERUN: 2,
	CREDITS_WATCHLIST_MONTHLY: 10,          // per company per user, debited monthly
	AGENT_EFFORT_DIMENSION: "medium",       // Exa agent run effort per dimension ($0.10)
	MONITOR_CADENCE_NEWS: "6h",
	MONITOR_CADENCE_POLICY: "1d",
	MONITOR_CADENCE_COMPETITOR: "7d",
	RESCORE_BATCH_HOURS: 12,                // ordinary material evidence batches; red_flag bypasses
	LEDGER_CHECK_OFFSETS_MONTHS: [0, 6, 12],
	VERDICT_BETA: true,                     // flipped manually after WP7.1 extraction eval ≥ 98%
	MAX_SEARCHES_PER_DIMENSION: 12,
	EXTRACTION_FILING_PAGES: 20,
}
