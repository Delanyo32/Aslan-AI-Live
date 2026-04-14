# UI Review — NewsTrader AI (Aslan-AI)

**Audited:** 2026-04-09
**Baseline:** Abstract 6-pillar design quality standards (no UI-SPEC.md present)
**Screenshots:** Not captured (Playwright CLI unavailable; dev server confirmed running on port 5173)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | CTAs are clear and directive; global error page copy is too generic |
| 2. Visuals | 3/4 | Strong typographic hierarchy on homepage; processing state has no visual affordance |
| 3. Color | 3/4 | Design tokens used consistently; rgba() literals duplicated across 4 files |
| 4. Typography | 3/4 | Well-defined token scale; headline bypasses tokens at 40px/32px hardcoded |
| 5. Spacing | 3/4 | Coherent rhythm; no spacing token system — all values are raw px literals |
| 6. Experience Design | 4/4 | Comprehensive state coverage: loading, error, empty, disabled, and confirmation all implemented |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **Global error page uses "Something went wrong." with no error code context** — Users hitting an unexpected 500 see a dead end with no guidance on what failed or what to do next; the status code is displayed in monospace above but the message is decoupled from it. Fix: change `src/routes/+error.svelte` line 7 to render a conditional message based on `$page.status` — e.g. 404 should read "This page doesn't exist" and 5xx should read "Something went wrong on our end. Try refreshing."

2. **Homepage headline `font-size: 40px` bypasses the design token scale** — The token `--text-3xl` is defined as `56px` and `--text-2xl` as `36px`; the headline sits at `40px` (responsive: `32px`) as a raw pixel literal, creating a value that lives outside the declared scale and will diverge from future token updates. Fix: in `src/routes/+page.svelte` lines 85 and 221, replace the raw `font-size: 40px` and `font-size: 32px` with `var(--text-2xl)` (36px) or add a new `--text-hero` token to the design system in `app.css`.

3. **rgba() accent color tints are hardcoded in 4 separate files** — `rgba(245, 158, 11, 0.06/0.15/0.3/0.4)` (amber tints) and `rgba(248, 113, 113, 0.05/0.1/0.2)` (red tints) appear as literals in `src/routes/backtest/new/+page.svelte`, `src/routes/dashboard/+page.svelte`, `src/routes/dashboard/account/+page.svelte`, and `src/lib/components/backtest/BacktestReport.svelte`. These encode the same semantic intent (warning background, error background) but cannot be changed from a single place. Fix: define `--bg-warning: rgba(245, 158, 11, 0.06)`, `--border-warning: rgba(245, 158, 11, 0.3)`, `--bg-danger: rgba(248, 113, 113, 0.05)`, `--border-danger: rgba(248, 113, 113, 0.2)` in `app.css` and replace all literal uses.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Passing items:**
- Primary CTAs use directive, specific language throughout: "Run Backtest →", "Create account →", "Confirm tickers →", "Run simulation →", "Unlock Report →". The arrow suffix creates a consistent forward motion pattern.
- Empty states are purposeful. Dashboard empty state: "No backtests yet. Run your first one below." (dashboard/+page.svelte line 112). Credits empty state: "No transactions yet." (credits/+page.svelte line 102). Both are contextually correct.
- Error states in the backtest pipeline are domain-specific: "No historical events found matching your hypothesis" with actionable guidance (new/+page.svelte line 149), insufficient credits warning with a direct buy link, API error with confirmation that credits were not deducted.
- Processing state copy in RuleSelector: "Starting simulation..." is an acceptable in-progress label but the trailing "..." is inconsistent with the "…" Unicode ellipsis used elsewhere (register/+page.svelte uses "Creating account…", login uses "Logging in…").

**Issues found:**
- `src/routes/+error.svelte` line 7: `"Something went wrong."` — this is the generic global fallback. It shows the HTTP status code above it but the message does not react to the code. A 404 ("Something went wrong") is confusing and incorrect.
- `src/routes/dashboard/account/+page.svelte` lines 77, 85: `"Something went wrong. Try again."` is used for the password change failure. Acceptable but could distinguish between "wrong current password" (already caught at line 74 as a specific 401 case) vs. generic server errors.
- `src/routes/dashboard/credits/+page.svelte` line 82: `"Error — try again"` on buy failure is thin. Consider "Checkout failed — try again or contact support."
- `src/lib/components/backtest/BacktestReport.svelte` line 262: `"Something went wrong — please try again"` on email gate failure is acceptable for anonymous users but should reassure them no data was lost.
- `WaitlistModal.svelte` line 69: the submit button reads "Join waitlist →" which is good; after success it changes to "You're on the list" (line 35) without the arrow — intentional and appropriate.
- `src/routes/backtest/new/+page.svelte` line 174: generic error fallback renders `errorState.message` directly as user-visible text, which means API-internal error strings like `"connection_lost"` could surface verbatim.

### Pillar 2: Visuals (3/4)

**Passing items:**
- Homepage has a clear visual hierarchy: wordmark (small, quiet) → italic serif headline (large, focal point) → sub text (muted) → textarea (surface elevation) → market selector (secondary) → CTA button (full-width, contained).
- The processing log component (ProcessingLog.svelte) uses a left border rail to signal ongoing activity — an effective minimal affordance for a live-streaming state.
- Charts use a coherent visual language: muted grid-free backgrounds, single prominent line, semantic entry/exit markers (green arrow up, red arrow down).
- The teaser gradient overlay (TeaserChart.svelte lines 80-86) is a strong conversion mechanic — the 60% fade-to-background makes the gate feel natural rather than punitive.
- The confidence badges (HIGH, MEDIUM, LOW) and the amber left-border treatment for warnings are visually distinct without being loud.

**Issues found:**
- During the processing pipeline (view = 'processing'), the only visual feedback is the ProcessingLog streaming text. There is no spinner, progress bar, or pulsing indicator. For users on slower connections where log lines appear slowly, the state can feel frozen. The log-rail border is passive rather than animated. Consider a CSS animation on the border-left (e.g., pulsing opacity) while `visibleLines` is empty or sparse.
- The "☰" hamburger toggle in the dashboard nav (`dashboard/+layout.svelte` line 28) is a raw Unicode character, not an SVG icon. On some platforms this character renders inconsistently at different weights. It works but is fragile.
- The `WaitlistModal` close button uses the Unicode "✕" character (`WaitlistModal.svelte` line 53). Similarly fragile but minor.
- Dashboard report rows wrap on mobile (`dashboard/+page.svelte` line 282, `flex-wrap: wrap`) which is correct, but the `col-query` going `flex-basis: 100%` on small screens means the ticker count, P&L, date range, and actions row could benefit from additional visual grouping to avoid looking like raw data lines.
- The `src/routes/backtest/stub/+page.svelte` dev redirect renders plain unstyled monospace text without applying the design system. This is a dev-only route so impact is minimal, but it exposes the design if navigated to accidentally.

### Pillar 3: Color (3/4)

**Color token usage — passing:**
- The design system defines a disciplined 5-level neutral ramp: `--bg-base`, `--bg-surface`, `--bg-elevated`, `--bg-border`, with text at 3 levels. This is consistently respected across all components.
- Semantic accent usage is correct: `--accent-gain` (green) for positive P&L only, `--accent-loss` (red) for negative P&L and destructive actions only. No accent color bleed into non-semantic uses found.
- `--accent-amber` is reserved for warnings (insufficient credits, coming-soon banners, low-confidence events, rerun notice) — consistent and meaningful.
- Chart tokens (`--chart-line`, `--chart-bench`, `--chart-hold`, `--chart-entry`, `--chart-exit`, `--chart-window`) keep chart rendering coordinated with the design system. EventChart.svelte reads these via `cssVar()` at mount — correct approach.

**Issues found:**
- **rgba() literals duplicated across 4 files** (see Top 3 Fix #3 above). The same semantic background tints for warning (amber) and danger (red) states are re-authored as raw `rgba()` values in:
  - `src/routes/backtest/new/+page.svelte` lines 303, 304, 313, 327, 328, 343
  - `src/routes/dashboard/+page.svelte` lines 389, 435, 436, 445
  - `src/routes/dashboard/account/+page.svelte` line 436
  - `src/lib/components/backtest/BacktestReport.svelte` line 1216
- `WaitlistModal.svelte` line 80: `background: rgba(0, 0, 0, 0.6)` for the modal backdrop is a raw value. Since `--bg-base` is `#0a0a0a` (close to black), consider `--backdrop-overlay` token instead.
- The `WaitlistModal` disabled state (line 166-170) colors the button `color: var(--accent-gain)` with `border-color: var(--accent-gain)`. Using the gain/green color on a disabled "You're on the list" state is clever (positive confirmation) but semantically overloads the success-state color. Minor issue.
- `EventChart.svelte` lines 70-76: fallback hex values in JS constants (e.g., `'#111111'`, `'#3d3b38'`, `'#f0ede8'`) are used as Lightweight Charts initialization fallbacks. These must stay in sync with `app.css` manually. Consider reading them purely from `cssVar()` with no fallback, which would surface token drift faster.

### Pillar 4: Typography (4 — adjusted to 3/4)

**Passing items:**
- The design system defines a clean 7-stop scale: `--text-xs` (11px) through `--text-3xl` (56px) in `app.css` lines 36-43.
- Font family usage is consistent: IBM Plex Sans for prose/UI, IBM Plex Mono for data/numbers/timestamps/tickers, Instrument Serif italic for the hero headline exclusively.
- Weight discipline is tight: only `font-weight: 400` and `font-weight: 500` appear, with 500 reserved for wordmarks, section labels, and the auth title.
- The monospace / sans distinction is semantic and purposeful: all ticker symbols, P&L values, dates in tables, and timestamps use `IBM Plex Mono`; all narrative text uses `IBM Plex Sans`. This is well-executed throughout.

**Issues found:**
- **Homepage headline bypasses the token scale** (see Top 3 Fix #2): `font-size: 40px` at `src/routes/+page.svelte` line 85, responsive to `font-size: 32px` at line 221. Neither value exists in the declared token scale. The closest tokens are `--text-2xl` (36px) and `--text-3xl` (56px). This is a gap in the scale itself, not just inconsistent application.
- `src/routes/auth/register/+page.svelte` lines 210, 220, 229: `font-size: 11px`, `font-size: 15px`, `font-size: 13px` are written as literals in the check-inbox state styles, not using `var(--text-xs)`, `var(--text-base)`, `var(--text-sm)`. The values are correct but the authoring pattern bypasses the tokens.
- `src/routes/auth/check-email/+page.svelte` lines 96, 106, 113: same pattern — `font-size: 11px`, `font-size: 15px`, `font-size: 13px` as literals.
- `PortfolioChart.svelte` line 157 (SVG text element): `font-size="11"` in SVG attribute, which is fine since SVG doesn't support CSS variables directly in attributes. Acceptable exception.
- `WaitlistModal.svelte` line 105: `font-size: 14px` — this value does not exist in the token scale (`--text-sm` is 13px, `--text-base` is 15px). The close button uses a 14px orphan value.

### Pillar 5: Spacing (3/4)

**Passing items:**
- Spacing choices are visually consistent even without a formal token system. Container padding is uniformly 24px on desktop / 16px on mobile (`Container.svelte` lines 11-18). Section gaps use 24px, 40px, 48px, 64px multiples consistently across dashboard layouts.
- The button padding `11px 16px` is used uniformly across the CTA buttons (run-btn, continue-btn, confirm-btn, btn on auth pages) — a reliable repeated pattern.
- Input padding `10px 12px` is consistent across all text inputs in auth, waitlist, and dashboard pages.
- Gap between form fields: `14px` in auth forms, `12px` in password fields, `16px` in account sections — these cluster around a loose 4px grid.

**Issues found:**
- **No spacing token system exists.** All spacing is raw pixel values. The app.css defines a type scale and color tokens but no `--space-*` variables. This is the main gap. With 7 different gap values in ClarifyingQuestions.svelte alone (24px, 20px, 10px, 4px/20px, 4px, 7px), the rhythm is functional but cannot be globally tuned.
- `ClarifyingQuestions.svelte` line 134: `gap: 4px 20px` (row/column gap) mixes a very small row gap with a large column gap. On narrow viewports the `flex-wrap: wrap` radio options could have awkward spacing.
- `RuleSelector.svelte` line 172: `gap: 3px` between preset label and rules text. This is below any standard grid increment and will be fragile across different viewport/font-size combinations.
- `BacktestReport.svelte` spacing values: the report has numerous one-off spacing literals (8px, 12px, 16px, 20px, 24px, 28px, 32px, 40px) defined inline in styles that are not discoverable as a system. Acceptable for a complex report layout but worth documenting.
- `src/routes/backtest/new/+page.svelte` line 239: `.new-backtest` padding-top `13vh` is a viewport-relative value — consistent with the homepage (also 13vh) and intentional for vertical centering, but worth noting as it behaves differently on very tall and very short viewports.

### Pillar 6: Experience Design (4/4)

This is the strongest pillar. The implementation demonstrates thorough state coverage at every interaction point.

**Loading states — excellent:**
- Auth forms: button text changes to "Logging in…" / "Creating account…" with `disabled` attribute during submission.
- Ticker confirmation and rule selection: buttons show "Confirming..." / "Starting simulation..." with `disabled`.
- Dashboard delete: "Deleting…" inline.
- Account name save: "Saving…". Account password change: "Updating…". Session revoke: "Signing out…". Account delete: "Deleting…".
- Credits purchase: "..." with opacity 0.4 on entire pack section while any purchase is in flight.
- Resend verification: "Sending…" in both the register post-state and check-email page.
- Visibility toggle: "Updating…" in BacktestReport.

**Error states — excellent:**
- Pipeline errors are categorized: `no_events`, `api_error` (with stage differentiation between detection and price), `insufficient_credits`, `generic` — each with a distinct message and appropriate recovery action.
- EventSource connection loss handled explicitly in ProcessingLog.svelte line 105-110: closes the stream and calls the onerror handler with `connection_lost` stage.
- All async actions in the account page have catch blocks that surface specific user-facing messages.
- Error messages show inline (not via alert/toast) at field level.

**Empty states — good:**
- Dashboard backtests list: "No backtests yet. Run your first one below."
- Usage history: "No transactions yet."
- Chart data fallback: "No chart data" placeholder in BacktestReport.svelte line 686.
- Research narrative: "Research narrative is being generated…" placeholder while async content loads.

**Destructive action confirmation — excellent:**
- Delete backtest: inline two-step confirm with "Confirm delete" / "Cancel".
- Delete account: inline confirm with full consequence text — "This permanently deletes your account, all saved backtests, and all report access. This cannot be undone."
- Revoke sessions: confirm step with clear explanation of scope.
- All three pattern uses disable the confirm button during the async action.

**Disabled states — thorough:**
- All primary action buttons correctly apply `disabled` attribute during loading and show muted styling.
- TickerConfirmation confirm button additionally disables when `selected.size === 0` — preventing empty submission.
- Low-confidence "Run anyway" button disables while ticker data is still being buffered (`!rankedTickers`).

**Minor gap:** The ProcessingLog has no visual indicator during the period between when it first mounts and when the first log line arrives. An empty `visibleLines` array renders an empty `log-rail` div with a left border but no content — users may be uncertain if the stream has started.

---

## Registry Safety

No `components.json` found — shadcn not initialized. Registry audit skipped.

---

## Files Audited

- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/app.css`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/app.html`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/+layout.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/+error.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/auth/login/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/auth/register/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/auth/check-email/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/backtest/new/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/backtest/stub/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/backtest/[id]/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/backtest/[id]/+error.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/dashboard/+layout.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/dashboard/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/dashboard/account/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/routes/dashboard/credits/+page.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/layout/Container.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/WaitlistModal.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/backtest/BacktestInput.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/backtest/BacktestReport.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/backtest/ClarifyingQuestions.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/backtest/ProcessingLog.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/backtest/RuleSelector.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/backtest/TickerConfirmation.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/charts/PortfolioChart.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/charts/EventChart.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/src/lib/components/charts/TeaserChart.svelte`
- `/Users/delanyoaborchie/Documents/github/Aslan-AI/package.json`
