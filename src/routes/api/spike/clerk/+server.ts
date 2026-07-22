// SPIKE (throwaway): proves @clerk/backend session verification bundles + runs on
// Cloudflare Workers. Keys are read from platform.env PER REQUEST — the
// adapter-cloudflare-safe path. svelte-clerk's withClerkHandler can't take this path:
// it resolves SECRET_KEY at module-init from $env/dynamic/private, which is empty at
// module load under adapter-cloudflare (see src/lib/server/auth.ts for the same lesson).
//
// Live check once keys exist:  curl https://<host>/api/spike/clerk        -> {signedIn:false}
//                              curl -H "Cookie: __session=..." .../clerk   -> {signedIn:true,userId}
import { json } from "@sveltejs/kit"
import { createClerkClient } from "@clerk/backend"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ request, platform }) => {
  const env = platform!.env
  const secretKey      = env.CLERK_SECRET_KEY as string | undefined
  const publishableKey = env.PUBLIC_CLERK_PUBLISHABLE_KEY as string | undefined
  if (!secretKey || !publishableKey) {
    return json({ ok: false, reason: "missing_keys" }, { status: 500 })
  }

  const clerk = createClerkClient({ secretKey, publishableKey })
  const requestState = await clerk.authenticateRequest(request, { secretKey, publishableKey })
  const auth = requestState.toAuth()

  return json({
    ok:       true,
    status:   requestState.status,     // 'signed-in' | 'signed-out' | 'handshake'
    signedIn: !!auth?.userId,
    userId:   auth?.userId ?? null,
  })
}
