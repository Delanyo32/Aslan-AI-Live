import type { PageServerLoad } from "./$types"
import { authAccount, authSession } from "$lib/server/db/schema"
import { eq, and, gt, count } from "drizzle-orm"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	const { db } = locals

	try {
		const [credentialRow, sessionRow] = await Promise.all([
			db
				.select({ cnt: count() })
				.from(authAccount)
				.where(
					and(
						eq(authAccount.userId, user.id),
						eq(authAccount.providerId, "credential")
					)
				),
			db
				.select({ cnt: count() })
				.from(authSession)
				.where(
					and(
						eq(authSession.userId, user.id),
						gt(authSession.expiresAt, new Date())
					)
				)
		])

		return {
			user,
			has_password:    (credentialRow[0]?.cnt ?? 0) > 0,
			active_sessions: sessionRow[0]?.cnt ?? 0,
		}
	} catch (err) {
		console.error("[account load]", err)
		throw error(500, { message: "Failed to load account" })
	}
}
