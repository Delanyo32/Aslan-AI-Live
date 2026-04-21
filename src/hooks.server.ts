import { createAuth } from "$lib/server/auth"
import { createDb } from "$lib/server/db/client"
import { svelteKitHandler } from "better-auth/svelte-kit"
import { building } from "$app/environment"
import type { Handle, HandleServerError } from "@sveltejs/kit"
import { redirect } from "@sveltejs/kit"
import { logger } from "$lib/server/logger"

// Re-export Durable Object classes so the adapter-cloudflare-generated worker
// entry exposes them at the top level. Cloudflare Pages wires the DO binding
// declared in wrangler.toml to the matching named export.
export { PipelineRunner } from "$lib/server/durable-objects/PipelineRunner"

export const handle: Handle = async ({ event, resolve }) => {
  const db   = createDb(event.platform!.env.DB)
  const auth = createAuth(db)
  event.locals.db = db

  // Let better-auth handle all /api/auth/* routes
  if (event.url.pathname.startsWith("/api/auth")) {
    return svelteKitHandler({ event, resolve, auth, building })
  }

  // Attach session to locals for all other routes
  const session = await auth.api.getSession({ headers: event.request.headers })
  event.locals.user    = session?.user    ?? null
  event.locals.session = session?.session ?? null

  // Guard dashboard routes
  if (event.url.pathname.startsWith("/dashboard") && !event.locals.user) {
    throw redirect(302, "/auth/login")
  }

  // Gate unverified email/password accounts out of the dashboard
  // Google OAuth users always arrive with emailVerified=true, so this only fires for
  // email/password registrations that haven't clicked their verification link yet.
  if (
    event.url.pathname.startsWith("/dashboard") &&
    event.locals.user &&
    event.locals.user.emailVerified === false
  ) {
    throw redirect(302, "/auth/check-email")
  }

  return resolve(event)
}

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logger.error('unhandled_server_error', {
    status,
    path: event.url.pathname,
    method: event.request.method,
    error: logger.serializeError(error),
  })
  return { message }
}
