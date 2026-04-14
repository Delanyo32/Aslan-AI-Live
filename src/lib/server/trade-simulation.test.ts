import { describe, test, expect } from "bun:test"
import {
	resolveEntryDate,
	resolveExitDate,
	simulateTrades,
	buildPortfolioSeries,
	computeSummary
} from "./trade-simulation"
import type { EntryExitRule, EventOccurrence, ImpactWindow } from "$lib/types/pipeline"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// 10 sequential "trading days" — simple contiguous dates for predictability
const makeBars = (startDate: string, count: number, basePrice = 100) => {
	const bars = []
	const d = new Date(startDate)
	for (let i = 0; i < count; i++) {
		const date = d.toISOString().slice(0, 10)
		bars.push({
			date,
			open: basePrice + i,
			high: basePrice + i + 2,
			low: basePrice + i - 2,
			close: basePrice + i + 1,
			volume: 1_000_000
		})
		d.setDate(d.getDate() + 1)
	}
	return bars
}

// ImpactWindow fixture for (NVDA, 2024-01-10)
const nvdaBars = makeBars("2024-01-08", 20, 500) // starts 2 days before event
const nvdaWindow: ImpactWindow = {
	ticker: "NVDA",
	event_date: "2024-01-10",
	impact_start: "2024-01-10",
	impact_end: "2024-01-20",
	impact_duration_days: 10,
	peak_car: 0.12,
	peak_car_date: "2024-01-15",
	final_car: 0.05,
	override_event: null,
	ohlcv: nvdaBars
}

// ImpactWindow fixture for (AMD, 2024-01-10)
const amdBars = makeBars("2024-01-08", 20, 200)
const amdWindow: ImpactWindow = {
	ticker: "AMD",
	event_date: "2024-01-10",
	impact_start: "2024-01-10",
	impact_end: "2024-01-20",
	impact_duration_days: 10,
	peak_car: 0.08,
	peak_car_date: "2024-01-14",
	final_car: 0.03,
	override_event: null,
	ohlcv: amdBars
}

// ImpactWindow fixture for (NVDA, 2024-02-05) — second event
const nvdaBars2 = makeBars("2024-02-03", 20, 520)
const nvdaWindow2: ImpactWindow = {
	ticker: "NVDA",
	event_date: "2024-02-05",
	impact_start: "2024-02-05",
	impact_end: "2024-02-15",
	impact_duration_days: 10,
	peak_car: 0.09,
	peak_car_date: "2024-02-10",
	final_car: 0.04,
	override_event: null,
	ohlcv: nvdaBars2
}

// Occurrences: 3 events — event 1 hits NVDA+AMD, events 2+3 hit NVDA only
const occurrences: EventOccurrence[] = [
	{
		event_date: "2024-01-10",
		description: "US announces chip export restrictions on China",
		confidence: "HIGH",
		tickers: ["NVDA", "AMD"],
		sources: [{ url: "https://example.com/1", title: "Chip restrictions", highlight: null }]
	},
	{
		event_date: "2024-02-05",
		description: "Second round of chip restrictions",
		confidence: "HIGH",
		tickers: ["NVDA"],
		sources: [{ url: "https://example.com/2", title: "More restrictions", highlight: null }]
	}
]

const impactWindows: ImpactWindow[] = [nvdaWindow, amdWindow, nvdaWindow2]

const longRule: EntryExitRule = {
	entry: "next_day",
	exit: "impact_end",
	direction: "long",
	position_size: 10_000
}

const shortRule: EntryExitRule = {
	entry: "next_day",
	exit: "impact_end",
	direction: "short",
	position_size: 10_000
}

// ---------------------------------------------------------------------------
// resolveEntryDate
// ---------------------------------------------------------------------------

describe("resolveEntryDate", () => {
	test("next_day returns the bar after event_date", () => {
		const result = resolveEntryDate("2024-01-10", longRule, nvdaBars)
		// event_date = 2024-01-10 (bars[2]), next day = bars[3] = 2024-01-11
		// open of bars[3] = 500 + 3 = 503
		expect(result).not.toBeNull()
		expect(result!.date).toBe("2024-01-11")
	})

	test("long entry applies +0.1% slippage to open price", () => {
		const result = resolveEntryDate("2024-01-10", longRule, nvdaBars)!
		const bar = nvdaBars.find(b => b.date === "2024-01-11")!
		expect(result.price).toBeCloseTo(bar.open * 1.001, 6)
	})

	test("short entry applies -0.1% slippage to open price", () => {
		const result = resolveEntryDate("2024-01-10", shortRule, nvdaBars)!
		const bar = nvdaBars.find(b => b.date === "2024-01-11")!
		expect(result.price).toBeCloseTo(bar.open * 0.999, 6)
	})

	test("event_day returns the event date bar (no offset)", () => {
		const rule: EntryExitRule = { ...longRule, entry: "event_day" }
		const result = resolveEntryDate("2024-01-10", rule, nvdaBars)!
		expect(result.date).toBe("2024-01-10")
	})

	test("two_days_after returns bar 2 trading days after event", () => {
		const rule: EntryExitRule = { ...longRule, entry: "two_days_after" }
		const result = resolveEntryDate("2024-01-10", rule, nvdaBars)!
		expect(result.date).toBe("2024-01-12")
	})
})

// ---------------------------------------------------------------------------
// resolveExitDate
// ---------------------------------------------------------------------------

describe("resolveExitDate", () => {
	test("impact_end uses the close on impact_end date", () => {
		const entry = resolveEntryDate("2024-01-10", longRule, nvdaBars)!
		const result = resolveExitDate(nvdaWindow, longRule, entry.date, nvdaBars)!
		expect(result.date).toBe("2024-01-20")
	})

	test("long exit applies -0.1% slippage to close price", () => {
		const entry = resolveEntryDate("2024-01-10", longRule, nvdaBars)!
		const result = resolveExitDate(nvdaWindow, longRule, entry.date, nvdaBars)!
		const bar = nvdaBars.find(b => b.date >= "2024-01-20")!
		expect(result.price).toBeCloseTo(bar.close * 0.999, 6)
	})

	test("short exit applies +0.1% slippage to close price", () => {
		const entry = resolveEntryDate("2024-01-10", shortRule, nvdaBars)!
		const result = resolveExitDate(nvdaWindow, shortRule, entry.date, nvdaBars)!
		const bar = nvdaBars.find(b => b.date >= "2024-01-20")!
		expect(result.price).toBeCloseTo(bar.close * 1.001, 6)
	})

	test("peak_car_date exits at peak_car_date close", () => {
		const rule: EntryExitRule = { ...longRule, exit: "peak_car_date" }
		const entry = resolveEntryDate("2024-01-10", rule, nvdaBars)!
		const result = resolveExitDate(nvdaWindow, rule, entry.date, nvdaBars)!
		expect(result.date).toBe("2024-01-15")
	})

	test("fixed_5_days exits 5 trading days after entry", () => {
		const rule: EntryExitRule = { ...longRule, exit: "fixed_5_days" }
		const entry = resolveEntryDate("2024-01-10", rule, nvdaBars)!
		const result = resolveExitDate(nvdaWindow, rule, entry.date, nvdaBars)!
		// entry = 2024-01-11, +5 days = 2024-01-16
		expect(result.date).toBe("2024-01-16")
	})
})

// ---------------------------------------------------------------------------
// simulateTrades — P&L correctness
// ---------------------------------------------------------------------------

describe("simulateTrades", () => {
	test("produces one trade per (occurrence × ticker) pair that has a window", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		// event1: NVDA + AMD = 2 trades; event2: NVDA = 1 trade → total 3
		expect(trades).toHaveLength(3)
	})

	test("long trade P&L is positive when exit > entry", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		// nvdaBars: entry open on 2024-01-11 = 503, exit close on 2024-01-20 = 513
		// With slippage: entry = 503*1.001, exit = 513*0.999
		const nvdaTrade = trades.find(t => t.ticker === "NVDA" && t.event_date === "2024-01-10")!
		expect(nvdaTrade.pnl_dollars).toBeGreaterThan(0)
	})

	test("long trade P&L manual verification with slippage", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const nvdaTrade = trades.find(t => t.ticker === "NVDA" && t.event_date === "2024-01-10")!

		// bars[3] = 2024-01-11: open=503, bars[12] = 2024-01-20: close=513
		const entryPrice = 503 * 1.001 // long entry slippage
		const exitPrice = 513 * 0.999 // long exit slippage
		const expectedPnlPct = (exitPrice - entryPrice) / entryPrice
		const expectedPnlDollars = expectedPnlPct * 10_000

		expect(nvdaTrade.entry_price).toBeCloseTo(entryPrice, 4)
		expect(nvdaTrade.exit_price).toBeCloseTo(exitPrice, 4)
		expect(nvdaTrade.pnl_pct).toBeCloseTo(expectedPnlPct, 6)
		expect(nvdaTrade.pnl_dollars).toBeCloseTo(expectedPnlDollars, 4)
	})

	test("short trade P&L is negative when price rises (correctly signed)", () => {
		// Our fixture has rising prices, so a short should lose money
		const trades = simulateTrades(occurrences, impactWindows, shortRule)
		const nvdaTrade = trades.find(t => t.ticker === "NVDA" && t.event_date === "2024-01-10")!
		expect(nvdaTrade.pnl_dollars).toBeLessThan(0)
		expect(nvdaTrade.pnl_pct).toBeLessThan(0)
	})

	test("short trade P&L manual verification with slippage", () => {
		const trades = simulateTrades(occurrences, impactWindows, shortRule)
		const nvdaTrade = trades.find(t => t.ticker === "NVDA" && t.event_date === "2024-01-10")!

		const entryPrice = 503 * 0.999 // short entry: lower fill
		const exitPrice = 513 * 1.001 // short exit: higher fill (covers at premium)
		const expectedPnlPct = (entryPrice - exitPrice) / entryPrice
		const expectedPnlDollars = expectedPnlPct * 10_000

		expect(nvdaTrade.entry_price).toBeCloseTo(entryPrice, 4)
		expect(nvdaTrade.exit_price).toBeCloseTo(exitPrice, 4)
		expect(nvdaTrade.pnl_pct).toBeCloseTo(expectedPnlPct, 6)
		expect(nvdaTrade.pnl_dollars).toBeCloseTo(expectedPnlDollars, 4)
	})

	test("trade_index is sequential starting from 0", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		trades.forEach((t, i) => expect(t.trade_index).toBe(i))
	})

	test("abnormal_return_vs_benchmark equals window.final_car", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const nvdaTrade = trades.find(t => t.ticker === "NVDA" && t.event_date === "2024-01-10")!
		expect(nvdaTrade.abnormal_return_vs_benchmark).toBe(nvdaWindow.final_car)
	})
})

// ---------------------------------------------------------------------------
// buildPortfolioSeries — continuity and concurrent trades
// ---------------------------------------------------------------------------

describe("buildPortfolioSeries", () => {
	test("has no date gaps between earliest entry and latest exit", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const series = buildPortfolioSeries(trades, 10_000)
		expect(series.length).toBeGreaterThan(0)

		for (let i = 1; i < series.length; i++) {
			const prev = new Date(series[i - 1].date)
			const curr = new Date(series[i].date)
			const diffMs = curr.getTime() - prev.getTime()
			const diffDays = diffMs / (1000 * 60 * 60 * 24)
			expect(diffDays).toBe(1) // exactly 1 calendar day apart
		}
	})

	test("starts at starting_capital on the first day (no P&L yet)", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const series = buildPortfolioSeries(trades, 10_000)
		// First entry is the earliest entry date — no trade closes that day in our fixture
		expect(series[0].value).toBe(10_000)
	})

	test("concurrent trades from same event both contribute to portfolio value", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		// NVDA and AMD both exit on 2024-01-20
		const nvdaTrade = trades.find(t => t.ticker === "NVDA" && t.event_date === "2024-01-10")!
		const amdTrade = trades.find(t => t.ticker === "AMD" && t.event_date === "2024-01-10")!
		expect(nvdaTrade.exit_date).toBe(amdTrade.exit_date)

		const series = buildPortfolioSeries(trades, 10_000)
		const dayOfExit = series.find(s => s.date === nvdaTrade.exit_date)!
		// Value should include both NVDA and AMD P&L
		const expectedValue = 10_000 + nvdaTrade.pnl_dollars + amdTrade.pnl_dollars
		expect(dayOfExit.value).toBeCloseTo(expectedValue, 4)
	})

	test("returns empty array when no trades", () => {
		expect(buildPortfolioSeries([], 10_000)).toEqual([])
	})
})

// ---------------------------------------------------------------------------
// computeSummary — max_drawdown and best/worst trade
// ---------------------------------------------------------------------------

describe("computeSummary", () => {
	test("max_drawdown is derived from portfolio series, not trades directly", () => {
		// Build a custom portfolio series with a known drawdown
		const series = [
			{ date: "2024-01-01", value: 10_000 },
			{ date: "2024-01-02", value: 11_000 }, // peak
			{ date: "2024-01-03", value: 9_900 }, // trough: (11000-9900)/11000 = 0.1
			{ date: "2024-01-04", value: 10_500 }
		]
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const summary = computeSummary(trades, series, 10_000)
		// Drawdown from 11000 to 9900 = 1100/11000 ≈ 0.1
		expect(summary.max_drawdown).toBeCloseTo(1100 / 11000, 6)
	})

	test("best_trade is an actual SimulatedTrade object from the set", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const series = buildPortfolioSeries(trades, 10_000)
		const summary = computeSummary(trades, series, 10_000)
		expect(trades).toContain(summary.best_trade)
		expect(summary.best_trade.pnl_dollars).toBe(
			Math.max(...trades.map(t => t.pnl_dollars))
		)
	})

	test("worst_trade is an actual SimulatedTrade object from the set", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const series = buildPortfolioSeries(trades, 10_000)
		const summary = computeSummary(trades, series, 10_000)
		expect(trades).toContain(summary.worst_trade)
		expect(summary.worst_trade.pnl_dollars).toBe(
			Math.min(...trades.map(t => t.pnl_dollars))
		)
	})

	test("win_rate is fraction of profitable trades", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const series = buildPortfolioSeries(trades, 10_000)
		const summary = computeSummary(trades, series, 10_000)
		const manualWinRate = trades.filter(t => t.pnl_dollars > 0).length / trades.length
		expect(summary.win_rate).toBeCloseTo(manualWinRate, 6)
	})

	test("trade_count, event_count, ticker_count are correct", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const series = buildPortfolioSeries(trades, 10_000)
		const summary = computeSummary(trades, series, 10_000)
		expect(summary.trade_count).toBe(3) // 2 + 1
		expect(summary.event_count).toBe(2)
		expect(summary.ticker_count).toBe(2) // NVDA, AMD
	})

	test("starting_capital is preserved in summary", () => {
		const trades = simulateTrades(occurrences, impactWindows, longRule)
		const series = buildPortfolioSeries(trades, 10_000)
		const summary = computeSummary(trades, series, 10_000)
		expect(summary.starting_capital).toBe(10_000)
	})
})
