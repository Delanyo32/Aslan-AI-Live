import { env } from "$env/dynamic/private"
const { ALPACA_API_KEY, ALPACA_API_SECRET } = env
import type { OHLCVBar } from "$lib/types/pipeline"

const BASE_URL = "https://data.alpaca.markets/v2/stocks"

type AlpacaBar = {
	t: string // ISO timestamp e.g. "2023-10-17T04:00:00Z"
	o: number
	h: number
	l: number
	c: number
	v: number
}

type AlpacaBarsResponse = {
	bars: AlpacaBar[] | null
	next_page_token: string | null
	symbol: string
}

export async function fetchOHLCV(
	symbol: string,
	dateFrom: string,
	dateTo: string
): Promise<OHLCVBar[]> {
	const headers: Record<string, string> = {
		"APCA-API-KEY-ID": ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": ALPACA_API_SECRET
	}

	const bars: OHLCVBar[] = []
	let pageToken: string | null = null

	do {
		const params = new URLSearchParams({
			start: dateFrom,
			end: dateTo,
			timeframe: "1Day",
			adjustment: "all",
			feed: "iex",
			limit: "1000"
		})
		if (pageToken) params.set("page_token", pageToken)

		const url = `${BASE_URL}/${encodeURIComponent(symbol)}/bars?${params}`
		const response = await fetch(url, { headers })

		if (!response.ok) {
			const text = await response.text()
			throw new Error(`Alpaca API error for ${symbol}: ${response.status} ${text}`)
		}

		const data: AlpacaBarsResponse = await response.json()

		for (const bar of data.bars ?? []) {
			// Extract YYYY-MM-DD from the ISO timestamp ("2023-10-17T04:00:00Z" → "2023-10-17")
			bars.push({
				date: bar.t.slice(0, 10),
				open: bar.o,
				high: bar.h,
				low: bar.l,
				close: bar.c,
				volume: bar.v
			})
		}

		pageToken = data.next_page_token
	} while (pageToken)

	// Ensure ascending order (Alpaca returns ascending but be explicit)
	bars.sort((a, b) => a.date.localeCompare(b.date))

	return bars
}

export type AssetUniverse = {
	/** All active US equity symbols — used as an allowlist to filter noise from Exa extractions */
	symbols: Set<string>
	/** symbol → company name */
	names: Map<string, string>
}

// Module-level cache — reloaded at most once per 24 h per server process
let _universe: AssetUniverse | null = null
let _loadedAt = 0
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * Loads the full list of active US equity assets from Alpaca.
 * Tries the paper-trading API first (most common in dev), then the live API.
 * Returns an empty universe on failure — callers must handle gracefully.
 */
export async function loadUSEquityUniverse(): Promise<AssetUniverse> {
	if (_universe && Date.now() - _loadedAt < TTL_MS) return _universe

	const headers: Record<string, string> = {
		"APCA-API-KEY-ID": ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": ALPACA_API_SECRET
	}

	for (const base of ["https://paper-api.alpaca.markets", "https://api.alpaca.markets"]) {
		try {
			const res = await fetch(`${base}/v2/assets?status=active&asset_class=us_equity`, { headers })
			if (!res.ok) continue
			const assets = await res.json() as { symbol: string; name?: string }[]
			_universe = {
				symbols: new Set(assets.map(a => a.symbol)),
				names:   new Map(assets.filter(a => a.name).map(a => [a.symbol, a.name!]))
			}
			_loadedAt = Date.now()
			return _universe
		} catch {
			// try next base URL
		}
	}

	console.error("[loadUSEquityUniverse] Failed to load from Alpaca — allowlist disabled")
	return { symbols: new Set(), names: new Map() }
}
