import type { LayoutServerLoad } from "./$types"
import { authUser } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"

export const load: LayoutServerLoad = async ({ locals }) => {
	// Auth guard is in hooks.server.ts — user is guaranteed non-null here
	const sessionUser = locals.user!
	const { db } = locals

	// Read credits fresh from the DB — the session-cached user may be stale
	// after credits are deducted directly via db.update() during a pipeline run.
	const [row] = await db
		.select({ credits: authUser.credits })
		.from(authUser)
		.where(eq(authUser.id, sessionUser.id))
		.limit(1)

	return { user: { ...sessionUser, credits: row?.credits ?? sessionUser.credits } }
}
