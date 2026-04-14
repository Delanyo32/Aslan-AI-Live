import { json } from "@sveltejs/kit"
import { authUser } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: "unauthenticated" }, { status: 401 })
	}

	let body: { name?: unknown }
	try {
		body = await request.json()
	} catch {
		return json({ error: "invalid_name" }, { status: 400 })
	}

	if (
		typeof body.name !== "string" ||
		body.name.trim().length === 0 ||
		body.name.trim().length > 100
	) {
		return json({ error: "invalid_name" }, { status: 400 })
	}

	const { db } = locals

	try {
		await db
			.update(authUser)
			.set({ name: body.name.trim(), updatedAt: new Date() })
			.where(eq(authUser.id, locals.user.id))
		return json({ ok: true })
	} catch (err) {
		console.error("[update-name]", err)
		return json({ error: "server_error" }, { status: 500 })
	}
}
