import type { D1Database } from "@cloudflare/workers-types"
import type { User, Session } from "$lib/server/auth"
import type { createDb } from "$lib/server/db/client"

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database
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
