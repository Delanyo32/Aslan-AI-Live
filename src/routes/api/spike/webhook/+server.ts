// SPIKE (throwaway): proves Clerk webhook verification bundles + runs on Workers.
// verifyWebhook takes a per-call signingSecret, so we feed it from platform.env
// (module-init env is empty under adapter-cloudflare). Uses standardwebhooks + WebCrypto.
//
// Live check: point a Clerk webhook endpoint at /api/spike/webhook and send a test event.
import { json } from "@sveltejs/kit"
import { verifyWebhook } from "@clerk/backend/webhooks"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request, platform }) => {
  const signingSecret = platform!.env.CLERK_WEBHOOK_SIGNING_SECRET as string | undefined
  if (!signingSecret) {
    return json({ ok: false, reason: "missing_signing_secret" }, { status: 500 })
  }

  try {
    const evt = await verifyWebhook(request, { signingSecret })
    // For a real handler this is where paymentAttempt.updated -> grant credits lives.
    return json({ ok: true, type: evt.type })
  } catch (err) {
    return json({ ok: false, reason: "verification_failed", message: String(err) }, { status: 400 })
  }
}
