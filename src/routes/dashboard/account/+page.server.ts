import type { PageServerLoad } from "./$types"
import { error } from "@sveltejs/kit"
import { getClerk } from "$lib/server/clerk"

// ponytail: interim Clerk-sourced loader — this whole page becomes Clerk's
// <UserProfile/> in phase 7, which renders name/email/password/sessions itself.
export const load: PageServerLoad = async ({ locals, platform }) => {
  const userId = locals.user!.id

  try {
    const clerk = getClerk(platform!.env)
    const [u, sessions] = await Promise.all([
      clerk.users.getUser(userId),
      clerk.sessions.getSessionList({ userId, status: "active" }),
    ])

    const email =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      ""
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ")

    return {
      user:            { id: userId, name, email },
      has_password:    u.passwordEnabled,
      active_sessions: sessions.data.length,
    }
  } catch (err) {
    console.error("[account load]", err)
    throw error(500, { message: "Failed to load account" })
  }
}
