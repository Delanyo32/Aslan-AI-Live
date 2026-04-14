import type { PageServerLoad } from "./$types"
import { creditTransactions } from "$lib/server/db/schema"
import { eq, desc } from "drizzle-orm"

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	const { db } = locals

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

	return { user, transactions }
}
