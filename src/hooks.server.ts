import { createDb } from "$lib/server/db/client"
import { createClerkClient } from "@clerk/backend"
import type { Handle, HandleServerError } from "@sveltejs/kit"
import { redirect } from "@sveltejs/kit"
import { logger } from "$lib/server/logger"

// Re-export Durable Object classes so the adapter-cloudflare-generated worker
// entry exposes them at the top level. Cloudflare wires the DO binding declared
// in wrangler.toml to the matching named export.
export { PipelineRunner } from "$lib/server/durable-objects/PipelineRunner"
export { TerminalReportRunner } from "$lib/server/durable-objects/TerminalReportRunner"
export { CompanyMonitor } from "$lib/server/durable-objects/CompanyMonitor"
export { RealityRunner } from "$lib/server/durable-objects/RealityRunner"

export const handle: Handle = async ({ event, resolve }) => {
  const env = event.platform!.env
  event.locals.db = createDb(env.DB)

  // IMPORTANT: read Clerk keys from platform.env PER REQUEST. Under adapter-cloudflare
  // $env/dynamic/* is empty at module load, so svelte-clerk's withClerkHandler (which
  // resolves keys at import time) can't be used here — we call @clerk/backend directly.
  const secretKey      = env.CLERK_SECRET_KEY as string | undefined
  const publishableKey = env.PUBLIC_CLERK_PUBLISHABLE_KEY as string | undefined

  if (!secretKey || !publishableKey) {
    logger.error("clerk_keys_missing", { path: event.url.pathname })
    event.locals.auth = () => null
    event.locals.user = null
    event.locals.session = null
  } else {
    const clerk = createClerkClient({ secretKey, publishableKey })
    const requestState = await clerk.authenticateRequest(event.request, { secretKey, publishableKey })

    // Handshake: Clerk needs a browser redirect to (re)issue the session cookie.
    // Returning its headers verbatim forwards both Location and Set-Cookie.
    if (requestState.headers.get("location")) {
      return new Response(null, { status: 307, headers: requestState.headers })
    }

    event.locals.auth = () => requestState.toAuth()
    const a = requestState.toAuth()
    // Clerk owns email verification — an email/password account has no active session
    // until it's verified, and Google arrives verified — so this is always true here.
    // ponytail: credits stays null until phase 5 moves the balance to `profiles`.
    event.locals.user    = a?.userId ? { id: a.userId, emailVerified: true, credits: null } : null
    event.locals.session = a?.sessionId ? { token: a.sessionId } : null
    // ponytail: non-handshake Set-Cookie forwarding is skipped — clerk-js sets the
    // session cookie client-side and the handshake branch above covers server refresh.
    // Mirror svelte-clerk's decorateHeaders if a cookie-refresh edge case surfaces.
  }

  // Guard dashboard routes
  if (event.url.pathname.startsWith("/dashboard") && !event.locals.user) {
    throw redirect(302, "/auth/login")
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
