import { describe, test, expect } from "bun:test"
import { classifyAsset, isRealCompany, type AssetMeta } from "./screener-filter"

const stock = (over: Partial<AssetMeta> = {}): AssetMeta => ({
	exchange: "NASDAQ",
	hasOptions: true,
	type: "stock",
	...over
})

describe("classifyAsset", () => {
	test("warrants/units/rights → warrant", () => {
		expect(classifyAsset("FGI Industries Ltd. Warrant", "NASDAQ")).toBe("warrant")
		expect(classifyAsset("Acme Corp Units", "NASDAQ")).toBe("warrant")
	})
	test("named funds and ETF venues → etf", () => {
		expect(classifyAsset("Direxion Shares ETF Trust Daily Bull", "NASDAQ")).toBe("etf")
		expect(classifyAsset("Whatever Holdings", "ARCA")).toBe("etf")
		expect(classifyAsset("Whatever Holdings", "BATS")).toBe("etf")
	})
	test("operating companies (incl. class shares / ADRs) → stock", () => {
		expect(classifyAsset("Apple Inc. Common Stock", "NASDAQ")).toBe("stock")
		expect(classifyAsset("Alphabet Inc. Class A Common Stock", "NASDAQ")).toBe("stock")
		expect(classifyAsset("Taiwan Semiconductor Manufacturing Co Ltd", "NYSE")).toBe("stock")
	})
})

describe("isRealCompany (movers junk-filter)", () => {
	test("keeps an optionable operating company on a major exchange", () => {
		expect(isRealCompany(stock())).toBe(true)
	})
	test("drops non-optionable (penny/warrant)", () => {
		expect(isRealCompany(stock({ hasOptions: false }))).toBe(false)
	})
	test("drops OTC / non-major exchanges", () => {
		expect(isRealCompany(stock({ exchange: "OTC" }))).toBe(false)
		expect(isRealCompany(stock({ exchange: "ARCA" }))).toBe(false)
	})
	test("drops ETFs and warrants even when optionable on a major exchange", () => {
		expect(isRealCompany(stock({ type: "etf" }))).toBe(false)
		expect(isRealCompany(stock({ type: "warrant" }))).toBe(false)
	})
	test("drops unknown symbols (not in universe)", () => {
		expect(isRealCompany(undefined)).toBe(false)
	})
})
