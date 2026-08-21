// Post-run number audit for the Reality Ledger (docs/AUDIT_Reality_Numbers.md).
// Prints the count for every failure class the 2026-08-18 audit found, so a
// prompt or pipeline change proves itself with numbers after each fleet pass.
//
//   bun scripts/audit-reality-numbers.ts [path-to-sqlite]
//
// Copies the miniflare D1 file first — sqlite can't open it while `wrangler
// dev` runs (the dev-cache gotcha's sibling).

import { Database } from "bun:sqlite"
import { copyFileSync, existsSync, mkdtempSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"

function findDb(): string {
	if (process.argv[2]) return process.argv[2]
	if (!existsSync(D1_DIR)) throw new Error(`no ${D1_DIR}; pass the sqlite path as an argument`)
	const files = readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite"))
	if (files.length === 0) throw new Error(`no .sqlite files in ${D1_DIR}`)
	// The D1 database is the big one; DO storage files are small.
	files.sort((a, b) => statSync(join(D1_DIR, b)).size - statSync(join(D1_DIR, a)).size)
	return join(D1_DIR, files[0])
}

const src = findDb()
const tmp = join(mkdtempSync(join(tmpdir(), "reality-audit-")), "db.sqlite")
copyFileSync(src, tmp)
for (const ext of ["-wal", "-shm"]) if (existsSync(src + ext)) copyFileSync(src + ext, tmp + ext)
// Not readonly: a WAL-mode copy needs its journal files writable to open.
const db = new Database(tmp)
const count = (sql: string): number => (db.query(sql).get() as { n: number }).n

// [label, target, sql] — target "0" means the class should be extinct.
const CHECKS: [string, string, string][] = [
	["unexpanded scale (notes say million/billion, amount < 10k)", "0",
		`SELECT count(*) n FROM ledger_entries WHERE origin='ai' AND value_type='currency'
		 AND (notes LIKE '%million%' OR notes LIKE '%billion%') AND abs(amount) < 10000`],
	["percent rows outside kind context", "0",
		`SELECT count(*) n FROM ledger_entries WHERE origin='ai' AND value_type='percent' AND kind != 'context'`],
	["percent-looking currency rows (legacy shape)", "0",
		`SELECT count(*) n FROM ledger_entries WHERE origin='ai' AND value_type='currency'
		 AND notes LIKE '%\\%%' ESCAPE '\\' AND abs(amount) <= 100`],
	["per-share language on currency claims", "0",
		`SELECT count(*) n FROM ledger_entries WHERE origin='ai' AND value_type='currency'
		 AND (notes LIKE '%per share%' OR notes LIKE '%per ordinary share%' OR notes LIKE '%per ADS%')`],
	["exact 1000x/1000000x of an XBRL fact, same period+unit (heuristic — round-number collisions occur)", "info",
		`SELECT count(*) n FROM ledger_entries a JOIN ledger_entries x
		 ON a.cik=x.cik AND a.period_end=x.period_end AND a.unit=x.unit
		 AND a.origin='ai' AND x.origin='xbrl' AND x.amount > 0
		 AND (a.amount = x.amount*1000.0 OR a.amount = x.amount*1000000.0)`],
	["due dates before the statement date", "0",
		`SELECT count(*) n FROM ledger_entries WHERE origin='ai' AND due_date IS NOT NULL AND due_date < period_end`],
	["gutted quarters (adjusted revenue < 10% of draft)", "0",
		`SELECT count(*) n FROM reality_statements
		 WHERE CAST(json_extract(draft,'$.revenue') AS REAL) > 0
		 AND CAST(json_extract(adjusted,'$.revenue') AS REAL) < 0.1 * CAST(json_extract(draft,'$.revenue') AS REAL)`],
	["quarters with null expenses", "low",
		`SELECT count(*) n FROM reality_statements WHERE json_extract(draft,'$.expenses') IS NULL`],
	["USD amounts above $500B (eyeball — some are genuine)", "info",
		`SELECT count(*) n FROM ledger_entries WHERE origin='ai' AND unit='USD' AND abs(amount) > 5e11`],
	["6-K extraction disagreements on record", "info",
		`SELECT count(*) n FROM ledger_flags WHERE flag_type='extraction_disagreement'`]
]

console.log(`Reality Ledger number audit — ${src}`)
console.log(`ai rows: ${count(`SELECT count(*) n FROM ledger_entries WHERE origin='ai'`)}, ` +
	`xbrl rows: ${count(`SELECT count(*) n FROM ledger_entries WHERE origin='xbrl'`)}, ` +
	`statements: ${count(`SELECT count(*) n FROM reality_statements`)}\n`)

let bad = 0
for (const [label, target, sql] of CHECKS) {
	const n = count(sql)
	const flag = target === "0" && n > 0 ? "  ← should be 0" : ""
	if (target === "0" && n > 0) bad++
	console.log(`${String(n).padStart(6)}  ${label}${flag}`)
}

// Per-company breakdown for the two statement-level checks, when non-zero.
const perCompany = (label: string, sql: string) => {
	const rows = db.query(sql).all() as { t: string; n: number }[]
	if (rows.length === 0) return
	console.log(`\n${label}:`)
	for (const r of rows) console.log(`  ${(r.t ?? "?").padEnd(6)} ${r.n}`)
}
perCompany("null expenses by company",
	`SELECT c.ticker t, count(*) n FROM reality_statements s LEFT JOIN sec_companies c ON c.cik=s.cik
	 WHERE json_extract(s.draft,'$.expenses') IS NULL GROUP BY s.cik ORDER BY n DESC`)
perCompany("gutted quarters by company",
	`SELECT c.ticker t, count(*) n FROM reality_statements s LEFT JOIN sec_companies c ON c.cik=s.cik
	 WHERE CAST(json_extract(s.draft,'$.revenue') AS REAL) > 0
	 AND CAST(json_extract(s.adjusted,'$.revenue') AS REAL) < 0.1 * CAST(json_extract(s.draft,'$.revenue') AS REAL)
	 GROUP BY s.cik ORDER BY n DESC`)

console.log(`\n${bad === 0 ? "CLEAN — every should-be-0 class is 0." : `${bad} class(es) above target.`}`)
