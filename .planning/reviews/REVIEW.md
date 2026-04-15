---
status: findings
files_reviewed: 88
findings:
  critical: 4
  warning: 12
  info: 10
  total: 26
---

# Aslan-AI: Full Codebase Audit

**Reviewed:** 2026-04-14
**Depth:** deep
**Files Reviewed:** 88
**Status:** issues_found

## Summary

This is a SvelteKit 5 application using Cloudflare D1 (SQLite), better-auth, Drizzle ORM, and an AI pipeline that calls OpenRouter + Exa to run news-driven backtests. The overall architecture is clean and well-structured. The main concerns fall into four areas:

1. **Security**: The `confirm-tickers` and `confirm-rule` pipeline endpoints have no authentication, a fire-and-forget credit transaction insert can silently fail after the user has already been charged, and the `/api/waitlist` endpoint has no email validation.
2. **Silent failures**: Several fire-and-forget database writes, an in-memory session store that breaks under multi-process deployments, and a `seed.ts` script importing `postgres` which conflicts with the D1/SQLite production setup.
3. **Dead code**: `ClarifyingQuestions.svelte`, `IntentConfirmation.svelte`, `UnderstandPreview.svelte`, `UnderstandSummaryCard.svelte`, and `StepCard.svelte` appear to be orphaned from a previous pipeline flow and are not imported by any active route. The `/api/pipeline/detect-events`, `/api/pipeline/impact-windows`, and `/api/pipeline/simulate` endpoints are also unreachable from the current UI.
4. **Technical debt**: Duplicated `addCalendarDays` utility, duplicated `entry_exit_suggestions` object literal, duplicated research agent loop logic, and a module-level `process.env` mutation in `ai.ts`.

---

## Critical Issues

### CR-01: Pipeline confirmation endpoints have no auth guard

**File:** `src/routes/api/pipeline/confirm-tickers/+server.ts:5` and `src/routes/api/pipeline/confirm-rule/+server.ts:6`

**Issue:** Both `POST /api/pipeline/confirm-tickers` and `POST /api/pipeline/confirm-rule` accept any caller without checking `locals.user`. An attacker who knows (or guesses) a valid `session_id` can resolve another user's pending pipeline session with arbitrary tickers or rule parameters, causing the victim's backtest to run with tampered data and deduct their credits for a malicious result.

The session IDs are `crypto.randomUUID()` values generated client-side (in `dashboard/+page.svelte` line 194), so they are not guessable in practice — but the missing auth check violates defense-in-depth and would become exploitable if session ID generation were ever weakened.

**Fix:**
```typescript
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "unauthenticated" }, { status: 401 })
  }
  // rest of handler...
}
```

---

### CR-02: Credit transaction insert is fire-and-forget after credits have already been deducted

**File:** `src/routes/api/pipeline/run/+server.ts:389-395`

**Issue:** After successfully deducting credits from `authUser`, the credit transaction record is written as a fire-and-forget `.catch()`. If the insert fails (D1 timeout, serialisation error, etc.) the user is charged but the transaction history shows nothing. This is a data integrity bug: credits and transactions will diverge silently.

```typescript
// current — silent failure
db.insert(creditTransactions).values({...})
  .catch((e: unknown) => console.error("[pipeline/run] credit_transaction insert failed:", e))
```

**Fix:** Await the insert. Both writes should succeed or fail together. Since D1 does not support full transactions in edge workers, use `db.batch()` to issue both atomically:

```typescript
await db.batch([
  db.update(authUser)
    .set({ credits: sql`${authUser.credits} - ${creditCost}` })
    .where(and(eq(authUser.id, user.id), sql`${authUser.credits} >= ${creditCost}`)),
  db.insert(creditTransactions).values({
    id:          crypto.randomUUID(),
    user_id:     user.id,
    amount:      -creditCost,
    reason:      params.is_rerun === true ? "rerun" : "backtest",
    backtest_id: report.id,
  })
])
```

Note: the current approach also loses the `deducted.length === 0` insufficient-credits check when refactored to `batch()`, so the logic needs restructuring — fetch current credits first, check sufficiency, then batch both writes.

---

### CR-03: `/api/waitlist` inserts email without any validation

**File:** `src/routes/api/waitlist/+server.ts:13-19`

**Issue:** The waitlist endpoint only checks that `email` is truthy — it does not validate the email format. Any non-empty string (including `"x"` or a SQL fragment) is inserted verbatim into the database. While Drizzle parameterises the query (preventing SQL injection), malformed email data pollutes the table and could cause issues with downstream Resend sends.

```typescript
if (!email) {
  return json({ error: "email is required" }, { status: 400 })
}
// No format check before insert
```

**Fix:** Apply the same `EMAIL_RE` regex already used in `capture-email` and `WaitlistModal.svelte`:

```typescript
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!email || !EMAIL_RE.test(email)) {
  return json({ error: "invalid_email" }, { status: 400 })
}
```

---

### CR-04: `pipeline-sessions` is an in-memory Map — breaks under multi-process / serverless deployments

**File:** `src/lib/server/pipeline-sessions.ts:11`

**Issue:** The SSE pipeline uses a module-level `Map<string, PendingSession>` to coordinate between the `POST /run` (which stores params) and the `GET /run` (SSE stream). In Cloudflare Workers, each request may run in a **different isolate**. If `POST` and the subsequent `GET` land on different isolates, `getPipelineParams()` returns `undefined`, and the SSE stream immediately returns 404 ("Session not found or expired"). This is a latent correctness bug that is currently masked by the short time between POST and GET, but is not guaranteed to work in production Workers deployments.

**Fix:** Store pipeline params in D1 (a `pipeline_sessions` table with a short TTL) or in a Cloudflare Durable Object. The session data is already serialisable JSON.

---

## Warnings

### WR-01: `seed.ts` imports `postgres` but production uses Cloudflare D1/SQLite

**File:** `scripts/seed.ts:6`

**Issue:** `seed.ts` connects via the `postgres` npm package to a `DATABASE_URL`, which implies a PostgreSQL connection. The rest of the stack uses Cloudflare D1 (SQLite). The seed script will fail silently or produce wrong results against D1, and is misleading for onboarding. The `creditTransactions.stripe_payment_id` column name (line 59, `app.ts`) also suggests historical PostgreSQL + Stripe usage.

**Fix:** Either update `seed.ts` to use the `wrangler d1 execute` CLI, or clearly document that this script is only for a local PostgreSQL dev mirror and update the README accordingly.

---

### WR-02: Unhandled promise rejection in `handleTickersConfirmed`

**File:** `src/routes/dashboard/+page.svelte:206-213`

**Issue:** `handleTickersConfirmed` calls `await fetch('/api/pipeline/run', ...)` but does not check `res.ok` or handle network errors. If the `POST /run` fails (e.g. 401, 500, network error), the function silently continues, sets `streamUrl`, and transitions to `'processing'` view — leaving the user watching an SSE stream that will immediately 404 because no params were stored.

```typescript
await fetch('/api/pipeline/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(paramsObj),
})
// res.ok is never checked
streamUrl = `/api/pipeline/run?session_id=${sessionId}`
```

**Fix:**
```typescript
const res = await fetch('/api/pipeline/run', { ... })
if (!res.ok) {
  errorState = { kind: 'generic', message: 'Failed to start pipeline. Please try again.' }
  view = 'input'
  return
}
```

---

### WR-03: `addCalendarDays` duplicated between two files

**File:** `src/routes/api/pipeline/run/+server.ts:41-45` and `src/routes/api/pipeline/impact-windows/+server.ts:7-11`

**Issue:** The exact same `addCalendarDays` helper is copy-pasted in both files. Any fix to one (e.g. timezone handling) will not propagate to the other.

**Fix:** Extract to `src/lib/server/date-utils.ts` and import in both files.

---

### WR-04: `entry_exit_suggestions` literal object duplicated

**File:** `src/routes/api/pipeline/run/+server.ts:248-270` and `src/routes/api/pipeline/impact-windows/+server.ts:74-96`

**Issue:** The three-preset `entry_exit_suggestions` object is copy-pasted verbatim in both server files. If a label or description changes, both copies need updating.

**Fix:** Extract to a shared constant in `src/lib/server/pipeline-config.ts` and import it.

---

### WR-05: Research agent loop logic is duplicated (`runResearchAgent` vs `runResearchAgentForTicker`)

**File:** `src/lib/server/exa-events.ts:349-527` and `src/lib/server/exa-events.ts:529-696`

**Issue:** The two `runResearchAgent*` functions share ~120 lines of nearly identical code: tool definitions, the `while` loop, the `toolCall` dispatch, and the `toConfidence` normaliser. The only differences are the system prompt, `MAX_SEARCHES` (15 vs 10), and the ticker injection at the end.

**Fix:** Extract a shared `runAgentLoop(systemPrompt, query, dateFrom, dateTo, maxSearches, onLog)` function that returns raw findings, and keep the two public functions as thin wrappers that build the system prompt and post-process results.

---

### WR-06: `model` module mutates `process.env` at import time

**File:** `src/lib/server/ai.ts:8`

**Issue:** `process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY` runs as a module side-effect at import time, before any request handling. In Cloudflare Workers, `process.env` is a shimmed object and mutations may not be visible to other modules or may be ignored. The comment explains the intent (making the key visible to `pi-ai`), but the approach is fragile.

**Fix:** Check whether `@mariozechner/pi-ai` accepts the API key via its `getModel()` options object (the preferred approach). If not, document why `process.env` mutation is required.

---

### WR-07: `getReportBySlugUnfiltered` is misnamed and misleads callers

**File:** `src/lib/server/db/reports.ts:73-84`

**Issue:** The function is called `getReportBySlugUnfiltered` but it still filters on `status = "complete"`. Reports with `status = "pending"` are silently excluded. Two callers — `delete/+server.ts` and `visibility/+server.ts` — rely on this for ownership checks, meaning a still-pending report cannot be deleted or its visibility changed by its owner.

**Fix:** Either rename to `getReportBySlugIfComplete` to reflect the actual behaviour, or add a second variant without the status filter for management operations.

---

### WR-08: `backtest/[id]/+page.server.ts` uses `params.id` as a slug, not an ID

**File:** `src/routes/backtest/[id]/+page.server.ts:9`

**Issue:** The route parameter is named `[id]` but is used as a `slug` throughout the load function (passed to `getReportBySlugUnfiltered`, used as `report_access_${params.id}` cookie key, etc.). The schema shows `id` is a UUID while `slug` is the 6-char public identifier. The naming inconsistency could cause confusion or bugs if a future route parameter is actually an ID.

**Fix:** Rename the route to `src/routes/backtest/[slug]/` to match the actual lookup semantics.

---

### WR-09: `dashboard/+page.server.ts` uses raw SQL JSON extraction without type safety

**File:** `src/routes/dashboard/+page.server.ts:27-31`

**Issue:** `json_extract()` and `json_array_length()` raw SQL calls bypass Drizzle's type inference. The return types are asserted as `sql<string>` and `sql<number>` without validation. If the JSON shape of `backtest_result` or `event_spec` changes, the query silently returns `null` values that are coerced to 0.

**Fix:** Either validate the returned values at runtime, or materialise `total_return_pct`, `date_from`, `date_to`, and `ticker_count` as dedicated columns on the `backtest_reports` table to avoid raw JSON extraction.

---

### WR-10: `RuleSelector.svelte` always sends `direction: 'long'` regardless of per-ticker directions

**File:** `src/lib/components/backtest/RuleSelector.svelte:44-47`

**Issue:** When the user confirms a rule preset, the component hardcodes `direction: 'long'` in the rule object sent to `/api/pipeline/confirm-rule`. The per-ticker directions chosen in `TickerConfirmation` are passed separately in the pipeline params (via `directions_map`), but the server-side `confirm-rule` validation at line 37 of `confirm-rule/+server.ts` checks `rule.direction` and would reject anything invalid. This is functionally OK because `directions_map` takes precedence in `simulateTrades`, but the hardcoded `'long'` is misleading and could break if the validation logic changes.

**Fix:** Remove `direction` from the rule object sent by `RuleSelector`, or derive it from the `defaultDirection` prop passed from the parent.

---

### WR-11: `backtest/[id]/+page.server.ts` — `viewContext` logic grants `"owner"` to any authenticated user, not just the report owner

**File:** `src/routes/backtest/[id]/+page.server.ts:27-29`

**Issue:**
```typescript
if (isOwner || !!locals.user) {
  viewContext = "owner"
```
Any logged-in user gets `viewContext = "owner"` for any report they can view, even reports they don't own. This means non-owner logged-in users see the full report (owner privileges) rather than the email-gate. The intent appears to be "logged-in users skip the email gate" but the variable name `"owner"` is misleading and downstream code may treat it as actual ownership.

**Fix:**
```typescript
if (isOwner) {
  viewContext = "owner"
} else if (!!locals.user || hasCookie) {
  viewContext = "email_access"
} else {
  viewContext = "public_link"
}
```

---

### WR-12: Polar webhook does not verify `userId` belongs to a real user before updating credits

**File:** `src/routes/api/webhooks/polar/+server.ts:22-39`

**Issue:** After verifying the webhook signature, the handler trusts `metadata.user_id` and directly increments `authUser.credits` without confirming the user exists. If a `user_id` in metadata refers to a deleted account, D1's foreign key constraint may or may not enforce this depending on pragma settings — but the `creditTransactions` insert will also run, leaving an orphaned row.

**Fix:** Wrap in a check:
```typescript
const [user] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, userId)).limit(1)
if (!user) {
  console.error("[polar webhook] unknown user_id:", userId)
  return new Response(null, { status: 200 }) // ack to avoid Polar retries
}
```

---

## Info

### IN-01: Dead component — `ClarifyingQuestions.svelte`

**File:** `src/lib/components/backtest/ClarifyingQuestions.svelte`

**Issue:** This component renders a multi-step "clarifying questions" UI from the old `understand → detect-events` pipeline flow. It is not imported by any active file. The new flow uses `ResearchResults.svelte` instead.

**Fix:** Delete the file or move it to a `_archive/` directory to reduce confusion.

---

### IN-02: Dead component — `IntentConfirmation.svelte`

**File:** `src/lib/components/backtest/IntentConfirmation.svelte`

**Issue:** Not imported by any file. Renders an "Aslan understood" card from the old flow.

**Fix:** Delete or archive.

---

### IN-03: Dead component — `UnderstandPreview.svelte`

**File:** `src/lib/components/backtest/UnderstandPreview.svelte`

**Issue:** Not imported by any file. Also renders the old understand confirmation step.

**Fix:** Delete or archive.

---

### IN-04: Dead component — `UnderstandSummaryCard.svelte`

**File:** `src/lib/components/backtest/UnderstandSummaryCard.svelte`

**Issue:** Not imported by any active file. It wraps `StepCard` for the old understanding display.

**Fix:** Delete or archive.

---

### IN-05: Dead API endpoints from old pipeline flow

**Files:**
- `src/routes/api/pipeline/detect-events/+server.ts`
- `src/routes/api/pipeline/impact-windows/+server.ts`
- `src/routes/api/pipeline/simulate/+server.ts`

**Issue:** These three endpoints implement the old "multi-step REST" pipeline. The current UI uses only `/api/pipeline/research` (SSE) and `/api/pipeline/run` (SSE). The old endpoints are no longer called from any client-side code. They add dead surface area and maintenance burden.

**Fix:** Delete all three, or document explicitly that they are kept as a fallback/debug API.

---

### IN-06: `backtest/stub/+page.svelte` is a dev-only redirect page checked into production code

**File:** `src/routes/backtest/stub/+page.svelte`

**Issue:** Redirects unconditionally to `/backtest/chip01`, a hardcoded seeded slug. This is a developer convenience that should not be reachable in production (no auth guard, no feature flag).

**Fix:** Add a `building` / `dev` environment guard, or delete the route and use a bookmark instead.

---

### IN-07: `src/lib/index.ts` is a placeholder with no exports

**File:** `src/lib/index.ts`

**Issue:** The file contains only the comment `// place files you want to import through the $lib alias in this folder.` It is the default SvelteKit scaffold file and is not used. No file imports from `$lib` directly (all imports use `$lib/server/...` or `$lib/components/...`).

**Fix:** Delete the file.

---

### IN-08: `void sessionId` suppresses an unused-variable warning rather than fixing the root cause

**File:** `src/lib/components/backtest/ProcessingLog.svelte:47`

**Issue:** `void sessionId` is used to prevent a TypeScript/linter warning about an unused prop. The `sessionId` prop was apparently added for parity with other components but is never used in this component's logic (the `streamUrl` already encodes the session ID). The prop itself is the dead code.

**Fix:** Remove the `sessionId` prop from `ProcessingLog` entirely (update the interface and the call site in `dashboard/+page.svelte`).

---

### IN-09: `StepCard.svelte` is an internal implementation detail exported at component level

**File:** `src/lib/components/backtest/StepCard.svelte`

**Issue:** `StepCard` is only ever used by `QuerySummaryCard`, `TickerSummaryCard`, `RuleSummaryCard`, and `UnderstandSummaryCard` (the last of which is dead). It is not a reusable general component. Keeping it as a standalone file adds indirection. If `UnderstandSummaryCard` is deleted (IN-04), `StepCard` is used only by three summary cards.

**Fix:** Low priority. Consider inlining into each summary card or moving to a `_internal/` subdirectory.

---

### IN-10: `creditTransactions.stripe_payment_id` column is a misnomer

**File:** `src/lib/server/db/schema/app.ts:58`

**Issue:** The `stripe_payment_id` column is populated in the Polar webhook with `event.data.id` (a Polar order ID, not a Stripe payment ID). The column name is a historical artifact from a previous payment provider. This is confusing when reading transaction records.

**Fix:** Rename the column to `payment_reference` or `order_id` in a migration.

---

_Reviewed: 2026-04-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
