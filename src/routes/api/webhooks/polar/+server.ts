import type { RequestHandler } from "./$types"
import { validateEvent } from "@polar-sh/sdk/webhooks"
import { env } from "$env/dynamic/private"
const { POLAR_WEBHOOK_SECRET } = env
import { authUser, creditTransactions } from "$lib/server/db/schema"
import { eq, sql } from "drizzle-orm"

export const POST: RequestHandler = async ({ request, locals }) => {
	const rawBody = await request.text()
	const headers = Object.fromEntries(request.headers.entries())

	let event: ReturnType<typeof validateEvent>
	try {
		event = validateEvent(rawBody, headers, POLAR_WEBHOOK_SECRET)
	} catch {
		return new Response("Invalid signature", { status: 400 })
	}

	const { db } = locals

	if (event.type === "order.created") {
		const { metadata } = event.data
		const userId  = metadata?.user_id as string
		const credits = parseInt(metadata?.credits as string, 10)
		const pack    = metadata?.pack as string

		if (userId && !isNaN(credits) && credits > 0) {
			await db
				.update(authUser)
				.set({ credits: sql`COALESCE(${authUser.credits}, 0) + ${credits}` })
				.where(eq(authUser.id, userId))

			await db.insert(creditTransactions).values({
				id:                crypto.randomUUID(),
				user_id:           userId,
				amount:            credits,
				reason:            `purchase_${pack}`,
				stripe_payment_id: event.data.id,
			})
		}
	}

	return new Response(null, { status: 200 })
}
