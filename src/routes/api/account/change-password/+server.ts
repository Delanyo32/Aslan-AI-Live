import { json } from "@sveltejs/kit"
import { createAuth } from "$lib/server/auth"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: "unauthenticated" }, { status: 401 })
	}

	let body: { currentPassword?: unknown; newPassword?: unknown }
	try {
		body = await request.json()
	} catch {
		return json({ error: "invalid_body" }, { status: 400 })
	}

	if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
		return json({ error: "invalid_body" }, { status: 400 })
	}

	const auth = createAuth(locals.db)

	try {
		await auth.api.changePassword({
			body: {
				currentPassword:     body.currentPassword,
				newPassword:         body.newPassword,
				revokeOtherSessions: false
			},
			headers: request.headers
		})
		return json({ ok: true })
	} catch (err: unknown) {
		// better-auth throws BAD_REQUEST (status 400) when current password is wrong
		const anyErr = err as Record<string, unknown>
		if (anyErr.status === 400 || anyErr.statusCode === 400) {
			return json({ error: "wrong_password" }, { status: 401 })
		}
		console.error("[change-password]", err)
		return json({ error: "server_error" }, { status: 500 })
	}
}
