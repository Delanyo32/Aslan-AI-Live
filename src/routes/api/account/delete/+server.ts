import { json } from "@sveltejs/kit"
import { authUser, backtestReports } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: "unauthenticated" }, { status: 401 })
	}

	const userId = locals.user.id
	const { db } = locals

	try {
		// D1 does not support interactive transactions — use batch() for atomicity
		await db.batch([
			db.update(backtestReports).set({ is_public: false }).where(eq(backtestReports.user_id, userId)),
			db.delete(authUser).where(eq(authUser.id, userId)),
		])
		return json({ ok: true })
	} catch (err) {
		console.error("[delete-account]", err)
		return json({ error: "delete_failed" }, { status: 500 })
	}
}
