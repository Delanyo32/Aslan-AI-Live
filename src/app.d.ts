import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types"
import type { User, Session } from "$lib/server/auth"
import type { createDb } from "$lib/server/db/client"

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
        PIPELINE_RUNNER: DurableObjectNamespace
        TERMINAL_REPORT_RUNNER: DurableObjectNamespace
        COMPANY_MONITOR: DurableObjectNamespace
        // Cloudflare exposes wrangler [vars] and secrets here too
        [key: string]: unknown
      }
    }
    interface Locals {
      user:    User    | null
      session: Session | null
      db:      ReturnType<typeof createDb>
    }
  }
}

export {}
