import { json } from "@sveltejs/kit"
import { fetchOHLCV } from "$lib/server/alpaca-market-data"
import { calculateImpactWindow } from "$lib/server/impact-window"
import type { EventOccurrence, ImpactWindow, OHLCVBar } from "$lib/types/pipeline"
import type { RequestHandler } from "./$types"

function addCalendarDays(isoDate: string, days: number): string {
	const d = new Date(isoDate)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

export const POST: RequestHandler = async ({ request }) => {
	let occurrences: EventOccurrence[]
	let tickers: string[]

	try {
		const body = await request.json()
		occurrences = body?.occurrences
		tickers = body?.tickers
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 })
	}

	if (!Array.isArray(occurrences) || occurrences.length === 0) {
		return json({ error: "occurrences must be a non-empty array" }, { status: 400 })
	}
	if (!Array.isArray(tickers) || tickers.length === 0) {
		return json({ error: "tickers must be a non-empty array" }, { status: 400 })
	}

	// Date range: earliest event − 5 days → latest event + 35 days
	const sortedDates = [...occurrences.map(o => o.event_date)].sort()
	const rangeFrom = addCalendarDays(sortedDates[0], -5)
	const rangeTo = addCalendarDays(sortedDates[sortedDates.length - 1], 35)

	// Fetch OHLCV for every ticker + SPY concurrently — one Alpaca call per symbol
	const allSymbols = [...new Set([...tickers, "SPY"])]

	let priceData: Map<string, OHLCVBar[]>
	try {
		const results = await Promise.all(
			allSymbols.map(async symbol => ({
				symbol,
				bars: await fetchOHLCV(symbol, rangeFrom, rangeTo)
			}))
		)
		priceData = new Map(results.map(r => [r.symbol, r.bars]))
	} catch (e) {
		console.error("[impact-windows] Alpaca fetch failed:", e)
		return json(
			{ error: "price_fetch_failed", detail: e instanceof Error ? e.message : String(e) },
			{ status: 502 }
		)
	}

	const spyBars = priceData.get("SPY") ?? []

	// One ImpactWindow per (occurrence × ticker) pair
	const impact_windows: ImpactWindow[] = []

	for (const occurrence of occurrences) {
		for (const ticker of tickers) {
			const tickerBars = priceData.get(ticker) ?? []
			impact_windows.push(
				calculateImpactWindow(ticker, occurrence.event_date, tickerBars, spyBars)
			)
		}
	}

	// 3 entry/exit presets — rule descriptions, not pinned dates, because every
	// occurrence has different peak_car_date and impact_end values (applied per-trade
	// in the simulation step).
	const entry_exit_suggestions = {
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
	}

	return json({ impact_windows, entry_exit_suggestions })
}
