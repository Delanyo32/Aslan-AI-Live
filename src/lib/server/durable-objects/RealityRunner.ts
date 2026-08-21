// RealityRunner (Reality Ledger PLAN Phase 7). ONE DO instance per company
// (`idFromName(cik)`) — a company's catalog is rebuilt as a unit, and a single
// instance serializes concurrent runs for free. Extends StreamingRunner (event
// log, SSE/WS fan-out, /status, /cancel, watchdog).
//
// Stage machine, alarm-driven:
//   xbrl        — companyfacts → mechanical entries (one alarm, no LLM)
//   cataloging  — ONE filing per alarm (CompanyMonitor discipline: the alarm
//                 does at most one expensive unit, then re-arms — a slow LLM
//                 pass never trips the alarm limit; eviction resumes at the
//                 next filing via the catalog_done checkpoint)
//   investigating — deterministic checks + one LLM judgment pass
//   reconciling — code drafts + one LLM adjustment pass → statements
//   complete
//
// Numbers flow one way: cataloger writes entries, investigator writes flags,
// reconciler derives statements. Nothing here edits an amount.

import type { R2Bucket } from "@cloudflare/workers-types"
import { and, eq, inArray, ne } from "drizzle-orm"
import {
	ledgerEntries,
	ledgerFlags,
	realityRuns,
	realityStatements,
	secFilings
} from "$lib/server/db/schema"
import {
	catalogSoftLayer,
	extractSixKFigures,
	pickResultsDocs,
	stripFilingHtml,
	type FilingMeta
} from "$lib/server/reality/cataloger"
import { factsToEntries, fetchCompanyFacts, type CompanyFacts, type LedgerEntryInsert } from "$lib/server/reality/xbrl"
import { investigate } from "$lib/server/reality/investigator"
import { reconcile } from "$lib/server/reality/reconciler"
import { REALITY_CONFIG } from "$lib/server/reality/config"
import { chunkForD1 } from "./TerminalReportRunner"
import { logger } from "$lib/server/logger"
import { StreamingRunner, RunnerAbort } from "./streaming-runner"

type RealityStage = "pending" | "xbrl" | "cataloging" | "investigating" | "reconciling" | "complete" | "failed" | "cancelled"

const STAGE_ORDER: RealityStage[] = ["xbrl", "cataloging", "investigating", "reconciling", "complete"]
const TERMINAL = new Set<RealityStage>(["complete", "failed", "cancelled"])

// Forms the cataloger reads (grilling decision: statements only, both filer kinds).
const CATALOG_FORMS = ["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "6-K", "6-K/A"]
const SIXK_HEAD_CHARS = 2000
const MAX_TEXT_CHARS = 3_500_000 // stays well inside the model's 1.05M-token window

type StartPayload = { session_id: string; cik: string; recatalog?: boolean }

const dayGap = (a: string, b: string): number =>
	Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)

export class RealityRunner extends StreamingRunner {
	protected readonly tag = "reality"

	private get r2(): R2Bucket {
		return this.env.SEC_R2 as R2Bucket
	}

	// ── HTTP entry ───────────────────────────────────────────────────────────

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		try {
			switch (url.pathname) {
				case "/start":
					return await this.handleStart(request)
				case "/stream":
					return await this.handleStream(request)
				case "/status":
					return await this.handleStatus()
				case "/cancel":
					return await this.handleCancel()
				default:
					return new Response("not found", { status: 404 })
			}
		} catch (e) {
			logger.error("reality_do_fetch_failed", { path: url.pathname, error: logger.serializeError(e) })
			return new Response(JSON.stringify({ error: "internal_error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			})
		}
	}

	private async handleStart(request: Request): Promise<Response> {
		const body = (await request.json()) as StartPayload
		if (!body.session_id || !/^\d{10}$/.test(body.cik ?? "")) {
			return new Response(JSON.stringify({ error: "invalid_payload" }), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			})
		}

		const existing = await this.storage.get<RealityStage>("stage")
		if (existing && !TERMINAL.has(existing)) {
			return new Response(JSON.stringify({ error: "already_running", stage: existing }), {
				status: 409,
				headers: { "Content-Type": "application/json" }
			})
		}

		// One instance per company: a fresh run wipes the previous run's DO state
		// (event log included). D1 rows survive — entries dedupe on content_hash.
		// catalog_done survives the wipe: a re-run re-does the code stages but
		// never re-pays LLM cataloging for filings already processed.
		// recatalog=true is the reset for materially-changed cataloger prompts:
		// it clears catalog_done AND deletes the company's ai rows (stale
		// extractions are pipeline artifacts, not evidence — unlike amendments).
		const prevDone = body.recatalog === true ? [] : ((await this.storage.get<string[]>("catalog_done")) ?? [])
		if (body.recatalog === true) {
			await this.db.delete(ledgerEntries).where(and(eq(ledgerEntries.cik, body.cik), eq(ledgerEntries.origin, "ai")))
			await this.db.delete(ledgerFlags).where(and(eq(ledgerFlags.cik, body.cik), eq(ledgerFlags.flag_type, "extraction_disagreement")))
		}
		await this.storage.deleteAll()
		const now = Date.now()
		await this.storage.put({
			session_id: body.session_id,
			cik: body.cik,
			stage: "xbrl" satisfies RealityStage,
			catalog_done: prevDone,
			next_event_id: 1,
			created_at: now,
			updated_at: now
		})
		await this.db
			.insert(realityRuns)
			.values({ session_id: body.session_id, cik: body.cik, status: "running", stage: "xbrl", created_at: now, updated_at: now })
			.onConflictDoUpdate({
				target: realityRuns.session_id,
				set: { status: "running", stage: "xbrl", error: null, updated_at: now }
			})
		await this.storage.setAlarm(Date.now())

		return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
	}

	// ── alarm — stage machine ────────────────────────────────────────────────

	async alarm(): Promise<void> {
		const stage = (await this.storage.get<RealityStage>("stage")) ?? "xbrl"
		if (TERMINAL.has(stage)) return

		try {
			switch (stage) {
				case "pending":
				case "xbrl":
					await this.runXbrl()
					await this.advance("cataloging")
					break
				case "cataloging": {
					const remaining = await this.runCatalogOne()
					if (remaining === 0) await this.advance("investigating")
					break
				}
				case "investigating":
					await this.runInvestigating()
					await this.advance("reconciling")
					break
				case "reconciling":
					await this.runReconciling()
					await this.finish()
					break
			}

			const next = (await this.storage.get<RealityStage>("stage")) ?? stage
			if (!TERMINAL.has(next)) await this.storage.setAlarm(Date.now())
		} catch (e) {
			await this.markFailed(stage, e)
			return
		}
		await this.runWatchdog()
	}

	private async advance(next: RealityStage): Promise<void> {
		await this.storage.put({ stage: next, updated_at: Date.now() })
		await this.updateRunRow({ stage: next })
		await this.emit("stage", { type: "stage", stage: next })
	}

	private async finish(): Promise<void> {
		const cik = (await this.storage.get<string>("cik"))!
		await this.storage.put({ stage: "complete" satisfies RealityStage, updated_at: Date.now() })
		await this.updateRunRow({ status: "complete", stage: "complete" })
		await this.emit("result", { type: "result", cik })
		this.closeAllSubscribers()
	}

	private async requireCik(): Promise<string> {
		const cik = await this.storage.get<string>("cik")
		if (!cik) throw new RunnerAbort("cik_missing", "xbrl")
		return cik
	}

	private async userAgent(): Promise<string> {
		const { env } = await import("$env/dynamic/private")
		if (!env.SEC_USER_AGENT) throw new RunnerAbort("sec_user_agent_missing", "xbrl")
		return env.SEC_USER_AGENT
	}

	private async insertEntries(rows: LedgerEntryInsert[]): Promise<number> {
		let n = 0
		for (const batch of chunkForD1(rows, 22)) {
			const inserted = await this.db.insert(ledgerEntries).values(batch).onConflictDoNothing().returning({ id: ledgerEntries.id })
			n += inserted.length
		}
		return n
	}

	// ── stage: xbrl ──────────────────────────────────────────────────────────

	private async runXbrl(): Promise<void> {
		const cik = await this.requireCik()
		const key = `${REALITY_CONFIG.R2_FACTS_PREFIX}${cik}.json`

		// R2-cached companyfacts (one ~3.5MB fetch per company per day, max).
		let facts: CompanyFacts | null = null
		const cached = await this.r2.get(key)
		if (cached && Date.now() - cached.uploaded.getTime() < REALITY_CONFIG.FACTS_MAX_AGE_HOURS * 3_600_000) {
			facts = (await cached.json()) as CompanyFacts
			await this.log("Using cached XBRL companyfacts")
		}
		if (!facts) {
			facts = await fetchCompanyFacts(cik, await this.userAgent())
			await this.r2.put(key, JSON.stringify(facts))
			await this.log("Fetched XBRL companyfacts from SEC")
		}

		const rows = await factsToEntries(facts, cik)
		const inserted = await this.insertEntries(rows)
		await this.log(`XBRL spine: ${rows.length} mechanical entries (${inserted} new)`)
	}

	// ── stage: cataloging — ONE filing per alarm ─────────────────────────────

	private async catalogQueue(cik: string, done: readonly string[]): Promise<(typeof secFilings.$inferSelect)[]> {
		const rows = await this.db
			.select()
			.from(secFilings)
			.where(and(eq(secFilings.cik, cik), inArray(secFilings.form, CATALOG_FORMS)))
		const doneSet = new Set(done)
		return rows.filter((r) => !doneSet.has(r.accession)).sort((a, b) => a.filing_date.localeCompare(b.filing_date))
	}

	private async runCatalogOne(): Promise<number> {
		const cik = await this.requireCik()
		const done = (await this.storage.get<string[]>("catalog_done")) ?? []
		const queue = await this.catalogQueue(cik, done)
		if (queue.length === 0) return 0
		const filing = queue[0]

		try {
			await this.catalogFiling(cik, filing)
		} catch (e) {
			// One filing's failure never sinks the company run — logged, skipped,
			// visible in the event stream.
			logger.warn("reality_catalog_filing_failed", { accession: filing.accession, error: logger.serializeError(e) })
			await this.log(`Filing ${filing.form} ${filing.filing_date}: cataloging failed, skipped`)
		}

		done.push(filing.accession)
		await this.storage.put({ catalog_done: done, updated_at: Date.now() })
		return queue.length - 1
	}

	private async docText(key: string): Promise<string> {
		const obj = await this.r2.get(key)
		if (!obj) throw new Error(`r2_missing:${key}`)
		return stripFilingHtml(await obj.text()).slice(0, MAX_TEXT_CHARS)
	}

	private async catalogFiling(cik: string, filing: typeof secFilings.$inferSelect): Promise<void> {
		const meta: FilingMeta = {
			cik,
			accession: filing.accession,
			form: filing.form,
			report_date: filing.report_date || null
		}
		const listed = await this.r2.list({ prefix: filing.r2_prefix })
		const docKeys = listed.objects.map((o) => o.key).filter((k) => /\.(htm|html|txt)$/i.test(k))
		if (docKeys.length === 0) throw new Error("no_documents")

		const base = filing.form.replace("/A", "")
		let inserted = 0

		if (base === "6-K") {
			// Probe: exhibit names are unstable → classify each doc's head.
			const docs = await Promise.all(
				docKeys.map(async (k) => ({ key: k, name: k.slice(filing.r2_prefix.length), text: await this.docText(k) }))
			)
			const picked = await pickResultsDocs(docs.map((d) => ({ name: d.name, head: d.text.slice(0, SIXK_HEAD_CHARS) })))
			if (picked.length === 0) {
				await this.log(`6-K ${filing.filing_date}: no results material — skipped`)
				return
			}
			for (const i of picked) {
				const doc = docs[i]
				const { entries, disagreements } = await extractSixKFigures(meta, doc.name, doc.text)
				inserted += await this.insertEntries(entries)
				if (disagreements.length > 0) {
					await this.log(`6-K ${doc.name}: ${disagreements.length} double-pass disagreement(s) dropped`)
					// Persisted, not just logged — a dropped figure is a data gap the
					// read model should be able to show. Survives the investigate
					// stage's flag rewrite (that delete skips this flag_type).
					const rows = disagreements.map((d) => ({
						id: crypto.randomUUID(),
						cik,
						flag_type: "extraction_disagreement",
						origin: "deterministic",
						summary: `6-K ${doc.name}: the two extraction passes read ${d.concept} for ${d.period_end} as ${d.values[0]} vs ${d.values[1]}; the figure was dropped.`,
						entry_ids: [] as string[],
						citations: [{ accession: filing.accession, location: doc.name }],
						period_end: d.period_end
					}))
					for (const batch of chunkForD1(rows, 10)) await this.db.insert(ledgerFlags).values(batch)
				}
				inserted += await this.insertEntries(await catalogSoftLayer(meta, doc.text))
			}
		} else {
			// Statement filing: the primary document carries statements + notes.
			const primary = filing.primary_document
				? docKeys.find((k) => k.endsWith(filing.primary_document!))
				: undefined
			const key = primary ?? docKeys.sort((a, b) => b.length - a.length)[0]
			inserted += await this.insertEntries(await catalogSoftLayer(meta, await this.docText(key)))
		}

		// Amendment: the original filing's entries stay, marked superseded — a
		// restatement's before/after is investigator input, never deleted.
		if (filing.form.endsWith("/A")) {
			const originals = await this.db
				.select({ accession: secFilings.accession })
				.from(secFilings)
				.where(and(eq(secFilings.cik, cik), eq(secFilings.form, base), eq(secFilings.report_date, filing.report_date ?? "")))
			const accs = originals.map((o) => o.accession).filter((a) => a !== filing.accession)
			if (accs.length > 0) {
				await this.db
					.update(ledgerEntries)
					.set({ superseded: true })
					.where(and(eq(ledgerEntries.cik, cik), inArray(ledgerEntries.accession, accs), ne(ledgerEntries.origin, "xbrl")))
			}
		}

		await this.log(`${filing.form} ${filing.filing_date}: ${inserted} new entries`)
	}

	// ── stage: investigating ─────────────────────────────────────────────────

	private async runInvestigating(): Promise<void> {
		const cik = await this.requireCik()
		const [entries, filings] = await Promise.all([
			this.db.select().from(ledgerEntries).where(eq(ledgerEntries.cik, cik)),
			this.db.select().from(secFilings).where(eq(secFilings.cik, cik))
		])
		const flags = await investigate(cik, entries, filings)

		// Flags regenerate wholesale each run (they are derived, not accumulated).
		// extraction_disagreement flags are cataloging output, not investigation
		// output — they live and die with the catalog (recatalog clears them).
		await this.db.delete(ledgerFlags).where(and(eq(ledgerFlags.cik, cik), ne(ledgerFlags.flag_type, "extraction_disagreement")))
		for (const batch of chunkForD1(flags, 10)) await this.db.insert(ledgerFlags).values(batch)
		await this.log(`Investigation: ${flags.length} flag(s)`)
	}

	// ── stage: reconciling ───────────────────────────────────────────────────

	private async runReconciling(): Promise<void> {
		const cik = await this.requireCik()
		const [entries, flags] = await Promise.all([
			this.db.select().from(ledgerEntries).where(eq(ledgerEntries.cik, cik)),
			this.db.select().from(ledgerFlags).where(eq(ledgerFlags.cik, cik))
		])
		const statements = await reconcile(cik, entries, flags)

		// Refuse to replace good data with a collapse, and refuse to call a run
		// complete when statements stop years before the entry data does (the
		// NVDA failure shape: entries to 2026, statements to 2020).
		const existing = await this.db
			.select({ id: realityStatements.id })
			.from(realityStatements)
			.where(eq(realityStatements.cik, cik))
		if (existing.length > 0 && statements.length < existing.length / 2)
			throw new Error(`reconcile_collapse: ${statements.length} statements vs ${existing.length} existing — keeping old rows`)
		// Only mechanical claims (XBRL / 6-K spine) form quarters — soft AI claims
		// can carry future period ends (commitment windows) and must not trip this.
		const lastEntry = entries
			.filter((e) => e.origin === "xbrl" || e.taxonomy_tag?.startsWith("6k:"))
			.reduce((m, e) => (e.period_end > m ? e.period_end : m), "")
		const lastStatement = statements.reduce((m, s) => (s.period_end > m ? s.period_end : m), "")
		if (lastEntry && (!lastStatement || dayGap(lastStatement, lastEntry) > 400))
			throw new Error(`reconcile_incomplete: statements end ${lastStatement || "never"} but entries run to ${lastEntry}`)

		await this.db.delete(realityStatements).where(eq(realityStatements.cik, cik))
		for (const batch of chunkForD1(statements, 10)) await this.db.insert(realityStatements).values(batch)
		await this.log(`Reconciled ${statements.length} quarter(s)`)
	}

	// ── run-row write-through ────────────────────────────────────────────────

	protected async updateRunRow(
		patch: Partial<{ status: string; stage: string; error: string | null; result_slug: string | null }>
	): Promise<void> {
		const sessionId = await this.storage.get<string>("session_id")
		if (!sessionId) return
		const { result_slug: _drop, ...rest } = patch
		await this.db
			.update(realityRuns)
			.set({ ...rest, updated_at: Date.now() })
			.where(eq(realityRuns.session_id, sessionId))
	}
}
