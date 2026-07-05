import { describe, test, expect } from "bun:test"
import { insufficientCredits } from "./runs"
import { terminalCreditCost } from "$lib/server/durable-objects/TerminalReportRunner"
import { TERMINAL_CONFIG } from "./config"

describe("credit pre-check", () => {
	test("402 payload shape when short", () => {
		expect(insufficientCredits(3, 5)).toEqual({
			error: "insufficient_credits",
			required: 5,
			available: 3
		})
	})

	test("null when the balance covers the cost", () => {
		expect(insufficientCredits(5, 5)).toBeNull()
		expect(insufficientCredits(6, 5)).toBeNull()
	})

	test("rerun selects CREDITS_RERUN, first run CREDITS_DEEP_REPORT", () => {
		expect(terminalCreditCost(true)).toBe(TERMINAL_CONFIG.CREDITS_RERUN)
		expect(terminalCreditCost(false)).toBe(TERMINAL_CONFIG.CREDITS_DEEP_REPORT)
	})
})
