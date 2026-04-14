import type {
	EntryExitRule,
	EventOccurrence,
	ImpactWindow,
	SimulatedTrade,
	BacktestResult
} from "$lib/types/pipeline"

const SLIPPAGE = 0.001 // 0.1%

// --- Trading day helpers ---
// All OHLCV bars passed here are already sorted ascending by date.

function tradingDaysAfter(bars: { date: string }[], fromDate: string, n: number): string | null {
	const idx = bars.findIndex(b => b.date >= fromDate)
	if (idx === -1) return null
	// If the fromDate itself is a trading day, offset 0 = that day
	const target = idx + n
	return bars[target]?.date ?? bars[bars.length - 1]?.date ?? null
}

function countTradingDays(bars: { date: string }[], from: string, to: string): number {
	return bars.filter(b => b.date > from && b.date <= to).length
}

// --- resolveEntryDate ---

export function resolveEntryDate(
	eventDate: string,
	rule: EntryExitRule,
	ohlcv: { date: string; open: number }[]
): { date: string; price: number } | null {
	let targetDate: string | null

	if (rule.entry === "event_day") {
		targetDate = tradingDaysAfter(ohlcv, eventDate, 0)
	} else if (rule.entry === "next_day") {
		targetDate = tradingDaysAfter(ohlcv, eventDate, 1)
	} else {
		// two_days_after
		targetDate = tradingDaysAfter(ohlcv, eventDate, 2)
	}

	if (!targetDate) return null
	const bar = ohlcv.find(b => b.date === targetDate)
	if (!bar) return null

	const slippageFactor = rule.direction === "long" ? 1 + SLIPPAGE : 1 - SLIPPAGE
	return { date: targetDate, price: bar.open * slippageFactor }
}

// --- resolveExitDate ---

export function resolveExitDate(
	window: ImpactWindow,
	rule: EntryExitRule,
	entryDate: string,
	ohlcv: { date: string; close: number }[]
): { date: string; price: number } | null {
	let targetDate: string | null

	if (rule.exit === "peak_car_date") {
		targetDate = window.peak_car_date
	} else if (rule.exit === "impact_end") {
		targetDate = window.impact_end
	} else {
		// fixed_5_days — 5 trading days after entry
		targetDate = tradingDaysAfter(ohlcv, entryDate, 5)
	}

	if (!targetDate) return null

	// Find bar on or after targetDate (in case it's not a trading day)
	const bar = ohlcv.find(b => b.date >= targetDate!)
	if (!bar) return null

	// Exit must be after entry
	if (bar.date <= entryDate) {
		// Advance by one trading day
		const idx = ohlcv.findIndex(b => b.date === bar.date)
		const next = ohlcv[idx + 1]
		if (!next) return null
		const slippageFactor = rule.direction === "long" ? 1 - SLIPPAGE : 1 + SLIPPAGE
		return { date: next.date, price: next.close * slippageFactor }
	}

	const slippageFactor = rule.direction === "long" ? 1 - SLIPPAGE : 1 + SLIPPAGE
	return { date: bar.date, price: bar.close * slippageFactor }
}

// --- simulateTrades ---

export function simulateTrades(
	occurrences: EventOccurrence[],
	impactWindows: ImpactWindow[],
	rule: EntryExitRule,
	directionMap?: Map<string, "long" | "short">
): SimulatedTrade[] {
	const trades: SimulatedTrade[] = []
	let index = 0

	// Build a lookup: "TICKER|event_date" → ImpactWindow
	const windowMap = new Map<string, ImpactWindow>()
	for (const w of impactWindows) {
		windowMap.set(`${w.ticker}|${w.event_date}`, w)
	}

	for (const occurrence of occurrences) {
		for (const ticker of occurrence.tickers) {
			const window = windowMap.get(`${ticker}|${occurrence.event_date}`)
			if (!window || window.ohlcv.length === 0) continue

			// Per-ticker direction: use directionMap if provided, then rule.directions_map,
			// then fall back to rule.direction for backward compatibility with old reports.
			const direction: "long" | "short" =
				directionMap?.get(ticker) ??
				rule.directions_map?.[ticker] ??
				rule.direction

			const tickerRule = { ...rule, direction }

			const entry = resolveEntryDate(occurrence.event_date, tickerRule, window.ohlcv)
			if (!entry) continue

			const exit = resolveExitDate(window, tickerRule, entry.date, window.ohlcv)
			if (!exit) continue

			const entryPrice = entry.price
			const exitPrice = exit.price
			const notional = rule.position_size

			let pnl_pct: number
			if (direction === "long") {
				pnl_pct = (exitPrice - entryPrice) / entryPrice
			} else {
				pnl_pct = (entryPrice - exitPrice) / entryPrice
			}

			const pnl_dollars = pnl_pct * notional
			const hold_days = countTradingDays(window.ohlcv, entry.date, exit.date)

			trades.push({
				trade_index: index++,
				event_date: occurrence.event_date,
				ticker,
				direction,
				entry_date: entry.date,
				entry_price: entryPrice,
				exit_date: exit.date,
				exit_price: exitPrice,
				hold_days,
				impact_window_end: window.impact_end,
				override_event: null,
				pnl_dollars,
				pnl_pct,
				abnormal_return_vs_benchmark: window.final_car,
				notional
			})
		}
	}

	return trades
}

// --- buildPortfolioSeries ---
// Produces one entry per calendar day (no gaps) from earliest entry to latest exit.
// P&L is realised on each trade's exit_date.

export function buildPortfolioSeries(
	trades: SimulatedTrade[],
	startingCapital: number
): { date: string; value: number }[] {
	if (trades.length === 0) return []

	// Collect all relevant dates
	const allDates = new Set<string>()
	for (const t of trades) {
		allDates.add(t.entry_date)
		allDates.add(t.exit_date)
	}

	const minDate = [...allDates].sort()[0]
	const maxDate = [...allDates].sort().reverse()[0]

	// Build a map of exit_date → total P&L realised on that day
	const pnlByDate = new Map<string, number>()
	for (const t of trades) {
		pnlByDate.set(t.exit_date, (pnlByDate.get(t.exit_date) ?? 0) + t.pnl_dollars)
	}

	// Walk calendar days from minDate to maxDate
	const series: { date: string; value: number }[] = []
	let value = startingCapital

	const current = new Date(minDate)
	const end = new Date(maxDate)

	while (current <= end) {
		const dateStr = current.toISOString().slice(0, 10)
		if (pnlByDate.has(dateStr)) {
			value += pnlByDate.get(dateStr)!
		}
		series.push({ date: dateStr, value })
		current.setDate(current.getDate() + 1)
	}

	return series
}

// --- computeSummary ---

export function computeSummary(
	trades: SimulatedTrade[],
	portfolioSeries: { date: string; value: number }[],
	startingCapital: number
): BacktestResult["summary"] {
	if (trades.length === 0) {
		throw new Error("Cannot compute summary for an empty trade list")
	}

	const finalPortfolioValue = portfolioSeries[portfolioSeries.length - 1]?.value ?? startingCapital
	const totalReturnDollars = finalPortfolioValue - startingCapital
	const totalReturnPct = totalReturnDollars / startingCapital

	const wins = trades.filter(t => t.pnl_dollars > 0).length
	const winRate = wins / trades.length

	const avgHoldDays = trades.reduce((sum, t) => sum + t.hold_days, 0) / trades.length

	const bestTrade = trades.reduce((best, t) => (t.pnl_dollars > best.pnl_dollars ? t : best))
	const worstTrade = trades.reduce((worst, t) => (t.pnl_dollars < worst.pnl_dollars ? t : worst))

	// Max drawdown from portfolio series (peak-to-trough)
	let maxDrawdown = 0
	let peak = portfolioSeries[0]?.value ?? startingCapital
	for (const { value } of portfolioSeries) {
		if (value > peak) peak = value
		const drawdown = (peak - value) / peak
		if (drawdown > maxDrawdown) maxDrawdown = drawdown
	}

	const eventDates = new Set(trades.map(t => t.event_date))
	const tickers = new Set(trades.map(t => t.ticker))

	return {
		total_return_pct: totalReturnPct,
		total_return_dollars: totalReturnDollars,
		win_rate: winRate,
		max_drawdown: maxDrawdown,
		avg_hold_days: avgHoldDays,
		best_trade: bestTrade,
		worst_trade: worstTrade,
		final_portfolio_value: finalPortfolioValue,
		starting_capital: startingCapital,
		trade_count: trades.length,
		event_count: eventDates.size,
		ticker_count: tickers.size
	}
}

// --- runSimulation ---
// Top-level orchestrator — called by the API route.

export function runSimulation(
	occurrences: EventOccurrence[],
	impactWindows: ImpactWindow[],
	rule: EntryExitRule,
	startingCapital: number,
	directionMap?: Map<string, "long" | "short">
): BacktestResult {
	const trades = simulateTrades(occurrences, impactWindows, rule, directionMap)

	if (trades.length === 0) {
		return {
			trades: [],
			portfolio_series: [],
			summary: {
				total_return_pct: 0,
				total_return_dollars: 0,
				win_rate: 0,
				max_drawdown: 0,
				avg_hold_days: 0,
				best_trade: null as unknown as SimulatedTrade,
				worst_trade: null as unknown as SimulatedTrade,
				final_portfolio_value: startingCapital,
				starting_capital: startingCapital,
				trade_count: 0,
				event_count: 0,
				ticker_count: 0
			}
		}
	}

	const portfolioSeries = buildPortfolioSeries(trades, startingCapital)
	const summary = computeSummary(trades, portfolioSeries, startingCapital)

	return { trades, portfolio_series: portfolioSeries, summary }
}
