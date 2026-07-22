import type { LayoutServerLoad } from "./$types"
import { buildClerkProps } from "svelte-clerk/server"

// Root SSR load: hand <ClerkProvider> its initial auth state + publishable key.
// The key is read from platform.env (reliable on Workers) and passed through page
// data rather than relying on $env/dynamic/public reaching the browser.
export const load: LayoutServerLoad = ({ locals, platform }) => {
  const auth = locals.auth()
  return {
    ...(auth ? buildClerkProps(auth) : {}),
    clerkPublishableKey: (platform?.env.PUBLIC_CLERK_PUBLISHABLE_KEY as string) ?? "",
  }
}
