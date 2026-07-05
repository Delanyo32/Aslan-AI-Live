// Renders the report fixture to a PDF two ways: with the real brand woffs
// (owner payload) and with the StandardFonts fallback (redacted public payload).
// Both must emit a valid, non-trivial PDF without throwing on the fixture's
// em-dashes, curly quotes, and multi-paragraph prose.
import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { buildReportPdf } from "./report-pdf"
import { fixtureReport } from "../../../routes/terminal/[slug]/fixture"
import { redactForPublic } from "$lib/types/terminal"

const FIXED = new Date("2026-01-01T00:00:00Z")
const header = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5))

// Reads static/fonts, exercising the real woff-subset embed path (as in prod).
const fromDisk = async (path: string): Promise<Uint8Array | null> => {
	try {
		return new Uint8Array(readFileSync("static" + path))
	} catch {
		return null
	}
}

test("owner payload renders a valid PDF with embedded brand fonts", async () => {
	const bytes = await buildReportPdf(fixtureReport, {
		isOwner: true,
		ledger: { ftr: 0.82, onTime: 9, late: 2, unaccounted: 1, total: 12 },
		load: fromDisk,
		generatedAt: FIXED
	})
	expect(header(bytes)).toBe("%PDF-")
	expect(bytes.length).toBeGreaterThan(5000)
})

test("redacted public payload renders with the StandardFonts fallback", async () => {
	const bytes = await buildReportPdf(redactForPublic(fixtureReport), {
		isOwner: false,
		ledger: null,
		load: async () => null, // force fallback
		generatedAt: FIXED
	})
	expect(header(bytes)).toBe("%PDF-")
	expect(bytes.length).toBeGreaterThan(3000)
})
