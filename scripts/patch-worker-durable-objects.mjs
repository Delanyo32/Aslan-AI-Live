#!/usr/bin/env node
// Post-build patch: @sveltejs/adapter-cloudflare's generated _worker.js only
// exports `default`. Cloudflare Pages resolves a Durable Object binding to a
// *named* export on the Worker entry — so we append the DO re-exports here.
//
// The DO class is bundled into the server output because hooks.server.ts
// re-exports it. We just need to surface it at the Worker-entry level.

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"

const WORKER_PATH = path.resolve(".svelte-kit/cloudflare/_worker.js")
const HOOKS_IMPORT = "./../output/server/entries/hooks.server.js"

const DO_CLASSES = ["PipelineRunner", "TerminalReportRunner", "CompanyMonitor"]

if (!existsSync(WORKER_PATH)) {
	console.error(`[patch-worker] ${WORKER_PATH} not found — run vite build first.`)
	process.exit(1)
}

let source = readFileSync(WORKER_PATH, "utf8")

if (DO_CLASSES.every(cls => source.includes(`${cls} as ${cls}`))) {
	console.log("[patch-worker] DO exports already present — skipping.")
	process.exit(0)
}

// Append a re-export line per DO class, and shadow any local binding name
// conflicts by aliasing through the hooks module's compiled output.
const exports = DO_CLASSES
	.map(cls => `${cls} as ${cls}`)
	.join(", ")
const patch = `\nexport { ${exports} } from "${HOOKS_IMPORT}";\n`

source += patch
writeFileSync(WORKER_PATH, source)

console.log(`[patch-worker] appended DO exports: ${DO_CLASSES.join(", ")}`)
