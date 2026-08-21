// SEC EDGAR filing downloader. Given a ticker, pulls every core filing's
// documents into R2 and records each one in D1 so re-runs only fetch the diff.
//
// Facts pinned by probing the live endpoints (2026-08-14), not from docs:
//  - www.sec.gov 403s unless User-Agent contains an "@". Any address passes
//    (even a bogus one) but SEC's stated policy is that it's how they reach you
//    before blocking, so SEC_USER_AGENT should be real. data.sec.gov is looser
//    and accepts any non-empty UA — we send the same header to both anyway.
//  - Rate limit is 10 req/s. secFetch gates every request to ~9/s.
//  - An 8-K's primary document is a 38 KB cover page; the earnings release is a
//    separate EX-99.1 .htm. Main-doc-only would miss the news, so we read the
//    folder listing and keep every .htm/.txt.
//  - 1990s filings have primaryDocument === "" and an index.json whose document
//    entries have BLANK names. Only {accession}.txt is retrievable — see
//    pickDocuments' fallback.

import type { R2Bucket, R2Object } from "@cloudflare/workers-types"

/** What r2.put() accepts as a body. Derived from the binding's own signature so
 *  it can't drift. Needed because `Response.body` is typed against the DOM's
 *  ReadableStream, which is structurally incompatible with the Workers one even
 *  though it is the same object at runtime. */
type R2PutBody = Parameters<R2Bucket["put"]>[1]

/** Minimal shape of the Workers `FixedLengthStream` global (a TransformStream
 *  that declares its byte length up front). Declared locally so this module does
 *  not depend on workers-types being loaded as an ambient global. */
declare const FixedLengthStream: new (length: number) => { readable: unknown; writable: unknown }
import { eq } from "drizzle-orm"
import type { createDb } from "./db/client"
import { secCompanies, secFilings } from "./db/schema"

type Db = ReturnType<typeof createDb>

/** Forms worth archiving. Everything else (Form 4 insider trades, 144, SC 13G)
 *  is table data, and is ~85% of a large issuer's filing count.
 *
 *  6-K is not optional. A foreign private issuer files 20-F once a year and puts
 *  EVERYTHING else — quarterly results, monthly revenue, press releases — in a
 *  6-K. Without it TSMC yields 7 filings since 2020 instead of 361, ASML 7
 *  instead of 64, ARM 3 instead of 35. Verified against EDGAR, not assumed. */
export const CORE_FORMS = new Set([
	// US domestic issuers
	"10-K", "10-K/A",
	"10-Q", "10-Q/A",
	"8-K",  "8-K/A",
	"DEF 14A",
	// Foreign private issuers
	"20-F", "20-F/A",
	"40-F", "40-F/A",
	"6-K",  "6-K/A",
])

export type FilingMeta = {
	accession:   string
	form:        string
	filingDate:  string
	reportDate:  string
	primaryDoc:  string
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

/** How long a single SEC request may take before we give up on it. Without a cap
 *  a stuck socket stalls the run silently, which looks exactly like slow progress.
 *
 *  Sized from measurement, not taste: SEC serves large documents at roughly
 *  160 KB/s, so Microsoft's 8.6 MB 10-K takes ~55s. A 30s cap failed 48 filings
 *  in the first batch — every one a big 10-K or proxy, none actually broken.
 *  180s clears a ~28 MB document and still catches a genuine hang. */
const REQUEST_TIMEOUT_MS = 180_000

/**
 * A rate-limited SEC fetcher, scoped to ONE sync run.
 *
 * The gate serialises the *start* of each request ~110ms apart (SEC's cap is 10
 * req/s); callers still overlap while awaiting responses.
 *
 * Built per run, never shared. A module-global gate deadlocks the whole isolate:
 * when a Worker request is cancelled mid-flight its continuations are abandoned,
 * so the promise chain never settles and every later request queues behind it
 * forever. That is not theoretical — it took out a 34-company batch after an
 * earlier run was cancelled, with the endpoint returning zero bytes.
 */
export function makeSecFetch(userAgent: string, signal?: AbortSignal) {
	let last = 0
	let chain: Promise<void> = Promise.resolve()

	return async function secFetch(url: string, init?: RequestInit): Promise<Response> {
		const turn = chain.then(async () => {
			const wait = last + 110 - Date.now()
			if (wait > 0) await new Promise((r) => setTimeout(r, wait))
			last = Date.now()
		})
		// Swallow rejections on the chain itself so one failure can't wedge the
		// queue for the rest of this run.
		chain = turn.catch(() => {})
		await turn

		const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		const res = await fetch(url, {
			...init,
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
			headers: { "User-Agent": userAgent, ...init?.headers },
		})
		if (!res.ok) throw new Error(`${res.status} ${url}`)
		return res
	}
}

export type SecFetch = ReturnType<typeof makeSecFetch>

/**
 * Store one SEC document in R2 without holding it in memory.
 *
 * Buffering via arrayBuffer() was the obvious approach and it does not fit: the
 * largest document in a 12k-file archive is 32 MB and 21 exceed 10 MB, so four
 * filings in flight could blow a Worker's 128 MB ceiling.
 *
 * Streaming needs a length, and SEC's responses carry none — it serves over
 * HTTP/2 with no Content-Length (verified under both gzip and identity), and
 * Workers transparently decompresses its gzip, so R2 rejects the body with
 * "Provided readable stream must have a known length". SEC's own folder listing
 * declares each file's exact size, so we wrap the body in a FixedLengthStream
 * carrying it.
 *
 * Pre-2001 listings declare no size (blank filenames and all); those documents
 * are small, so they fall back to buffering.
 */
async function putDocument(
	r2: R2Bucket, key: string, res: Response, declaredSize: number, contentType: string
): Promise<R2Object> {
	if (!res.body) throw new Error(`empty body: ${key}`)
	if (declaredSize <= 0) {
		return r2.put(key, await res.arrayBuffer(), { httpMetadata: { contentType } })
	}
	const fixed = new FixedLengthStream(declaredSize)
	// Drives the copy while r2.put() drains the readable half. A failure here also
	// fails the put, which is what the caller reports; catching keeps it from
	// surfacing separately as an unhandled rejection.
	const pumped = (res.body as unknown as { pipeTo(w: unknown): Promise<void> })
		.pipeTo(fixed.writable)
		.catch(() => {})
	const stored = await r2.put(key, fixed.readable as R2PutBody, { httpMetadata: { contentType } })
	await pumped
	return stored
}

/** Run `fn` over `items` with at most `n` in flight, stopping early once
 *  `signal` aborts. Exported for the abort test. */
export async function pool<T>(
	items: T[], n: number, fn: (item: T) => Promise<void>, signal?: AbortSignal
): Promise<void> {
	let i = 0
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (i < items.length) {
				if (signal?.aborted) return
				await fn(items[i++])
			}
		})
	)
}

// ─── Pure helpers (unit-tested in sec.test.ts) ───────────────────────────────

export const isCoreForm = (form: string): boolean => CORE_FORMS.has(form)

/** Oldest filing date we archive unless the caller overrides `since`. */
export const DEFAULT_SINCE = "2020-01-01"

/** True for a real YYYY-MM-DD date. Guards the `since` param: a typo that fell
 *  through as "" would silently pull all of history back to 1994. */
export function isIsoDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
	const d = new Date(`${s}T00:00:00Z`)
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Filing dates are ISO YYYY-MM-DD, so a string compare is a date compare.
 *  A blank date (some pre-2001 rows) sorts below any real `since` and is dropped. */
export const filedOnOrAfter = (filingDate: string, since: string): boolean => filingDate >= since

/** Accession → EDGAR folder segment: dashes stripped. */
export const accessionPath = (accession: string): string => accession.replace(/-/g, "")

export const r2Prefix = (cik: string, accession: string): string => `sec/${cik}/${accession}/`

/**
 * Folder listing → the documents worth keeping.
 *
 * Keeps .htm/.html/.txt and drops:
 *   - blank names (1990s listings emit sizes with no filename)
 *   - anything starting with the accession: {acc}-index.html, {acc}-index-headers.html,
 *     and {acc}.txt (the full submission, which duplicates every other document)
 *   - R1.htm, R2.htm… — generated XBRL viewer fragments, not filed content
 *
 * Falls back to {accession}.txt when that leaves nothing, which is the only
 * retrievable file for pre-2001 filings.
 */
export function pickDocuments(names: string[], accession: string): string[] {
	const kept = names.filter((n) => {
		if (!n) return false
		if (n.startsWith(accession)) return false
		if (/^R\d+\.html?$/i.test(n)) return false
		return /\.(html?|txt)$/i.test(n)
	})
	return kept.length > 0 ? kept : [`${accession}.txt`]
}

export const contentTypeFor = (name: string): string =>
	/\.txt$/i.test(name) ? "text/plain; charset=utf-8" : "text/html; charset=utf-8"

/** Submissions JSON's column-oriented `recent`/older shape → one row per filing,
 *  core forms filed on or after `since`. SEC stores each field as a parallel
 *  array, not objects. */
export function toFilingMetas(cols: Record<string, unknown[]>, since: string): FilingMeta[] {
	const out: FilingMeta[] = []
	const forms = (cols.form ?? []) as string[]
	for (let i = 0; i < forms.length; i++) {
		if (!isCoreForm(forms[i])) continue
		if (!filedOnOrAfter(String((cols.filingDate as string[])[i] ?? ""), since)) continue
		out.push({
			accession:  String((cols.accessionNumber as string[])[i]),
			form:       forms[i],
			filingDate: String((cols.filingDate as string[])[i] ?? ""),
			reportDate: String((cols.reportDate as string[])[i] ?? ""),
			primaryDoc: String((cols.primaryDocument as string[])[i] ?? ""),
		})
	}
	return out
}

// ─── EDGAR reads ─────────────────────────────────────────────────────────────

export type CompanyRef = { cik: string; ticker: string; name: string }

/** Ticker → CIK via the public ticker map. Cached 24h at the edge so a sync
 *  costs one fetch of this 795 KB file per day, not one per run. */
export async function lookupCik(symbol: string, secFetch: SecFetch): Promise<CompanyRef | null> {
	const res = await secFetch("https://www.sec.gov/files/company_tickers.json", {
		cf: { cacheTtl: 86400, cacheEverything: true },
	} as RequestInit)
	const map = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>
	const want = symbol.trim().toUpperCase()
	const hit = Object.values(map).find((e) => e.ticker.toUpperCase() === want)
	if (!hit) return null
	return { cik: String(hit.cik_str).padStart(10, "0"), ticker: hit.ticker, name: hit.title }
}

/** Every core filing on or after `since`, newest first — the submissions file
 *  plus the older-history files it points at (`filings.files`), which hold
 *  everything past the first 1000.
 *
 *  Each older-history entry declares the date range it covers, so one whose
 *  `filingTo` predates `since` is skipped without fetching it. With the default
 *  since=2020-01-01, Apple's 1994–2015 file is never downloaded at all. */
export async function listCoreFilings(cik: string, secFetch: SecFetch, since: string): Promise<FilingMeta[]> {
	const res = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)
	const doc = (await res.json()) as {
		filings: { recent: Record<string, unknown[]>; files?: { name: string; filingTo?: string }[] }
	}
	const all = toFilingMetas(doc.filings.recent, since)
	for (const f of doc.filings.files ?? []) {
		if (f.filingTo && f.filingTo < since) continue
		const older = await secFetch(`https://data.sec.gov/submissions/${f.name}`)
		all.push(...toFilingMetas((await older.json()) as Record<string, unknown[]>, since))
	}
	return all
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export type SyncSummary = {
	cik: string; ticker: string; name: string; since: string
	total: number; added: number; skipped: number; failed: number; bytes: number
	aborted: boolean
}

/**
 * Download every core filing for `symbol` filed on or after `since` that isn't
 * already in D1.
 *
 * `onProgress` gets one line per filing as it lands. A filing that throws is
 * counted and skipped — no D1 row is written for it, so the next run retries it
 * — and the run continues. One bad filing never aborts a backfill.
 *
 * `signal` stops the run between filings. The endpoint aborts it when the client
 * disconnects; without that a `curl | head` would keep hammering SEC to the end
 * of the backfill with nobody reading.
 */
export async function syncSymbol(opts: {
	symbol:      string
	db:          Db
	r2:          R2Bucket
	userAgent:   string
	since?:      string
	limit?:      number
	signal?:     AbortSignal
	onProgress?: (line: string) => void
}): Promise<SyncSummary> {
	const { symbol, db, r2, userAgent, limit, signal } = opts
	const since = opts.since ?? DEFAULT_SINCE
	if (!isIsoDate(since)) throw new Error(`since must be YYYY-MM-DD, got: ${since}`)
	const say = opts.onProgress ?? (() => {})
	// Per-run fetcher: its rate gate must not outlive this request. See makeSecFetch.
	const secFetch = makeSecFetch(userAgent, signal)

	const company = await lookupCik(symbol, secFetch)
	if (!company) throw new Error(`unknown symbol: ${symbol}`)
	const { cik, ticker, name } = company
	say(`${ticker}  CIK ${cik}  ${name}  (since ${since})`)

	const filings = await listCoreFilings(cik, secFetch, since)
	const have = new Set(
		(await db.select({ a: secFilings.accession }).from(secFilings).where(eq(secFilings.cik, cik)))
			.map((r) => r.a)
	)
	// Count against the window, not the whole table: `have` may hold filings from
	// an earlier run with an older `since` that this run isn't asking about.
	let missing = filings.filter((f) => !have.has(f.accession))
	const already = filings.length - missing.length
	if (limit && limit > 0) missing = missing.slice(0, limit)
	say(`${filings.length} core filings in window, ${already} already stored, ${missing.length} to fetch`)

	let added = 0, failed = 0, bytes = 0
	await pool(missing, 4, async (f) => {
		try {
			const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath(f.accession)}`
			const listing = (await (await secFetch(`${base}/index.json`)).json()) as {
				// `size` is a string in EDGAR's JSON, and blank for directory entries
				// and for pre-2001 documents.
				directory: { item: { name: string; size: string }[] }
			}
			const items = listing.directory.item
			const docs = pickDocuments(items.map((i) => i.name), f.accession)
			// SEC's listing is the only place a document's byte length is stated;
			// putDocument needs it to stream without buffering.
			const declared = new Map(items.map((i) => [i.name, Number(i.size) || 0]))

			const prefix = r2Prefix(cik, f.accession)
			let filingBytes = 0
			for (const doc of docs) {
				const res = await secFetch(`${base}/${doc}`)
				// R2 reports what it actually wrote — a truer count than any header.
				const stored = await putDocument(
					r2, prefix + doc, res, declared.get(doc) ?? 0, contentTypeFor(doc)
				)
				filingBytes += stored.size
			}

			// Written only after every document is in R2 — this is the resume point.
			await db.insert(secFilings).values({
				accession:        f.accession,
				cik,
				form:             f.form,
				filing_date:      f.filingDate,
				report_date:      f.reportDate,
				primary_document: f.primaryDoc,
				r2_prefix:        prefix,
				doc_count:        docs.length,
				bytes:            filingBytes,
			}).onConflictDoNothing()

			added++
			bytes += filingBytes
			say(`${f.form.padEnd(9)} ${f.filingDate}  ${String(docs.length).padStart(2)} docs  ${fmtBytes(filingBytes)}`)
		} catch (err) {
			failed++
			say(`ERROR     ${f.accession}  ${err instanceof Error ? err.message : String(err)}`)
		}
	}, signal)

	// last_synced_at only means "fully caught up", so an aborted run must not set
	// it — otherwise a partial backfill looks complete.
	await db.insert(secCompanies)
		.values({ cik, ticker, name, last_synced_at: signal?.aborted ? null : new Date() })
		.onConflictDoUpdate({
			target: secCompanies.cik,
			set: signal?.aborted ? { ticker, name } : { ticker, name, last_synced_at: new Date() },
		})

	return {
		cik, ticker, name, since,
		total: filings.length, added, skipped: already, failed, bytes,
		aborted: signal?.aborted ?? false,
	}
}

export const fmtBytes = (n: number): string =>
	n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`
