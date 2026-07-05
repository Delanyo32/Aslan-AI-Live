import { redirect } from "@sveltejs/kit"
import { authUser } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"
import { TERMINAL_CONFIG } from "$lib/server/terminal/config"
import type { PageServerLoad } from "./$types"

// Auth guard for the terminal input page. /terminal/[slug] is a public share
// page, so we can't guard `startsWith("/terminal")` in hooks.server.ts (that's
// how /dashboard guards) — this per-page guard mirrors the same two redirects.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, "/auth/login")
	if (locals.user.emailVerified === false) throw redirect(302, "/auth/check-email")

	// Fresh balance (session-cached credits go stale after a run debits) — mirrors
	// dashboard/+layout.server.ts.
	const [row] = await locals.db
		.select({ credits: authUser.credits })
		.from(authUser)
		.where(eq(authUser.id, locals.user.id))
		.limit(1)

	return {
		credits: row?.credits ?? locals.user.credits ?? 0,
		creditCost: TERMINAL_CONFIG.CREDITS_DEEP_REPORT
	}
}
