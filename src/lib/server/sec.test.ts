// Pins the two filters the archive's correctness rests on: which forms we keep,
// and which files inside a filing we keep. Fixtures are real listings captured
// from EDGAR on 2026-08-14.

import { afterEach, describe, expect, it } from "bun:test"
import {
	isCoreForm, pickDocuments, toFilingMetas, accessionPath, contentTypeFor,
	isIsoDate, filedOnOrAfter, DEFAULT_SINCE, pool, makeSecFetch,
} from "./sec"

describe("isCoreForm", () => {
	it("keeps reports and their amendments", () => {
		for (const f of ["10-K", "10-Q", "8-K", "8-K/A", "DEF 14A", "20-F", "40-F"]) {
			expect(isCoreForm(f)).toBe(true)
		}
	})
	it("keeps 6-K, which is where foreign issuers put everything", () => {
		// TSMC: 7 core filings since 2020 without this, 361 with it.
		expect(isCoreForm("6-K")).toBe(true)
		expect(isCoreForm("6-K/A")).toBe(true)
	})
	it("drops insider and holder noise", () => {
		// 587 of Apple's newest 1000 filings are Form 4 — this is the filter earning its keep.
		for (const f of ["4", "3", "5", "144", "SC 13G", "S-8", "424B2", "FWP"]) {
			expect(isCoreForm(f)).toBe(false)
		}
	})
})

describe("pickDocuments", () => {
	const ACC = "0000320193-26-000018"

	it("keeps the main doc and the EX-99.1 earnings release, drops viewer and XBRL files", () => {
		// Real listing of Apple's 2026-07-30 8-K.
		const names = [
			`${ACC}-index-headers.html`, `${ACC}-index.html`, `${ACC}.txt`, `${ACC}-xbrl.zip`,
			"a8-kex991q3202606272026.htm", "aapl-20260730.htm",
			"aapl-20260730.xsd", "aapl-20260730_def.xml", "aapl-20260730_g1.jpg",
			"aapl-20260730_htm.xml", "aapl-20260730_lab.xml", "aapl-20260730_pre.xml",
			"FilingSummary.xml", "MetaLinks.json", "R1.htm", "report.css", "Show.js",
		]
		expect(pickDocuments(names, ACC).sort())
			.toEqual(["a8-kex991q3202606272026.htm", "aapl-20260730.htm"])
	})

	it("falls back to the full .txt when the listing has blank names", () => {
		// Real listing of Apple's 1994-01-26 10-Q: document entries carry a size
		// but no filename, so only the full submission is retrievable.
		const old = "0000320193-94-000002"
		const names = [`${old}-index-headers.html`, `${old}-index.html`, `${old}.txt`, "", ""]
		expect(pickDocuments(names, old)).toEqual([`${old}.txt`])
	})
})

describe("date floor", () => {
	it("defaults to 2020-01-01", () => {
		expect(DEFAULT_SINCE).toBe("2020-01-01")
	})

	it("accepts real ISO dates and rejects typos", () => {
		for (const s of ["2020-01-01", "1994-01-26", "2026-12-31"]) expect(isIsoDate(s)).toBe(true)
		// "2021-02-30" is the one that matters: it passes a regex but is not a day.
		for (const s of ["", "2020", "2020-1-1", "01/01/2020", "2021-02-30", "2020-13-01", "yesterday"]) {
			expect(isIsoDate(s)).toBe(false)
		}
	})

	it("includes the boundary day and drops blank dates", () => {
		expect(filedOnOrAfter("2020-01-01", "2020-01-01")).toBe(true)
		expect(filedOnOrAfter("2020-01-02", "2020-01-01")).toBe(true)
		expect(filedOnOrAfter("2019-12-31", "2020-01-01")).toBe(false)
		// Some pre-2001 rows carry no date — they must never slip past the floor.
		expect(filedOnOrAfter("", "2020-01-01")).toBe(false)
	})
})

describe("toFilingMetas", () => {
	const cols = {
		accessionNumber: ["0000320193-26-032884", "0000320193-26-000020", "0000320193-94-000002"],
		form:            ["4", "10-Q", "10-Q"],
		filingDate:      ["2026-08-13", "2026-07-31", "1994-01-26"],
		reportDate:      ["2026-08-11", "2026-06-27", ""],
		primaryDocument: ["xslF345X06/form4.xml", "aapl-20260627.htm", ""],
	}

	it("reads SEC's parallel-array shape, dropping non-core forms and pre-since filings", () => {
		expect(toFilingMetas(cols, DEFAULT_SINCE)).toEqual([{
			accession: "0000320193-26-000020", form: "10-Q",
			filingDate: "2026-07-31", reportDate: "2026-06-27", primaryDoc: "aapl-20260627.htm",
		}])
	})

	it("reaches the 1994 filing when since is moved back", () => {
		expect(toFilingMetas(cols, "1990-01-01").map((f) => f.filingDate))
			.toEqual(["2026-07-31", "1994-01-26"])
	})
})

describe("pool", () => {
	it("processes every item when nothing aborts", async () => {
		const seen: number[] = []
		await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { seen.push(n) })
		expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
	})

	it("respects the concurrency cap", async () => {
		let inFlight = 0, peak = 0
		await pool(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
			peak = Math.max(peak, ++inFlight)
			await new Promise((r) => setTimeout(r, 1))
			inFlight--
		})
		expect(peak).toBe(4)
	})

	it("stops early once the signal aborts — the disconnect fix", async () => {
		// Without this, a client that hangs up mid-backfill left the run fetching
		// all ~90 filings from SEC with nobody reading the stream.
		const ac = new AbortController()
		const seen: number[] = []
		await pool(Array.from({ length: 100 }, (_, i) => i), 1, async (n) => {
			seen.push(n)
			if (seen.length === 5) ac.abort()
		}, ac.signal)
		expect(seen.length).toBe(5)
	})
})

describe("makeSecFetch rate gate", () => {
	const realFetch = globalThis.fetch
	const stub = async () => new Response("ok", { status: 200 })
	afterEach(() => { globalThis.fetch = realFetch })

	it("spaces requests ~110ms apart within one run", async () => {
		globalThis.fetch = stub as typeof fetch
		const f = makeSecFetch("test@example.com")
		const t0 = Date.now()
		await Promise.all([f("https://x/1"), f("https://x/2"), f("https://x/3")])
		// 3 requests → 2 gaps → at least ~220ms.
		expect(Date.now() - t0).toBeGreaterThanOrEqual(200)
	})

	it("keeps each run's gate independent — the batch-deadlock regression", async () => {
		// A module-global gate wedged the whole isolate: one cancelled run left the
		// shared promise chain pending and every later request queued behind it
		// forever (endpoint returned zero bytes for 30 min). Per-run gates mean a
		// busy or broken run cannot delay the next one.
		globalThis.fetch = stub as typeof fetch
		const busy = makeSecFetch("test@example.com")
		const fresh = makeSecFetch("test@example.com")

		const busyWork = Promise.all([busy("https://x/1"), busy("https://x/2"), busy("https://x/3")])
		const t0 = Date.now()
		await fresh("https://x/other")
		const freshMs = Date.now() - t0
		await busyWork

		// Shared gate → fresh waits behind busy's 3 slots (>300ms). Independent → immediate.
		expect(freshMs).toBeLessThan(100)
	})

	it("a failed request does not wedge the queue behind it", async () => {
		let n = 0
		globalThis.fetch = (async () => {
			if (++n === 1) throw new Error("socket hang up")
			return new Response("ok", { status: 200 })
		}) as typeof fetch
		const f = makeSecFetch("test@example.com")
		await expect(f("https://x/boom")).rejects.toThrow("socket hang up")
		expect((await f("https://x/fine")).status).toBe(200)
	})

	it("throws on a non-2xx instead of returning a bad body", async () => {
		globalThis.fetch = (async () => new Response("denied", { status: 403 })) as typeof fetch
		const f = makeSecFetch("test@example.com")
		await expect(f("https://www.sec.gov/x")).rejects.toThrow("403")
	})
})

describe("misc", () => {
	it("strips dashes for the EDGAR folder path", () => {
		expect(accessionPath("0000320193-26-000018")).toBe("000032019326000018")
	})
	it("labels .txt as plain text and everything else as html", () => {
		expect(contentTypeFor("a.txt")).toContain("text/plain")
		expect(contentTypeFor("a.htm")).toContain("text/html")
	})
})
