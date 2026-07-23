// Pure asset-classification + movers junk-filter. Kept env-free (no $env import)
// so it's unit-testable under `bun test` — alpaca-market-data.ts reads
// $env/dynamic/private at module load, which is unavailable in tests.

export type AssetType = "stock" | "etf" | "warrant"

export type AssetMeta = {
	exchange: string // NASDAQ | NYSE | ARCA | BATS | OTC | AMEX
	hasOptions: boolean
	type: AssetType
}

// Operating companies list on these; ARCA/BATS are ETF venues, OTC is junk.
export const MAJOR_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX"])

const DERIVATIVE_RE = /\b(warrants?|units?|rights?)\b/i
const FUND_RE = /\b(ETF|fund|portfolio)\b/i

/** Classify a US-equity asset from its name + listing venue. */
export function classifyAsset(name: string, exchange: string): AssetType {
	if (DERIVATIVE_RE.test(name)) return "warrant"
	if (FUND_RE.test(name) || exchange === "ARCA" || exchange === "BATS") return "etf"
	return "stock"
}

/**
 * True when a symbol is a real operating company worth suggesting — not a
 * warrant, unit, penny stock, or leveraged/inverse ETF. Verified against live
 * Alpaca movers: every penny/warrant mover was non-optionable, and the one
 * optionable outlier (a leveraged ETF) is caught by the "etf" classification.
 */
export function isRealCompany(meta: AssetMeta | undefined): boolean {
	return (
		!!meta &&
		meta.hasOptions &&
		MAJOR_EXCHANGES.has(meta.exchange) &&
		meta.type === "stock"
	)
}
