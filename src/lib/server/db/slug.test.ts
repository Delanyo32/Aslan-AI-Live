import { describe, test, expect } from "bun:test"
import { withUniqueSlug } from "./slug"

const uniqueError = () => new Error("UNIQUE constraint failed: reports.slug")

describe("withUniqueSlug", () => {
	test("passes a fresh 6-char [a-z0-9] slug and returns the insert result", async () => {
		const slugs: string[] = []
		const out = await withUniqueSlug(async (slug) => {
			slugs.push(slug)
			return { slug }
		})
		expect(slugs).toHaveLength(1)
		expect(out.slug).toMatch(/^[a-z0-9]{6}$/)
	})

	test("retries on unique-constraint collisions, up to 5 attempts", async () => {
		let calls = 0
		const out = await withUniqueSlug(async (slug) => {
			if (++calls < 5) throw uniqueError()
			return slug
		})
		expect(calls).toBe(5)
		expect(out).toMatch(/^[a-z0-9]{6}$/)

		calls = 0
		await expect(
			withUniqueSlug(async () => {
				calls++
				throw uniqueError()
			})
		).rejects.toThrow("UNIQUE constraint failed")
		expect(calls).toBe(5)
	})

	test("non-unique errors rethrow immediately", async () => {
		let calls = 0
		await expect(
			withUniqueSlug(async () => {
				calls++
				throw new Error("connection lost")
			})
		).rejects.toThrow("connection lost")
		expect(calls).toBe(1)
	})
})
