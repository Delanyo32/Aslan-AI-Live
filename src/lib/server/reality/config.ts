// Reality Ledger tunables (docs/PLAN_Reality_Ledger_v0.1.md Phase 2).
// Per-role model choice: start strong everywhere (user decision, grilling
// 2026-08-15); downgrade individual roles from measured pilot cost/quality.

export const REALITY_CONFIG = {
	// Role → OpenRouter model id, resolved via getAiModel(id).
	MODEL_CATALOGER: "openai/gpt-5.6-luna",     // soft-layer + 6-K extraction — digit accuracy gates everything
	MODEL_INVESTIGATOR: "openai/gpt-5.6-luna",  // cross-filing judgment
	MODEL_RECONCILER: "openai/gpt-5.6-luna",    // quarterly adjustments + narrative
	MODEL_CLASSIFIER: "openai/gpt-5.6-luna",    // 6-K doc classify (~2KB reads) — first downgrade candidate

	// companyfacts cache key prefix in R2 (beside the filings archive).
	R2_FACTS_PREFIX: "xbrl/",
	// Refetch companyfacts if the cached copy is older than this.
	FACTS_MAX_AGE_HOURS: 24
}
