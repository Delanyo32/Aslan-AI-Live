// Shared EventSource wiring + liveness watchdog for SSE progress streams
// (ProcessingLog, TerminalProgress). The browser auto-reconnects EventSource
// with Last-Event-ID, so a transport error is only fatal if no event arrives
// within the grace window while the socket keeps failing.

export interface SubscribeSSEOptions {
	/** Named event handlers. Receiving any of these (except "error") proves
	 *  liveness and cancels a pending fatal timer before the handler runs.
	 *  "error" fires for both server-sent error events (MessageEvent with a
	 *  JSON payload — terminal, handler should tear down) and transport-level
	 *  errors (no payload — leave those to the watchdog). */
	on: Record<string, (e: MessageEvent) => void>
	/** Max time a transport-level error may go unresolved before onfatal. */
	graceMs: number
	/** Watchdog expiry. The stream is closed before this is called. */
	onfatal: () => void
	/** Also cancel a pending fatal timer on a successful (re)connect. */
	cancelGraceOnOpen?: boolean
}

/** Opens an EventSource and returns an idempotent teardown function. */
export function subscribeSSE(url: string, opts: SubscribeSSEOptions): () => void {
	const es = new EventSource(url)
	let closed = false
	let fatalTimer: ReturnType<typeof setTimeout> | null = null

	function cancelFatalTimer() {
		if (fatalTimer) { clearTimeout(fatalTimer); fatalTimer = null }
	}

	function teardown() {
		closed = true
		cancelFatalTimer()
		es.close()
	}

	for (const [name, handler] of Object.entries(opts.on)) {
		es.addEventListener(name, (e) => {
			if (name !== "error") cancelFatalTimer()
			handler(e as MessageEvent)
		})
	}

	if (opts.cancelGraceOnOpen) es.onopen = cancelFatalTimer

	es.onerror = () => {
		if (closed) return
		// Server explicitly closed the stream (e.g. after the final event) —
		// not fatal on its own.
		if (es.readyState === EventSource.CLOSED) return
		cancelFatalTimer()
		fatalTimer = setTimeout(() => {
			if (closed) return
			teardown()
			opts.onfatal()
		}, opts.graceMs)
	}

	return teardown
}
