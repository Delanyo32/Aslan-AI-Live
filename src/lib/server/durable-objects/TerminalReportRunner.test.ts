import { describe, test, expect } from "bun:test"
import {
	TERMINAL_STAGE_ORDER,
	DIMENSION_ORDER,
	nextStage,
	pendingDimensions,
	terminalCreditCost,
	collectEvidenceItems,
	chunkForD1
} from "./TerminalReportRunner"
import { evidenceHash } from "$lib/server/terminal/scoring"
import { TERMINAL_CONFIG } from "$lib/server/terminal/config"
import type { DimensionEvidence, DimensionId, EvidenceItem } from "$lib/types/terminal"

const item = (hash: string, dim: DimensionId): EvidenceItem => ({
	url: `https://ex.com/${hash}`,
	title: null,
	source_domain: "ex.com",
	published_at: null,
	snippet: null,
	id: crypto.randomUUID(),
	content_hash: hash,
	origin: "report_run",
	dimensions: [dim],
	company_controlled: false
})

const dimEvidence = (dim: DimensionId, items: EvidenceItem[]): DimensionEvidence => ({
	dimension: dim,
	findings: [],
	screen_hits: [],
	evidence_items: items,
	searches_run: 1
})

describe("stage order", () => {
	test("advances through the pipeline in order, terminating at complete", () => {
		expect(nextStage("resolving")).toBe("competitor_set")
		expect(nextStage("competitor_set")).toBe("researching")
		expect(nextStage("researching")).toBe("extracting")
		expect(nextStage("persisting")).toBe("complete")
		expect(nextStage("complete")).toBe("complete")
	})

	test("every non-terminal stage maps to its successor in the order table", () => {
		for (let i = 0; i < TERMINAL_STAGE_ORDER.length - 1; i++) {
			expect(nextStage(TERMINAL_STAGE_ORDER[i])).toBe(TERMINAL_STAGE_ORDER[i + 1])
		}
	})
})

describe("per-dimension checkpoint resume", () => {
	test("no progress → all nine run in order", () => {
		expect(pendingDimensions([])).toEqual(DIMENSION_ORDER)
	})

	test("resumes after the checkpointed dimensions, preserving order", () => {
		expect(pendingDimensions(["F1", "F2", "F3"])).toEqual(["F4", "F5", "F6", "F7", "F8", "F9"])
	})

	test("out-of-order / duplicate checkpoints still yield the correct remainder", () => {
		expect(pendingDimensions(["F3", "F1", "F1"])).toEqual(["F2", "F4", "F5", "F6", "F7", "F8", "F9"])
	})

	test("all done → nothing left", () => {
		expect(pendingDimensions(DIMENSION_ORDER)).toEqual([])
	})
})

describe("credit cost selection", () => {
	test("fresh report vs rerun", () => {
		expect(terminalCreditCost(false)).toBe(TERMINAL_CONFIG.CREDITS_DEEP_REPORT)
		expect(terminalCreditCost(true)).toBe(TERMINAL_CONFIG.CREDITS_RERUN)
	})
})

describe("chunkForD1", () => {
	test("keeps every batch under D1's 100-bound-parameter limit", () => {
		// 10 dimension_scores rows × 12 columns = 120 params — the failure this fixes.
		const rows = Array.from({ length: 10 }, (_, i) => i)
		const batches = chunkForD1(rows, 12)
		expect(batches.every((b) => b.length * 12 <= 100)).toBe(true)
		expect(batches.flat()).toEqual(rows)
		// 150 evidence rows × 11 columns
		const evidence = chunkForD1(Array.from({ length: 150 }, (_, i) => i), 11)
		expect(evidence.every((b) => b.length * 11 <= 100)).toBe(true)
		expect(evidence.flat().length).toBe(150)
	})
})

describe("evidence-snapshot-hash input assembly", () => {
	test("dedupes by content_hash and merges the dimensions each item belongs to", () => {
		const list = [
			dimEvidence("F1", [item("a", "F1"), item("b", "F1")]),
			dimEvidence("F2", [item("a", "F2"), item("c", "F2")])
		]
		const collected = collectEvidenceItems(list)
		expect(collected.map((i) => i.content_hash).sort()).toEqual(["a", "b", "c"])
		const a = collected.find((i) => i.content_hash === "a")!
		expect(a.dimensions.sort()).toEqual(["F1", "F2"])
	})

	test("does not mutate the source evidence items", () => {
		const shared = item("a", "F1")
		const list = [dimEvidence("F1", [shared]), dimEvidence("F2", [item("a", "F2")])]
		collectEvidenceItems(list)
		expect(shared.dimensions).toEqual(["F1"])
	})

	test("snapshot hash is order-independent over the collected set", async () => {
		const list = [
			dimEvidence("F1", [item("a", "F1"), item("b", "F1")]),
			dimEvidence("F2", [item("c", "F2")])
		]
		const collected = collectEvidenceItems(list)
		const h1 = await evidenceHash("composite", "1.0.0", collected)
		const h2 = await evidenceHash("composite", "1.0.0", [...collected].reverse())
		expect(h1).toBe(h2)
		// A different rubric version pins a different grade → different hash.
		expect(await evidenceHash("composite", "1.0.1", collected)).not.toBe(h1)
	})
})
