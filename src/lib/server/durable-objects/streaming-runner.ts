// Shared engine for the alarm-driven runner DOs (PipelineRunner,
// TerminalReportRunner) — extracted from their verbatim-copied skeletons:
// append-only `evt:` event log with buffer cap, SSE + WebSocket fan-out with
// Last-Event-ID replay, /status + /cancel handlers, abort semantics, run-row
// write-through, and the stall watchdog. Subclasses keep their own stage
// machine, /start payload, and D1 run-index table.

import type {
	DurableObjectState,
	DurableObjectStorage,
	D1Database,
	WebSocket as CFWebSocket
} from "@cloudflare/workers-types"
import { createDb } from "$lib/server/db/client"
import { logger } from "$lib/server/logger"

// Cloudflare runtime global not present in lib.dom. Declared here so TypeScript
// accepts `new WebSocketPair()` and the `.accept()` / `.send()` members used by
// the WebSocket handler.
declare const WebSocketPair: { new (): { 0: CFWebSocket; 1: CFWebSocket } }

export type Env = {
	DB: D1Database
	[key: string]: unknown
}

export type StoredEvent = {
	id: number
	type: string
	payload: unknown
	at: number
}

const EVENT_KEY_PREFIX = "evt:"
const EVENT_KEY_WIDTH = 10
const EVENT_BUFFER_MAX = 500
const STALL_WATCHDOG_MS = 30 * 60 * 1000

function eventKey(id: number): string {
	return `${EVENT_KEY_PREFIX}${String(id).padStart(EVENT_KEY_WIDTH, "0")}`
}

// ISO string → Date, null on missing/unparseable. Shared by the runner DOs and
// CompanyMonitor.
export function toDateOrNull(iso: string | null): Date | null {
	if (!iso) return null
	const d = new Date(iso)
	return Number.isNaN(d.getTime()) ? null : d
}

// Fail the run with a stable error code attributed to a stage.
export class RunnerAbort extends Error {
	constructor(
		public readonly code: string,
		public readonly stage: string
	) {
		super(code)
		this.name = "RunnerAbort"
	}
}

type SseSub = { controller: ReadableStreamDefaultController<Uint8Array>; encoder: TextEncoder }

export abstract class StreamingRunner {
	protected readonly env: Env
	protected readonly storage: DurableObjectStorage
	protected readonly db: ReturnType<typeof createDb>

	// Prefix for the shared plumbing's log tags ("pipeline" | "terminal").
	protected abstract readonly tag: string

	// Live subscribers — SSE controllers + WebSockets. Cleared on DO eviction;
	// clients reconnect via Last-Event-ID.
	private readonly sseSubs = new Set<SseSub>()
	private readonly wsSubs = new Set<CFWebSocket>()

	constructor(state: DurableObjectState, env: Env) {
		this.env = env
		this.storage = state.storage
		this.db = createDb(env.DB)
	}

	// Each runner mirrors run state into its own D1 index table; the shared
	// /cancel and markFailed paths write through this.
	protected abstract updateRunRow(
		patch: Partial<{ status: string; stage: string; error: string | null; result_slug: string | null }>
	): Promise<void>

	// ── /stream (SSE + WS upgrade + Last-Event-ID replay) ─────────────────────

	protected async handleStream(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade")?.toLowerCase()
		if (upgradeHeader === "websocket") return this.handleStreamWebSocket(request)

		const lastEventId = this.parseLastEventId(request.headers.get("Last-Event-ID"))
		const encoder = new TextEncoder()
		let sub: SseSub | null = null

		const self = this
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				sub = { controller, encoder }
				self.sseSubs.add(sub)

				// Replay buffered events strictly newer than Last-Event-ID.
				const buffered = await self.loadEventsSince(lastEventId)
				for (const evt of buffered) {
					try {
						controller.enqueue(encoder.encode(self.formatSSE(evt)))
					} catch {
						/* client closed */
					}
				}

				// If the run is already terminal, close the stream after replay.
				const stage = await self.storage.get<string>("stage")
				if (stage === "complete" || stage === "failed" || stage === "cancelled") {
					try {
						controller.close()
					} catch {
						/* already closed */
					}
					if (sub) self.sseSubs.delete(sub)
				}
			},
			cancel() {
				if (sub) self.sseSubs.delete(sub)
			}
		})

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no"
			}
		})
	}

	private handleStreamWebSocket(request: Request): Response {
		const pair = new WebSocketPair()
		const clientSocket = pair[0]
		const serverSocket = pair[1]

		serverSocket.accept()
		this.wsSubs.add(serverSocket)

		const lastEventId = this.parseLastEventId(new URL(request.url).searchParams.get("last_event_id"))

		// Fire-and-forget replay.
		this.loadEventsSince(lastEventId)
			.then((events) => {
				for (const evt of events) {
					try {
						serverSocket.send(JSON.stringify(evt))
					} catch {
						/* closed */
					}
				}
			})
			.catch((err) => {
				logger.warn(`${this.tag}_ws_replay_failed`, { error: logger.serializeError(err) })
			})

		serverSocket.addEventListener("close", () => {
			this.wsSubs.delete(serverSocket)
		})
		serverSocket.addEventListener("error", () => {
			this.wsSubs.delete(serverSocket)
		})

		// CF Workers Response supports the non-standard webSocket init field.
		return new Response(null, { status: 101, webSocket: clientSocket } as ResponseInit & {
			webSocket: CFWebSocket
		})
	}

	private parseLastEventId(raw: string | null): number {
		if (!raw) return 0
		const n = Number(raw)
		return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
	}

	// ── /status ────────────────────────────────────────────────────────────────

	protected async handleStatus(): Promise<Response> {
		const [stage, nextId, createdAt, updatedAt, error, slug, userId] = await Promise.all([
			this.storage.get<string>("stage"),
			this.storage.get<number>("next_event_id"),
			this.storage.get<number>("created_at"),
			this.storage.get<number>("updated_at"),
			this.storage.get<string>("error"),
			this.storage.get<string>("report_slug"),
			this.storage.get<string>("user_id")
		])

		return new Response(
			JSON.stringify({
				stage: stage ?? null,
				event_count: (nextId ?? 1) - 1,
				created_at: createdAt ?? null,
				updated_at: updatedAt ?? null,
				error: error ?? null,
				result_slug: slug ?? null,
				user_id: userId ?? null
			}),
			{ headers: { "Content-Type": "application/json" } }
		)
	}

	// ── /cancel ────────────────────────────────────────────────────────────────

	protected async handleCancel(): Promise<Response> {
		const stage = await this.storage.get<string>("stage")
		if (stage === "complete" || stage === "failed" || stage === "cancelled") {
			return new Response(JSON.stringify({ ok: true, stage }), {
				headers: { "Content-Type": "application/json" }
			})
		}
		await this.storage.deleteAlarm()
		await this.storage.put({ stage: "cancelled", updated_at: Date.now() })
		await this.updateRunRow({ status: "cancelled", stage: "cancelled" })
		await this.emit("error", { type: "error", message: "cancelled", stage: stage ?? "unknown" })
		this.closeAllSubscribers()
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" }
		})
	}

	// ── Event plumbing ─────────────────────────────────────────────────────────

	protected async emit(type: string, payload: unknown): Promise<void> {
		const id = (await this.storage.get<number>("next_event_id")) ?? 1
		const evt: StoredEvent = { id, type, payload, at: Date.now() }

		await this.storage.put({ [eventKey(id)]: evt, next_event_id: id + 1 })
		await this.trimEventBuffer(id)

		const frame = this.formatSSE(evt)
		const wire = JSON.stringify(evt)
		for (const sub of this.sseSubs) {
			try {
				sub.controller.enqueue(sub.encoder.encode(frame))
			} catch {
				/* closed */
			}
		}
		for (const ws of this.wsSubs) {
			try {
				ws.send(wire)
			} catch {
				/* closed */
			}
		}
	}

	protected async log(message: string): Promise<void> {
		await this.emit("log", { type: "log", timestamp: new Date().toISOString(), message })
	}

	private async trimEventBuffer(latestId: number): Promise<void> {
		if (latestId <= EVENT_BUFFER_MAX) return
		await this.storage.delete(eventKey(latestId - EVENT_BUFFER_MAX))
	}

	private async loadEventsSince(afterId: number): Promise<StoredEvent[]> {
		const map = await this.storage.list<StoredEvent>({
			prefix: EVENT_KEY_PREFIX,
			start: eventKey(afterId + 1),
			limit: EVENT_BUFFER_MAX
		})
		return Array.from(map.values()).sort((a, b) => a.id - b.id)
	}

	private formatSSE(evt: StoredEvent): string {
		return `id: ${evt.id}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt.payload)}\n\n`
	}

	protected closeAllSubscribers(): void {
		for (const sub of this.sseSubs) {
			try {
				sub.controller.close()
			} catch {
				/* already closed */
			}
		}
		this.sseSubs.clear()
		for (const ws of this.wsSubs) {
			try {
				ws.close(1000, "complete")
			} catch {
				/* already closed */
			}
		}
		this.wsSubs.clear()
	}

	// ── Failure + stall watchdog ───────────────────────────────────────────────

	protected async markFailed(stage: string, error: unknown): Promise<void> {
		const isAbort = error instanceof RunnerAbort
		const message = isAbort ? error.code : error instanceof Error ? error.message : "internal_error"
		const failStage = isAbort ? error.stage : stage

		logger.error(`${this.tag}_run_failed`, {
			stage: failStage,
			error: logger.serializeError(error)
		})

		await this.storage.put({ stage: "failed", error: message, updated_at: Date.now() })
		await this.updateRunRow({ status: "failed", stage: "failed", error: message })
		await this.emit("error", { type: "error", message, stage: failStage })
		this.closeAllSubscribers()
	}

	// Alarm tail: an idle non-terminal stage past the stall window fails the run.
	// `exemptStage` is for a stage that legitimately waits on external input
	// (PipelineRunner's "impact_done" awaits /rule).
	protected async runWatchdog(exemptStage?: string): Promise<void> {
		const now = Date.now()
		const updatedAt = (await this.storage.get<number>("updated_at")) ?? now
		const stage = await this.storage.get<string>("stage")
		if (
			stage &&
			stage !== "complete" &&
			stage !== "failed" &&
			stage !== "cancelled" &&
			stage !== exemptStage &&
			now - updatedAt > STALL_WATCHDOG_MS
		) {
			await this.markFailed(stage, new Error("stage_stalled"))
		}
	}
}
