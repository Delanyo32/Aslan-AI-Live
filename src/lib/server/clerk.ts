import { createClerkClient } from "@clerk/backend"

// Clerk backend client built from Cloudflare platform.env. Keys are read here (per
// call, not at module load) because $env/dynamic/* is empty at module-init under
// adapter-cloudflare. Shared by the hook, the account loader, and the webhook handler.
export function getClerk(env: App.Platform["env"]) {
  return createClerkClient({
    secretKey:      env.CLERK_SECRET_KEY as string,
    publishableKey: env.PUBLIC_CLERK_PUBLISHABLE_KEY as string,
  })
}
