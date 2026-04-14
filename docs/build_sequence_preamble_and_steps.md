# NewsTrader AI — Build Sequence Preamble Addendum & Updated Steps

> Insert the Page & Route Inventory, User Story Map, and Navigation Cross-Check at the
> TOP of build_sequence_v2.md, before Step 1. Then replace the five new steps at the
> end with the versions in this file — they include Navigation Manifests and story
> acceptance checks that were missing from the previous addendum.

---

## Preamble — Page & Route Inventory

*Phase 2 output. Every URL in the application. Every link traced to a destination.*
*The Navigation Cross-Check table and every step's Navigation Manifest are derived from this.*

### All Routes

| # | Route | Auth level | Page title | Who reaches it | What it links away to | User need |
|---|-------|-----------|------------|----------------|-----------------------|-----------|
| R1 | `/` | PUBLIC | NewsTrader AI | Direct entry; "Run your own backtest — free →" from R6 (public_link context); "Run your own backtest →" from R6 footer | "Run Backtest →" → R2 | Describe a trade hypothesis and start a backtest |
| R2 | `/backtest/new` | PUBLIC | Run Backtest | "Run Backtest →" from R1; "Run New Backtest" from R5; `?rerun=...&query=...` from R6 owner | Pipeline complete → R6; "← Back" implicit browser | Run the AI pipeline and reach the report |
| R3 | `/backtest/stub` | PUBLIC | Report (dev stub) | Dev only — Step 3 redirects here during static UI phase | Same exits as R6 (replaces R6 during development) | Development placeholder |
| R4 | `/auth/login` | PUBLIC (redirect to R5 if already auth) | Sign in | "Sign in →" from R7/R8; hooks redirect from R5/R10/R11 when no session; "← Back to login" from R8; "Sign out →" from R9 | "Sign up →" → R8; `/dashboard` on success → R5; Google OAuth flow | Authenticate to access saved reports |
| R5 | `/dashboard` | AUTH+VERIFIED | Dashboard | Login success → R4; verification success → R9; "← Dashboard" from R6 (owner); pipeline complete for auth user → R6 | "Account" nav link → R10; "Credits" / "⚡ N credits" nav → R11; "View ↗" report row → R6; "Run New Backtest" → R2; "Join waitlist →" banner → WaitlistModal (inline); sign-out (client call) → R4 | Review saved backtests and run new ones |
| R6 | `/backtest/[id]` | PUBLIC/TEASER (email gate); AUTH owner sees owner controls | Backtest Report | Pipeline complete → R2; "View ↗" from R5; shared URL (direct); email link | Email gate submit (same page, teaser → full); "Re-run →" → R2(?rerun); "Buy credits →" (0-credit state) → R11; "Copy share link" (clipboard, no nav); "← Run your own backtest →" (public_link) → R1; "Create a free account →" CTA → R8; "Set a live alert — Coming Soon. Join the waitlist →" → WaitlistModal (inline); owner: "Make private/public" (same page); owner: "Delete" → R5 | View a completed backtest report |
| R7 | `/auth/register` | PUBLIC | Create account | "Sign up →" from R4; "Create a free account →" from R6; footer CTAs | "← Back to login" → R4; post-success (email/password) → R9; post-success (Google OAuth) → R5 | Create an account to save reports and get free credits |
| R8 | `/auth/check-email` | AUTH (unverified only — redirect verified users to R5) | Check your inbox | hooks redirect from R5/R10/R11 when `emailVerified = false`; post-register success → R7 | "Resend verification →" (same page, no nav); "Sign out →" → R4 | Prompt new registrants to verify before accessing dashboard |
| R9 | `/auth/verify-email` | PUBLIC (token in URL) | Verifying… | Email verification link | Success → R5; expired/invalid token → R4 with error query param | Complete email verification via link |
| R10 | `/dashboard/account` | AUTH+VERIFIED | Account Settings | "Account" nav link → R5 | "← Back to dashboard" → R5; revoke-sessions success → R4; delete-account success → R1 | Edit profile, change password, manage sessions, delete account |
| R11 | `/dashboard/credits` | AUTH+VERIFIED | Credits | "⚡ N credits" nav → R5; "Buy credits →" → R5 (0-credit warning) or R6 (0-credit re-run state) | "← Back to dashboard" → R5; "Buy →" pack row → Polar checkout (external); Polar redirect back with `?success=1` (same URL) | Buy credits and view usage history |
| R12 | `+error.svelte` (global) | PUBLIC | Error | Any unhandled SvelteKit error | "← Back to homepage" → R1 | Catch-all error page |
| R13 | `/backtest/[id]/+error.svelte` | PUBLIC | Report not found | 404 on invalid or private slug | "← Run your own backtest" → R1 | Route-specific 404 for report URLs |

### Route Completeness Checks

**CHECK 1 — Every exit destination is in the inventory:**
- WaitlistModal is an inline modal (not a route) — no route needed ✓
- Polar checkout is an external URL — no route needed ✓
- `?success=1` returns to R11 (same route) ✓
- `?rerun=...&query=...` routes to R2 (same route, different state) ✓
- All other destinations mapped ✓ — **PASS**

**CHECK 2 — Every route has at least one inbound path:**
- R3 (`/backtest/stub`): reached from dev-mode redirect in Step 3 — dev-only, exempt ✓
- All others have inbound paths ✓ — **PASS**

**CHECK 3 — Every route has at least one outbound path:**
- R12 and R13 each have one outbound link (← Back to homepage / ← Run your own backtest) ✓
- All others have multiple outbound paths ✓ — **PASS**

---

## Preamble — User Story Map

*Phase 3 output. Every story traces every click. Every navigation derives from a story.*

---

### Story 1 — Run a public backtest

AS A Hobbyist Retail Trader with no account
I WANT TO type a trade hypothesis in plain English and run a historical simulation
SO THAT I can see whether my intuition about a news event would have been profitable

**Acceptance criteria:**
- The user can type a hypothesis and reach the processing state without logging in
- The textarea accepts free text up to any reasonable length
- Only "US Stocks" is selectable; all other markets are visible but inactive with tooltips
- The AI asks at least one clarifying question (entry timing, direction, position size) before running
- The user can confirm tickers before the simulation runs
- The user can choose an entry/exit preset before the simulation runs
- The processing log streams lines in real time — no spinner, no blank waiting period
- At the end the user is taken to a report page

**Pages involved:** R1, R2, R6

**Navigation trace:**

Starting state: User opens `/` (R1). Sees: wordmark, headline "What would you have made?",
  textarea with placeholder, market selector row, "Run Backtest →" button.

Step 1: `/` (R1)
  User sees: Homepage with empty textarea and "US Stocks" active in the market selector.
  User action: Types "Buy Nvidia every time the US announces new AI chip restrictions on China"
    into the textarea.
  Result: Textarea content updated. No navigation yet.

Step 2: `/` (R1)
  User sees: Filled textarea.
  User action: Clicks "Run Backtest →".
  Result: Navigates to `/backtest/new` (R2), "input" state.

Step 3: `/backtest/new` (R2) — input state
  User sees: BacktestInput component (same textarea pre-filled, market selector, button).
    Below the input: clarifying questions section appears immediately.
    "A FEW QUESTIONS BEFORE WE RUN" label + three questions.
  User action: Selects answers (entry: "Market open next day", direction: "Long",
    position size: leaves default 10000). Clicks "Continue →".
  Result: Page transitions to "processing" state (same URL, no navigation).

Step 4: `/backtest/new` (R2) — processing state
  User sees: ProcessingLog streaming real lines with timestamps. Clarifying questions gone.
  User action: Waits. When "NVDA AMD INTC QCOM — confirm?" appears:
    TickerConfirmation component shown. All tickers pre-checked.
  User action: Clicks "Confirm tickers →".
  Result: ProcessingLog continues. Entry/exit preset shown.

Step 5: `/backtest/new` (R2) — processing state, awaiting rule
  User sees: RuleSelector with three preset rows. "Moderate" pre-selected.
  User action: Clicks "Run simulation →".
  Result: Simulation runs. Log appends final lines. Report slug arrives.

Step 6: `/backtest/new` (R2) — done
  User action: Pipeline emits RESULT event.
  Result: Browser navigates to `/backtest/{slug}` (R6), teaser state.

End state: `/backtest/{slug}` (R6). User sees teaser: P&L headline, blurred chart,
  blurred trade log rows, email gate form.

Error path: Exa returns 0 events. Log shows "No historical events found matching your
  hypothesis." + "Refine query →" link. User clicks link, textarea pre-filled with
  original query, page resets to input state.

---

### Story 2 — Unlock the full report (email gate)

AS A Hobbyist Retail Trader who saw the teaser
I WANT TO submit my email to unlock the full report
SO THAT I can see all trade details, charts, and sources

**Acceptance criteria:**
- Submitting a valid email reveals the full report without a page reload
- An email arrives at the submitted address with the report link and headline P&L
- The full report shows all 8 sections: disclaimer, parameters, narrative, occurrences,
  aggregate performance, trade log, sources, footer CTAs
- Refreshing the page after email submission immediately shows the full report (cookie)
- The disclaimer banner is always visible and cannot be dismissed

**Pages involved:** R6

**Navigation trace:**

Starting state: `/backtest/{slug}` (R6), teaser state. User sees blurred trade log and email gate.

Step 1: `/backtest/{slug}` (R6)
  User sees: "See the full report — free" label, email input, "Unlock Report →" button,
    social proof count.
  User action: Types `jane@example.com` into email input. Clicks "Unlock Report →".
  Result: Button label changes to "Opening report…", disabled. Same page.

Step 2: `/backtest/{slug}` (R6)
  (Server: validates email, stores capture, sends Resend email, sets cookie)
  User sees: Full report revealed. All sections visible. No page reload.

End state: `/backtest/{slug}` (R6), full report. Disclaimer banner sticky at top.

Error path: Invalid email format. Client shows "Please enter a valid email address." inline
  below the input. No server call is made.

---

### Story 3 — Share a backtest report

AS A Serious Individual Investor who completed a backtest
I WANT TO copy a public link to my report
SO THAT I can share results with colleagues or on social media

**Acceptance criteria:**
- "Copy share link ↗" button copies the current page URL to clipboard
- The button label changes to "Copied!" for 1.5 seconds, then reverts
- The shared URL is accessible to anyone without login (teaser mode)
- The shared page shows a "Run your own backtest — free →" link to the homepage

**Pages involved:** R6, R1

**Navigation trace:**

Starting state: `/backtest/{slug}` (R6), full report (user has email access or is owner).

Step 1: `/backtest/{slug}` (R6)
  User action: Clicks "Copy share link ↗" in Section ⑧.
  Result: URL copied to clipboard. Button label → "Copied!" for 1.5s, then reverts. No navigation.

Step 2: A different user opens the shared URL.
  New user sees: Teaser report with "Run your own backtest — free →" link.
  New user action: Clicks "Run your own backtest — free →".
  Result: Navigates to `/` (R1).

End state: `/` (R1). New user can start their own backtest.

---

### Story 4 — Create an account

AS A Hobbyist Retail Trader who just unlocked a report
I WANT TO create a free account
SO THAT my reports are saved and I get 3 free credits for more backtests

**Acceptance criteria:**
- Registration requires name, email, password (≥ 8 characters)
- Google OAuth is available as an alternative
- After email/password registration, the user sees a "check your inbox" message — not a redirect to the dashboard
- After Google OAuth, the user is taken directly to the dashboard
- A newly registered user starts with 3 credits

**Pages involved:** R6, R7, R8, R5

**Navigation trace:**

Starting state: `/backtest/{slug}` (R6), full report. User sees "Create a free account →" CTA.

Step 1: `/backtest/{slug}` (R6)
  User action: Clicks "Create a free account →".
  Result: Navigates to `/auth/register` (R7).

Step 2: `/auth/register` (R7)
  User sees: Registration form — name, email, password, "Create account →" button,
    "Continue with Google" button, "← Back to login" link.
  User action: Fills name="Jane Trader", email="jane@example.com", password="securepass1".
    Clicks "Create account →".
  Result: Button → "Creating…". Server creates user with 3 credits, sends verification email.
    Form replaced with check-inbox state (same URL, no navigation).

Step 3: `/auth/register` (R7) — check-inbox state
  User sees: "CHECK YOUR INBOX — We've sent a verification link to jane@example.com."
    "Resend verification →" button. "← Back to login" link.

Step 4: User opens email. Clicks verification link.
  Result: Navigates to `/auth/verify-email?token=...` (R9).
  Server validates token, sets emailVerified=true. Redirects to `/dashboard` (R5).

End state: `/dashboard` (R5). User sees "⚡ 3 credits" in nav. Coming soon banner. Empty backtests list.

Error path: Weak password (< 8 chars). Inline error below password field before server call.
  Server not contacted.

---

### Story 5 — Sign in to existing account

AS A Serious Individual Investor with an existing account
I WANT TO sign in
SO THAT I can access my saved backtests and credit balance

**Acceptance criteria:**
- Email/password sign-in lands the user on the dashboard
- Google OAuth sign-in lands the user on the dashboard
- An incorrect password shows an inline error — no page reload
- Attempting to access /dashboard without a session redirects to /auth/login

**Pages involved:** R4, R5

**Navigation trace:**

Starting state: `/auth/login` (R4). User sees: email + password fields, "Sign in →" button,
  "Continue with Google" button, "Sign up →" link.

Step 1: `/auth/login` (R4)
  User action: Types email + password. Clicks "Sign in →".
  Result: Button → "Signing in…". On success: navigates to `/dashboard` (R5).

End state: `/dashboard` (R5).

Error path: Wrong password. Inline "Invalid email or password." below the form. No navigation.

---

### Story 6 — Run a dashboard backtest (authenticated)

AS A Serious Individual Investor with an account and credits
I WANT TO run a new backtest from my dashboard
SO THAT the result is automatically saved to my account

**Acceptance criteria:**
- The same BacktestInput component is available on the dashboard
- If credits = 0, an amber warning appears instead of the input with a "Buy credits →" link
- Running a backtest deducts the correct number of credits on completion
- The new report appears at the top of "My Backtests" after completion

**Pages involved:** R5, R2, R6

**Navigation trace:**

Starting state: `/dashboard` (R5). User sees "RUN NEW BACKTEST" section with BacktestInput.

Step 1: `/dashboard` (R5)
  User action: Types hypothesis into BacktestInput. Clicks "Run Backtest →".
  Result: Navigates to `/backtest/new` (R2). Flows identically to Story 1 Step 3 onward.

End state: `/backtest/{slug}` (R6), full report (no email gate for authenticated users).

Error path: User has 0 credits. BacktestInput area shows amber warning:
  "You've used all your credits. Buy more to continue." with "Buy credits →" link → R11.

---

### Story 7 — Buy credits

AS A Serious Individual Investor who has run out of credits
I WANT TO purchase a credit pack
SO THAT I can run more backtests

**Acceptance criteria:**
- Three credit packs are visible with their prices and credit counts
- Clicking "Buy →" on a pack redirects to the Polar-hosted checkout
- After a successful payment, the user is returned to /dashboard/credits with a success banner
- The credit balance in the nav updates to reflect the new total

**Pages involved:** R5, R11, external Polar checkout

**Navigation trace:**

Starting state: `/dashboard/credits` (R11). Reached via "⚡ N credits" in dashboard nav (R5).

Step 1: `/dashboard` (R5)
  User action: Clicks "⚡ N credits" in the top nav.
  Result: Navigates to `/dashboard/credits` (R11).

Step 2: `/dashboard/credits` (R11)
  User sees: Current balance, usage history, three credit pack rows:
    Starter (10 credits / $9), Pro (30 credits / $19), Power (100 credits / $49).
  User action: Clicks "Buy →" on the Starter pack row.
  Result: Button → "Redirecting…". Page navigates to Polar external checkout URL.

Step 3: External Polar checkout. User completes payment.
  Result: Polar redirects back to `/dashboard/credits?success=1` (R11).

Step 4: `/dashboard/credits?success=1` (R11)
  User sees: Amber success banner: "Payment successful — 10 credits added to your account."
    (Webhook has already updated the DB; balance in nav reflects new total.)

End state: `/dashboard/credits` (R11). Balance updated.

Error path: Webhook arrives with invalid signature. 400 returned. Credits not added.
  User contacts support (no automated recovery in V1).

---

### Story 8 — Manage a report (visibility + delete)

AS A Prop Trader who owns a report
I WANT TO control whether my report is public and be able to delete it
SO THAT I can manage my privacy and keep my dashboard clean

**Acceptance criteria:**
- Owner sees a controls row above Section ② on the report page
- Toggling to private makes the report inaccessible to non-owners immediately
- Toggling back to public restores access
- Delete shows an inline confirmation — no modal
- After delete, owner is redirected to dashboard; report URL returns 404

**Pages involved:** R6, R5, R13

**Navigation trace:**

Starting state: `/backtest/{slug}` (R6), owner context. User sees owner controls row.

Step 1: `/backtest/{slug}` (R6) — owner
  User action: Clicks "Make private →".
  Result: Label updates to "This report is private". Amber notice appears. No navigation.

Step 2: `/backtest/{slug}` (R6) — owner
  User action: Clicks "Delete".
  Result: Inline confirmation appears below controls row.

Step 3: `/backtest/{slug}` (R6) — owner
  User action: Clicks "Confirm delete".
  Result: Navigates to `/dashboard` (R5). Report row gone from list.

End state: `/dashboard` (R5). Report absent.
  Accessing the old report URL as non-owner: returns `/backtest/[id]/+error.svelte` (R13).

---

### Story 9 — Re-run with adjusted parameters

AS A Serious Individual Investor reviewing a past report
I WANT TO re-run the same hypothesis with different settings
SO THAT I can refine my analysis cheaply (1 credit flat)

**Acceptance criteria:**
- "Re-run with adjusted parameters →" link appears in Section ② for authenticated users with ≥ 1 credit
- Users with 0 credits see an inline "Re-run requires 1 credit. Buy credits →" message instead
- Clicking the link takes the user to /backtest/new with the query pre-filled
- An amber notice above the textarea says "1 credit will be deducted regardless of result size"
- Re-run deducts exactly 1 credit regardless of ticker or event count

**Pages involved:** R6, R2, R11

**Navigation trace:**

Starting state: `/backtest/{slug}` (R6), full report, user authenticated with credits ≥ 1.

Step 1: `/backtest/{slug}` (R6)
  User sees: In Section ②, below parameters: "Re-run with adjusted parameters →" text link.
  User action: Clicks "Re-run with adjusted parameters →".
  Result: Navigates to `/backtest/new?rerun={slug}&query={encoded}` (R2).

Step 2: `/backtest/new` (R2) — input state with pre-fill
  User sees: Textarea pre-filled with original query. Amber notice above:
    "Re-running — 1 credit will be deducted regardless of result size."
  User action: Modifies query if desired. Clicks "Run Backtest →". Flows as Story 1.

End state: New report at a new slug. Credit balance is 1 lower.

Error path: User has 0 credits. Section ② shows "Re-run requires 1 credit." with
  "Buy credits →" link → R11. No navigation to /backtest/new.

---

### Story 10 — Manage account settings

AS A Registered user
I WANT TO update my display name, change my password, revoke sessions, or delete my account
SO THAT I have full control over my data

**Acceptance criteria:**
- Account settings are reachable from the dashboard top nav "Account" link
- Display name can be edited inline without a page reload
- Password section is absent for Google-OAuth-only accounts
- "Sign out of all other devices" shows inline confirmation before acting
- Account deletion shows inline confirmation; all user data is inaccessible after

**Pages involved:** R5, R10, R4, R1

**Navigation trace:**

Starting state: `/dashboard` (R5). User sees "Account" link in top nav.

Step 1: `/dashboard` (R5)
  User action: Clicks "Account" in the top-right nav.
  Result: Navigates to `/dashboard/account` (R10).

Step 2: `/dashboard/account` (R10)
  User sees: "← Back to dashboard" link, PROFILE section, PASSWORD section (if applicable),
    SESSIONS section, DANGER ZONE section.
  User action (name change): Clicks "Edit" next to display name → inline input appears →
    types new name → clicks "Save" → name updates inline.
  Result: No navigation. Name updated in DB.

Step 3: `/dashboard/account` (R10) — delete flow
  User action: Clicks "Delete account →" → inline confirmation appears.
    Clicks "Confirm delete my account".
  Result: Navigates to `/` (R1).

End state: `/` (R1). User's session and data gone.

---

### Story 11 — Join the waitlist for a coming-soon feature

AS A Hobbyist Retail Trader interested in live alerts
I WANT TO leave my email for a feature that isn't available yet
SO THAT I'm notified when it launches

**Acceptance criteria:**
- Every "coming soon" element has a working "Join waitlist →" action
- The waitlist modal captures email + the specific feature the user is interested in
- After submission the button reads "You're on the list" — no page reload
- The market selector coming-soon tooltips include "Join the waitlist" links

**Pages involved:** R1, R2, R5, R6 (WaitlistModal is inline on all these pages)

**Navigation trace:**

Starting state: Any page with a coming-soon element (e.g. `/` market selector).

Step 1: `/` (R1)
  User sees: "Crypto — coming soon" in market selector. Hovers → CSS tooltip appears:
    "Crypto markets — coming soon. Join the waitlist →"
  User action: Clicks "Join the waitlist →" in tooltip.
  Result: WaitlistModal opens (inline, centered, no backdrop animation). No navigation.

Step 2: WaitlistModal (inline on R1)
  User sees: "Crypto markets — coming soon" title, email input, "Join waitlist →" button.
  User action: Types email. Clicks "Join waitlist →".
  Result: Button → "You're on the list". Modal stays open. No navigation.

End state: User remains on `/` (R1). Modal shows confirmation state.

---

## Preamble — Navigation Cross-Check Table

*Every route's inbound and outbound navigations, mapped to the story steps that produce them.*
*Every row in every step's Navigation Manifest must trace back to a row in this table.*

| Route | Inbound (Story, Step) | Outbound (Story, Step) |
|-------|----------------------|------------------------|
| R1 `/` | S3-Step2, S10-Step3 (delete) | S1-Step2 "Run Backtest →" → R2 |
| R2 `/backtest/new` | S1-Step2, S6-Step1, S9-Step2 | S1-Step6 pipeline complete → R6 |
| R6 `/backtest/[id]` | S1-Step6, S2-start, S4-Step1 (CTA) | S2-Step2 full report (same page); S3-Step2 "Run your own backtest →" → R1; S4-Step1 "Create account →" → R7; S8-Step1 make private (same page); S8-Step3 delete → R5; S9-Step1 "Re-run →" → R2; S9 0-credit → R11 |
| R7 `/auth/register` | S4-Step1, R4 "Sign up →" | S4-Step3 check-inbox (same page); R4 "← Back to login" |
| R8 `/auth/check-email` | S4-Step3 post-register; hooks redirect | "Resend →" (same page); "Sign out →" → R4 |
| R9 `/auth/verify-email` | S4-Step4 email link | S4-Step4 success → R5; error → R4 |
| R4 `/auth/login` | S5-start; hooks redirect; S8 "Sign out →"; R7 "← Back" | S5-Step1 success → R5; R7 "Sign up →" |
| R5 `/dashboard` | S5-Step1 (login); S4-Step4 (verify); S6-start; S8-Step3 (delete) | S6-Step1 BacktestInput → R2; S7-Step1 credits nav → R11; S10-Step1 "Account" → R10; R6 row "View →"; "Sign out" → R4 |
| R10 `/dashboard/account` | S10-Step1 "Account" nav | S10-Step2 "← Back to dashboard" → R5; session revoke → R4; S10-Step3 delete → R1 |
| R11 `/dashboard/credits` | S7-Step1 credits nav; S6 0-credit warning; S9 0-credit "Buy credits →" | S7-Step3 Polar checkout (external); success return `?success=1` (same); "← Back" → R5 |
| R12 `+error.svelte` | Any unhandled error | "← Back to homepage" → R1 |
| R13 `/backtest/[id]/+error.svelte` | Invalid/private slug | "← Run your own backtest" → R1 |

---

## Updated New Steps

*Steps 20–24 rewritten with Navigation Manifests, story acceptance checks, and correct*
*user story cross-references. Replace the versions in the previous addendum with these.*

---

## Step 20 — Account Settings Page

Build `/dashboard/account` — the route the dashboard top nav has linked to since Step 15. Covers display name editing, password change, session revocation, and account deletion, all inline with no modals.

**Depends on:** Step 14 (auth), Step 15 (dashboard layout + nav link)
**Unlocks:** none
**User stories addressed:** Story 10 — Manage account settings

**Research first:**
Before writing any code for this step, read the following and confirm the answers:
- `better-auth` server API — confirm whether `auth.api.changePassword()` exists and its
  exact parameter shape. If it doesn't exist, confirm the correct fallback.
- `better-auth` — confirm whether `DELETE FROM "user"` cascades correctly to `"session"`,
  `"account"`, `"verification"` given the FKs in 002_auth.sql, or whether a better-auth
  method should be used instead.

**Navigation manifest:**

| Element label | Type | From page | To page / action | Built in step |
|---|---|---|---|---|
| "Account" | nav link | R5 `/dashboard` | R10 `/dashboard/account` | Step 15 (link exists); this step builds the destination |
| "← Back to dashboard" | text link | R10 | R5 `/dashboard` | Step 15 |
| Session revoke success | redirect | R10 | R4 `/auth/login` | Step 14 |
| "Delete my account" confirm | redirect | R10 | R1 `/` | Step 1 |

### Prompt

```
Build the account settings page. Auth required — hooks.server.ts already redirects
unauthenticated requests from /dashboard/* to /auth/login (Step 14).
Use Svelte 5 runes syntax throughout.

--- LOAD: src/routes/dashboard/account/+page.server.ts ---

Read event.locals.user (set by hooks.server.ts).

  const credentialRows = await db`
    SELECT COUNT(*) as count FROM "account"
    WHERE "userId" = ${event.locals.user.id} AND "providerId" = 'credential'
  `
  const sessionCount = await db`
    SELECT COUNT(*) as count FROM "session"
    WHERE "userId" = ${event.locals.user.id} AND "expiresAt" > NOW()
  `

Return: { user, has_password: credentialRows[0].count > 0, active_sessions: Number(sessionCount[0].count) }
Wrap in try/catch → error(500) on DB failure.

--- PAGE: src/routes/dashboard/account/+page.svelte ---

Uses src/routes/dashboard/+layout.svelte (same top nav as dashboard — no duplicate nav).
Single column, max-width: 720px, identical to report prose section (Design.md §4).

Top of page — navigation anchor:
  "← Back to dashboard" — IBM Plex Sans, --text-secondary, 13px, text link
  href="/dashboard"
  Margin-bottom: 32px

Page label:
  "ACCOUNT SETTINGS" — IBM Plex Sans, 11px, uppercase, letter-spacing 0.08em, --text-secondary

Sections separated by 1px solid --bg-border rules (Design.md §4).

--- SECTION: PROFILE ---

Label: "PROFILE" — same 11px uppercase style

Row — Display name:
  Left:  "Display name" — IBM Plex Sans, --text-secondary, 13px
  Right: {data.user.name} — IBM Plex Sans, --text-primary, 15px; "Edit" text link inline

  let editing    = $state(false)
  let nameValue  = $state(data.user.name)
  let nameSaving = $state(false)
  let nameError  = $state("")

  editing=false: show value + "Edit" text link (--text-secondary, cursor pointer)
  editing=true:  show <input> (--bg-surface, 1px --bg-border, 2px border-radius, focus --text-secondary,
                   IBM Plex Sans 15px, width 240px) + "Save" outlined button + "Cancel" text link

  Save: nameSaving=true, button → "Saving…" (disabled)
    POST /api/account/update-name { name: nameValue.trim() }
    200 → editing=false
    error → nameError = "Failed to save. Try again." (--accent-loss, 13px, below input)
    nameSaving=false

  Cancel: editing=false, nameValue=data.user.name (reset)

Row — Email:
  Left:  "Email address" — --text-secondary, 13px
  Right: {data.user.email} — IBM Plex Mono, --text-primary, 13px
  No edit control.

--- SECTION: PASSWORD (only if data.has_password === true) ---

Label: "PASSWORD"

Three inputs stacked (max-width 320px):
  type="password": "Current password", "New password" (placeholder: "8 chars minimum"), "Confirm password"
  Style: same as all app inputs (--bg-surface, 1px --bg-border, 2px radius, IBM Plex Sans 15px)

"Change password →" outlined button (1px --bg-border, no fill, --text-primary, hover --bg-elevated).

let pwSaving = $state(false), pwError = $state(""), pwSuccess = $state(false)

Client validation first (no server call if fails):
  new < 8 chars → pwError = "New password must be at least 8 characters."
  confirm ≠ new  → pwError = "Passwords do not match."
  pwError shown in --accent-loss, 13px below button.

On valid submit: pwSaving=true, pwError=""
  Disable button → "Updating…"
  POST /api/account/change-password { currentPassword, newPassword }
  200  → pwSuccess=true, clear fields, show "Password updated." (--text-secondary, 13px, 4s then hide)
  401  → pwError = "Current password is incorrect."
  else → pwError = "Something went wrong. Try again."
  pwSaving=false

--- SECTION: SESSIONS ---

Label: "SESSIONS"

"You have {data.active_sessions} active session(s) across all devices."
IBM Plex Sans, --text-secondary, 13px.

"Sign out of all other devices →" outlined button.

let revokeConfirming = $state(false), revokeLoading = $state(false)

revokeConfirming=false: show button
revokeConfirming=true: show inline below button (no modal):
  "This will sign you out everywhere except this browser. Confirm?"
  [Yes, sign out] outlined (--accent-loss border + text)  [Cancel] text link --text-secondary

On confirm: revokeLoading=true
  POST /api/account/revoke-sessions
  200 → navigate to /auth/login
  err → inline "Failed to sign out. Try again." in --accent-loss

--- SECTION: DANGER ZONE ---

Label: "DANGER ZONE"
  IBM Plex Sans, 11px, uppercase, --accent-loss color
  Border-bottom: 1px solid --accent-loss (not --bg-border)

"Delete account →" outlined button:
  border: 1px solid --accent-loss, color: --accent-loss, background: transparent
  hover: background: rgba(248, 113, 113, 0.06)

let deleteConfirming = $state(false), deleteLoading = $state(false), deleteError = $state("")

deleteConfirming=true: inline below button:
  "This permanently deletes your account and all report access. This cannot be undone."
  IBM Plex Sans, --text-secondary, 13px
  [Delete my account] outlined --accent-loss   [Cancel] text link --text-secondary

On confirm: deleteLoading=true, deleteError=""
  POST /api/account/delete
  200 → navigate to /
  err → deleteError = "Account deletion failed. Contact support if this persists." (--accent-loss)
  deleteLoading=false

--- API ENDPOINTS ---

All require auth (401 if no session). All log errors server-side; return { error: string } only.

src/routes/api/account/update-name/+server.ts
  Input: { name: string }  Validate non-empty, max 100 chars → 400 { error: "invalid_name" }
  UPDATE "user" SET "name" = $1, "updatedAt" = NOW() WHERE "id" = $2
  Return 200 { ok: true }

src/routes/api/account/change-password/+server.ts
  Input: { currentPassword, newPassword }
  Confirm auth.api.changePassword() method in Research first and implement accordingly.
  Wrong current password → 401 { error: "wrong_password" }
  200 { ok: true }

src/routes/api/account/revoke-sessions/+server.ts
  Get current session token (auth.api.getSession()).
  DELETE FROM "session" WHERE "userId" = $1 AND "token" != $2 (keep current token)
  Return 200 { ok: true }

src/routes/api/account/delete/+server.ts
  In a single postgres.js transaction:
    UPDATE backtest_reports SET is_public = false WHERE user_id = $1
    DELETE FROM "user" WHERE "id" = $1  (cascades to session/account/verification)
  Return 200 { ok: true }

--- DO NOT BUILD ---
  Email address change, two-factor auth, API key management (all V2)
```

### Definition of Done

Technical checks:
- [ ] `/dashboard/account` loads correctly for an authenticated user — visible in browser
- [ ] Display name inline edit: "Edit" → input appears; "Cancel" restores original value with no server call (DevTools: no network request on Cancel)
- [ ] Name save: button shows "Saving…" while in-flight; name updates inline; psql confirms `SELECT "name" FROM "user"`
- [ ] Password section absent for Google-only accounts — verify by logging in with Google
- [ ] Wrong current password → "Current password is incorrect." inline (no page reload, no alert)
- [ ] Session revoke: shows inline confirmation; "Cancel" dismisses cleanly; confirm fires the endpoint
- [ ] After revoke: redirected to /auth/login; old session cookie rejected on next visit (clear cookies, paste old cookie manually, visit /dashboard)
- [ ] Account deletion: inline confirmation → "Delete my account" POSTs endpoint → redirected to /
- [ ] After deletion: psql `SELECT * FROM "user" WHERE id = ...` returns 0 rows; all session rows gone

Navigation checks:
- [ ] "← Back to dashboard" → `/dashboard` — confirm in browser address bar
- [ ] After session revoke confirm → `/auth/login` — confirm address bar
- [ ] After "Delete my account" confirm → `/` (homepage) — confirm address bar

Error path checks:
- [ ] Network offline (DevTools) + click "Save" on display name → "Failed to save. Try again." inline, no blank screen
- [ ] POST `/api/account/update-name` with `{ name: "" }` via curl → 400 `{ error: "invalid_name" }`, not 500
- [ ] POST `/api/account/delete` without session cookie → 401, not 500

NFR checks:
- [ ] No stack traces in any error response body — all 4xx/5xx responses are `{ error: "..." }` strings only
- [ ] All async buttons are disabled while in-flight — double-submit impossible (verify by clicking rapidly)

Story acceptance checks (Story 10):
- [ ] "Account" link in dashboard top nav reaches this page — Story 10, Step 1
- [ ] Display name edit works inline without a page reload — Story 10, Step 2 criterion
- [ ] Password section absent for Google OAuth accounts — Story 10 criterion
- [ ] Inline confirmation shown before session revoke fires — Story 10 criterion
- [ ] After account delete, user is on `/` and cannot log back in — Story 10, Step 3

### Demo inputs

| Input | Value |
|-------|-------|
| New display name | `Dela Osei` |
| Current password | `testpassword123` |
| New password | `newpassword456` |
| Confirm password | `newpassword456` |

Prerequisites: Run `bun run db:seed` to create `dev@test.com` / `testpassword123`. Log in first.

### Smoke test

1. Log in at `/auth/login`. Click "Account" in the top-right nav. [Story 10, Step 1]
   You should see the Account Settings page with your name and email.
2. Click "Edit" next to Display name. Type `Dela Osei`. Click "Save". [Story 10, Step 2]
   "Saving…" appears briefly, then "Dela Osei" appears inline. No reload.
3. In Password section: enter wrong current password, valid new password. Click "Change password →".
   You should see "Current password is incorrect." below the button.
4. Click "Delete account →". The inline warning should appear. Click "Cancel". Warning disappears.

Navigation check: Click "← Back to dashboard". You should land on `/dashboard`.

Error scenario: Fill in current password correctly, new password = `abc` (too short).
You should see "New password must be at least 8 characters." before any network request fires.

---

## Step 21 — Email Verification Flow

Configure better-auth's email verification, gate the dashboard behind `emailVerified = true`, and build `/auth/check-email` — the page unverified users see when redirected from `/dashboard`.

**Depends on:** Step 13 (Resend installed), Step 14 (better-auth configured)
**Unlocks:** none
**User stories addressed:** Story 4 — Create an account (Steps 3–4 of trace)

**Research first:**
Before writing any code for this step, read the following and confirm the answers:
- `better-auth` email verification — is it `plugins: [emailVerification(...)]` or a top-level
  `emailVerification: { ... }` option? Confirm for the installed version.
- Exact `sendVerificationEmail` callback signature: `{ user, url, token }` or `{ email, url }`?
- Does better-auth automatically handle `/api/auth/verify-email` via svelteKitHandler, or must
  a manual route be created?
- Does `authClient.sendVerificationEmail({ email })` exist on the client SDK?

**Navigation manifest:**

| Element label | Type | From page | To page / action | Built in step |
|---|---|---|---|---|
| `/auth/register` post-success (email/password) | redirect | R7 | R8 `/auth/check-email` | This step builds R8 |
| Verification email link | external link in email | email client | R9 `/auth/verify-email` | This step creates R9 if needed |
| R9 success | redirect | R9 | R5 `/dashboard` | Step 15 |
| "Resend verification →" | button | R8 | same page (no nav) | This step |
| "Sign out →" | text link | R8 | R4 `/auth/login` | Step 14 |
| hooks gate: unverified user hits R5 | redirect | R5 | R8 `/auth/check-email` | This step |

### Prompt

```
Add email verification to the auth layer. Resend is already installed (Step 13).
No new packages needed.

--- UPDATED: src/lib/server/auth.ts ---

Read Research first before editing. Add email verification to betterAuth() config.

  sendVerificationEmail: async ({ user, url }) => {
    // signature may differ — use confirmed signature from Research first
    try {
      const { Resend } = await import("resend")
      const resend = new Resend(RESEND_API_KEY)
      await resend.emails.send({
        from:    `noreply@${new URL(PUBLIC_BASE_URL).hostname}`,
        to:      user.email,
        subject: "Verify your NewsTrader AI account",
        html: `<div style="font-family:'IBM Plex Sans',sans-serif;color:#f0ede8;
                           background:#0a0a0a;padding:32px;">
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

--- UPDATED: src/hooks.server.ts ---

After `event.locals.user = session?.user ?? null`, add:

  const isProtectedRoute = event.url.pathname.startsWith("/dashboard")
  const user = event.locals.user

  if (isProtectedRoute && user && user.emailVerified === false) {
    // Google OAuth users always have emailVerified=true — this only fires for
    // unverified email/password accounts.
    throw redirect(302, "/auth/check-email")
  }

This block goes AFTER the existing `/dashboard` → `/auth/login` redirect for unauthenticated
users. The order is:
  1. No session → redirect /dashboard → /auth/login  (existing)
  2. Session, unverified → redirect /dashboard → /auth/check-email  (new)
  3. Session, verified → allow through  (existing)

--- UPDATED: src/routes/auth/register/+page.svelte ---

After successful signUp.email():
  registered = true (not a redirect — stays on /auth/register)
  registeredEmail = submittedEmail

When registered=true, replace the form with:

  Label: "CHECK YOUR INBOX"
  IBM Plex Sans, 11px, uppercase, letter-spacing 0.08em, --text-secondary

  "We've sent a verification link to {registeredEmail}."
  IBM Plex Sans, --text-secondary, 15px.

  let resendLoading = $state(false), resendSent = $state(false)

  "Resend verification →" outlined button
  On click: resendLoading=true
    Call authClient.sendVerificationEmail({ email: registeredEmail })  (confirm method name)
    resendSent=true, resendLoading=false
    Button → "Sent ✓" (permanent for this session)

  "← Back to login" text link → /auth/login (--text-secondary, 13px)

--- NEW PAGE: src/routes/auth/check-email/+page.svelte ---

No server load file. No dashboard layout — this is a pre-auth page.
Same layout as homepage: single centered column, upper-third of viewport.

Logo wordmark top-left: "NewsTrader AI" — IBM Plex Sans, --text-primary
  (same style as homepage, not the dashboard nav)

Content:
  Label: "VERIFY YOUR EMAIL" — 11px, uppercase, letter-spacing 0.08em, --text-secondary

  "Before accessing your dashboard, please verify your email address."
  IBM Plex Sans, --text-secondary, 15px.

  let userEmail = $state("")
  let resendLoading = $state(false), resendSent = $state(false), resendError = $state("")

  On mount ($effect):
    const session = await authClient.getSession()
    userEmail = session?.data?.user?.email ?? ""

  When userEmail is set:
    "We sent a link to {userEmail}."
    IBM Plex Sans, --text-secondary, 13px.

  "Resend verification email →" outlined button (same style as all app buttons)
  On click: resendLoading=true, resendError=""
    Call authClient.sendVerificationEmail({ email: userEmail })
    resendSent=true → button → "Email sent ✓" (permanent)
    On error: resendError = "Failed to send. Try again." (--accent-loss, 13px, below button)
    resendLoading=false

  "Sign out →" text link, --text-secondary, 13px, margin-top: 24px
  On click: await authClient.signOut() → navigate to /auth/login

--- VERIFICATION CALLBACK ---

If Research first confirms better-auth handles /api/auth/verify-email automatically
via svelteKitHandler: no additional route needed.

If a manual route is required: create
  src/routes/auth/verify-email/+page.server.ts
    Read token = url.searchParams.get("token")
    If no token → redirect(302, "/auth/login")
    Call confirmed better-auth API to verify token.
    Success → redirect(302, "/dashboard")
    Error   → return { error: "Invalid or expired verification link." }

  src/routes/auth/verify-email/+page.svelte
    If data.error: show the error message, IBM Plex Sans --accent-loss 15px.
      "← Back to login" link → /auth/login

--- DO NOT BUILD ---
  Email address change with re-verification (V2)
  Phone verification (V2)
  Magic link login (V2)
```

### Definition of Done

Technical checks:
- [ ] New email/password registration at `/auth/register` shows check-inbox state — browser stays on `/auth/register`, no redirect to `/dashboard`
- [ ] Verification email received in inbox within 60s — confirm in email client
- [ ] Clicking verification link sets `"emailVerified" = true`: psql `SELECT "emailVerified" FROM "user" WHERE email = '...'`
- [ ] After clicking link → lands on `/dashboard` — confirm address bar
- [ ] Unverified user navigating to `/dashboard` → redirected to `/auth/check-email` — confirm address bar
- [ ] Google OAuth login reaches `/dashboard` with no check-email gate — verify by logging in with Google
- [ ] "Resend verification →" on `/auth/check-email` sends a second email — confirm in inbox

Navigation checks:
- [ ] Post-register check-inbox state: "← Back to login" → `/auth/login` — confirm address bar
- [ ] "Sign out →" on `/auth/check-email` → `/auth/login` — confirm address bar
- [ ] Verification link in email → `/dashboard` (after token validated) — confirm address bar

Error path checks:
- [ ] Temporarily set `RESEND_API_KEY=invalid`, register new account — user row created in psql; check-inbox state shown (not an error page); error logged server-side
- [ ] Tampered verification token `?token=badtoken` → human-readable error message, not 500 or blank page
- [ ] Click "Resend →" on `/auth/check-email` with network offline → "Failed to send. Try again." inline, not blank

NFR checks:
- [ ] Resend failure does not block account creation (story 4 criterion: user gets 3 credits even if email fails)

Story acceptance checks (Story 4):
- [ ] After email/password register: user sees check-inbox message, NOT the dashboard — Story 4, Step 3
- [ ] After clicking verification link: user is on `/dashboard` with 3 credits in nav — Story 4, Step 4
- [ ] Google OAuth user skips verification and reaches dashboard directly — Story 4 criterion

### Demo inputs

| Input | Value |
|-------|-------|
| Registration email | `verifytest@example.com` |
| Registration password | `testpassword123` |
| Display name | `Verify Test` |

Prerequisites: Run `DELETE FROM "user" WHERE email = 'verifytest@example.com'` in psql if needed.
`RESEND_API_KEY` must be a valid key with a verified sending domain.

### Smoke test

1. Open `/auth/register`. Fill in all fields. Click "Create account →". [Story 4, Step 2]
   The form is replaced with "CHECK YOUR INBOX". The address bar still shows `/auth/register`.
2. Open your inbox. The verification email should arrive. Click the link. [Story 4, Step 4]
   You should land on `/dashboard`. Address bar confirms.
3. Sign out. Try navigating directly to `/dashboard`. [hooks gate]
   You should be on `/auth/check-email` — NOT `/auth/login`.
4. On `/auth/check-email`: click "Sign out →".
   You should land on `/auth/login`. Address bar confirms.

Navigation check: On `/auth/register` post-success state, click "← Back to login".
You should land on `/auth/login` — confirm address bar.

Error scenario: While on `/auth/check-email` with no network (DevTools offline), click
"Resend verification email →". You should see "Failed to send. Try again." inline — not a
blank page or unhandled error.

---

## Step 22 — Low-Confidence Events: Pipeline Storage & Report Toggle

Persist LOW-confidence events from the detection stage into `backtest_reports.low_confidence_events` and add a client-side toggle in Section ④ of the report. PRD §6.3: "low-confidence shown as a toggle."

**Depends on:** Step 6 (event detection), Step 9 (pipeline), Step 10 (persistence), Step 4 (report UI)
**Unlocks:** none
**User stories addressed:** Story 1 — Run a public backtest (Step 1 end-state: full report shows all data)

**Navigation manifest:**

| Element label | Type | From page | To page / action | Built in step |
|---|---|---|---|---|
| "Show low-confidence events (N) →" | toggle button | R6 `/backtest/[id]` | same page, state change | This step |
| "← Hide low-confidence events" | toggle button | R6 | same page, state change | This step |

### Prompt

```
Three files change: exa-events.ts (split output), pipeline/run (pass to createReport),
and the report page (toggle UI). Plus one new migration.

--- MIGRATION: src/lib/server/db/migrations/003_low_confidence_events.sql ---

ALTER TABLE backtest_reports
  ADD COLUMN IF NOT EXISTS low_confidence_events JSONB NOT NULL DEFAULT '[]'::jsonb;

Run with: bun run db:migrate
Safe on live data — IF NOT EXISTS + DEFAULT '[]' leaves existing rows intact.

--- UPDATE: src/lib/server/exa-events.ts ---

Change deduplicateEvents return type:
  Before: RawExaEvent[]
  After:  { confirmed: RawExaEvent[], low_confidence: RawExaEvent[] }

After existing deduplication clustering:
  const confirmed      = deduped.filter(e => e.confidence !== "LOW")
  const low_confidence = deduped.filter(e => e.confidence === "LOW")
  return { confirmed, low_confidence }

rankTickers called on confirmed only — no change to that function.

Update POST /api/pipeline/detect-events response shape:
  { raw_events, low_confidence_events, ranked_tickers, total_found,
    high_confidence, medium_confidence, low_confidence }

Update BacktestReportRow in src/lib/types/pipeline.ts:
  Add: low_confidence_events: RawExaEvent[]

--- UPDATE: GET /api/pipeline/run (src/routes/api/pipeline/run/+server.ts) ---

Stage 2: destructure the new return:
  const { confirmed, low_confidence } = deduplicateEvents([...primary, ...supplementary])
  const ranked_tickers = rankTickers(confirmed)

Pass low_confidence to createReport() at end of Stage 4.
Do NOT emit low_confidence in the SSE stream (they are a disclosure, not a user decision).
The existing low_confidence SSE event (for 1–2 confirmed events) is UNCHANGED.

--- UPDATE: src/lib/server/db/reports.ts ---

createReport: accept and INSERT low_confidence_events field.
getReportBySlug: SELECT the new column.

--- UPDATE: src/routes/backtest/[id]/+page.server.ts ---

Return low_confidence_events: report.low_confidence_events ?? [] alongside report.

--- UPDATE: src/routes/backtest/[id]/+page.svelte ---

Destructure: let { report, low_confidence_events } = $props()  (or from data)

In SECTION ④, between section label and first occurrence:
  Show only when low_confidence_events.length > 0.

  let showLow = $state(false)

  Toggle button:
    showLow=false: "{low_confidence_events.length} low-confidence event(s) excluded — Show →"
      border: 1px solid --bg-border, background: transparent, color: --text-secondary
      padding: 4px 10px, IBM Plex Sans 13px, cursor pointer
      hover: color --text-primary, border-color --text-secondary
      transition: color 100ms

    showLow=true: "← Hide low-confidence events"
      border: 1px solid --accent-amber, color: --accent-amber

  Toggle is a <button> element (not a checkbox, not a pill).

  When showLow=true: render low_confidence_events interleaved with confirmed occurrences
  in chronological order by event_date.

  Each low-confidence row:
    Event date (IBM Plex Mono --text-secondary 13px)
    "LOW" badge: 11px uppercase, color --text-muted, border 1px --bg-border, no background
    "excluded from simulation" label inline: IBM Plex Sans 11px --text-muted
    Description: 1px --bg-border left-border block, IBM Plex Sans 15px --text-secondary
    Sources if any: "Publication · Headline · ↗ URL" (same style as confirmed)
    NO per-ticker subsections. NO chart placeholders. NO trade data.
    1px --bg-border rule below each row.

Toggle state is NOT in the URL — page refresh resets to hidden.

--- DO NOT BUILD ---
  Simulating or costing low-confidence events
  Emitting low_confidence events in the SSE stream
  Any change to confirmed event count, credit cost, or P&L
```

### Definition of Done

Technical checks:
- [ ] `003_low_confidence_events.sql` runs without error on a DB with existing rows — `SELECT COUNT(*) FROM backtest_reports` unchanged before/after
- [ ] psql: `\d backtest_reports` shows `low_confidence_events jsonb not null default '[]'::jsonb`
- [ ] After a pipeline run: `SELECT low_confidence_events FROM backtest_reports ORDER BY created_at DESC LIMIT 1` returns a JSON array (may be empty `[]` — not null)
- [ ] If `low_confidence_events.length > 0`: toggle button visible below "HISTORICAL OCCURRENCES" label
- [ ] Toggle open: low-confidence rows appear, no chart placeholders, no trade data
- [ ] Toggle close: rows disappear. DevTools Network tab: no requests on toggle either way
- [ ] Toggle absent from DOM when `low_confidence_events = []`

Navigation checks:
- [ ] Toggle "Show →" → same page, rows appear — address bar unchanged
- [ ] Toggle "← Hide" → same page, rows hidden — address bar unchanged

Error path checks:
- [ ] Set `low_confidence_events = null` in psql; reload report → no toggle, no JS error, page renders normally
- [ ] Run migration twice → no error (IF NOT EXISTS guard)

Story acceptance checks (Story 1 — full report shows all data):
- [ ] When LOW events exist, user can access them via toggle — report is transparent about exclusions

### Demo inputs

| Input | Value |
|-------|-------|
| Backtest query | `Buy Nvidia every time the US announces new AI chip restrictions on China` |

Prerequisites: Steps 9 and 10 complete. Run `bun run db:migrate` (includes 003 migration).
Run the full pipeline once and check `low_confidence_events` in psql.

### Smoke test

1. Run the chip-restrictions backtest. Navigate to the report.
2. Scroll to "HISTORICAL OCCURRENCES". If any LOW events were found, a compact button
   reads "N low-confidence event(s) excluded — Show →". Click it.
   Rows appear between confirmed events — dates, descriptions, sources. No charts, no trades.
3. Click "← Hide low-confidence events". Rows disappear. Open DevTools Network tab —
   zero new requests should appear for either click.

Navigation check: Toggle on, toggle off — address bar unchanged throughout.

Error scenario: In psql, `UPDATE backtest_reports SET low_confidence_events = null WHERE ...`.
Reload the report. You should see no toggle and no JavaScript console error.

---

## Step 23 — Re-Run with Adjusted Parameters

Add "Re-run with adjusted parameters →" to Section ② of completed reports, pre-fill `/backtest/new` from URL params, and apply the PRD §5.4 flat 1-credit cost for re-runs.

**Depends on:** Step 9 (pipeline), Step 10 (persistence), Step 14 (auth), Step 15 (dashboard)
**Unlocks:** none
**User stories addressed:** Story 9 — Re-run with adjusted parameters

**Navigation manifest:**

| Element label | Type | From page | To page / action | Built in step |
|---|---|---|---|---|
| "Re-run with adjusted parameters →" | text link | R6 `/backtest/[id]` | R2 `/backtest/new?rerun=...&query=...` | Step 3 (R2 exists) |
| "Buy credits →" (0-credit state) | text link | R6 | R11 `/dashboard/credits` | Step 16 |

### Prompt

```
Update three files: the pipeline run endpoint, the report page, and /backtest/new.
No new routes needed.

--- UPDATE: GET /api/pipeline/run (src/routes/api/pipeline/run/+server.ts) ---

Add to pipeline params type:
  is_rerun?:          boolean
  source_report_slug?: string

Credit cost block — replace existing formula:
  let cost: number
  if (params.is_rerun === true) {
    cost = 1   // PRD §5.4 flat re-run cost
  } else if (confirmed_tickers.length >= 6) {
    cost = 5
  } else if (confirmed_tickers.length >= 2) {
    cost = 3
  } else if (occurrences.length > 5) {
    cost = 2
  } else {
    cost = 1
  }

credit_transactions INSERT: use reason = 'rerun' when params.is_rerun === true.

--- UPDATE: src/routes/backtest/[id]/+page.server.ts ---

Add to load return: userCredits: event.locals.user?.credits ?? null
  (null = unauthenticated visitor)

--- UPDATE: src/routes/backtest/[id]/+page.svelte ---

Re-run CTA — in SECTION ② (Query & Parameters), below the parameters list.
Show only in full-report state (not teaser).

  const rerunUrl = `/backtest/new?rerun=${report.slug}&query=${encodeURIComponent(report.query)}`

  {#if userCredits === null}
    <!-- unauthenticated — show nothing -->
  {:else if userCredits === 0}
    <!-- 0 credits -->
    <span style="color: var(--accent-amber); font-size: 13px; font-family: 'IBM Plex Sans';">
      Re-run requires 1 credit.
    </span>
    <a href="/dashboard/credits" style="color: var(--accent-amber); ...">Buy credits →</a>
  {:else}
    <!-- ≥ 1 credit -->
    <a href={rerunUrl}
       style="font-size: 13px; color: var(--text-secondary); font-family: 'IBM Plex Sans';
              text-decoration: none;"
       onmouseover="this.style.textDecoration='underline'"
       onmouseout="this.style.textDecoration='none'">
      Re-run with adjusted parameters →
    </a>
  {/if}

Margin-top: 16px from the parameters list. No border, no button.

--- UPDATE: src/routes/backtest/new/+page.svelte ---

Import $page (or use the SvelteKit 5 equivalent — confirm current convention).

  const rerunSlug  = $derived($page.url.searchParams.get("rerun")  ?? null)
  const queryParam = $derived($page.url.searchParams.get("query")  ?? null)

If queryParam is not null:
  1. Pre-fill BacktestInput textarea with decodeURIComponent(queryParam)
     (Pass as a prop to BacktestInput — add `initialValue?: string` prop if not present)

  2. Show amber notice ABOVE the textarea (below the wordmark, above BacktestInput):
       border-left: 3px solid var(--accent-amber)
       padding: 8px 12px, margin-bottom: 16px
       background: transparent
       IBM Plex Sans, 13px, color: --accent-amber
       Text: "Re-running — 1 credit will be deducted regardless of result size."

  3. In the pipeline params object passed to GET /api/pipeline/run:
       is_rerun: true
       source_report_slug: rerunSlug ?? undefined

If queryParam is null: no notice, no pre-fill, no is_rerun flag. Normal flow.

--- DO NOT BUILD ---
  Skip clarifying questions for re-runs (full flow always runs)
  Pre-filling tickers or entry/exit rule from source report (V2)
  Re-run for unauthenticated users
```

### Definition of Done

Technical checks:
- [ ] Authenticated user with ≥ 1 credit sees "Re-run with adjusted parameters →" text link in Section ② — confirm in browser
- [ ] Authenticated user with 0 credits sees "Re-run requires 1 credit. Buy credits →" — set `credits = 0` in psql to test
- [ ] Unauthenticated visitor sees nothing in that DOM position — open report in private window
- [ ] `/backtest/new?rerun=...&query=...`: textarea pre-filled, amber notice visible above it
- [ ] Re-run completes: psql `SELECT credits FROM "user"` is exactly 1 lower than before
- [ ] psql `SELECT reason, amount FROM credit_transactions ORDER BY created_at DESC LIMIT 1` → `reason='rerun'`, `amount=-1`

Navigation checks:
- [ ] "Re-run →" link → `/backtest/new?rerun={slug}&query={encoded}` — confirm full URL in address bar
- [ ] "Buy credits →" (0-credit state) → `/dashboard/credits` — confirm address bar
- [ ] After re-run completes → new report at its own slug (not source slug) — confirm address bar

Error path checks:
- [ ] `is_rerun=true` passed with user having 0 credits → pipeline emits `insufficient_credits`, credits stay at 0 (check psql)

Story acceptance checks (Story 9):
- [ ] "Re-run →" link visible for auth user with credits — Story 9, Step 1
- [ ] "Re-run requires 1 credit. Buy credits →" visible for 0-credit user — Story 9, error path
- [ ] `/backtest/new` with pre-fill: query present, amber notice present — Story 9, Step 2
- [ ] Re-run costs exactly 1 credit — Story 9 criterion

### Demo inputs

| Input | Value |
|-------|-------|
| Source report slug | `SELECT slug FROM backtest_reports LIMIT 1` in psql |
| Test URL | `/backtest/new?rerun={slug}&query=Buy%20Nvidia%20every%20time%20the%20US%20announces%20new%20AI%20chip%20restrictions%20on%20China` |
| Credits before | 3 |
| Expected credits after | 2 |

Prerequisites: Dev user logged in with ≥ 1 credit. At least one completed report.

### Smoke test

1. Log in. Navigate to a completed report. Scroll to Section ②. [Story 9, Step 1]
   Below the parameters list: "Re-run with adjusted parameters →" text link.
2. Click it. Address bar: `/backtest/new?rerun=...&query=...`. [Story 9, Step 2]
   Textarea is pre-filled. Amber notice reads "Re-running — 1 credit will be deducted..."
3. Click "Run Backtest →". Complete the full pipeline flow.
4. Check the dashboard top nav. Credit balance should be 1 lower.

Navigation check: Click "Re-run →". Confirm address bar contains `?rerun=` and `&query=`.

Error scenario: In psql, set `credits = 0`. Refresh the report. Section ② should show
"Re-run requires 1 credit." with "Buy credits →" — not the re-run link.

---

## Step 24 — Report Management API (Delete & Visibility)

Create the two server endpoint files that Steps 15 and 17 reference by URL, and wire the dashboard delete button and the report page owner controls to the real endpoints.

**Depends on:** Step 10 (backtest_reports table), Step 14 (auth)
**Unlocks:** Step 15 delete wiring, Step 17 owner controls wiring
**User stories addressed:** Story 8 — Manage a report (visibility + delete)

**Navigation manifest:**

| Element label | Type | From page | To page / action | Built in step |
|---|---|---|---|---|
| Dashboard "Delete" confirm | POST + local state | R5 `/dashboard` | same page, row removed | This step |
| Report "Confirm delete" | POST + redirect | R6 `/backtest/[id]` | R5 `/dashboard` | Step 15 |
| Report "Make private/public" | POST + same-page update | R6 | same page, label updates | This step |
| Deleted report URL (non-owner) | route guard | R6 | R13 `/backtest/[id]/+error.svelte` | Step 18 |

### Prompt

```
Create two API endpoints and update two existing pages. No new packages.

--- FILE: src/routes/api/reports/[slug]/delete/+server.ts ---

export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) return error(401, { error: "unauthenticated" })
  const report = await getReportBySlug(params.slug)
  if (!report) return error(404, { error: "not_found" })
  if (report.user_id !== locals.user.id) return error(403, { error: "forbidden" })
  try {
    await db`
      UPDATE backtest_reports
         SET is_public = false, updated_at = NOW()
       WHERE slug = ${params.slug} AND user_id = ${locals.user.id}
    `
    return json({ ok: true })
  } catch (err) {
    console.error("[delete report]", err)
    return error(500, { error: "delete_failed" })
  }
}

--- FILE: src/routes/api/reports/[slug]/visibility/+server.ts ---

export const POST: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) return error(401, { error: "unauthenticated" })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.is_public !== "boolean")
    return error(400, { error: "invalid_body" })
  const report = await getReportBySlug(params.slug)
  if (!report) return error(404, { error: "not_found" })
  if (report.user_id !== locals.user.id) return error(403, { error: "forbidden" })
  try {
    await db`
      UPDATE backtest_reports
         SET is_public = ${body.is_public}, updated_at = NOW()
       WHERE slug = ${params.slug} AND user_id = ${locals.user.id}
    `
    return json({ ok: true, is_public: body.is_public })
  } catch (err) {
    console.error("[visibility report]", err)
    return error(500, { error: "update_failed" })
  }
}

--- UPDATE: src/routes/dashboard/+page.svelte ---

Wire the existing inline delete confirmation (built in Step 15) to the real endpoint.

  let deletingSlug  = $state<string | null>(null)
  let deleteLoading = $state<string | null>(null)
  let deleteErrors  = $state<Record<string, string>>({})

  async function deleteReport(slug: string) {
    deleteLoading = slug
    const res = await fetch(`/api/reports/${slug}/delete`, { method: "POST" })
    deleteLoading = null
    if (!res.ok) {
      deleteErrors[slug] = "Could not delete. Try again."
      return
    }
    reports = reports.filter(r => r.slug !== slug)
    deletingSlug = null
  }

Per backtest row layout:
  [Query excerpt  ·  tickers  ·  return  ·  date range]   [View ↗]  [Delete]

  "Delete" — IBM Plex Sans 13px --text-secondary, text link style (no button border)
  On click: deletingSlug = slug

  When deletingSlug === slug (inline block directly below the row, no modal):
    "Delete this backtest? This cannot be undone."  IBM Plex Sans 13px --text-secondary
    [Confirm delete]  outlined --accent-loss border + text, padding 4px 10px
    [Cancel]          text link --text-secondary, margin-left 12px
    On confirm: disable both, "Confirm delete" → "Deleting…" → await deleteReport(slug)
    On cancel: deletingSlug = null

  If deleteErrors[slug]: show below confirmation in --accent-loss 13px.

--- UPDATE: src/routes/backtest/[id]/+page.svelte (owner controls) ---

Owner controls row (Step 17 already determines viewContext="owner"):
  Position: below Section ① (Disclaimer Banner), above Section ②
  Background: --bg-surface, border-bottom: 1px solid --bg-border, padding: 8px 0
  Font: IBM Plex Sans 13px, display flex, justify-content space-between

  let visibilityLoading = $state(false)
  let visibilityError   = $state("")
  let currentIsPublic   = $state(data.report.is_public)
  let justMadePrivate   = $state(false)
  let deleteConfirming  = $state(false)
  let deleteLoading     = $state(false)
  let deleteError       = $state("")

  Left side:
    "This report is {currentIsPublic ? 'public' : 'private'}"
    color: currentIsPublic ? --text-secondary : --accent-amber

    "{currentIsPublic ? 'Make private' : 'Make public'} →" — text link, --text-secondary
    hover: text-decoration underline
    On click:
      visibilityLoading=true, visibilityError=""
      POST /api/reports/{slug}/visibility { is_public: !currentIsPublic }
      200 → currentIsPublic = !currentIsPublic; if now private: justMadePrivate=true
      error → visibilityError = "Could not update visibility. Try again."
      visibilityLoading=false
    While loading: pointer-events none, text → "Updating…"

    When justMadePrivate=true (resets when switched back to public):
      Inline amber notice below the controls row:
        border-left: 3px solid --accent-amber, padding: 6px 12px
        "This report is now private — only you can view it."
        IBM Plex Sans 13px --accent-amber

    If visibilityError: below controls in --accent-loss 13px.

  Right side:
    "Copy share link ↗" — outlined button (same app-wide style)
      On click: await navigator.clipboard.writeText(window.location.href)
        Button → "Copied!" for 1.5s (setTimeout), then reverts.
        (Already built in Step 4 — wire to real clipboard API here if using stub)

    "Delete" — text link, --accent-loss, 13px, margin-left 16px
    On click: deleteConfirming=true

    When deleteConfirming=true (inline BELOW the controls row, not a modal):
      "Delete this report? This cannot be undone." IBM Plex Sans 13px --text-secondary
      [Confirm delete] outlined --accent-loss   [Cancel] text link --text-secondary
      On confirm:
        deleteLoading=true
        POST /api/reports/{slug}/delete
        200 → import { goto } from "$app/navigation"; goto("/dashboard")
        error → deleteError = "Deletion failed. Try again."; deleteLoading=false

--- DO NOT BUILD ---
  Bulk delete, restore/undelete, transfer ownership (all V2)
  Hard delete of DB rows (FKs from credit_transactions prevent this)
```

### Definition of Done

Technical checks:
- [ ] `POST /api/reports/[slug]/delete` as owner → `is_public = false` in psql
- [ ] Same endpoint as different auth user → 403 (test with second account cookie)
- [ ] Same endpoint unauthenticated → 401
- [ ] After soft-delete: report URL in private window → `/backtest/[id]/+error.svelte` (R13)
- [ ] `POST /api/reports/[slug]/visibility { is_public: false }` → psql confirms false; `{ is_public: true }` → confirms true
- [ ] Same endpoint with `{ is_public: "yes" }` → 400 `{ error: "invalid_body" }`
- [ ] Dashboard: "Delete" shows inline confirmation; "Cancel" dismisses; confirm calls endpoint + removes row without page reload
- [ ] Report page: visibility toggle updates label and amber notice inline; button shows "Updating…" while in-flight
- [ ] "Copy share link ↗" copies URL; label → "Copied!" for 1.5s, reverts
- [ ] Report page delete: inline confirmation → "Confirm delete" → redirected to `/dashboard`

Navigation checks:
- [ ] Report page delete confirmed → `/dashboard` — confirm address bar
- [ ] After soft-delete: private window visiting old slug → R13 error page — confirm
- [ ] Dashboard delete: row removed from list; rest of list intact; no GET /dashboard fired (DevTools)

Error path checks:
- [ ] Dashboard: block the delete endpoint (DevTools) → "Could not delete. Try again." inline; row NOT removed
- [ ] Report: network offline, click "Make private →" → "Could not update visibility. Try again." inline; label unchanged

NFR checks:
- [ ] No SQL or stack trace in any 4xx/5xx response body

Story acceptance checks (Story 8):
- [ ] Owner sees controls row between disclaimer and Section ② — Story 8 criterion
- [ ] Make private → non-owner gets 404 immediately — Story 8, Step 1 result
- [ ] Make public → non-owner can view again — Story 8 criterion
- [ ] Delete shows inline confirmation (no modal) — Story 8 criterion
- [ ] After delete → `/dashboard`, report absent — Story 8, Step 3

### Demo inputs

| Input | Value |
|-------|-------|
| Report slug (owner) | `SELECT slug FROM backtest_reports WHERE user_id IS NOT NULL LIMIT 1` |
| Visibility body — private | `{ "is_public": false }` |
| Visibility body — public | `{ "is_public": true }` |

Prerequisites: Dev user must own at least one completed report.

### Smoke test

1. Log in. Navigate to a completed report. Below the disclaimer banner, you should see
   the owner controls row: visibility label, toggle link, "Copy share link ↗", "Delete". [Story 8]
2. Click "Make private →". Label → "This report is private". Amber notice appears.
   Open report URL in private window → R13 error page ("doesn't exist or has been made private").
3. Click "Make public →". Amber notice disappears.
   Reload private window → teaser visible again.
4. Click "Copy share link ↗". Label → "Copied!" for 1.5s, reverts. [Story 3]
5. Click "Delete". Inline confirmation appears (no modal). Click "Cancel". Disappears. [Story 8, Step 2]
6. Click "Delete" again. Click "Confirm delete". You land on `/dashboard`. [Story 8, Step 3]
   Report row is absent from the list. Address bar confirms `/dashboard`.
7. Navigate to the old report URL directly. You should see the R13 error page.

Navigation check: Report page "Confirm delete" → `/dashboard` — confirm address bar.

Error scenario: Open DevTools Network, block `/api/reports/{slug}/delete`. Click "Delete"
on dashboard row, then confirm. You should see "Could not delete. Try again." inline — row intact.
