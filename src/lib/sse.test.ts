import { describe, expect, test } from "bun:test"
import { subscribeSSE } from "./sse"

// Minimal EventSource stub — just enough surface for subscribeSSE.
class FakeEventSource {
	static CLOSED = 2
	static instances: FakeEventSource[] = []
	readyState = 1
	onopen: (() => void) | null = null
	onerror: (() => void) | null = null
	listeners: Record<string, ((e: Event) => void)[]> = {}
	constructor(public url: string) {
		FakeEventSource.instances.push(this)
	}
	addEventListener(name: string, fn: (e: Event) => void) {
		;(this.listeners[name] ??= []).push(fn)
	}
	emit(name: string, data?: string) {
		const e = data !== undefined ? new MessageEvent(name, { data }) : new Event(name)
		for (const fn of this.listeners[name] ?? []) fn(e)
	}
	close() {
		this.readyState = FakeEventSource.CLOSED
	}
}
;(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource

const last = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("subscribeSSE", () => {
	test("dispatches named events and events cancel a pending fatal timer", async () => {
		const got: string[] = []
		let fatal = false
		subscribeSSE("u", {
			graceMs: 20,
			onfatal: () => (fatal = true),
			on: { log: (e) => got.push(e.data) }
		})
		const es = last()
		es.onerror!() // arm watchdog
		es.emit("log", "hello") // liveness — cancels it
		await sleep(35)
		expect(got).toEqual(["hello"])
		expect(fatal).toBe(false)
	})

	test("unresolved transport error goes fatal and closes the source", async () => {
		let fatal = false
		subscribeSSE("u", { graceMs: 10, onfatal: () => (fatal = true), on: {} })
		const es = last()
		es.onerror!()
		await sleep(25)
		expect(fatal).toBe(true)
		expect(es.readyState).toBe(FakeEventSource.CLOSED)
	})

	test("server-closed stream (readyState CLOSED) is not fatal; teardown prevents fatal", async () => {
		let fatal = false
		subscribeSSE("u", { graceMs: 10, onfatal: () => (fatal = true), on: {} })
		const closedEs = last()
		closedEs.readyState = FakeEventSource.CLOSED
		closedEs.onerror!()

		let fatal2 = false
		const teardown = subscribeSSE("u", { graceMs: 10, onfatal: () => (fatal2 = true), on: {} })
		last().onerror!()
		teardown()
		await sleep(25)
		expect(fatal).toBe(false)
		expect(fatal2).toBe(false)
	})

	test("error events do not count as liveness; open does when opted in", async () => {
		let fatal = false
		subscribeSSE("u", {
			graceMs: 20,
			cancelGraceOnOpen: true,
			onfatal: () => (fatal = true),
			on: { error: () => {} }
		})
		const es = last()
		es.onerror!()
		es.emit("error") // named listener runs but must not cancel the watchdog
		es.onopen!() // successful reconnect cancels it
		await sleep(35)
		expect(fatal).toBe(false)
	})
})
