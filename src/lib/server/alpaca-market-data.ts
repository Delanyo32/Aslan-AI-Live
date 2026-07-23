import { env } from "$env/dynamic/private"
import type { OHLCVBar } from "$lib/types/pipeline"
import { classifyAsset, isRealCompany, type AssetMeta } from "./screener-filter"

const BASE_URL = "https://data.alpaca.markets/v2/stocks"
const SCREENER_URL = "https://data.alpaca.markets/v1beta1/screener/stocks"

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
		"APCA-API-KEY-ID":     env.ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": env.ALPACA_API_SECRET,
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

type AlpacaSnapshotResponse = {
	latestTrade?: { p: number } | null
	dailyBar?: { c: number } | null
	prevDailyBar?: { c: number } | null
}

/**
 * Latest price for a symbol via Alpaca's snapshot endpoint (iex feed, matching
 * fetchOHLCV). Prefers the latest trade, then today's close, then yesterday's.
 * Returns null when Alpaca has no usable price; throws on transport/auth errors
 * (callers treat a thrown snapshot as "no verdict", never fatal to a report).
 */
export async function fetchSnapshot(symbol: string): Promise<number | null> {
	const headers: Record<string, string> = {
		"APCA-API-KEY-ID":     env.ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": env.ALPACA_API_SECRET,
	}

	const url = `${BASE_URL}/${encodeURIComponent(symbol)}/snapshot?feed=iex`
	const response = await fetch(url, { headers })

	if (!response.ok) {
		const text = await response.text()
		throw new Error(`Alpaca snapshot error for ${symbol}: ${response.status} ${text}`)
	}

	const data: AlpacaSnapshotResponse = await response.json()
	const price = data.latestTrade?.p ?? data.dailyBar?.c ?? data.prevDailyBar?.c ?? null
	return typeof price === "number" && price > 0 ? price : null
}

export type AssetUniverse = {
	/** All active US equity symbols — used as an allowlist to filter noise from Exa extractions */
	symbols: Set<string>
	/** symbol → company name */
	names: Map<string, string>
	/** symbol → exchange / optionability / derived type (categories + movers junk-filter) */
	meta: Map<string, AssetMeta>
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
		"APCA-API-KEY-ID":     env.ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": env.ALPACA_API_SECRET,
	}

	for (const base of ["https://paper-api.alpaca.markets", "https://api.alpaca.markets"]) {
		try {
			const res = await fetch(`${base}/v2/assets?status=active&asset_class=us_equity`, { headers })
			if (!res.ok) continue
			const assets = await res.json() as { symbol: string; name?: string; exchange?: string; attributes?: string[] }[]
			const meta = new Map<string, AssetMeta>()
			for (const a of assets) {
				const exchange = a.exchange ?? ""
				meta.set(a.symbol, {
					exchange,
					hasOptions: (a.attributes ?? []).includes("has_options"),
					type: classifyAsset(a.name ?? "", exchange)
				})
			}
			_universe = {
				symbols: new Set(assets.map(a => a.symbol)),
				names:   new Map(assets.filter(a => a.name).map(a => [a.symbol, a.name!])),
				meta
			}
			_loadedAt = Date.now()
			return _universe
		} catch {
			// try next base URL
		}
	}

	console.error("[loadUSEquityUniverse] Failed to load from Alpaca — allowlist disabled")
	return { symbols: new Set(), names: new Map(), meta: new Map() }
}

// ── Screener: market movers + most-active (dashboard suggestions) ─────────────

export type MoverItem = { symbol: string; name: string; price: number; percent_change: number }
export type ActiveItem = { symbol: string; name: string; volume: number }
export type Screener = { gainers: MoverItem[]; losers: MoverItem[]; most_actives: ActiveItem[] }

const EMPTY_SCREENER: Screener = { gainers: [], losers: [], most_actives: [] }

// Screener refreshes per-minute upstream — cache briefly so dashboard loads don't refetch.
let _screener: Screener | null = null
let _screenerAt = 0
const SCREENER_TTL_MS = 60 * 1000

type RawMover = { symbol: string; price: number; percent_change: number }
type RawActive = { symbol: string; volume: number }

/**
 * Top gainers, losers, and most-active US operating companies for the dashboard.
 * Raw Alpaca movers are dominated by warrants/penny stocks/leveraged ETFs; we
 * keep only real companies (see isRealCompany) and enrich each with its name.
 * Returns empty lists on any failure — the dashboard degrades gracefully.
 */
export async function fetchScreener(limit = 6): Promise<Screener> {
	if (_screener && Date.now() - _screenerAt < SCREENER_TTL_MS) return _screener

	const headers: Record<string, string> = {
		"APCA-API-KEY-ID":     env.ALPACA_API_KEY,
		"APCA-API-SECRET-KEY": env.ALPACA_API_SECRET,
	}

	try {
		const universe = await loadUSEquityUniverse()
		// Fetch a wide raw window (movers are junk-heavy) so enough survive the filter.
		const [moversRes, activesRes] = await Promise.all([
			fetch(`${SCREENER_URL}/movers?top=40`, { headers }),
			fetch(`${SCREENER_URL}/most-actives?by=volume&top=40`, { headers })
		])
		if (!moversRes.ok || !activesRes.ok) return EMPTY_SCREENER

		const movers = await moversRes.json() as { gainers?: RawMover[]; losers?: RawMover[] }
		const actives = await activesRes.json() as { most_actives?: RawActive[] }

		const keep = (symbol: string) => isRealCompany(universe.meta.get(symbol))
		const name = (symbol: string) => universe.names.get(symbol) ?? symbol

		const mapMovers = (rows: RawMover[] | undefined): MoverItem[] =>
			(rows ?? []).filter(r => keep(r.symbol)).slice(0, limit)
				.map(r => ({ symbol: r.symbol, name: name(r.symbol), price: r.price, percent_change: r.percent_change }))

		_screener = {
			gainers: mapMovers(movers.gainers),
			losers:  mapMovers(movers.losers),
			most_actives: (actives.most_actives ?? []).filter(r => keep(r.symbol)).slice(0, limit)
				.map(r => ({ symbol: r.symbol, name: name(r.symbol), volume: r.volume }))
		}
		_screenerAt = Date.now()
		return _screener
	} catch {
		return EMPTY_SCREENER
	}
}
