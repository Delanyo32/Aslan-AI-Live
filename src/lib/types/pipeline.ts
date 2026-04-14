import { Type, type Static } from "@mariozechner/pi-ai"

export const EventSpecSchema = Type.Object({
	event_type: Type.String({ description: "Short label e.g. chip export restriction" }),
	event_description: Type.String({ description: "1-2 sentences describing the event" }),
	geography: Type.String({ description: "US, global, or other" }),
	direction_hint: Type.String({
		description: "Expected price direction: long, short, neutral, or unknown"
	}),
	date_range: Type.Object({
		start: Type.String({ description: "ISO date. Default 2015-01-01 if not specified" }),
		end: Type.String({ description: "ISO date. Default today if not specified" })
	})
})

export const ExaSearchSchema = Type.Object({
	primary_query: Type.String({
		description:
			"One complete descriptive sentence for Exa neural search. " +
			"Write it as a journalist would write a headline. NOT keywords."
	}),
	additional_queries: Type.Array(Type.String(), {
		minItems: 3,
		maxItems: 4,
		description:
			"3-4 alternative phrasings covering different eras, angles, " +
			"and journalist vocabulary for the same event type."
	}),
	date_from: Type.String({ description: "Mirrors event_spec.date_range.start" }),
	date_to: Type.String({ description: "Mirrors event_spec.date_range.end" })
})

export const ClarifyingQuestionSchema = Type.Object({
	question: Type.String({ description: "The clarifying question to ask the user" }),
	options: Type.Array(Type.String(), {
		minItems: 2,
		maxItems: 4,
		description: "2-4 short answer choices the user can pick from"
	})
})

export const UnderstandResponseSchema = Type.Object({
	event_spec: EventSpecSchema,
	exa_search: ExaSearchSchema,
	ambiguity: Type.String({
		description: "Ambiguity level of the query: LOW, MEDIUM, or HIGH"
	}),
	clarifying_questions: Type.Array(ClarifyingQuestionSchema, {
		maxItems: 2,
		description:
			"0-2 items only when ambiguity is HIGH. Each must have a question and 2-4 short options. " +
			"NEVER include entry/exit timing, direction, or position size -- " +
			"those are always shown separately in the UI."
	})
})

// Inferred TypeScript types from schemas -- use these everywhere
export type EventSpec = Static<typeof EventSpecSchema>
export type ExaSearch = Static<typeof ExaSearchSchema>
export type ClarifyingQuestion = Static<typeof ClarifyingQuestionSchema>
export type UnderstandResponse = Static<typeof UnderstandResponseSchema>

// Ticker confirmed by the user with a per-ticker trade direction
export type ConfirmedTickerWithDirection = {
	symbol: string
	name: string
	direction: 'long' | 'short'
}

// --- Event detection types (plain TypeScript, not pi-ai schemas) ---

export type RawExaEvent = {
	event_date: string
	description: string
	tickers_mentioned: string[]
	confidence: "HIGH" | "MEDIUM" | "LOW"
	sources: { url: string; title: string; highlight: string | null }[]
}

export type RankedTicker = {
	symbol: string
	name?: string // company name, populated server-side from Alpaca assets API
	event_count: number // how many events mention this ticker
	total_events: number // total events in the result set
}

export type EventOccurrence = {
	event_date: string
	description: string
	confidence: "HIGH" | "MEDIUM" | "LOW"
	tickers: string[]
	sources: { url: string; title: string; highlight: string | null }[]
}

export type OHLCVBar = {
	date: string
	open: number
	high: number
	low: number
	close: number
	volume: number
}

export type ImpactWindow = {
	ticker: string
	event_date: string
	impact_start: string
	impact_end: string
	impact_duration_days: number
	peak_car: number // decimal e.g. 0.145 = +14.5%
	peak_car_date: string
	final_car: number
	override_event: null // always null in V1
	ohlcv: OHLCVBar[] // bars covering 5 pre-event days through impact_end
}

// --- Trade simulation types ---

export type EntryExitRule = {
	entry: "event_day" | "next_day" | "two_days_after"
	exit: "peak_car_date" | "impact_end" | "fixed_5_days"
	direction: "long" | "short"        // legacy fallback; new reports use directions_map
	position_size: number              // notional USD per trade e.g. 10000
	directions_map?: Record<string, "long" | "short"> // per-ticker direction (new reports)
}

export type SimulatedTrade = {
	trade_index: number
	event_date: string
	ticker: string
	direction: "long" | "short"
	entry_date: string
	entry_price: number
	exit_date: string
	exit_price: number
	hold_days: number
	impact_window_end: string
	override_event: null
	pnl_dollars: number
	pnl_pct: number
	abnormal_return_vs_benchmark: number
	notional: number
}

export type BacktestResult = {
	trades: SimulatedTrade[]
	portfolio_series: { date: string; value: number }[]
	summary: {
		total_return_pct: number
		total_return_dollars: number
		win_rate: number
		max_drawdown: number
		avg_hold_days: number
		best_trade: SimulatedTrade
		worst_trade: SimulatedTrade
		final_portfolio_value: number
		starting_capital: number
		trade_count: number
		event_count: number
		ticker_count: number
	}
}

// ── Database row type ────────────────────────────────────────────────────────
// Returned from +page.server.ts load — dates are serialised to strings by
// SvelteKit's devalue layer, so created_at / updated_at arrive as strings.

export type BacktestReportRow = {
	id: string
	slug: string
	user_id: string | null
	email: string | null
	query: string
	event_spec: EventSpec
	exa_search: ExaSearch
	rule: EntryExitRule
	confirmed_tickers: string[]
	occurrences: EventOccurrence[]
	impact_windows: ImpactWindow[]
	backtest_result: BacktestResult
	low_confidence_events: RawExaEvent[]
	research_narrative: string | null
	status: string
	is_public: boolean
	view_count: number
	created_at: string | Date
	updated_at: string | Date
}
