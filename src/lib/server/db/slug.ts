// Shared random-slug insert helper (reports.ts + terminal-reports.ts).

const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

function generateSlug(): string {
	return Array.from(
		{ length: 6 },
		() => SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]
	).join("")
}

function isUniqueConstraintError(e: unknown): boolean {
	const msg = (e as Error)?.message ?? ""
	// SQLite: "UNIQUE constraint failed: ..."
	// PostgreSQL: code 23505 (kept for compatibility during transition)
	return msg.includes("UNIQUE constraint failed") || (e as { code?: string })?.code === "23505"
}

/**
 * Run `insert` with a fresh random 6-char slug, retrying (5 attempts total)
 * when it fails on a unique constraint. Any other error rethrows immediately;
 * a unique-constraint failure on the final attempt rethrows too.
 */
export async function withUniqueSlug<T>(insert: (slug: string) => Promise<T>): Promise<T> {
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			return await insert(generateSlug())
		} catch (e: unknown) {
			if (isUniqueConstraintError(e) && attempt < 4) continue
			throw e
		}
	}
	throw new Error("Failed to generate a unique slug after 5 attempts") // unreachable; satisfies TS
}
