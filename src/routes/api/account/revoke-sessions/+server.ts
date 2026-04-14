import { json } from "@sveltejs/kit"
import { authSession } from "$lib/server/db/schema"
import { eq, and, ne } from "drizzle-orm"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user || !locals.session) {
		return json({ error: "unauthenticated" }, { status: 401 })
	}

	const { db } = locals

	try {
		await db
			.delete(authSession)
			.where(
				and(
					eq(authSession.userId, locals.user.id),
					ne(authSession.token, locals.session.token)
				)
			)
		return json({ ok: true })
	} catch (err) {
		console.error("[revoke-sessions]", err)
		return json({ error: "server_error" }, { status: 500 })
	}
}
