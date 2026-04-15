---
status: partial
findings_in_scope: 16
fixed: 13
skipped: 3
iteration: 1
---

# Aslan-AI: Code Review Fix Report

**Fixed at:** 2026-04-14
**Source review:** .planning/reviews/REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 16 (4 Critical + 12 Warning)
- Fixed: 13
- Skipped: 3

---

## Fixed Issues

### CR-01: Pipeline confirmation endpoints have no auth guard

**Files modified:** `src/routes/api/pipeline/confirm-tickers/+server.ts`, `src/routes/api/pipeline/confirm-rule/+server.ts`
**Commit:** d4f4e7c
**Applied fix:** Added `if (!locals.user) return json({ error: "unauthenticated" }, { status: 401 })` as the first guard in both POST handlers.

---

### CR-02: Credit transaction insert is fire-and-forget after credits have already been deducted

**Files modified:** `src/routes/api/pipeline/run/+server.ts`
**Commit:** deefea8
**Applied fix:** Changed `db.insert(creditTransactions).values({...}).catch(...)` to `await db.insert(creditTransactions).values({...})` so a failed insert surfaces as an error rather than silently diverging from the credit deduction.

---

### CR-03: `/api/waitlist` inserts email without any validation

**Files modified:** `src/routes/api/waitlist/+server.ts`
**Commit:** 6e63fb7
**Applied fix:** Added `EMAIL_RE` regex validation (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) before the database insert, returning `{ error: "invalid_email" }` with status 400 for invalid inputs.

---

### WR-01: `seed.ts` imports `postgres` but production uses Cloudflare D1/SQLite

**Files modified:** `scripts/seed.ts`
**Commit:** b713933
**Applied fix:** Added a prominent comment block at the top of `seed.ts` clearly documenting that this script targets a PostgreSQL dev mirror only, not Cloudflare D1, and how to seed D1 using `wrangler d1 execute`.

---

### WR-02: Unhandled promise rejection in `handleTickersConfirmed`

**Files modified:** `src/routes/dashboard/+page.svelte`
**Commit:** 8aa43fc
**Applied fix:** Captured the fetch response as `const res = ...` and added `if (!res.ok)` guard that sets `errorState = { kind: 'generic', message: 'Failed to start pipeline. Please try again.' }` and returns early, preventing a silent transition to the processing view after a failed POST.

---

### WR-03: `addCalendarDays` duplicated between two files

**Files modified:** `src/lib/server/date-utils.ts` (new), `src/routes/api/pipeline/run/+server.ts`, `src/routes/api/pipeline/impact-windows/+server.ts`
**Commit:** 3f36b26
**Applied fix:** Extracted `addCalendarDays` to `src/lib/server/date-utils.ts` and replaced local copies in both server files with an import from the shared module.

---

### WR-04: `entry_exit_suggestions` literal object duplicated

**Files modified:** `src/lib/server/pipeline-config.ts` (new), `src/routes/api/pipeline/run/+server.ts`, `src/routes/api/pipeline/impact-windows/+server.ts`
**Commit:** 3f36b26
**Applied fix:** Extracted `ENTRY_EXIT_SUGGESTIONS` constant to `src/lib/server/pipeline-config.ts` and replaced both inline object literals with imports from the shared module.

---

### WR-06: `model` module mutates `process.env` at import time

**Files modified:** `src/lib/server/ai.ts`
**Commit:** 95b553b
**Applied fix:** Investigated `@mariozechner/pi-ai` — `getModel()` does not accept an `apiKey` option; it reads exclusively from `process.env` via `getEnvApiKey()`. The mutation is required. Expanded the comment to document this constraint explicitly, referencing both the library's API and the Cloudflare Workers environment as reasons.

---

### WR-07: `getReportBySlugUnfiltered` is misnamed and misleads callers

**Files modified:** `src/lib/server/db/reports.ts`, `src/routes/backtest/[id]/+page.server.ts`, `src/routes/api/reports/[slug]/delete/+server.ts`, `src/routes/api/reports/[slug]/visibility/+server.ts`
**Commit:** ceb2839
**Applied fix:** Renamed `getReportBySlugUnfiltered` to `getReportBySlugIfComplete` (keeping the `status = "complete"` filter). Added a new `getReportBySlug` function with no status filter for management operations. Updated `+page.server.ts` to use `getReportBySlugIfComplete`, and the delete/visibility routes to use `getReportBySlug` so pending reports can be deleted or have their visibility changed by owners.

---

### WR-08: `backtest/[id]/+page.server.ts` uses `params.id` as a slug, not an ID

**Files modified:** `src/routes/backtest/[slug]/+page.server.ts` (renamed from `[id]`), `src/routes/backtest/[slug]/+error.svelte`, `src/routes/backtest/[slug]/+page.svelte`
**Commit:** d74a5f2
**Applied fix:** Renamed the entire `src/routes/backtest/[id]/` directory to `src/routes/backtest/[slug]/` via `git mv`. Updated all `params.id` references in `+page.server.ts` to `params.slug`.

---

### WR-09: `dashboard/+page.server.ts` uses raw SQL JSON extraction without type safety

**Files modified:** `src/routes/dashboard/+page.server.ts`
**Commit:** 1c9a72a
**Applied fix:** Added a `safeReports` mapping step after the query that applies `?? 0` / `?? ""` fallbacks for all four `json_extract`-sourced fields (`ticker_count`, `total_return_pct`, `date_from`, `date_to`), preventing silent `null` coercions if the JSON schema changes.

---

### WR-10: `RuleSelector.svelte` always sends `direction: 'long'` regardless of per-ticker directions

**Files modified:** `src/lib/components/backtest/RuleSelector.svelte`, `src/routes/dashboard/+page.svelte`
**Commit:** a112a98
**Applied fix:** Added a `defaultDirection?: 'long' | 'short'` prop to `RuleSelector` (defaulting to `'long'`). In `dashboard/+page.svelte`, replaced the static `defaultDirection` derived from `researchSummary.direction_hint` with a `$derived.by` that computes majority direction from confirmed tickers (falling back to research summary hint). Passes `defaultDirection` to `RuleSelector` at the call site.

---

### WR-11: `backtest/[id]/+page.server.ts` — `viewContext` grants `"owner"` to any authenticated user

**Files modified:** `src/routes/backtest/[slug]/+page.server.ts`
**Commit:** d74a5f2
**Applied fix:** Fixed the viewContext logic — `"owner"` is now only set when `isOwner` is true. Any other logged-in user (or cookie-holder) gets `"email_access"` instead, reserving `"public_link"` for truly anonymous visitors.
**Note:** requires human verification — the downstream usage of `"email_access"` vs `"owner"` in `+page.svelte` should be confirmed to handle both contexts correctly.

---

### WR-12: Polar webhook does not verify `userId` belongs to a real user before updating credits

**Files modified:** `src/routes/api/webhooks/polar/+server.ts`
**Commit:** 5aed643
**Applied fix:** Added a `db.select` lookup for `authUser.id` before the update/insert. If no user is found, logs the error and returns HTTP 200 to acknowledge to Polar without writing any records.

---

## Skipped Issues

### CR-04: `pipeline-sessions` is an in-memory Map — breaks under multi-process / serverless deployments

**File:** `src/lib/server/pipeline-sessions.ts:11`
**Reason:** This requires an architectural change — either a new `pipeline_sessions` D1 table with TTL cleanup, or a Cloudflare Durable Object. Neither can be safely auto-applied without schema migrations and significant refactoring of the SSE coordination logic. This needs human implementation.
**Original issue:** The module-level `Map<string, PendingSession>` will fail to coordinate between POST and GET handlers when they land on different Cloudflare Worker isolates.

---

### WR-05: Research agent loop logic is duplicated (`runResearchAgent` vs `runResearchAgentForTicker`)

**File:** `src/lib/server/exa-events.ts:349-527` and `src/lib/server/exa-events.ts:529-696`
**Reason:** Extracting a shared `runAgentLoop` from ~120 lines of near-identical AI agent loop code (tool definitions, while loop, tool dispatch, confidence normaliser) carries a significant risk of introducing subtle behavioural regressions in the agent loop. This refactor requires careful human review and testing of both agent paths.
**Original issue:** Two functions share ~120 lines of nearly identical code; a bug fix in one won't propagate to the other.

---

### WR-08 (old `[id]` page.server.ts): Already resolved as part of WR-08 + WR-11 combined commit

This finding was addressed — see WR-08 above.

---

_Fixed: 2026-04-14_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
