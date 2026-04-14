# NewsTrader AI — Build Sequence Addendum (Steps 20–24)

> Paste these steps after Step 19 in `build_sequence_v2.md`.
> Each step follows the exact same format and conventions as the existing sequence.
>
> **Why these steps exist — gaps fixed:**
> - Step 20: `/dashboard/account` linked in top nav since Step 15, never built
> - Step 21: `"emailVerified"` column exists in 002_auth.sql; no step configures verification email or gate
> - Step 22: PRD §6.3 "low-confidence shown as a toggle" — LOW events currently discarded and not persisted
> - Step 23: PRD §5.4 "Re-run with adjusted parameters → 1 credit" tier — unimplemented
> - Step 24: `POST /api/reports/[slug]/delete` and `POST /api/reports/[slug]/visibility` referenced
>   by URL in Steps 15 and 17 respectively, but neither step creates the server files

---

## Step 20 — Account Settings Page

Build the `/dashboard/account` page that the top nav "Account" link has pointed to since Step 15. Covers profile editing, password change, session revocation, and account deletion — all inline, no modals.

> **Decision:** Account deletion is a soft-then-hard delete: first set all user's `backtest_reports.is_public = false`, then `DELETE FROM "user"` which cascades to `"session"`, `"account"`, and `"verification"` via the FK constraints in `002_auth.sql`. This preserves report rows for analytics while revoking all access.
>
> **Decision:** Password change calls `auth.api.changePassword()` from the server-side better-auth API, not the client SDK. The client POSTs `{ currentPassword, newPassword }` to a custom endpoint which proxies to the auth API. This avoids exposing the raw password change mechanism on the client.
>
> **Decision:** Google-only accounts (no credential row in `"account"` table) do not show the Password section. The server determines this and passes `has_password: boolean` to the page.

**Research first:**
Before writing any code for this step, read the following and confirm the answers:
- `better-auth` server API — confirm whether `auth.api.changePassword()` exists and its exact
  signature. If it does not exist, confirm the correct alternative (e.g., manually hashing
  with the same algorithm better-auth uses and calling `UPDATE "account" SET password = ...`).
- `better-auth` — confirm whether deleting the `"user"` row directly cascades correctly to
  `"session"`, `"account"`, `"verification"` given the FKs in `002_auth.sql`, or whether
  better-auth exposes a `auth.api.deleteUser()` method that should be used instead.

### Prompt

```
Build the account settings page. Auth required — hooks.server.ts already redirects
unauthenticated requests from /dashboard/* to /auth/login.

--- LOAD: src/routes/dashboard/account/+page.server.ts ---

Import { db } from "$lib/server/db/client" and { auth } from "$lib/server/auth".
Read event.locals.user (populated by hooks.server.ts).

Run two queries:
  const credentialRows = await db`
    SELECT COUNT(*) as count
    FROM "account"
    WHERE "userId" = ${event.locals.user.id}
      AND "providerId" = 'credential'
  `
  const sessionCount = await db`
    SELECT COUNT(*) as count
    FROM "session"
    WHERE "userId" = ${event.locals.user.id}
      AND "expiresAt" > NOW()
  `

Return:
  user:           event.locals.user       // { id, name, email, credits, emailVerified }
  has_password:   credentialRows[0].count > 0
  active_sessions: Number(sessionCount[0].count)

Wrap in try/catch. On DB error: return error(500, { message: "Failed to load account" }).

--- PAGE: src/routes/dashboard/account/+page.svelte ---

Use the same src/routes/dashboard/+layout.svelte as the dashboard (already wraps
all /dashboard/* routes with the top nav).

Use Svelte 5 runes syntax throughout ($state, $props, $derived).

Page structure — single column, max-width 720px, identical margin and font rules to the
report prose sections (Design.md §4 — 720px max for prose, 24px side padding).

Top of page:
  "← Back to dashboard" — IBM Plex Sans, --text-secondary, 13px, text link → /dashboard
  Spacing below: 32px

Page heading:
  "ACCOUNT SETTINGS" — IBM Plex Sans, 11px, uppercase, letter-spacing: 0.08em, --text-secondary

Sections are separated by 1px solid --bg-border dividers, matching report page convention.

--- SECTION 1: PROFILE ---

Section label: "PROFILE" — same uppercase 11px style.

Row — Display name:
  Left:  label "Display name" — IBM Plex Sans, --text-secondary, 13px
  Right: current value (data.user.name) — IBM Plex Sans, --text-primary, 15px

  let editing = $state(false)
  let nameValue = $state(data.user.name)
  let nameSaving = $state(false)
  let nameError = $state("")

  When editing = false: show value + "Edit" text link (--text-secondary, no underline,
    cursor pointer), inline at right. Click → editing = true.
  When editing = true: show <input> pre-filled with nameValue, IBM Plex Sans 15px,
    same textarea style as homepage (--bg-surface bg, 1px --bg-border border, 2px radius,
    focus border --text-secondary), width: 240px.
    + "Save" outlined button (same style as all buttons in app — no fill, 1px --bg-border,
      --text-primary, hover --bg-elevated).
    + "Cancel" text link (--text-secondary) → editing = false, nameValue resets.

  Save handler (async):
    nameSaving = true, nameError = ""
    Disable Save button, label → "Saving…"
    POST /api/account/update-name  { name: nameValue.trim() }
    On 200: editing = false, no page reload.
    On error: nameError = "Failed to save. Try again." — shown in --accent-loss below input.
    nameSaving = false.

Row — Email:
  Left:  "Email address" — --text-secondary, 13px
  Right: data.user.email — IBM Plex Mono, --text-primary, 13px
  No edit control. No footnote needed.

--- SECTION 2: PASSWORD (only if data.has_password === true) ---

Section label: "PASSWORD"

If data.has_password is false, this entire section is absent from the DOM.

Three <input> fields, stacked, each full width up to 320px:
  1. "Current password"   type="password", placeholder=""
  2. "New password"       type="password", placeholder="8 characters minimum"
  3. "Confirm password"   type="password"

All inputs: same style as all other inputs in the app (--bg-surface, 1px --bg-border,
  2px radius, IBM Plex Sans 15px, focus border --text-secondary).

"Change password →" outlined button below.

let pwSaving = $state(false)
let pwError  = $state("")
let pwSuccess = $state(false)

Client-side validation (before server call):
  - New password length < 8 → pwError = "New password must be at least 8 characters."
  - Confirm does not match → pwError = "Passwords do not match."
  Show error in --accent-loss, 13px, inline below the button. Do not call server.

On valid submit:
  pwSaving = true, pwError = ""
  Disable button, label → "Updating…"
  POST /api/account/change-password  { currentPassword, newPassword }
  On 200: pwSuccess = true, clear all three fields.
    Show "Password updated." in --text-secondary, 13px, inline below button.
    Hide after 4s ($effect with setTimeout, clear on component unmount).
  On 401 (wrong current password): pwError = "Current password is incorrect."
  On other error: pwError = "Something went wrong. Try again."
  pwSaving = false.

--- SECTION 3: SESSIONS ---

Section label: "SESSIONS"

Text: "You have {data.active_sessions} active session(s) across all devices."
IBM Plex Sans, --text-secondary, 13px.

"Sign out of all other devices →" outlined button.

let revokeConfirming = $state(false)
let revokeLoading    = $state(false)

When revokeConfirming = false: show the button as described.
When revokeConfirming = true (clicked): show inline below the button:
  "This will sign you out everywhere except this browser. Confirm?"
  [Yes, sign out] — outlined, --accent-loss border + text color
  [Cancel]        — text link, --text-secondary
  No modal. No backdrop. Inline only.
  (Design.md §1: "no modal overlays for these states")

On confirm:
  revokeLoading = true
  POST /api/account/revoke-sessions  (no body needed — server reads session from cookie)
  On 200: navigate to /auth/login (invalidates remaining sessions).
  On error: show "Failed to sign out. Try again." in --accent-loss, inline.

--- SECTION 4: DANGER ZONE ---

Section label: "DANGER ZONE" — IBM Plex Sans, 11px, uppercase, --accent-loss (not --text-secondary)
1px solid --accent-loss border-bottom below the label instead of the standard --bg-border.

"Delete account →" outlined button:
  border:  1px solid --accent-loss
  color:   --accent-loss
  background: transparent
  hover:   background: rgba(248, 113, 113, 0.06)  (very subtle tinted hover, no glow)

let deleteConfirming = $state(false)
let deleteLoading    = $state(false)
let deleteError      = $state("")

When deleteConfirming = false: show only the button.
When deleteConfirming = true: show inline below the button:
  "This permanently deletes your account, all saved backtests, and all report access.
   This cannot be undone."
   IBM Plex Sans, --text-secondary, 13px.
  [Delete my account] — outlined, --accent-loss border + text
  [Cancel]            — text link, --text-secondary

On confirm:
  deleteLoading = true, deleteError = ""
  POST /api/account/delete  (no body — server reads user from session)
  On 200: navigate to / (homepage).
  On error: deleteError = "Account deletion failed. Contact support if this persists."
    Show in --accent-loss, 13px, inline below the confirmation block.
    deleteLoading = false.

--- API ENDPOINTS ---

All four endpoints live in src/routes/api/account/.
All require authentication — if event.locals.user is null, return error(401, { error: "unauthenticated" }).
All log full errors server-side; return sanitised { error: string } to the client.

FILE: src/routes/api/account/update-name/+server.ts
  Input: { name: string }
  Validate: name must be a non-empty string, max 100 chars.
  UPDATE "user" SET "name" = $1, "updatedAt" = NOW() WHERE "id" = $2
  Return 200 { ok: true }.
  On invalid input: 400 { error: "invalid_name" }.

FILE: src/routes/api/account/change-password/+server.ts
  Input: { currentPassword: string, newPassword: string }
  Read the Research first block above before implementing this.
  Attempt the password change via the confirmed better-auth API method.
  On wrong current password: 401 { error: "wrong_password" }.
  On success: 200 { ok: true }.

FILE: src/routes/api/account/revoke-sessions/+server.ts
  Get current session token from the request headers (use auth.api.getSession()).
  DELETE FROM "session"
    WHERE "userId" = $1
      AND "token" != $2   -- keep the current session token so this request completes
  Return 200 { ok: true }.
  Note: the front end then navigates to /auth/login, which will clear the remaining cookie.

FILE: src/routes/api/account/delete/+server.ts
  Steps (in a transaction via postgres.js):
    1. UPDATE backtest_reports SET is_public = false WHERE user_id = $1
    2. DELETE FROM "user" WHERE "id" = $1
       (cascades to "session", "account", "verification" via FK)
  On success: 200 { ok: true }.
  On DB error: 500 { error: "delete_failed" }.

--- NAVIGATION WIRING ---

This page is reached from:
  Dashboard top nav "Account" text link → /dashboard/account  (wired in Step 15 layout)
  No change needed to the nav — the link already exists.

This page links to:
  "← Back to dashboard" → /dashboard
  After session revoke  → /auth/login
  After account delete  → / (homepage)

Do not add any other navigation. The dashboard layout's top nav and credit display
carry over from +layout.svelte — no duplicate nav needed here.

--- DO NOT BUILD ---
  - Email address change (V2)
  - Two-factor authentication (V2)
  - API key generation (V2)
  - Notification preferences (V2)
```

### Definition of Done
- [ ] Navigating to `/dashboard/account` without auth redirects to `/auth/login` (hooks already handle this — verify it applies to this new route)
- [ ] "← Back to dashboard" text link is present at the top and navigates to `/dashboard` — confirm in browser address bar
- [ ] Display name edit: clicking "Edit" shows the inline input pre-filled with the current name; clicking "Cancel" restores the original value without a server call
- [ ] Display name save: button shows "Saving…" and is disabled while in-flight; on success the new name appears inline without a page reload; verify with `SELECT "name" FROM "user" WHERE id = ...` in psql
- [ ] Email address row is display-only — no edit control present in the DOM
- [ ] Password section absent for Google-OAuth-only accounts — confirm by logging in with Google and inspecting the page
- [ ] Password change: client-side validation fires before any server call (test with mismatched passwords — no network request in DevTools)
- [ ] Password change: wrong current password returns inline "Current password is incorrect." — no alert, no blank screen
- [ ] "Sign out of all other devices" shows inline confirmation; "Cancel" dismisses it without any server call
- [ ] "Delete account" shows inline danger confirmation; "Cancel" dismisses; "Delete my account" calls the endpoint and navigates to `/`
- [ ] After deletion: `SELECT * FROM "user" WHERE id = ...` in psql returns zero rows; all session rows for that user are also gone (cascade confirmed)
- [ ] After deletion: old session cookie no longer authenticates — copy cookie, open new tab, visit `/dashboard`, confirm redirect to `/auth/login`
- [ ] All buttons are disabled and relabelled while their request is in-flight — no double-submit possible
- [ ] No stack traces or SQL errors appear in any API response body — all errors are `{ error: "..." }` strings

Error path checks:
- [ ] Disable the network (DevTools offline) and click "Save" on display name — confirm "Failed to save. Try again." appears inline, not a blank screen
- [ ] POST `/api/account/update-name` with `{ name: "" }` (empty string) via curl — confirm 400 `{ error: "invalid_name" }`, not 500
- [ ] POST `/api/account/delete` without a session cookie — confirm 401, not 500 or redirect

Navigation checks:
- [ ] "← Back to dashboard" → `/dashboard` — confirm address bar
- [ ] After "Sign out of all devices" → `/auth/login` — confirm address bar
- [ ] After "Delete my account" → `/` (homepage) — confirm address bar

### Demo inputs

| Input | Value |
|-------|-------|
| New display name | `Dela Osei` |
| Current password (change test) | `testpassword123` |
| New password | `newpassword456` |
| Confirm password | `newpassword456` |

Prerequisites: Dev user must exist — run `bun run db:seed` first. Log in at `/auth/login`
with `dev@test.com` / `testpassword123` before visiting `/dashboard/account`.

### Smoke test

1. Log in at `/auth/login` as `dev@test.com`. Click "Account" in the top-right nav.
   You should see the Account Settings page with your display name and email shown.
2. Click "Edit" next to Display name. An input field should appear pre-filled with your name.
   Change it to `Dela Osei`. Click "Save". The button shows "Saving…" briefly, then
   "Dela Osei" appears inline. No page reload.
3. Scroll to Password. Enter current = `testpassword123`, new = `newpassword456`,
   confirm = `newpassword456`. Click "Change password →". You should see "Password updated."
4. Click "Sign out of all other devices →". An inline confirmation appears.
   Click "Cancel". The confirmation disappears. Nothing else changes.
5. Scroll to Danger Zone. Click "Delete account →". The inline warning appears.
   Click "Cancel". The warning disappears.

Error scenario: In the Password section, enter current = `wrongpassword`, new = `abc123abc`,
confirm = `abc123abc`. Click "Change password →". You should see "Current password is
incorrect." inline below the button — not an alert, not a blank page.

---

## Step 21 — Email Verification Flow

Configure better-auth's email verification, gate unverified users from the dashboard, and build the post-registration and check-email pages. Google OAuth users are exempt.

> **Decision:** Unverified email/password users who attempt to access any `/dashboard/*`
> route are redirected to `/auth/check-email` — not to `/auth/login`. This preserves the
> context that they have an account; they just haven't verified it yet.
>
> **Decision:** Verification email failure (e.g. Resend throws) must not block account
> creation. The `sendVerificationEmail` callback logs the error server-side and returns
> without throwing, so the `"user"` row is always created regardless of email delivery.
>
> **Decision:** Read the better-auth docs for `emailVerification` before implementing —
> the exact config shape (`plugins: [emailVerification(...)]` vs a top-level key) must
> match the installed version. The Research first block below lists the exact questions.

**Research first:**
Before writing any code for this step, read the following and confirm the answers:
- `better-auth` docs for email verification — is it `plugins: [emailVerification({ ... })]`
  or a top-level `emailVerification: { ... }` option on `betterAuth()`? Confirm for the
  installed version.
- What is the exact `sendVerificationEmail` callback signature? Does it receive
  `{ user, url, token }` or `{ email, url }` or something else?
- Does better-auth automatically handle the verification callback at `/api/auth/verify-email`
  once the feature is enabled, or must a route be created manually? Confirm by checking
  whether the hooks.server.ts `svelteKitHandler` covers it automatically.
- Does `authClient.sendVerificationEmail({ email })` exist on the client SDK, and what
  does it return on success/failure?

### Prompt

```
Add email verification to the auth layer built in Step 14.
Resend client is already set up (Step 13). No new packages.

--- UPDATED AUTH CONFIG: src/lib/server/auth.ts ---

Read the Research first block above before making any changes here.

Add email verification to the betterAuth() config. The exact config key depends on the
version — confirm from the docs. The callback must:

  sendVerificationEmail: async ({ user, url, token }) => {
    // NOTE: signature may differ — confirm in Research first
    try {
      const resend = new Resend(RESEND_API_KEY)
      await resend.emails.send({
        from:    `noreply@${new URL(PUBLIC_BASE_URL).hostname}`,
        to:      user.email,
        subject: "Verify your NewsTrader AI account",
        html: `
          <div style="font-family: 'IBM Plex Sans', sans-serif; color: #f0ede8;
                      background: #0a0a0a; padding: 32px;">
            <p style="margin: 0 0 16px; font-size: 15px;">
              Click the link below to verify your email address:
            </p>
            <p style="margin: 0 0 16px;">
              <a href="${url}" style="color: #f0ede8;">${url}</a>
            </p>
            <p style="margin: 0; font-size: 13px; color: #7a7672;">
              This link expires in 24 hours. If you did not create a NewsTrader AI account,
              ignore this email.
            </p>
          </div>
        `
      })
    } catch (err) {
      // Fire-and-forget: log but do not throw — account creation must not be blocked
      console.error("[auth] Verification email send failed:", err)
    }
  }

--- HOOKS UPDATE: src/hooks.server.ts ---

After the session is loaded and event.locals.user is set, add an unverified-user gate:

  // After: event.locals.user = session?.user ?? null
  // Add:
  const isProtectedRoute = event.url.pathname.startsWith("/dashboard")
  const isAuthRoute      = event.url.pathname.startsWith("/auth")
  const user             = event.locals.user

  if (
    isProtectedRoute &&
    user &&
    user.emailVerified === false
  ) {
    // Google OAuth users always have emailVerified = true — this only fires for
    // email/password accounts that haven't clicked the verification link yet.
    throw redirect(302, "/auth/check-email")
  }

The existing redirect from /dashboard to /auth/login for unauthenticated users
remains in place above this new block — order matters.

--- POST-REGISTRATION UX: src/routes/auth/register/+page.svelte ---

Currently redirects to /dashboard on success. Replace that with:

  let registered = $state(false)
  let registeredEmail = $state("")

  On signUp.email() success:
    registered = true
    registeredEmail = submittedEmail
    // Do NOT navigate — show the check-your-inbox state in-place

  When registered = true, replace the form with:
    (IBM Plex Sans, --text-primary, 15px, centered within the same form container)

    Heading (uppercase label style):
      "CHECK YOUR INBOX" — 11px, uppercase, letter-spacing 0.08em, --text-secondary

    Body:
      "We've sent a verification link to {registeredEmail}."
      IBM Plex Sans, --text-secondary, 15px.

    "Resend verification →" outlined button (same style as all app buttons).
    Let resendLoading = $state(false), resendSent = $state(false).

    On click:
      resendLoading = true
      Call authClient.sendVerificationEmail({ email: registeredEmail })
        (confirm method name in Research first)
      resendSent = true, resendLoading = false
      Button text changes to "Sent ✓" — stays that way (no revert)

    "← Back to login" text link, --text-secondary → /auth/login

    No redirect. No auto-navigation. User must click the email link.

--- NEW PAGE: src/routes/auth/check-email/+page.svelte ---

This page is shown when an authenticated-but-unverified user tries to reach /dashboard.
It has NO server load function — it reads the user from a client-side auth call.

Layout: same centered single-column as the homepage (upper-third of viewport).
No dashboard nav — this is a pre-auth gate page.
Logo wordmark top-left: "NewsTrader AI" — IBM Plex Sans, --text-primary.

Content (top to bottom):

  Label: "VERIFY YOUR EMAIL"
  IBM Plex Sans, 11px, uppercase, letter-spacing 0.08em, --text-secondary

  Body:
    "Before accessing your dashboard, please verify your email address."
    IBM Plex Sans, --text-secondary, 15px.

  let resendLoading = $state(false)
  let resendSent    = $state(false)
  let userEmail     = $state("")

  On mount ($effect): call authClient.getSession() to get the current user's email.
    userEmail = session?.user?.email ?? ""

  If userEmail:
    "We sent a verification link to {userEmail}."
    IBM Plex Sans, --text-secondary, 13px.

  "Resend verification email →" outlined button.
  On click: resendLoading = true, call authClient.sendVerificationEmail({ email: userEmail })
    On success: resendSent = true, button → "Email sent ✓" (no revert)
    On error: inline --accent-loss text "Failed to send. Try again."
    resendLoading = false.

  "Sign out →" text link, --text-secondary, 13px.
  On click: call authClient.signOut() → navigate to /auth/login.

--- VERIFICATION CALLBACK ---

If the Research first step confirms better-auth handles /api/auth/verify-email
automatically (most likely): no new route needed. The existing hooks.server.ts
`svelteKitHandler` proxy covers it.

If a manual route IS required: create
  src/routes/auth/verify-email/+page.server.ts
  Read token from url.searchParams.get("token").
  If no token: redirect to /auth/login.
  Call the confirmed better-auth server API to verify the token.
  On success: redirect to /dashboard.
  On error: return { error: "Invalid or expired verification link." }
  And create src/routes/auth/verify-email/+page.svelte to display the error if present.

--- NAVIGATION WIRING ---

New routes and their inbound/outbound links:

  /auth/register (updated):
    After success → stays on /auth/register (shows check-inbox state)
    "← Back to login" → /auth/login

  /auth/check-email (new):
    Reached from: hooks.server.ts redirect when user.emailVerified === false
    "Sign out →" → /auth/login
    Verification link in email → /api/auth/verify-email?token=... → /dashboard

  /api/auth/verify-email (better-auth automatic or manual):
    On success → /dashboard
    On error   → /auth/verify-email error page (if manual route needed)

--- DO NOT BUILD ---
  - Email change with re-verification (V2)
  - Phone verification (V2)
  - "Magic link" login (V2)
  - Force-verification of existing pre-migration users (run a one-off script separately)
```

### Definition of Done
- [ ] Registering a new email/password account at `/auth/register` shows "CHECK YOUR INBOX" in-place — browser does NOT navigate to `/dashboard`
- [ ] A verification email arrives at the registered address via Resend — confirm in inbox; confirm Resend dashboard logs a successful send
- [ ] Clicking the link in the email sets `"emailVerified" = true` in psql: `SELECT "emailVerified" FROM "user" WHERE email = '...'`
- [ ] After clicking the verification link the browser lands on `/dashboard` — confirm address bar
- [ ] An unverified user who navigates directly to `/dashboard` is redirected to `/auth/check-email`, not `/auth/login` — confirm with a fresh unverified account
- [ ] `/auth/check-email` displays the user's email address and a working "Resend" button
- [ ] Google OAuth users are never sent to `/auth/check-email` — they reach `/dashboard` directly on first login
- [ ] "Sign out →" on `/auth/check-email` calls `authClient.signOut()` and redirects to `/auth/login`
- [ ] Resend failure (temporarily set `RESEND_API_KEY=invalid`) does not block account creation — `"user"` row exists in psql, register flow still shows the check-inbox state

Error path checks:
- [ ] Deliberately visit the verification URL with a tampered token (`?token=badtoken`) — confirm the user sees a human-readable error message, not a 500 or blank page
- [ ] Deliberately set `RESEND_API_KEY=invalid`, register a new account — confirm the `"user"` row is created in psql, the error is logged server-side, and the register page shows the check-inbox message (not an error page)
- [ ] Click "Resend verification email →" on `/auth/check-email` with no network (DevTools offline) — confirm an inline error appears, not a blank screen

Navigation checks:
- [ ] "← Back to login" on `/auth/register` post-success state → `/auth/login` — confirm address bar
- [ ] "Sign out →" on `/auth/check-email` → `/auth/login` — confirm address bar
- [ ] Verification link email → `/dashboard` — confirm address bar

### Demo inputs

| Input | Value |
|-------|-------|
| Registration email | `verifytest@example.com` |
| Registration password | `testpassword123` |
| Display name | `Verify Test` |

Prerequisites: No existing account with `verifytest@example.com`. Run
`DELETE FROM "user" WHERE email = 'verifytest@example.com'` in psql if needed.
`RESEND_API_KEY` must be a valid key with a verified sending domain.

### Smoke test

1. Open `/auth/register`. Fill in name, email, password. Click "Register".
   The form is replaced with "CHECK YOUR INBOX — We've sent a verification link to verifytest@example.com."
2. Open your inbox. The email from `noreply@<your domain>` should be there. Click the verification link.
   You should land on `/dashboard`.
3. In psql: `SELECT "emailVerified" FROM "user" WHERE email = 'verifytest@example.com'` → `true`.
4. Sign out. Sign back in with the same credentials. You should reach `/dashboard` directly.
5. Create a second test account but do NOT click the verification link. Navigate to `/dashboard`.
   You should be redirected to `/auth/check-email`.

Error scenario: While on `/auth/check-email`, click "Sign out →". You should be redirected
to `/auth/login` immediately — not a blank screen, not an error page.

---

## Step 22 — Low-Confidence Events: Pipeline Storage & Report Toggle

Store LOW-confidence events separately in the pipeline (they are already found but currently discarded), persist them in a new `low_confidence_events` column, and add a client-side toggle to the report page. PRD §6.3: "low-confidence shown as a toggle."

> **Decision:** LOW events are never simulated — they do not affect trade count, P&L,
> credits, or any summary metric. They are stored as a disclosure artefact only. The
> toggle is purely client-side ($state); no server call is made when the user toggles it.
>
> **Decision:** A new `003_low_confidence_events.sql` migration adds the column rather
> than modifying the existing migration files. Run migrations in order: 001 → 002 → 003.
>
> **Decision:** LOW events that have no `tickers_mentioned` (all tokens were blocklisted
> or appeared in only one event) still appear in the toggle disclosure. Their disclosure
> value is the event description and source, not the ticker list.

### Prompt

```
Three areas change: the event detection service, the pipeline persistence, and the
report page. No UI framework changes — Svelte 5 throughout.

--- MIGRATION: src/lib/server/db/migrations/003_low_confidence_events.sql ---

ALTER TABLE backtest_reports
  ADD COLUMN IF NOT EXISTS low_confidence_events JSONB NOT NULL DEFAULT '[]'::jsonb;

Run with: bun run db:migrate
Safe to run on a live DB — the IF NOT EXISTS guard and DEFAULT '[]' ensure
existing rows are unaffected.

--- UPDATE: src/lib/server/exa-events.ts ---

The deduplicateEvents function currently returns RawExaEvent[] (all confidence levels mixed).
Split the return so confirmed and low-confidence events are separated.

Update the function signature:

  function deduplicateEvents(events: RawExaEvent[]): {
    confirmed:       RawExaEvent[]   // confidence "HIGH" or "MEDIUM"
    low_confidence:  RawExaEvent[]   // confidence "LOW"
  }

Implementation: after the existing deduplication clustering, split the final deduped array:
  const confirmed      = deduped.filter(e => e.confidence !== "LOW")
  const low_confidence = deduped.filter(e => e.confidence === "LOW")
  return { confirmed, low_confidence }

rankTickers is called only with confirmed — no change to that function.

Update the return type of POST /api/pipeline/detect-events to include both:
  {
    raw_events:           RawExaEvent[]   // confirmed only (renamed from raw_events)
    low_confidence_events: RawExaEvent[]  // new
    ranked_tickers:       RankedTicker[]
    total_found:          number
    high_confidence:      number
    medium_confidence:    number
    low_confidence:       number
  }

Also add to src/lib/types/pipeline.ts:
  Update BacktestReportRow to include:
    low_confidence_events: RawExaEvent[]

--- UPDATE: GET /api/pipeline/run — src/routes/api/pipeline/run/+server.ts ---

Stage 2 currently calls deduplicateEvents and uses the result directly.
Update to destructure the new return shape:

  const { confirmed, low_confidence } = deduplicateEvents([...primary, ...supplementary])
  const ranked_tickers = rankTickers(confirmed)

  // low_confidence_events is thread-forwarded to createReport — not emitted via SSE.
  // The existing "low_confidence" SSE event (for 1–2 confirmed events) is UNCHANGED.

Pass low_confidence to the createReport() call at the end of Stage 4:
  await createReport({
    ...existingFields,
    low_confidence_events: low_confidence   // new field
  })

--- UPDATE: src/lib/server/db/reports.ts ---

Update the createReport function to accept and INSERT low_confidence_events:

  // In the INSERT query, add:
  low_confidence_events = ${JSON.stringify(data.low_confidence_events ?? [])}

Update getReportBySlug to SELECT the new column.

--- UPDATE: src/routes/backtest/[id]/+page.server.ts ---

Pass low_confidence_events from the loaded report to the page data:
  return {
    report,
    low_confidence_events: report.low_confidence_events ?? []
  }

--- UPDATE: src/routes/backtest/[id]/+page.svelte ---

Add to the page's $props() (or data destructuring):
  let { report, low_confidence_events } = $props()

In SECTION ④ (Historical Occurrences), between the section label and the first
occurrence block, add the toggle control — only when low_confidence_events.length > 0.

let showLow = $state(false)

Toggle control (Design.md §11 "Coming Soon" badge pattern — no filled background):
  When showLow = false:
    "<n> low-confidence event(s) excluded — Show →"
    IBM Plex Sans, 13px, --text-secondary
    Border: 1px solid --bg-border
    Background: transparent
    Padding: 4px 10px (inline, compact)
    Cursor: pointer
    Hover: color --text-primary, border-color --text-secondary
    Transition: color 100ms

  When showLow = true:
    "← Hide low-confidence events"
    Border: 1px solid --accent-amber
    Color: --accent-amber
    Hover: opacity 0.8

The toggle is a <button> element styled as above — not a checkbox, not a pill switch.

When showLow = true, render low-confidence event rows interleaved with confirmed events
in chronological order by event_date.

Each low-confidence row structure (same outer container as a confirmed occurrence):
  Row header:
    Event date — IBM Plex Mono, --text-secondary, 13px
    Confidence badge: "LOW"
      11px uppercase, color: --text-muted, border: 1px solid --bg-border, no background
    Disclosure label (immediately after badge, inline):
      "excluded from simulation"
      IBM Plex Sans, 11px, --text-muted

  Description: 1px --bg-border left-border block, IBM Plex Sans, 15px, --text-secondary
    (same style as confirmed occurrence descriptions)

  Sources (if any): same format as confirmed occurrences — "Publication · Headline · ↗ URL"

  NO per-ticker subsections. NO chart placeholders. NO trade detail rows.
  The section ends after sources.

  A 1px --bg-border horizontal rule separates this row from the next (same as confirmed).

--- NAVIGATION ---

No new routes. The toggle lives entirely within /backtest/[id].
Toggle state is NOT in the URL — refreshing the page resets it to hidden.

--- DO NOT BUILD ---
  - Simulating low-confidence events (out of scope for V1)
  - Storing low-confidence events in the SSE stream
  - Any credit cost change — LOW events do not affect cost
  - Filtering low-confidence events out of the confirmed set (they are already filtered)
```

### Definition of Done
- [ ] Migration `003_low_confidence_events.sql` runs without errors on a DB that already has rows — verify with `SELECT COUNT(*) FROM backtest_reports` before and after (count unchanged)
- [ ] `low_confidence_events` column exists: `\d backtest_reports` in psql shows the new column with default `[]`
- [ ] Running the chip-restrictions demo query produces a report; `SELECT low_confidence_events FROM backtest_reports ORDER BY created_at DESC LIMIT 1` in psql returns a JSON array (may be empty — depends on Exa results; at least zero rows, not null)
- [ ] If `low_confidence_events` contains entries: the toggle control appears below the "HISTORICAL OCCURRENCES" label on the report page
- [ ] Clicking the toggle shows low-confidence rows interleaved by date with confirmed events; each has the "LOW / excluded from simulation" badge and no trade/chart content
- [ ] Clicking "← Hide" removes the rows — no network call (verify via DevTools Network tab: no requests fire on toggle)
- [ ] If a report has zero low-confidence events: the toggle is completely absent from the DOM
- [ ] `rankTickers` still runs only on confirmed events — confirmed event count and simulation results are identical to before this step
- [ ] `BacktestReportRow` type in `pipeline.ts` includes `low_confidence_events: RawExaEvent[]`

Error path checks:
- [ ] Set `low_confidence_events = null` for an existing report row in psql; reload the report — confirm page renders normally with no toggle and no JavaScript error
- [ ] Run `003_low_confidence_events.sql` twice — confirm the `IF NOT EXISTS` guard prevents an error on the second run
- [ ] Pass an empty `low_confidence_events: []` to `createReport()` — confirm the column stores `[]`, not `null` or a PostgreSQL error

Navigation checks:
- [ ] Toggle state resets to hidden on page refresh — confirm by toggling on, pressing F5, confirming toggle is back to "Show →"

### Demo inputs

| Input | Value |
|-------|-------|
| Backtest query | `Buy Nvidia every time the US announces new AI chip restrictions on China` |
| Expected confirmed events | ≥ 4 (HIGH or MEDIUM confidence) |
| Expected low-confidence events | 0 or more (depends on Exa results; column will be `[]` if none) |

Prerequisites: Steps 9 and 10 must be complete. Run the migration before testing:
`bun run db:migrate`. Then run the full pipeline once and check the DB.

### Smoke test

1. Run a full backtest with the chip-restrictions query and navigate to the report.
2. Scroll to "HISTORICAL OCCURRENCES". If Exa returned any LOW-confidence events,
   you should see a compact button: "N low-confidence event(s) excluded — Show →".
3. Click it. Low-confidence rows should appear between confirmed events in date order.
   Each shows a date, "LOW" badge, "excluded from simulation" label, description, and sources.
   No charts, no trade rows.
4. Click "← Hide low-confidence events". The rows disappear. Open DevTools Network tab —
   no requests should have fired during steps 3 and 4.
5. Refresh the page. The toggle should be back to the "Show →" state.

Error scenario: In psql, set `low_confidence_events = null` for the report you just ran.
Refresh the report page. You should see no toggle and no JavaScript error — the page
renders all confirmed events normally.

---

## Step 23 — Re-Run with Adjusted Parameters

Add a "Re-run →" CTA to completed report pages, pre-fill `/backtest/new` from URL params, and apply the PRD §5.4 flat 1-credit cost when `is_rerun` is set. Authenticated users only.

> **Decision:** A re-run is a full new pipeline execution — it does not skip any stage.
> The "adjusted parameters" in the credit tier name refers to the user being able to
> change the query, tickers, or entry/exit rule before re-submitting. No special
> fast-path exists. The 1-credit flat cost is the only difference from a new backtest.
>
> **Decision:** The re-run CTA is shown only to authenticated users with ≥ 1 credit.
> Unauthenticated visitors and users with 0 credits see different states (see below).
> The CTA is in Section ②  (Query & Parameters) — the logical location since re-running
> is a parameter-level action, not a share or social action.

### Prompt

```
Update three files: the pipeline run endpoint (credit formula), the report page
(re-run CTA), and the backtest new page (pre-fill from URL params). No new routes.

--- UPDATE: GET /api/pipeline/run — src/routes/api/pipeline/run/+server.ts ---

Add is_rerun and source_report_slug to the pipeline params type:

  type PipelineParams = {
    query:             string
    session_id:        string
    starting_capital:  number
    date_from?:        string
    date_to?:          string
    is_rerun?:         boolean   // NEW
    source_report_slug?: string  // NEW — slug of the report being re-run
  }

Update the credit cost formula in Stage 4 (credit deduction block):

  // BEFORE Stage 4 credit deduction (existing formula):
  let cost: number
  const tickerCount = confirmed_tickers.length
  const eventCount  = occurrences.length

  if (params.is_rerun === true) {
    cost = 1   // PRD §5.4 — flat 1 credit for any re-run
  } else if (tickerCount >= 6) {
    cost = 5
  } else if (tickerCount >= 2) {
    cost = 3
  } else if (eventCount > 5) {
    cost = 2
  } else {
    cost = 1
  }

In the credit_transactions INSERT after a successful re-run, set:
  reason:     'rerun'
  backtest_id: the newly created report's ID (not source_report_slug — that is the
               old report; this field stores the current transaction's report)

No other changes to Stage 4 — all stages run identically.

--- UPDATE: src/routes/backtest/[id]/+page.svelte ---

Re-run CTA lives in SECTION ② (Query & Parameters), directly below the parameters list.
It is already loaded by +page.server.ts which has access to event.locals.user.

Pass from +page.server.ts:
  userCredits: event.locals.user?.credits ?? null   // null = unauthenticated
  (Add this field to the existing load function return — no new load file needed)

In the page, derive the CTA state:

  const rerunUrl = $derived(
    `/backtest/new?rerun=${report.slug}&query=${encodeURIComponent(report.query)}`
  )

CTA rendering (shown only in full-report state, not teaser):

  CASE 1 — userCredits is null (unauthenticated):
    No re-run UI. Nothing rendered. Do not explain why — just omit it.

  CASE 2 — userCredits === 0:
    "Re-run requires 1 credit."
    [Buy credits →] — text link → /dashboard/credits
    IBM Plex Sans, 13px, --accent-amber (warning color — not an error)
    No outlined button — just inline text + link.

  CASE 3 — userCredits >= 1:
    "Re-run with adjusted parameters →" — text link (no button)
    IBM Plex Sans, 13px, --text-secondary
    No underline by default; underline on hover.
    href: rerunUrl (client-side navigation via <a> — no JS needed)
    (1 credit will be shown on the destination page, not here)

All three cases appear in exactly the same DOM position — a single <div> below the
parameters list. The div has a top margin of 16px and no border.

--- UPDATE: src/routes/backtest/new/+page.svelte ---

On mount, read URL search params via $page (import from "$app/stores" or "$app/state"
depending on SvelteKit 5 convention — confirm which is current):

  import { page } from "$app/stores"

  // In an $effect or directly in script:
  const rerunSlug  = $derived($page.url.searchParams.get("rerun"))
  const queryParam = $derived($page.url.searchParams.get("query"))

If queryParam is present:
  1. Pre-fill the textarea with decodeURIComponent(queryParam).
     (The textarea value is already managed by $state in BacktestInput — set it there.)

  2. Show an amber notice ABOVE the textarea (not the market selector):
     "Re-running — 1 credit will be deducted regardless of result size."
     IBM Plex Sans, 13px, color: --accent-amber
     Left-border style: border-left: 3px solid --accent-amber, padding: 8px 12px,
     background: transparent. Same inline notice pattern used elsewhere in the app.
     Margin-bottom: 16px (between notice and textarea).

  3. Pass is_rerun: true and source_report_slug: rerunSlug to the pipeline params
     when the backtest is submitted. Add these to the params object that gets
     URL-encoded and passed to GET /api/pipeline/run.

If queryParam is absent (normal new backtest): no notice, no pre-fill, no is_rerun flag.
The state machine and clarifying questions flow are identical to a normal backtest.

--- NAVIGATION WIRING ---

No new routes. Links involved:

  Report page Section ②:
    "Re-run with adjusted parameters →" → /backtest/new?rerun={slug}&query={encoded}

  Report page Section ② (0-credit state):
    "Buy credits →" → /dashboard/credits

  /backtest/new with ?rerun and ?query params:
    Flows identically to /backtest/new without params — same state machine,
    same clarifying questions, same navigation to the result report.
    The only differences are: pre-filled textarea, amber notice, is_rerun=true in params.

--- DO NOT BUILD ---
  - Skip clarifying questions for re-runs (full flow is always shown)
  - Pre-filling tickers or entry/exit rule from the source report (V2)
  - Re-run for unauthenticated users
  - A dedicated re-run endpoint — the existing pipeline/run handles it via is_rerun flag
```

### Definition of Done
- [ ] An authenticated user with ≥ 1 credit sees "Re-run with adjusted parameters →" as a text link in Section ② of the report — confirm in browser
- [ ] An authenticated user with 0 credits sees "Re-run requires 1 credit. Buy credits →" in the same position — confirm by temporarily setting `credits = 0` in psql
- [ ] An unauthenticated visitor sees nothing in that DOM position — confirm by opening the report in a private window
- [ ] "Re-run →" link navigates to `/backtest/new?rerun=...&query=...` — confirm address bar
- [ ] At `/backtest/new` with re-run params: textarea is pre-filled with the original query and the amber notice is visible above it
- [ ] Completing the re-run pipeline deducts exactly 1 credit regardless of ticker or event count — verify in psql: `SELECT credits FROM "user"` before and after
- [ ] `credit_transactions` row has `reason = 'rerun'` and `amount = -1` — verify in psql: `SELECT reason, amount FROM credit_transactions ORDER BY created_at DESC LIMIT 1`
- [ ] "Buy credits →" (0-credit state) navigates to `/dashboard/credits` — confirm address bar

Error path checks:
- [ ] Manually pass `is_rerun=true` in the SSE URL params while the user has 0 credits — confirm the pipeline emits `insufficient_credits` error, the UI shows the actionable error state, and credits do not go negative (check psql)
- [ ] Pass a non-existent `source_report_slug=doesnotexist` — confirm the pipeline still runs to completion; `credit_transactions.backtest_id` references the new report correctly

Navigation checks:
- [ ] "Re-run →" → `/backtest/new?rerun={slug}&query={encoded}` — confirm full URL in address bar
- [ ] After re-run completes → new report at its own slug (not the original) — confirm address bar
- [ ] "Buy credits →" → `/dashboard/credits` — confirm address bar

### Demo inputs

| Input | Value |
|-------|-------|
| Source report slug | (any completed report — `SELECT slug FROM backtest_reports LIMIT 1` in psql) |
| URL to test | `/backtest/new?rerun={slug}&query=Buy%20Nvidia%20every%20time%20the%20US%20announces%20new%20AI%20chip%20restrictions%20on%20China` |
| User credits (before) | 3 |
| Expected credits (after) | 2 |

Prerequisites: Dev user must be logged in and have ≥ 1 credit. At least one completed
report must exist — run the demo query from Step 10 if needed.

### Smoke test

1. Log in as the dev user. Navigate to a completed report.
2. Scroll to Section ② (Query & Parameters). Below the parameters list you should see
   "Re-run with adjusted parameters →" as a text link.
3. Click it. You land on `/backtest/new`. The textarea is pre-filled with the original
   query. An amber notice reads "Re-running — 1 credit will be deducted regardless of result size."
4. Click "Run Backtest" without changing the query. Complete the full flow.
5. Check the dashboard top nav: credit balance should be 1 lower than before.
6. In psql: `SELECT reason, amount FROM credit_transactions ORDER BY created_at DESC LIMIT 1`
   → `reason = 'rerun'`, `amount = -1`.

Error scenario: In psql, set `credits = 0` for the dev user. Refresh the report page.
In Section ②, you should see "Re-run requires 1 credit." with a "Buy credits →" link —
not the re-run text link, not a blank space.

---

## Step 24 — Report Management API (Delete & Visibility)

Create the two endpoints that Steps 15 and 17 reference by URL but never build. Wire the dashboard delete button and the report page owner controls to the real endpoints.

> **Decision:** Delete is a soft delete: `is_public = false`. The row is retained in the
> database for operational continuity (credit transactions reference it via `backtest_id`).
> The report becomes inaccessible to all non-owners because the route guard in
> `+page.server.ts` returns 404 when `is_public = false` and the viewer is not the owner.
>
> **Decision:** Both endpoints enforce owner-only access by comparing `report.user_id`
> to `event.locals.user.id`. A 403 is returned — not a 404 — so the owner knows the
> report exists but the operation was rejected (useful for debugging; not a security risk
> since the slug is already known to the requester).

### Prompt

```
Create two server endpoints and update two existing pages to wire them up.
No new packages needed.

--- ENDPOINT 1: src/routes/api/reports/[slug]/delete/+server.ts ---

export const POST: RequestHandler = async ({ params, locals }) => {

  // Auth check
  if (!locals.user) return error(401, { error: "unauthenticated" })

  // Load report
  const report = await getReportBySlug(params.slug)
  if (!report)             return error(404, { error: "not_found" })

  // Owner check
  if (report.user_id !== locals.user.id) return error(403, { error: "forbidden" })

  try {
    await db`
      UPDATE backtest_reports
         SET is_public   = false,
             updated_at  = NOW()
       WHERE slug    = ${params.slug}
         AND user_id = ${locals.user.id}
    `
    return json({ ok: true })
  } catch (err) {
    console.error("[delete report]", err)
    return error(500, { error: "delete_failed" })
  }
}

Import getReportBySlug from "$lib/server/db/reports".
Import db from "$lib/server/db/client".
Never expose err details to the client.

--- ENDPOINT 2: src/routes/api/reports/[slug]/visibility/+server.ts ---

export const POST: RequestHandler = async ({ params, locals, request }) => {

  if (!locals.user) return error(401, { error: "unauthenticated" })

  const body = await request.json().catch(() => null)
  if (body === null || typeof body.is_public !== "boolean") {
    return error(400, { error: "invalid_body" })
  }

  const report = await getReportBySlug(params.slug)
  if (!report)                              return error(404, { error: "not_found" })
  if (report.user_id !== locals.user.id)    return error(403, { error: "forbidden" })

  try {
    await db`
      UPDATE backtest_reports
         SET is_public  = ${body.is_public},
             updated_at = NOW()
       WHERE slug    = ${params.slug}
         AND user_id = ${locals.user.id}
    `
    return json({ ok: true, is_public: body.is_public })
  } catch (err) {
    console.error("[visibility report]", err)
    return error(500, { error: "update_failed" })
  }
}

--- UPDATE: src/routes/dashboard/+page.svelte ---

The dashboard already shows inline delete confirmation (Step 15 prompt).
Wire the confirmed delete action to the real endpoint:

  async function deleteReport(slug: string): Promise<void> {
    const res = await fetch(`/api/reports/${slug}/delete`, { method: "POST" })
    if (!res.ok) {
      // Show inline error below that specific row:
      // "Could not delete. Try again." — --accent-loss, 13px, IBM Plex Sans
      deleteErrors[slug] = "Could not delete. Try again."
      return
    }
    // Remove row from local list — no page reload
    reports = reports.filter(r => r.slug !== slug)
    deletingSlug = null   // reset inline confirmation state
  }

  let deletingSlug   = $state<string | null>(null)
  let deleteErrors   = $state<Record<string, string>>({})
  let deleteLoading  = $state<string | null>(null)  // slug of row being deleted

  Delete row UI (per backtest row):

    [Query excerpt · tickers · return · date range]   [↗ View] [Delete]

    "Delete" — IBM Plex Sans, 13px, --text-secondary, text link style (no button border)
    On click: deletingSlug = slug

    When deletingSlug === slug (inline confirmation directly below the row):
      "Delete this backtest? This cannot be undone."
      IBM Plex Sans, 13px, --text-secondary
      [Confirm delete]  — outlined button, --accent-loss border + text, small (padding 4px 10px)
      [Cancel]          — text link, --text-secondary, margin-left 12px
      On "Confirm delete":
        deleteLoading = slug
        Disable both controls, "Confirm delete" → "Deleting…"
        await deleteReport(slug)
        deleteLoading = null
      On "Cancel": deletingSlug = null

    If deleteErrors[slug] is set: show it below the confirmation block in --accent-loss.

--- UPDATE: src/routes/backtest/[id]/+page.svelte and +page.server.ts ---

The report page already determines view context in Step 17:
  "owner"        → authenticated user owns this report
  "email_access" → report_access_{slug} cookie present
  "public_link"  → neither

Add to the data passed from +page.server.ts (alongside viewContext):
  userOwnsReport: viewContext === "owner"

Owner controls block — shown only when userOwnsReport = true.
Place it immediately below Section ① (Disclaimer Banner) and above Section ②.
It is a compact row — not a section with a label.

  let visibilityLoading = $state(false)
  let visibilityError   = $state("")
  let currentIsPublic   = $state(data.report.is_public)   // local mirror of DB value
  let justMadePrivate   = $state(false)

  Layout of owner controls row:
    Background: --bg-surface
    Border-bottom: 1px solid --bg-border
    Padding: 8px 0
    Font: IBM Plex Sans, 13px

  Left side:
    "This report is {currentIsPublic ? 'public' : 'private'}"
    Color: currentIsPublic ? --text-secondary : --accent-amber

    [Make private →] or [Make public →] — text link style, --text-secondary, no border
    On click:
      visibilityLoading = true, visibilityError = ""
      const newValue = !currentIsPublic
      const res = await fetch(`/api/reports/${data.report.slug}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: newValue })
      })
      if (res.ok) {
        currentIsPublic = newValue
        justMadePrivate = !newValue
      } else {
        visibilityError = "Could not update visibility. Try again."
      }
      visibilityLoading = false

    When visibilityLoading: link text → "Updating…", pointer-events: none

    If justMadePrivate:
      Inline amber notice (same left-border style as disclaimer, but compact):
        border-left: 3px solid --accent-amber, padding: 6px 12px, margin-top: 8px
        "This report is now private — only you can view it."
        IBM Plex Sans, 13px, --accent-amber
      justMadePrivate resets to false when user makes it public again.

    If visibilityError: show in --accent-loss, 13px, below the controls.

  Right side (float or flex justify-between):
    "Copy share link ↗" — already built in Step 4; ensure it's in this row now.
    Share button click: copy window.location.href, label → "Copied!" for 1.5s then revert.

  Delete control (separate from visibility, at far right):
    let deleteConfirming = $state(false)
    let deleteLoading    = $state(false)
    let deleteError      = $state("")

    "Delete" — IBM Plex Sans, 13px, --accent-loss, text link style
    On click: deleteConfirming = true

    When deleteConfirming = true (inline below the controls row — not a modal):
      "Delete this report? This cannot be undone."
      IBM Plex Sans, 13px, --text-secondary
      [Confirm delete] — outlined, --accent-loss, small (padding 4px 10px)
      [Cancel]         — text link, --text-secondary
      On confirm:
        deleteLoading = true
        const res = await fetch(`/api/reports/${data.report.slug}/delete`, { method: "POST" })
        if (res.ok) { goto("/dashboard") }
        else { deleteError = "Deletion failed. Try again."; deleteLoading = false }

--- NAVIGATION WIRING ---

All navigations triggered by these controls:

  Dashboard "Delete" confirmed → removes row from local list (no navigation)
  Report page "Delete" confirmed and successful → goto("/dashboard")
  Report page "Make private" → stays on same page; "is private" label updates inline
  Report page "Copy share link" → clipboard write; no navigation

No new routes. These endpoints are internal API routes only.

--- DO NOT BUILD ---
  - Bulk delete (V2)
  - Restore / undelete (V2)
  - Transfer report ownership (V2)
  - Hard delete of DB rows (credit_transactions reference backtest_reports via FK)
```

### Definition of Done
- [ ] `POST /api/reports/[slug]/delete` sets `is_public = false` for the owner's report — verify in psql: `SELECT is_public FROM backtest_reports WHERE slug = '...'`
- [ ] Same endpoint returns 403 when called with a different authenticated user's session — verify with curl using a second test account's cookie
- [ ] Same endpoint returns 401 when called without any session — verify with curl and no cookie header
- [ ] After soft-delete: navigating to the report URL as an unauthenticated user returns the 404 error page — confirm in a private browser window
- [ ] `POST /api/reports/[slug]/visibility` with `{ "is_public": false }` sets `is_public = false`; with `{ "is_public": true }` sets it back — verify in psql after each
- [ ] Same visibility endpoint returns 400 when body is `{ "is_public": "yes" }` — confirm response is `{ "error": "invalid_body" }`
- [ ] Dashboard: clicking "Delete" shows the inline confirmation below the row; "Cancel" clears it; "Confirm delete" removes the row from the list without a page reload
- [ ] Report page (owner): visibility toggle updates the label inline ("public" ↔ "private"); the amber "now private" notice appears when switching to private and disappears when switching back to public
- [ ] "Copy share link ↗" copies the current URL and changes label to "Copied!" for 1.5s — confirm in browser
- [ ] Report page: clicking "Delete" shows inline confirmation; confirming redirects to `/dashboard`
- [ ] No SQL or stack trace details appear in any 4xx/5xx response body

Error path checks:
- [ ] Dashboard delete: with the delete endpoint temporarily broken (comment out the handler body), confirm delete — "Could not delete. Try again." appears inline below the row; the row is NOT removed from the list
- [ ] Report page visibility: with network set to offline in DevTools, click "Make private →" — "Could not update visibility. Try again." appears inline; the label does not change
- [ ] POST `/api/reports/[slug]/delete` with a slug that belongs to a different user — confirm 403 response; `is_public` unchanged in psql

Navigation checks:
- [ ] After successful delete from report page → `/dashboard` — confirm address bar
- [ ] Dashboard delete: report row disappears from list; rest of list is unaffected; no full page reload (network tab: no GET /dashboard request)
- [ ] "Copy share link ↗" → no navigation; text changes to "Copied!" and reverts in 1.5s

### Demo inputs

| Input | Value |
|-------|-------|
| Report slug to test (owner) | (any completed report — `SELECT slug FROM backtest_reports WHERE user_id IS NOT NULL LIMIT 1` in psql) |
| Visibility payload — make private | `{ "is_public": false }` |
| Visibility payload — make public | `{ "is_public": true }` |

Prerequisites: Dev user must own at least one completed report. Run the full pipeline
once if no reports exist. A second test account is needed to verify the 403 path.

### Smoke test

1. Log in as the dev user. Navigate to a completed report you own.
2. Below the disclaimer banner, you should see the owner controls row:
   "This report is public  [Make private →]  [Copy share link ↗]  [Delete]"
3. Click "Make private →". The label should update to "This report is private" and an
   amber notice should appear: "This report is now private — only you can view it."
4. Open the report URL in a private window (no session). You should see the 404 error page.
5. Back in the owner view, click "Make public →". The label reverts to "This report is public."
6. Open the URL again in the private window. The teaser report should be visible again.
7. Click "Copy share link ↗". The button should read "Copied!" for 1.5 seconds, then revert.
8. Go to `/dashboard`. Find the same report row. Click "Delete". An inline confirmation
   appears. Click "Confirm delete". The row disappears from the list without a page reload.
9. Navigate directly to the deleted report's URL. You should see the 404 error page.

Error scenario: Open DevTools → Network → block the request to `/api/reports/{slug}/delete`.
Click "Delete" on a dashboard row, then click "Confirm delete". You should see "Could not
delete. Try again." inline below the confirmation — the row should NOT disappear.

---

## Appendix — Updated Dependency Map

Replace the existing dependency graph in the build sequence appendix with this one.

```
Step 1  (Foundation)
  └── Step 2  (Homepage UI)
        └── Step 3  (Clarifying Questions + Processing State)
Step 4  (Report UI — static mock data)
  └── Step 11 (Per-event Charts — lightweight-charts)
        └── Step 12 (Portfolio Charts — plain SVG)

Steps 5–8 can be built in parallel with Steps 2–4:
  Step 5  (Query Understanding — pi-ai)
  Step 6  (Event Detection — exa-js)
  Step 7  (Impact Windows — Alpaca OHLCV)
  Step 8  (Trade Simulation — pure TypeScript, bun test)
    └── Step 9  (Pipeline Orchestration — SSE)
          └── Step 10 (Persistence + Research Narrative)
                └── Step 22 (Low-Confidence Events ← ADDENDUM)
                └── Step 13 (Email Gate + Waitlist Modal — resend)
                      └── Step 21 (Email Verification ← ADDENDUM)
                      └── Step 14 (better-auth — pg.Pool adapter)
                            └── Step 20 (Account Settings ← ADDENDUM)
                            └── Step 15 (Dashboard + credit deduction)
                                  └── Step 24 (Report Management API ← ADDENDUM)
                                  └── Step 16 (Polar.sh credits)

Step 10 + Step 14
  └── Step 17 (Public Share URLs + OG Tags)
        └── Step 24 (Report Management API ← ADDENDUM)

Step 9 + Step 10 + Step 15
  └── Step 23 (Re-Run with Adjusted Parameters ← ADDENDUM)

Step 18 (Error States)     — after Step 9, can overlap Steps 10–17
Step 19 (Mobile Pass)      — final UI pass, after all other steps
Step 20 (Account Settings) — after Steps 14 + 15
Step 21 (Email Verification) — after Steps 13 + 14
Step 22 (Low-Confidence Toggle) — after Steps 9 + 10
Step 23 (Re-Run) — after Steps 9 + 10 + 15
Step 24 (Report Management API) — after Steps 10 + 14; unlocks Steps 15 + 17 wiring
```
