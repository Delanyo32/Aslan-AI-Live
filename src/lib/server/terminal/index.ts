// Aslan Terminal module interface — contract file (§2.3 of SPEC v0.3).
// Frozen after WP0.1; changes require orchestrator sign-off (change notes go here).
// Change note (cleanup pass): Company now lives in $lib/types/terminal (one
// declaration, re-exported here for existing importers); the unused
// checkLanguageCompliance / triageEvidence re-exports were removed — their
// callers import ./synthesis and ./triage directly.

export type { Company } from "$lib/types/terminal"

// scoring.ts (WP1.3) — LLM anchors + deterministic caps; pure composite.
export { gradeDimension, computeComposite } from "./scoring"

// research.ts (WP1.2) — one Exa agent run per dimension (recipe fallback); signature unchanged.
export { runDimensionResearch } from "./research"

// extraction.ts (WP1.4) — Exa filings + double extraction; injectable deps for offline tests.
export { extractFundamentals } from "./extraction"

// reconcile.ts (WP3.1) — reverse-DCF + verdict; null for non-US. Signature unchanged.
export { reconcilePrice } from "./reconcile"

// synthesis.ts (WP1.5) — implemented; signature unchanged (optional injectable caller added).
export { synthesize } from "./synthesis"
