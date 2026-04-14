import { createAuthClient } from "better-auth/svelte"

export const authClient = createAuthClient()

// Exports used on auth pages:
// authClient.signIn.email({ email, password, callbackURL: "/dashboard" })
// authClient.signUp.email({ email, password, name, callbackURL: "/dashboard" })
// authClient.signOut()
// authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })
