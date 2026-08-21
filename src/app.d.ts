import type { D1Database, DurableObjectNamespace, Fetcher, R2Bucket } from "@cloudflare/workers-types"
import type { SessionAuthObject } from "@clerk/backend"
import type { EmailBinding } from "$lib/server/email"
import type { createDb } from "$lib/server/db/client"

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        ASSETS: Fetcher
        PIPELINE_RUNNER: DurableObjectNamespace
        TERMINAL_REPORT_RUNNER: DurableObjectNamespace
        COMPANY_MONITOR: DurableObjectNamespace
        REALITY_RUNNER: DurableObjectNamespace
        EMAIL: EmailBinding
        SEC_R2: R2Bucket
        // Cloudflare exposes wrangler [vars] and secrets here too
        [key: string]: unknown
      }
    }
    interface Locals {
      // Clerk request auth (from @clerk/backend authenticateRequest().toAuth()).
      auth:    () => SessionAuthObject | null
      // Compat shim over Clerk while the app is migrated off better-auth's shapes.
      // `id` is the Clerk user id; `credits` is sourced from `profiles` in phase 5.
      user:    { id: string; emailVerified: boolean; credits?: number | null } | null
      session: { token: string } | null
      db:      ReturnType<typeof createDb>
    }
  }
}

export {}
