import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { env as privateEnv } from "$env/dynamic/private"
import { env as publicEnv } from "$env/dynamic/public"

const {
  BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  RESEND_API_KEY
} = privateEnv
const PUBLIC_BASE_URL = publicEnv.PUBLIC_BASE_URL
import * as schema from "$lib/server/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import type { createDb } from "$lib/server/db/client"

export function createAuth(db: ReturnType<typeof createDb>) {
  return betterAuth({
    secret:  BETTER_AUTH_SECRET,
    baseURL: PUBLIC_BASE_URL,
    database: drizzleAdapter(db, {
      provider:  "sqlite",
      camelCase: true, // auth tables use camelCase column names (emailVerified, createdAt, etc.)
      schema: {
        user:         schema.authUser,
        session:      schema.authSession,
        account:      schema.authAccount,
        verification: schema.authVerification,
      }
    }),
    emailAndPassword: {
      enabled:           true,
      minPasswordLength: 8
    },
    emailVerification: {
      sendOnSignUp:                true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        try {
          const { Resend } = await import("resend")
          const resend = new Resend(RESEND_API_KEY)
          await resend.emails.send({
            from:    `noreply@${new URL(PUBLIC_BASE_URL).hostname}`,
            to:      user.email,
            subject: "Verify your Aslan Finance account",
            html: `<div style="font-family:'IBM Plex Sans',sans-serif;color:#f0ede8;background:#0a0a0a;padding:32px;">
                     <p style="margin:0 0 16px;font-size:15px;">
                       Click to verify your email address:
                     </p>
                     <p style="margin:0 0 16px;">
                       <a href="${url}" style="color:#f0ede8;">${url}</a>
                     </p>
                     <p style="margin:0;font-size:13px;color:#7a7672;">
                       Link expires in 24 hours.
                     </p>
                   </div>`
          })
        } catch (err) {
          console.error("[auth] Verification email failed:", err)
          // Do NOT throw — account creation must not be blocked by email failure
        }
      }
    },
    socialProviders: {
      ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET ? {
        google: {
          clientId:     GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET
        }
      } : {})
    },
    user: {
      additionalFields: {
        credits: {
          type:         "number",
          defaultValue: 20,
          required:     false
        }
      }
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Link any pre-auth reports (submitted before registration) to this user.
            await db
              .update(schema.backtestReports)
              .set({ user_id: user.id })
              .where(
                and(
                  eq(schema.backtestReports.email, user.email),
                  isNull(schema.backtestReports.user_id)
                )
              )
          }
        }
      }
    }
  })
}

export type Auth    = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]["session"]
export type User    = Auth["$Infer"]["Session"]["user"]
