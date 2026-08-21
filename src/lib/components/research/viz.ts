// Shared bits for the /research charts. Series palette = the dataviz reference
// categorical slots, validated 2026-08-20 against this site's light surface
// #fcfbf9 (all checks pass; aqua/yellow are sub-3:1 so every series is
// direct-labeled). Chart chrome uses the site's DESIGN.md ink/border tokens so
// charts and prose read as one surface. Site is light-only, so no dark steps.

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const
// Two steps of the blue sequential ramp — before/after and disclosed/estimated pairs.
export const BLUE_DARK = "#1c5cab"
export const BLUE_LIGHT = "#86b6ef"

// DESIGN.md tokens: text-secondary / text-body / divider / border.
export const INK_MUTED = "#6b7280" // axis ticks, chart captions — 4.9:1 on paper
export const INK_LABEL = "#4b5563" // direct series labels
export const GRID = "#eeeeee" // hairline gridlines
export const BASELINE = "#e5e5e5" // axis baseline

/** Ink for text sitting ON a series fill: dark ink on the light fills, white on the dark ones. */
export const inkOn = (fill: string): string =>
	[SERIES[2], SERIES[3], BLUE_LIGHT].includes(fill) ? "#171717" : "#ffffff"

const SYM: Record<string, string> = { USD: "$", EUR: "€", TWD: "NT$", RUB: "₽" }

/** Compact money: $2.82T / $712B / $9.3B / $640M. */
export function fmtMoney(v: number | null | undefined, currency = "USD"): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "—"
	const sym = SYM[currency] ?? `${currency} `
	const sign = v < 0 ? "-" : ""
	const a = Math.abs(v)
	const f = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(0) : x.toFixed(1))
	if (a >= 1e12) return `${sign}${sym}${(a / 1e12).toFixed(2)}T`
	if (a >= 1e9) return `${sign}${sym}${f(a / 1e9)}B`
	if (a >= 1e6) return `${sign}${sym}${f(a / 1e6)}M`
	return `${sign}${sym}${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

export const fmtPct = (v: number | null | undefined, dp = 0): string =>
	v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(dp)}%`

/** "2026-Q2" → "Q2 '26" for axis ticks; plain years pass through unchanged. */
export const fmtQ = (q: string): string => (q.includes("-Q") ? `Q${q.slice(6)} '${q.slice(2, 4)}` : q)
