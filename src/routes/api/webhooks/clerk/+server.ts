import { json } from "@sveltejs/kit"
import { verifyWebhook } from "@clerk/backend/webhooks"
import { profiles, backtestReports, creditTransactions } from "$lib/server/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import type { RequestHandler } from "./$types"

// Monthly credit allotment per Clerk plan slug. Credits RESET each billing cycle
// (unused credits expire) — the subscription model chosen for this migration.
// ponytail: reset-per-cycle (SET); for rollover, ADD with a cap instead.
const ALLOTMENT: Record<string, number> = { starter: 50, pro: 200, power: 600 }
const WELCOME_CREDITS = 20

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const signingSecret = platform!.env.CLERK_WEBHOOK_SIGNING_SECRET as string | undefined
  if (!signingSecret) return json({ error: "missing_signing_secret" }, { status: 500 })

  let evt: Awaited<ReturnType<typeof verifyWebhook>>
  try {
    evt = await verifyWebhook(request, { signingSecret })
  } catch {
    return new Response("invalid signature", { status: 400 })
  }

  const db = locals.db
  const type = evt.type as string
  // Billing event payloads aren't in @clerk/backend's WebhookEvent union — read loosely.
  const data = evt.data as any

  // New Clerk user → seed a profile (welcome credits) + adopt any pre-auth reports.
  // Replaces better-auth's databaseHooks.user.create.after.
  if (type === "user.created") {
    const userId: string = data.id
    const email: string | null =
      (data.email_addresses?.find((e: any) => e.id === data.primary_email_address_id) ??
        data.email_addresses?.[0])?.email_address ?? null

    await db
      .insert(profiles)
      .values({ user_id: userId, email, credits: WELCOME_CREDITS })
      .onConflictDoNothing()

    if (email) {
      await db
        .update(backtestReports)
        .set({ user_id: userId })
        .where(and(eq(backtestReports.email, email), isNull(backtestReports.user_id)))
    }
    return json({ ok: true })
  }

  // Successful subscription payment (initial checkout or renewal) → grant this cycle.
  if (type === "paymentAttempt.updated" && data.status === "paid") {
    const userId: string | undefined = data.payer?.user_id
    const item = data.subscription_items?.[0]
    const slug: string | undefined = item?.plan?.slug
    const paymentId: string = data.id
    const allotment = slug ? ALLOTMENT[slug] : undefined
    if (!userId || allotment === undefined) return json({ ok: true }) // not a credit plan

    // Idempotent: skip if this payment was already granted (webhook retries).
    const [seen] = await db
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(eq(creditTransactions.stripe_payment_id, paymentId))
      .limit(1)
    if (seen) return json({ ok: true, deduped: true })

    const periodEnd = typeof item?.period_end === "number" ? new Date(item.period_end * 1000) : null

    // Reset the balance to this cycle's allotment (upsert covers a payment that lands
    // before the user.created webhook did).
    await db
      .insert(profiles)
      .values({ user_id: userId, credits: allotment, plan: slug, period_end: periodEnd })
      .onConflictDoUpdate({
        target: profiles.user_id,
        set: { credits: allotment, plan: slug, period_end: periodEnd, updated_at: new Date() },
      })

    await db.insert(creditTransactions).values({
      id: crypto.randomUUID(),
      user_id: userId,
      amount: allotment,
      reason: `subscription_${slug}`,
      stripe_payment_id: paymentId,
    })
    return json({ ok: true })
  }

  // Subscription canceled → stop future grants; current balance stands until used.
  if (type === "subscriptionItem.canceled") {
    const userId: string | undefined = data.payer?.user_id
    if (userId) {
      await db
        .update(profiles)
        .set({ plan: null, period_end: null, updated_at: new Date() })
        .where(eq(profiles.user_id, userId))
    }
    return json({ ok: true })
  }

  return json({ ok: true }) // ack unhandled event types
}
