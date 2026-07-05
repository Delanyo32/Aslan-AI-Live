import { describe, test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { companies, terminalAlerts } from "$lib/server/db/schema"
import {
	extractMonitorId,
	findCompanyByMonitorId,
	markAlertsRead,
	monitorStateHasId,
	webhookTokenValid
} from "./monitoring"

describe("webhookTokenValid", () => {
	test("matches only the exact configured token", () => {
		expect(webhookTokenValid("tok", "tok")).toBe(true)
		expect(webhookTokenValid("wrong", "tok")).toBe(false)
		expect(webhookTokenValid(undefined, "tok")).toBe(false)
	})

	test("fails closed when the env token is unset or empty", () => {
		expect(webhookTokenValid(undefined, undefined)).toBe(false)
		expect(webhookTokenValid("", "")).toBe(false)
		expect(webhookTokenValid("", undefined)).toBe(false)
	})
})

describe("extractMonitorId", () => {
	test("reads the documented data.monitorId shape", () => {
		expect(extractMonitorId({ type: "monitor.run.completed", data: { monitorId: "mon_1" } })).toBe("mon_1")
	})

	test("falls back to top-level and snake_case ids", () => {
		expect(extractMonitorId({ monitorId: "mon_2" })).toBe("mon_2")
		expect(extractMonitorId({ data: { monitor_id: "mon_3" } })).toBe("mon_3")
	})

	test("null for missing/empty/non-string ids and junk payloads", () => {
		expect(extractMonitorId({})).toBeNull()
		expect(extractMonitorId(null)).toBeNull()
		expect(extractMonitorId("nope")).toBeNull()
		expect(extractMonitorId({ data: { monitorId: "" } })).toBeNull()
		expect(extractMonitorId({ data: { monitorId: 42 } })).toBeNull()
	})
})

describe("monitorStateHasId", () => {
	const state = {
		news_monitor_id: "mon_news",
		news_secret: "sec_news",
		policy_monitor_id: "mon_policy",
		policy_secret: null,
		competitor_monitor_id: null,
		competitor_secret: null
	}

	test("matches any of the three monitor id fields", () => {
		expect(monitorStateHasId(state, "mon_news")).toBe(true)
		expect(monitorStateHasId(state, "mon_policy")).toBe(true)
		expect(monitorStateHasId(state, "mon_other")).toBe(false)
	})

	test("secret fields never match; null/garbage state never matches", () => {
		expect(monitorStateHasId(state, "sec_news")).toBe(false)
		expect(monitorStateHasId(null, "mon_news")).toBe(false)
		expect(monitorStateHasId("mon_news", "mon_news")).toBe(false)
	})
})

// In-memory sqlite via bun:sqlite so the DB-facing helpers run against real SQL.
type Db = Parameters<typeof markAlertsRead>[0]
function testDb(): Db {
	const sqlite = new Database(":memory:")
	sqlite.run(`CREATE TABLE companies (
		id text PRIMARY KEY, ticker text NOT NULL, name text NOT NULL,
		exa_entity text, is_us integer NOT NULL DEFAULT 0, alpaca_symbol text,
		sector text, competitor_webset_id text, monitor_state text,
		created_at integer NOT NULL, updated_at integer NOT NULL)`)
	sqlite.run(`CREATE TABLE terminal_alerts (
		id text PRIMARY KEY, user_id text NOT NULL, company_id text NOT NULL,
		dimension text NOT NULL, old_grade text, new_grade text NOT NULL,
		reason text NOT NULL, citations text NOT NULL DEFAULT '[]',
		read integer NOT NULL DEFAULT 0, emailed integer NOT NULL DEFAULT 0,
		created_at integer NOT NULL)`)
	return drizzle(sqlite) as unknown as Db
}

async function seedCompany(db: Db, id: string, monitorState: object | null): Promise<void> {
	await db.insert(companies).values({
		id,
		ticker: id.toUpperCase(),
		name: id,
		monitor_state: monitorState,
		created_at: new Date(),
		updated_at: new Date()
	})
}

describe("findCompanyByMonitorId", () => {
	test("maps a monitor id to the owning company; unknown id → null", async () => {
		const db = testDb()
		await seedCompany(db, "aapl", { news_monitor_id: "mon_a", policy_monitor_id: null, competitor_monitor_id: null })
		await seedCompany(db, "msft", { news_monitor_id: "mon_b", policy_monitor_id: "mon_b2", competitor_monitor_id: null })
		await seedCompany(db, "tsla", null)

		expect((await findCompanyByMonitorId(db, "mon_a"))?.id).toBe("aapl")
		expect((await findCompanyByMonitorId(db, "mon_b2"))?.id).toBe("msft")
		expect(await findCompanyByMonitorId(db, "mon_zzz")).toBeNull()
	})
})

describe("markAlertsRead owner scoping", () => {
	test("only the owner's rows flip, even when ids belong to someone else", async () => {
		const db = testDb()
		const rows = [
			{ id: "a1", user_id: "alice", company_id: "c1", dimension: "F1", new_grade: "B", reason: "r" },
			{ id: "a2", user_id: "alice", company_id: "c1", dimension: "F2", new_grade: "C", reason: "r" },
			{ id: "b1", user_id: "bob", company_id: "c1", dimension: "F1", new_grade: "D", reason: "r" }
		]
		for (const r of rows) await db.insert(terminalAlerts).values(r)

		// alice tries to mark her own a1 plus bob's b1
		const updated = await markAlertsRead(db, "alice", ["a1", "b1"])
		expect(updated).toBe(1)

		const all = await db.select().from(terminalAlerts)
		const byId = Object.fromEntries(all.map((r) => [r.id, r.read]))
		expect(byId).toEqual({ a1: true, a2: false, b1: false })
	})

	test("empty ids is a no-op", async () => {
		const db = testDb()
		expect(await markAlertsRead(db, "alice", [])).toBe(0)
	})
})
