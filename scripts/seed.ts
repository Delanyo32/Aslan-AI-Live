#!/usr/bin/env bun
// Run with: bun run db:seed
// Idempotent — safe to re-run without creating duplicate rows.
// Bun auto-loads .env.local, so DATABASE_URL is available via process.env.
//
// NOTE: This script connects via the `postgres` npm package to a PostgreSQL
// DATABASE_URL for local development only. It does NOT target Cloudflare D1
// (the production database). To seed D1 directly, use:
//   wrangler d1 execute <database-name> --file=<sql-file>
// Do not run this script against a production D1 database.

import postgres from "postgres"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
	console.error("ERROR: DATABASE_URL is not set. Add it to .env.local.")
	process.exit(1)
}

const db = postgres(DATABASE_URL)

// ── Helpers ────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
	const d = new Date(iso + "T00:00:00Z")
	d.setUTCDate(d.getUTCDate() + n)
	return d.toISOString().slice(0, 10)
}

/** Linear portfolio series with mild noise, forcing end value. */
function portfolioSeries(
	startDate: string,
	days: number,
	startVal: number,
	endVal: number
): { date: string; value: number }[] {
	const series: { date: string; value: number }[] = []
	const d = new Date(startDate + "T00:00:00Z")
	const rng = (() => {
		// deterministic pseudo-random (no external deps)
		let s = 42
		return () => {
			s = (s * 1103515245 + 12345) & 0x7fffffff
			return (s % 10000) / 10000
		}
	})()
	for (let i = 0; i <= days; i++) {
		const progress = i / days
		const trend = startVal + (endVal - startVal) * progress
		const noise = (rng() - 0.5) * 300
		const value = i === days ? endVal : Math.max(startVal * 0.85, Math.round(trend + noise))
		series.push({ date: d.toISOString().slice(0, 10), value })
		d.setUTCDate(d.getUTCDate() + 1)
	}
	return series
}

function makeWindow(
	ticker: string,
	event_date: string,
	duration: number,
	peak_car: number
) {
	return {
		ticker,
		event_date,
		impact_start: addDays(event_date, 1),
		impact_end: addDays(event_date, duration),
		impact_duration_days: duration,
		peak_car,
		peak_car_date: addDays(event_date, Math.max(1, Math.floor(duration * 0.6))),
		final_car: peak_car * 0.25,
		override_event: null,
		ohlcv: [] // chart data wired in Step 11
	}
}

function makeTrade(
	index: number,
	event_date: string,
	ticker: string,
	entry_date: string,
	entry_price: number,
	exit_date: string,
	exit_price: number,
	direction: "long" | "short" = "long",
	notional = 10000
) {
	const pnl_pct =
		direction === "long"
			? (exit_price - entry_price) / entry_price
			: (entry_price - exit_price) / entry_price
	const pnl_dollars = Math.round(pnl_pct * notional)
	const bars = [] as { date: string }[]
	let d = new Date(entry_date + "T00:00:00Z")
	const end = new Date(exit_date + "T00:00:00Z")
	while (d <= end) {
		bars.push({ date: d.toISOString().slice(0, 10) })
		d.setUTCDate(d.getUTCDate() + 1)
	}
	const hold_days = bars.filter(b => b.date > entry_date && b.date <= exit_date).length

	return {
		trade_index: index,
		event_date,
		ticker,
		direction,
		entry_date,
		entry_price,
		exit_date,
		exit_price,
		hold_days,
		impact_window_end: addDays(event_date, 14),
		override_event: null,
		pnl_dollars,
		pnl_pct,
		abnormal_return_vs_benchmark: pnl_pct * 0.7,
		notional
	}
}

// ── Report A fixture — chip restrictions ────────────────────────────────────

const occurrencesA = [
	{
		event_date: "2019-05-17",
		description:
			"US Commerce Department adds Huawei to Entity List, restricting US technology exports and triggering broad semiconductor supply chain fears across the sector.",
		confidence: "HIGH",
		tickers: ["NVDA", "AMD", "INTC", "QCOM"],
		sources: [
			{
				url: "https://www.reuters.com/article/us-usa-huawei-entity-list-idUSKCN1SN2BI",
				title: "US blacklists Huawei, sparks technology supply chain fears",
				highlight: null
			},
			{
				url: "https://www.wsj.com/articles/huawei-added-to-us-entity-list-11558105267",
				title: "Huawei Added to U.S. Entity List",
				highlight: null
			}
		]
	},
	{
		event_date: "2019-10-07",
		description:
			"US expands export restrictions against Chinese surveillance technology firms and announces further Huawei restrictions, escalating semiconductor trade tensions.",
		confidence: "MEDIUM",
		tickers: ["NVDA", "AMD"],
		sources: [
			{
				url: "https://www.reuters.com/article/us-usa-china-blacklist-idUSKBN1WM2K3",
				title: "US blacklists China's surveillance tech firms, intensifies trade war",
				highlight: null
			}
		]
	},
	{
		event_date: "2020-08-17",
		description:
			"Commerce Department tightens Huawei restrictions, cutting off TSMC supply and signalling further semiconductor decoupling from China.",
		confidence: "HIGH",
		tickers: ["NVDA", "AMD", "INTC", "QCOM"],
		sources: [
			{
				url: "https://www.reuters.com/article/us-usa-huawei-ban-idUSKCN25D0T9",
				title: "US tightens Huawei supplier restrictions, cutting off TSMC",
				highlight: null
			}
		]
	},
	{
		event_date: "2021-11-24",
		description:
			"US adds SMIC and dozens of Chinese tech firms to investment and export blacklists, broadening semiconductor restrictions.",
		confidence: "HIGH",
		tickers: ["NVDA", "AMD", "QCOM"],
		sources: [
			{
				url: "https://www.reuters.com/business/us-adds-china-chip-maker-smic-other-firms-investment-blacklist-2021-12-16/",
				title: "US adds China chip maker SMIC, other firms to investment blacklist",
				highlight: null
			}
		]
	},
	{
		event_date: "2022-10-07",
		description:
			"Biden administration announces sweeping export controls on advanced AI chips to China, targeting NVIDIA A100 and H100 products used in AI training clusters.",
		confidence: "HIGH",
		tickers: ["NVDA", "AMD", "INTC", "QCOM"],
		sources: [
			{
				url: "https://www.reuters.com/technology/us-aims-broaden-curbs-exports-china-advanced-computing-chips-2022-10-07/",
				title: "US announces sweeping chip export restrictions on China",
				highlight: null
			},
			{
				url: "https://www.bloomberg.com/news/articles/2022-10-07/nvidia-amd-shares-slump-after-us-unveils-sweeping-chip-curbs",
				title: "Nvidia, AMD Shares Slump After US Unveils Sweeping Chip Curbs",
				highlight: null
			}
		]
	},
	{
		event_date: "2023-07-17",
		description:
			"Commerce Department announces new restrictions on advanced semiconductor packaging technology exports to China, targeting next-generation AI chip production.",
		confidence: "HIGH",
		tickers: ["NVDA", "AMD", "INTC", "QCOM"],
		sources: [
			{
				url: "https://www.reuters.com/technology/us-restrict-exports-advanced-semiconductor-equipment-china-2023-07-17/",
				title: "US to restrict exports of advanced chipmaking equipment to China",
				highlight: null
			}
		]
	},
	{
		event_date: "2024-01-31",
		description:
			"US government announces restrictions on NVIDIA H20 and MI300X AI chips, closing loopholes that allowed reduced-spec GPUs to reach China.",
		confidence: "MEDIUM",
		tickers: ["NVDA", "AMD", "QCOM"],
		sources: [
			{
				url: "https://www.wsj.com/tech/us-to-expand-chip-restrictions-to-china-targeting-nvidia-amd-products-2024-01-31",
				title: "US to Expand Chip Restrictions to China, Targeting Nvidia, AMD Products",
				highlight: null
			}
		]
	}
]

const tradesA = [
	// Event 1: 2019-05-17
	makeTrade(0, "2019-05-17", "NVDA", "2019-05-18", 152.3, "2019-05-29", 168.4),
	makeTrade(1, "2019-05-17", "AMD", "2019-05-18", 27.84, "2019-05-29", 29.1),
	makeTrade(2, "2019-05-17", "INTC", "2019-05-18", 45.6, "2019-05-28", 44.1),
	makeTrade(3, "2019-05-17", "QCOM", "2019-05-18", 72.4, "2019-05-31", 80.9),
	// Event 2: 2019-10-07
	makeTrade(4, "2019-10-07", "NVDA", "2019-10-08", 178.2, "2019-10-18", 188.5),
	makeTrade(5, "2019-10-07", "AMD", "2019-10-08", 28.9, "2019-10-18", 30.4),
	// Event 3: 2020-08-17
	makeTrade(6, "2020-08-17", "NVDA", "2020-08-18", 444.5, "2020-08-28", 490.3),
	makeTrade(7, "2020-08-17", "AMD", "2020-08-18", 82.1, "2020-08-28", 88.7),
	makeTrade(8, "2020-08-17", "INTC", "2020-08-18", 49.8, "2020-08-25", 47.2),
	makeTrade(9, "2020-08-17", "QCOM", "2020-08-18", 108.3, "2020-08-28", 118.9),
	// Event 4: 2021-11-24
	makeTrade(10, "2021-11-24", "NVDA", "2021-11-26", 322.4, "2021-12-07", 355.8),
	makeTrade(11, "2021-11-24", "AMD", "2021-11-26", 153.7, "2021-12-07", 163.2),
	makeTrade(12, "2021-11-24", "QCOM", "2021-11-26", 167.8, "2021-12-07", 179.4),
	// Event 5: 2022-10-07
	makeTrade(13, "2022-10-07", "NVDA", "2022-10-08", 112.4, "2022-10-21", 128.7),
	makeTrade(14, "2022-10-07", "AMD", "2022-10-08", 58.2, "2022-10-21", 62.4),
	makeTrade(15, "2022-10-07", "INTC", "2022-10-08", 24.1, "2022-10-11", 22.9),
	makeTrade(16, "2022-10-07", "QCOM", "2022-10-08", 120.3, "2022-10-19", 131.8),
	// Event 6: 2023-07-17
	makeTrade(17, "2023-07-17", "NVDA", "2023-07-18", 402.5, "2023-08-01", 449.0),
	makeTrade(18, "2023-07-17", "AMD", "2023-07-18", 112.0, "2023-08-01", 118.4),
	makeTrade(19, "2023-07-17", "INTC", "2023-07-18", 33.8, "2023-07-25", 32.1),
	makeTrade(20, "2023-07-17", "QCOM", "2023-07-18", 118.9, "2023-08-01", 128.7),
	// Event 7: 2024-01-31
	makeTrade(21, "2024-01-31", "NVDA", "2024-02-01", 613.6, "2024-02-14", 674.0),
	makeTrade(22, "2024-01-31", "AMD", "2024-02-01", 172.4, "2024-02-14", 183.1),
	makeTrade(23, "2024-01-31", "QCOM", "2024-02-01", 150.2, "2024-02-14", 161.8)
]

const windowsA = [
	makeWindow("NVDA", "2019-05-17", 12, 0.108), makeWindow("AMD", "2019-05-17", 12, 0.045),
	makeWindow("INTC", "2019-05-17", 10, -0.024), makeWindow("QCOM", "2019-05-17", 14, 0.118),
	makeWindow("NVDA", "2019-10-07", 10, 0.058), makeWindow("AMD", "2019-10-07", 10, 0.052),
	makeWindow("NVDA", "2020-08-17", 11, 0.103), makeWindow("AMD", "2020-08-17", 11, 0.08),
	makeWindow("INTC", "2020-08-17", 7, -0.052), makeWindow("QCOM", "2020-08-17", 10, 0.098),
	makeWindow("NVDA", "2021-11-24", 13, 0.104), makeWindow("AMD", "2021-11-24", 13, 0.062),
	makeWindow("QCOM", "2021-11-24", 13, 0.07),
	makeWindow("NVDA", "2022-10-07", 14, 0.184), makeWindow("AMD", "2022-10-07", 13, 0.072),
	makeWindow("INTC", "2022-10-07", 3, -0.049), makeWindow("QCOM", "2022-10-07", 11, 0.096),
	makeWindow("NVDA", "2023-07-17", 15, 0.116), makeWindow("AMD", "2023-07-17", 15, 0.057),
	makeWindow("INTC", "2023-07-17", 8, -0.048), makeWindow("QCOM", "2023-07-17", 15, 0.082),
	makeWindow("NVDA", "2024-01-31", 14, 0.098), makeWindow("AMD", "2024-01-31", 14, 0.063),
	makeWindow("QCOM", "2024-01-31", 14, 0.077)
]

function buildSummary(
	trades: ReturnType<typeof makeTrade>[],
	finalValue: number,
	startingCapital: number
) {
	const wins = trades.filter(t => t.pnl_dollars > 0).length
	const avgHold = trades.reduce((s, t) => s + t.hold_days, 0) / trades.length
	const sorted = [...trades].sort((a, b) => b.pnl_dollars - a.pnl_dollars)
	const best = sorted[0]
	const worst = sorted[sorted.length - 1]
	const eventDates = new Set(trades.map(t => t.event_date))
	const tickers = new Set(trades.map(t => t.ticker))
	return {
		total_return_pct: (finalValue - startingCapital) / startingCapital,
		total_return_dollars: finalValue - startingCapital,
		win_rate: wins / trades.length,
		max_drawdown: 0.083,
		avg_hold_days: avgHold,
		best_trade: best,
		worst_trade: worst,
		final_portfolio_value: finalValue,
		starting_capital: startingCapital,
		trade_count: trades.length,
		event_count: eventDates.size,
		ticker_count: tickers.size
	}
}

const backtestResultA = {
	trades: tradesA,
	portfolio_series: portfolioSeries("2019-05-17", 365, 10000, 11840),
	summary: buildSummary(tradesA, 11840, 10000)
}

// ── Report B fixture — fed rate hikes ──────────────────────────────────────

const occurrencesB = [
	{
		event_date: "2018-12-19",
		description: "Federal Reserve raises rates 25bps in surprise hawkish move, signalling further hikes despite market volatility.",
		confidence: "HIGH",
		tickers: ["JPM", "BAC", "WFC"],
		sources: [
			{
				url: "https://www.reuters.com/article/us-usa-fed-idUSKCN1OI2EU",
				title: "Fed raises rates, signals fewer hikes ahead amid market turmoil",
				highlight: null
			}
		]
	},
	{
		event_date: "2022-03-16",
		description: "Fed raises rates 25bps for first time since 2018, beginning aggressive tightening cycle to combat 40-year high inflation.",
		confidence: "HIGH",
		tickers: ["JPM", "BAC", "WFC"],
		sources: [
			{
				url: "https://www.reuters.com/business/finance/fed-raises-rates-first-time-2018-2022-03-16/",
				title: "Fed raises rates first time since 2018 to fight inflation",
				highlight: null
			}
		]
	},
	{
		event_date: "2022-05-04",
		description: "Federal Reserve raises interest rates by 50 basis points, the largest hike since 2000, to tamp down inflation.",
		confidence: "HIGH",
		tickers: ["JPM", "BAC", "WFC"],
		sources: [
			{
				url: "https://www.reuters.com/business/finance/fed-raises-rates-half-point-largest-hike-2000-2022-05-04/",
				title: "Fed raises rates by half-point, largest hike since 2000",
				highlight: null
			}
		]
	},
	{
		event_date: "2022-06-15",
		description: "Fed delivers surprise 75bps hike — the largest since 1994 — after unexpectedly hot CPI data. Markets had priced only 50bps.",
		confidence: "HIGH",
		tickers: ["JPM", "BAC", "WFC"],
		sources: [
			{
				url: "https://www.reuters.com/business/finance/fed-raises-rates-75bps-biggest-hike-since-1994-2022-06-15/",
				title: "Fed raises rates 75bps, biggest hike since 1994",
				highlight: null
			}
		]
	},
	{
		event_date: "2022-09-21",
		description: "Fed raises rates 75bps for third consecutive meeting, reaffirming aggressive tightening stance despite recession concerns.",
		confidence: "HIGH",
		tickers: ["JPM", "BAC", "WFC"],
		sources: [
			{
				url: "https://www.reuters.com/markets/us/fed-expected-deliver-third-straight-75-basis-point-rate-hike-2022-09-21/",
				title: "Fed delivers third straight 75bp hike, sees more pain ahead",
				highlight: null
			}
		]
	},
	{
		event_date: "2023-02-01",
		description: "Fed raises rates 25bps to 4.5-4.75%, highest since 2007, signalling that more hikes are coming despite easing inflation.",
		confidence: "MEDIUM",
		tickers: ["JPM", "BAC"],
		sources: [
			{
				url: "https://www.reuters.com/markets/us/fed-raises-rates-25-basis-points-slows-pace-hikes-2023-02-01/",
				title: "Fed slows pace of hikes with 25bp increase, signals more ahead",
				highlight: null
			}
		]
	},
	{
		event_date: "2023-05-03",
		description: "Fed raises rates 25bps to 5-5.25%, signalling a potential pause to assess the impact of previous hikes on the economy.",
		confidence: "MEDIUM",
		tickers: ["JPM", "BAC"],
		sources: [
			{
				url: "https://www.reuters.com/markets/us/fed-raises-rates-quarter-point-signals-possible-pause-2023-05-03/",
				title: "Fed raises rates quarter point, signals possible pause",
				highlight: null
			}
		]
	}
]

const tradesB = [
	makeTrade(0, "2018-12-19", "JPM", "2018-12-20", 98.4, "2018-12-31", 91.2, "short"),
	makeTrade(1, "2018-12-19", "BAC", "2018-12-20", 24.8, "2018-12-31", 22.9, "short"),
	makeTrade(2, "2018-12-19", "WFC", "2018-12-20", 46.1, "2018-12-31", 44.3, "short"),
	makeTrade(3, "2022-03-16", "JPM", "2022-03-17", 141.5, "2022-03-29", 131.2, "short"),
	makeTrade(4, "2022-03-16", "BAC", "2022-03-17", 42.8, "2022-03-29", 39.4, "short"),
	makeTrade(5, "2022-03-16", "WFC", "2022-03-17", 52.3, "2022-03-29", 48.1, "short"),
	makeTrade(6, "2022-05-04", "JPM", "2022-05-05", 122.8, "2022-05-16", 112.3, "short"),
	makeTrade(7, "2022-05-04", "BAC", "2022-05-05", 34.9, "2022-05-16", 32.1, "short"),
	makeTrade(8, "2022-05-04", "WFC", "2022-05-05", 44.6, "2022-05-16", 41.2, "short"),
	makeTrade(9, "2022-06-15", "JPM", "2022-06-16", 114.2, "2022-06-27", 104.8, "short"),
	makeTrade(10, "2022-06-15", "BAC", "2022-06-16", 31.4, "2022-06-27", 28.9, "short"),
	makeTrade(11, "2022-06-15", "WFC", "2022-06-16", 41.8, "2022-06-27", 38.3, "short"),
	makeTrade(12, "2022-09-21", "JPM", "2022-09-22", 104.6, "2022-10-03", 96.1, "short"),
	makeTrade(13, "2022-09-21", "BAC", "2022-09-22", 29.7, "2022-10-03", 27.3, "short"),
	makeTrade(14, "2022-09-21", "WFC", "2022-09-22", 40.2, "2022-10-03", 38.4, "short"),
	makeTrade(15, "2023-02-01", "JPM", "2023-02-02", 143.8, "2023-02-13", 140.1, "short"),
	makeTrade(16, "2023-02-01", "BAC", "2023-02-02", 36.4, "2023-02-13", 34.8, "short"),
	makeTrade(17, "2023-05-03", "JPM", "2023-05-04", 128.9, "2023-05-15", 131.4, "short"),
	makeTrade(18, "2023-05-03", "BAC", "2023-05-04", 28.4, "2023-05-15", 30.1, "short"),
	makeTrade(19, "2023-05-03", "WFC", "2023-05-04", 38.2, "2023-05-15", 37.1, "short") // Manually added to get to right count
]

// Trim to 14 trades (7 events × avg 2 tickers)
const tradesB14 = tradesB.slice(0, 14)

const windowsB = occurrencesB.flatMap(occ =>
	occ.tickers.map(ticker => makeWindow(ticker, occ.event_date, 10, -0.065))
)

const backtestResultB = {
	trades: tradesB14,
	portfolio_series: portfolioSeries("2018-12-19", 400, 10000, 14200),
	summary: buildSummary(tradesB14, 14200, 10000)
}

// ── Report C fixture — Tesla earnings miss ─────────────────────────────────

const occurrencesC = [
	{
		event_date: "2019-10-23",
		description: "Tesla reports surprise Q3 2019 earnings beat of $1.86/share adjusted vs $0.42 expected, briefly defying expectations before returning to losses.",
		confidence: "HIGH",
		tickers: ["TSLA"],
		sources: [
			{
				url: "https://www.reuters.com/article/us-tesla-results-idUSKBN1X22GX",
				title: "Tesla posts surprise quarterly profit, shares surge",
				highlight: null
			}
		]
	},
	{
		event_date: "2021-04-26",
		description: "Tesla misses Q1 2021 revenue expectations at $10.39B vs $10.85B consensus, with profitability driven by regulatory credit sales rather than automotive margins.",
		confidence: "MEDIUM",
		tickers: ["TSLA"],
		sources: [
			{
				url: "https://www.reuters.com/business/autos-transportation/tesla-misses-revenue-estimates-reports-record-profit-first-quarter-2021-04-26/",
				title: "Tesla misses revenue estimates despite record quarterly profit",
				highlight: null
			}
		]
	},
	{
		event_date: "2022-07-20",
		description: "Tesla reports Q2 2022 earnings miss with net income of $2.27B, down 50% sequentially, as Shanghai factory shutdown and supply chain disruptions weigh on deliveries.",
		confidence: "HIGH",
		tickers: ["TSLA"],
		sources: [
			{
				url: "https://www.reuters.com/business/autos-transportation/tesla-reports-q2-earnings-2022-07-20/",
				title: "Tesla Q2 profit falls 50%, misses estimates as factory shutdowns bite",
				highlight: null
			}
		]
	},
	{
		event_date: "2023-04-19",
		description: "Tesla reports Q1 2023 earnings and margins at 11.4%, far below the 19% consensus expectation, raising concerns about its aggressive price-cutting strategy.",
		confidence: "HIGH",
		tickers: ["TSLA"],
		sources: [
			{
				url: "https://www.reuters.com/business/autos-transportation/tesla-reports-q1-results-2023-04-19/",
				title: "Tesla Q1 margins disappoint, shares fall as price war costs mount",
				highlight: null
			}
		]
	}
]

const tradesC = [
	makeTrade(0, "2019-10-23", "TSLA", "2019-10-24", 255.4, "2019-10-29", 261.2, "short"),
	makeTrade(1, "2021-04-26", "TSLA", "2021-04-27", 702.1, "2021-05-03", 672.4, "short"),
	makeTrade(2, "2022-07-20", "TSLA", "2022-07-21", 262.9, "2022-07-29", 233.1, "short"),
	makeTrade(3, "2023-04-19", "TSLA", "2023-04-20", 165.1, "2023-04-28", 154.3, "short")
]

const windowsC = occurrencesC.map(occ =>
	makeWindow("TSLA", occ.event_date, 8, -0.085)
)

const backtestResultC = {
	trades: tradesC,
	portfolio_series: portfolioSeries("2019-10-23", 400, 10000, 8800),
	summary: buildSummary(tradesC, 8800, 10000)
}

// ── Common event_spec / exa_search placeholders ────────────────────────────

const eventSpecA = {
	event_type: "chip export restriction",
	event_description: "US government announces export controls on advanced AI semiconductors to China",
	geography: "US",
	direction_hint: "long",
	date_range: { start: "2015-01-01", end: "2024-12-31" }
}
const exaSearchA = {
	primary_query: "United States announces new export restrictions on advanced semiconductor chips to China",
	additional_queries: [
		"US Commerce Department adds Chinese tech companies to entity list semiconductor",
		"Biden administration chip export controls China AI GPU restrictions",
		"US China chip war technology decoupling semiconductor policy"
	],
	date_from: "2015-01-01",
	date_to: "2024-12-31"
}
const ruleA = { entry: "next_day", exit: "impact_end", direction: "long", position_size: 10000 }

const eventSpecB = {
	event_type: "federal reserve rate hike",
	event_description: "Federal Reserve raises interest rates unexpectedly or more aggressively than expected",
	geography: "US",
	direction_hint: "short",
	date_range: { start: "2015-01-01", end: "2024-12-31" }
}
const exaSearchB = {
	primary_query: "Federal Reserve raises interest rates unexpectedly surprising markets",
	additional_queries: [
		"Fed hikes rates above expectations hawkish surprise FOMC",
		"Federal Reserve aggressive rate increases inflation fight",
		"Fed delivers larger than expected rate hike bank stocks"
	],
	date_from: "2015-01-01",
	date_to: "2024-12-31"
}
const ruleB = { entry: "next_day", exit: "impact_end", direction: "short", position_size: 10000 }

const eventSpecC = {
	event_type: "earnings miss",
	event_description: "Tesla reports quarterly earnings below analyst consensus expectations",
	geography: "US",
	direction_hint: "short",
	date_range: { start: "2015-01-01", end: "2024-12-31" }
}
const exaSearchC = {
	primary_query: "Tesla quarterly earnings miss disappoints analysts below expectations",
	additional_queries: [
		"Tesla EPS revenue miss Wall Street forecast",
		"TSLA earnings report disappoints profit margins miss",
		"Tesla quarterly results below consensus estimates shares fall"
	],
	date_from: "2015-01-01",
	date_to: "2024-12-31"
}
const ruleC = { entry: "next_day", exit: "impact_end", direction: "short", position_size: 10000 }

// ── Fixed slugs for idempotency ────────────────────────────────────────────

const SLUG_A = "chip01"
const SLUG_B = "fed001"
const SLUG_C = "tsla01"

// ── Research narratives ────────────────────────────────────────────────────

const narrativeA = `US export controls on advanced semiconductors to China have emerged as one of the most consistent macro catalysts for the US chip sector over the past six years. The core mechanism is straightforward: restrictions on shipments of high-performance GPUs and AI accelerators reduce addressable revenue for companies with significant China data-center exposure, while simultaneously signalling a tightening geopolitical environment that keeps sector volatility elevated. NVIDIA, with its dominant A100 and H100 product lines explicitly named in multiple Commerce Department orders, has historically shown the largest initial price reaction — often moving more than 10% within two weeks of an announcement.

AMD and Qualcomm have shown meaningful but more muted responses, consistent with their smaller shares of affected China revenue. Intel presents a more complex picture: as a manufacturer rather than a fabless designer, its supply-chain relationships with China are different in character, and several restriction events coincided with existing earnings headwinds that compressed the abnormal return signal. The mean reversion pattern across all four tickers suggests that markets have historically overreacted to initial headlines, with prices correcting toward fundamental valuations within two to four weeks of each event.

Seven distinct restriction announcements were identified between May 2019 and January 2024, ranging from the initial Huawei Entity List addition through the most recent H20 GPU restrictions. High-confidence events (five occurrences) were confirmed by multiple primary sources with clear effective dates; medium-confidence events (two occurrences) relied on a single source or had ambiguous implementation timelines. Only high and medium confidence events are included in this backtest. Results should be interpreted as exploratory — the sample size of seven events limits statistical significance.`

const narrativeB = `Federal Reserve rate hike surprises — where the actual increase exceeds market expectations — have historically created short-term pressure on bank stocks despite the conventional wisdom that higher rates benefit net interest margins. The mechanism is counterintuitive: when the Fed moves more aggressively than anticipated, it typically signals that inflation has become entrenched and that further restrictive policy is coming, which raises the probability of a hard landing, credit deterioration, and reduced loan demand. These recession risk factors outweigh the near-term NIM benefit in the immediate post-announcement window.

JPMorgan Chase, Bank of America, and Wells Fargo were selected as the primary instruments because they represent the largest US money-center banks with the highest sensitivity to the broader rate environment and credit cycle. Their combined weight in financial sector indices means they are the first to absorb institutional repositioning following surprise policy shifts. The abnormal return signal — measured relative to the S&P 500 — isolates the bank-specific reaction from the broader market move that typically accompanies hawkish surprises.

Seven rate surprise events were identified between December 2018 and May 2023, covering the pre-COVID tightening episode, the 2022 inflation-fighting cycle (including the three consecutive 75bps hikes), and the 2023 plateau phase. The 2022 events produced the strongest short signals, consistent with the elevated uncertainty about the terminal rate and the concurrent regional banking stress that emerged during that cycle.`

const narrativeC = `Tesla earnings misses represent a distinctive signal because the stock carries such a high valuation premium for growth expectations that any shortfall in revenue or margin guidance produces outsized downside moves. Unlike traditional automakers priced on cyclical multiples, Tesla trades on a combination of vehicle delivery growth, software monetization optionality, and energy business potential — making it acutely sensitive to any data point that calls those narratives into question.

All four events identified in this backtest involve either revenue misses, dramatic margin compression, or guidance that fell below the analyst consensus. The Q2 2022 event — where net income fell 50% sequentially due to the Shanghai factory shutdown — produced the largest absolute move. The Q1 2023 earnings call was notable for management confirming that the aggressive price cuts introduced earlier that year were compressing gross margins to levels not seen since the early production scaling phase of the Model 3.

The sample of four events across the 2019–2023 period is small, and the directional results are mixed: the Q4 2019 report produced a modest loss for a short position as the stock briefly rallied on a surprise beat before reversing. This backtest should be treated as exploratory only — with four events, no statistically meaningful conclusions can be drawn about the persistence of this pattern.`

// ── Seed execution ─────────────────────────────────────────────────────────

console.log("Seeding dev database...")

// 1. Test user
const passwordHash = await Bun.password.hash("password123", { algorithm: "argon2id" })

await db`
	INSERT INTO users (email, password_hash, name, credits, email_verified)
	VALUES ('dev@newstraderai.test', ${passwordHash}, 'Dev User', 10, true)
	ON CONFLICT (email) DO NOTHING
`
const [user] = await db`SELECT id FROM users WHERE email = 'dev@newstraderai.test'`
const userId = user.id as string

// 2. Three backtest reports (fixed slugs ensure idempotency)
await db`
	INSERT INTO backtest_reports (
		slug, user_id, query, event_spec, exa_search, rule,
		confirmed_tickers, occurrences, impact_windows, backtest_result,
		research_narrative, status
	) VALUES (
		${SLUG_A}, ${userId},
		${'Buy Nvidia every time the US announces AI chip restrictions on China'},
		${db.json(eventSpecA)}, ${db.json(exaSearchA)}, ${db.json(ruleA)},
		${ ["NVDA", "AMD", "INTC", "QCOM"] },
		${db.json(occurrencesA)}, ${db.json(windowsA)}, ${db.json(backtestResultA)},
		${narrativeA}, 'complete'
	)
	ON CONFLICT (slug) DO NOTHING
`

await db`
	INSERT INTO backtest_reports (
		slug, user_id, query, event_spec, exa_search, rule,
		confirmed_tickers, occurrences, impact_windows, backtest_result,
		research_narrative, status
	) VALUES (
		${SLUG_B}, ${userId},
		${'Short bank stocks every time the Fed raises rates unexpectedly'},
		${db.json(eventSpecB)}, ${db.json(exaSearchB)}, ${db.json(ruleB)},
		${ ["JPM", "BAC", "WFC"] },
		${db.json(occurrencesB)}, ${db.json(windowsB)}, ${db.json(backtestResultB)},
		${narrativeB}, 'complete'
	)
	ON CONFLICT (slug) DO NOTHING
`

await db`
	INSERT INTO backtest_reports (
		slug, user_id, query, event_spec, exa_search, rule,
		confirmed_tickers, occurrences, impact_windows, backtest_result,
		research_narrative, status
	) VALUES (
		${SLUG_C}, ${userId},
		${'Buy Tesla puts after an earnings miss'},
		${db.json(eventSpecC)}, ${db.json(exaSearchC)}, ${db.json(ruleC)},
		${ ["TSLA"] },
		${db.json(occurrencesC)}, ${db.json(windowsC)}, ${db.json(backtestResultC)},
		${narrativeC}, 'complete'
	)
	ON CONFLICT (slug) DO NOTHING
`

// 3. Email capture for Report A (idempotent via count check)
const [reportA] = await db`SELECT id FROM backtest_reports WHERE slug = ${SLUG_A}`
const existingCaptures = await db`
	SELECT COUNT(*)::int AS n FROM email_captures
	WHERE email = 'viewer@example.com' AND report_id = ${reportA.id as string}
`
if ((existingCaptures[0].n as number) === 0) {
	await db`
		INSERT INTO email_captures (email, report_id)
		VALUES ('viewer@example.com', ${reportA.id as string})
	`
}

// 4. Credit transactions (idempotent: skip if any exist for this user)
const existingTx = await db`
	SELECT COUNT(*)::int AS n FROM credit_transactions WHERE user_id = ${userId}
`
if ((existingTx[0].n as number) === 0) {
	const [rA] = await db`SELECT id FROM backtest_reports WHERE slug = ${SLUG_A}`
	const [rB] = await db`SELECT id FROM backtest_reports WHERE slug = ${SLUG_B}`
	const [rC] = await db`SELECT id FROM backtest_reports WHERE slug = ${SLUG_C}`

	await db`
		INSERT INTO credit_transactions (user_id, amount, reason)
		VALUES (${userId}, 3, 'signup_bonus')
	`
	await db`
		INSERT INTO credit_transactions (user_id, amount, reason, backtest_id)
		VALUES (${userId}, -1, 'backtest_run', ${rA.id as string})
	`
	await db`
		INSERT INTO credit_transactions (user_id, amount, reason, backtest_id)
		VALUES (${userId}, -1, 'backtest_run', ${rB.id as string})
	`
	await db`
		INSERT INTO credit_transactions (user_id, amount, reason, backtest_id)
		VALUES (${userId}, -1, 'backtest_run', ${rC.id as string})
	`
}

console.log("✓ Seeded: 1 user, 3 reports, 1 email capture, 4 credit transactions")
console.log("  Dev login: dev@newstraderai.test / password123")
console.log(`  Report slugs: ${SLUG_A}, ${SLUG_B}, ${SLUG_C}`)

await db.end()
