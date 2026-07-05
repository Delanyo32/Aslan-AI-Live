// Minimal ambient types for "bun:test" so `bun run check` (svelte-check/tsc)
// can type-check *.test.ts files. @types/bun is not installed and house rules
// forbid new npm deps; bun provides the real implementation at runtime.
// ponytail: loose `expect: any` — replace with @types/bun if a dep is ever approved.

declare module "bun:test" {
	type TestFn = (name: string, fn: () => void | Promise<void>) => void
	export const describe: (name: string, fn: () => void) => void
	export const test: TestFn & { skip: TestFn; only: TestFn }
	export const it: TestFn & { skip: TestFn; only: TestFn }
	export const expect: (value: unknown) => any
	export const beforeEach: (fn: () => void | Promise<void>) => void
	export const afterEach: (fn: () => void | Promise<void>) => void
	export const beforeAll: (fn: () => void | Promise<void>) => void
	export const afterAll: (fn: () => void | Promise<void>) => void
	export const mock: any
	export const spyOn: any
}

// Same story for "bun:sqlite" (used by monitoring.test.ts with drizzle's
// bun-sqlite driver): just enough surface for the tests to type-check.
declare module "bun:sqlite" {
	export class Database {
		constructor(filename?: string)
		run(sql: string, ...params: unknown[]): unknown
		query(sql: string): any
		prepare(sql: string): any
		close(): void
	}
}
