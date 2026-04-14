import type { OHLCVBar, ImpactWindow } from "$lib/types/pipeline"

// --- computeCAR ---
// Inner-joins two OHLCV series on date, computes daily abnormal return
// (ticker return minus benchmark return), and returns the running cumulative
// abnormal return (CAR) for every aligned trading day.
// The first bar in each series serves as the prior-day base — no CAR entry
// is emitted for it. The caller filters the result to event_date forward.

export function computeCAR(
	tickerBars: OHLCVBar[],
	benchmarkBars: OHLCVBar[]
): { date: string; car: number }[] {
	const tickerMap = new Map(tickerBars.map(b => [b.date, b]))
	const benchmarkMap = new Map(benchmarkBars.map(b => [b.date, b]))

	// Dates present in both series, sorted ascending
	const alignedDates = [...tickerMap.keys()]
		.filter(d => benchmarkMap.has(d))
		.sort()

	if (alignedDates.length < 2) return []

	const result: { date: string; car: number }[] = []
	let car = 0

	for (let i = 1; i < alignedDates.length; i++) {
		const date = alignedDates[i]
		const prevDate = alignedDates[i - 1]

		const ticker = tickerMap.get(date)!
		const tickerPrev = tickerMap.get(prevDate)!
		const bench = benchmarkMap.get(date)!
		const benchPrev = benchmarkMap.get(prevDate)!

		const tickerReturn = ticker.close / tickerPrev.close - 1
		const benchReturn = bench.close / benchPrev.close - 1
		car += tickerReturn - benchReturn

		result.push({ date, car })
	}

	return result
}

// --- detectImpactWindowEnd ---
// Scans the CAR series from event_date forward (capped at 30 trading days)
// and returns the day the event's price effect ended, using whichever signal
// fires first:
//   1. Full mean reversion: CAR crosses back through zero
//   2. Significant decay:   CAR falls below 20% of its peak absolute value
//   3. Max cap:             30 trading days reached

export function detectImpactWindowEnd(
	carSeries: { date: string; car: number }[],
	eventDate: string
): { end_date: string; reason: "car_decay" | "max_cap" } {
	// Only days from event_date forward, hard-capped at 30 trading days
	const series = carSeries.filter(c => c.date >= eventDate).slice(0, 30)

	if (series.length === 0) {
		return { end_date: eventDate, reason: "max_cap" }
	}

	let peakAbsCar = 0
	let prevCar = 0

	for (let i = 0; i < series.length; i++) {
		const { date, car } = series[i]
		const absCar = Math.abs(car)

		if (absCar > peakAbsCar) {
			peakAbsCar = absCar
		}

		// Only check decay conditions once we have a meaningful peak and a prior day
		if (peakAbsCar > 0.001 && i > 0) {
			// Full mean reversion: CAR sign flipped (crossed zero)
			if ((prevCar > 0 && car <= 0) || (prevCar < 0 && car >= 0)) {
				return { end_date: date, reason: "car_decay" }
			}
			// Significant decay: current abs < 20% of peak abs
			if (absCar < peakAbsCar * 0.2) {
				return { end_date: date, reason: "car_decay" }
			}
		}

		prevCar = car
	}

	return { end_date: series[series.length - 1].date, reason: "max_cap" }
}

// --- calculateImpactWindow ---
// Orchestrates CAR computation and window detection for a single (ticker, event)
// pair. Both OHLCV arrays span the full fetch range (5 days pre-event through
// event + 35 days), so slicing is done here before calling computeCAR.

export function calculateImpactWindow(
	ticker: string,
	eventDate: string,
	ohlcv: OHLCVBar[],
	spyOHLCV: OHLCVBar[]
): ImpactWindow {
	const DEGENERATE: ImpactWindow = {
		ticker,
		event_date: eventDate,
		impact_start: eventDate,
		impact_end: eventDate,
		impact_duration_days: 0,
		peak_car: 0,
		peak_car_date: eventDate,
		final_car: 0,
		override_event: null,
		ohlcv: []
	}

	// Find first bar on or after event_date in each series
	const tickerEventIdx = ohlcv.findIndex(b => b.date >= eventDate)
	const spyEventIdx = spyOHLCV.findIndex(b => b.date >= eventDate)

	if (tickerEventIdx === -1 || spyEventIdx === -1) return DEGENERATE

	// Include one bar before event_date so computeCAR can compute the day-0 return
	const tickerSlice = ohlcv.slice(Math.max(0, tickerEventIdx - 1))
	const spySlice = spyOHLCV.slice(Math.max(0, spyEventIdx - 1))

	// Compute full CAR series, then keep only days >= event_date
	const carSeries = computeCAR(tickerSlice, spySlice).filter(c => c.date >= eventDate)

	if (carSeries.length === 0) return DEGENERATE

	// Find peak CAR (by absolute value)
	let peakCar = 0
	let peakCarDate = carSeries[0].date
	for (const { date, car } of carSeries) {
		if (Math.abs(car) > Math.abs(peakCar)) {
			peakCar = car
			peakCarDate = date
		}
	}

	const { end_date: impact_end } = detectImpactWindowEnd(carSeries, eventDate)

	// Count trading days inside the window
	const windowBars = ohlcv.filter(b => b.date >= eventDate && b.date <= impact_end)
	const impact_duration_days = windowBars.length

	// final_car: CAR on the last day of the window
	const finalEntry =
		carSeries.find(c => c.date === impact_end) ?? carSeries[carSeries.length - 1]

	// OHLCV for charting: 5 pre-event trading days + all bars through impact_end
	const chartStart = ohlcv[Math.max(0, tickerEventIdx - 5)]?.date ?? eventDate
	const chartBars = ohlcv.filter(b => b.date >= chartStart && b.date <= impact_end)

	return {
		ticker,
		event_date: eventDate,
		impact_start: eventDate,
		impact_end,
		impact_duration_days,
		peak_car: peakCar,
		peak_car_date: peakCarDate,
		final_car: finalEntry.car,
		override_event: null,
		ohlcv: chartBars
	}
}
