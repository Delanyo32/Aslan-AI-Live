#!/usr/bin/env node
// Single-command dev with Durable Objects. Vite dev + getPlatformProxy can't
// resolve a same-project DO class (Miniflare: "no such actor class"), so we
// run the adapter-cloudflare build + wrangler pages dev instead — and watch
// source files, rebuilding on change with wrangler's --live-reload pushing
// a browser refresh.
//
// Feedback loop: ~5s (full SvelteKit build). Not HMR, but one command and
// DO bindings resolve end-to-end.

import { spawn, spawnSync } from "node:child_process"
import { watch } from "node:fs"
import path from "node:path"

const CWD = process.cwd()
const WATCH_DIRS = [
	path.join(CWD, "src"),
	path.join(CWD, "wrangler.toml"),
]
const REBUILD_DEBOUNCE_MS = 400

function initialBuild() {
	console.log("[dev-do] initial build…")
	const r = spawnSync("bun", ["run", "build"], { stdio: "inherit" })
	if (r.status !== 0) {
		console.error("[dev-do] initial build failed — aborting.")
		process.exit(r.status ?? 1)
	}
}

function startWrangler() {
	// :5173 matches PUBLIC_BASE_URL=http://localhost:5173 in .dev.vars so
	// better-auth's callback URLs stay consistent in dev.
	const port = process.env.PORT ?? "5173"
	console.log(`[dev-do] starting wrangler dev on :${port}…`)
	// Workers mode: `wrangler dev` reads `main` from wrangler.toml and bundles
	// the DO class natively (no separate Worker required). --live-reload
	// refreshes the browser whenever _worker.js is rewritten by the watcher.
	const proc = spawn(
		"npx",
		["wrangler", "dev", "--live-reload", "--port", port],
		{ stdio: "inherit" },
	)
	proc.on("exit", (code) => {
		console.log(`[dev-do] wrangler exited with ${code}`)
		process.exit(code ?? 0)
	})
	return proc
}

let rebuildTimer = null
let rebuildInFlight = null
function scheduleRebuild(reason) {
	if (rebuildTimer) clearTimeout(rebuildTimer)
	rebuildTimer = setTimeout(async () => {
		rebuildTimer = null
		if (rebuildInFlight) return
		console.log(`[dev-do] rebuild (${reason})…`)
		rebuildInFlight = new Promise((resolve) => {
			const p = spawn("bun", ["run", "build"], { stdio: "inherit" })
			p.on("exit", (code) => {
				rebuildInFlight = null
				if (code === 0) console.log("[dev-do] rebuild ok — browser will reload.")
				else            console.error(`[dev-do] rebuild failed (${code}) — fix and save to retry.`)
				resolve()
			})
		})
	}, REBUILD_DEBOUNCE_MS)
}

function startWatchers() {
	for (const dir of WATCH_DIRS) {
		try {
			watch(dir, { recursive: true }, (_event, filename) => {
				if (!filename) return
				if (filename.endsWith("~")) return
				if (filename.includes("/.svelte-kit/")) return
				scheduleRebuild(filename)
			})
			console.log(`[dev-do] watching ${path.relative(CWD, dir)}`)
		} catch (e) {
			console.warn(`[dev-do] could not watch ${dir}: ${(e && e.message) || e}`)
		}
	}
}

// ── main ──────────────────────────────────────────────────────────────────

initialBuild()
const wrangler = startWrangler()
startWatchers()

const shutdown = (sig) => {
	console.log(`[dev-do] ${sig} — shutting down.`)
	wrangler.kill(sig)
	process.exit(0)
}
process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
