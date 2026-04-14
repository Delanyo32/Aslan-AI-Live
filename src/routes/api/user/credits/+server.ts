import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { authUser } from "$lib/server/db/schema"
import { eq } from "drizzle-orm"

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ credits: 0 }, { status: 401 })

	const [row] = await locals.db
		.select({ credits: authUser.credits })
		.from(authUser)
		.where(eq(authUser.id, locals.user.id))
		.limit(1)

	return json({ credits: row?.credits ?? 0 })
}
