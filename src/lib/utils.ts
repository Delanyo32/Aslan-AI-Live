// Small shared helpers used by both server and UI code.

/** Hostname of a URL without a leading "www.", or null if unparseable. */
export function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.replace(/^www\./, "")
	} catch {
		return null
	}
}

/** Format an ISO date string for display; returns the input on parse failure. */
export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }): string {
	const d = new Date(iso)
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", opts)
}
