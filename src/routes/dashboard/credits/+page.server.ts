import type { PageServerLoad } from "./$types"
import { creditTransactions, profiles } from "$lib/server/db/schema"
import { eq, desc } from "drizzle-orm"

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	const { db } = locals

	const [balance] = await db
		.select({ credits: profiles.credits })
		.from(profiles)
		.where(eq(profiles.user_id, user.id))
		.limit(1)

	const transactions = await db
		.select({
			id:         creditTransactions.id,
			amount:     creditTransactions.amount,
			reason:     creditTransactions.reason,
			created_at: creditTransactions.created_at,
		})
		.from(creditTransactions)
		.where(eq(creditTransactions.user_id, user.id))
		.orderBy(desc(creditTransactions.created_at))
		.limit(20)

	return { user: { ...user, credits: balance?.credits ?? 0 }, transactions }
}
