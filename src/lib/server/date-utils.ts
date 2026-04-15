/**
 * Adds a number of calendar days to an ISO date string (YYYY-MM-DD).
 * Uses UTC arithmetic to avoid timezone drift.
 */
export function addCalendarDays(isoDate: string, days: number): string {
	const d = new Date(isoDate)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}
