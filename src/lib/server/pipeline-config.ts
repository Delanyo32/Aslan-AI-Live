/**
 * Shared pipeline configuration constants.
 */

export const ENTRY_EXIT_SUGGESTIONS = {
	aggressive: {
		label: "Aggressive",
		entry_rule: "Market open on event day",
		exit_rule: "Close on peak CAR date",
		description:
			"Catches maximum upside but requires same-day execution. Best for fast-moving events."
	},
	moderate: {
		label: "Moderate",
		entry_rule: "Market open next trading day after event",
		exit_rule: "Close on impact window end date (CAR decay or mean reversion)",
		description:
			"Rides the full event effect with a 1-day entry buffer to avoid gap-open noise."
	},
	conservative: {
		label: "Conservative",
		entry_rule: "Market open 2 trading days after event",
		exit_rule: "Close 5 trading days after event",
		description:
			"Avoids gap-open noise; trades the sustained trend only. Fixed 5-day hold."
	}
} as const
