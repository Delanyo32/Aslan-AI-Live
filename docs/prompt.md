You are helping me generate a build_sequence.md for my project using Claude Code as the builder.
Before you write a single step, you must complete four phases in order. Do not skip any phase.
Do not begin the next phase until the current one is fully confirmed.

---

PHASE 1 — CONFIRM THE STACK

Ask the user the following questions and wait for answers before proceeding:

1. What is your frontend framework and runtime? (e.g. SvelteKit + Bun, Next.js + Node)
2. What is your database and ORM/query client? (e.g. PostgreSQL + postgres.js, SQLite + Drizzle)
3. What library are you using for auth? (e.g. better-auth, Lucia, NextAuth, Clerk)
4. What are you using for payments? (e.g. Stripe, Polar.sh, Lemon Squeezy)
5. What are you using for transactional email? (e.g. Resend, Postmark, Loops)
6. Are there any AI SDK preferences? (e.g. Anthropic SDK directly, OpenRouter, Vercel AI SDK)
7. What testing approach do you want? (e.g. unit tests per step, integration only, none in sequence)

Do not infer or assume any library choices. If the user gives a partial answer, ask follow-up
questions until each slot is filled.

---

PHASE 2 — PAGE & ROUTE INVENTORY

This phase must be completed and confirmed by the user before any user stories or steps are written.
Its output is the source of truth for every URL, every link, and every navigation decision
in the rest of the document.

STEP 2A — ENUMERATE ALL ROUTES

Read the PRD, design.md, and any other provided documents. List every distinct URL or route
pattern the application will have in V1. For each route, fill in all six fields:

  | Route | Auth level | Page title | Who reaches it | What it links away to | User need it serves |
  |-------|-----------|------------|----------------|-----------------------|---------------------|

  Auth levels:
    PUBLIC         — no login required
    PUBLIC/TEASER  — no login, but content is gated (e.g. blurred until email submitted)
    AUTH           — login required; redirect to login if no session
    AUTH+VERIFIED  — login required AND email must be verified
    OWNER-ONLY     — login required AND user must own the resource

  "Who reaches it" — list every inbound path: direct URL, redirect from another page,
    link click, post-submit navigation, email link, webhook redirect, etc.

  "What it links away to" — list every button, text link, form submission, and programmatic
    navigation (goto, redirect, window.location) that leaves this page, with the exact
    visible label and destination URL.

  "User need it serves" — one sentence: what does the user accomplish on this page?

STEP 2B — ROUTE COMPLETENESS CHECK

After listing all routes, apply the following three checks. Do not proceed to Phase 3 until
all three pass:

  CHECK 1 — Every exit destination is in the inventory.
    For each URL listed under "What it links away to" across all rows: confirm it appears
    as a Route in the table. If a destination URL is missing, add the missing route now.
    Common missed routes: /dashboard/account, /auth/check-email, /auth/verify-email,
    error pages (+error.svelte), any "coming soon" link target.

  CHECK 2 — Every route has at least one inbound path.
    Every route in the table must appear as a destination in at least one other route's
    "What it links away to" column, OR be a direct-entry URL (like the homepage).
    A route with no inbound path is either unreachable or missing a link somewhere.

  CHECK 3 — Every route has at least one outbound path.
    Every route in the table must have at least one exit. If it has none, it is a dead end.
    Exception: routes that only redirect (e.g. OAuth callbacks) are exempt if their
    redirect destination is listed.

Output this as a completed table. Show the three check results as PASS/FAIL with notes.
Do not proceed to Phase 3 if any check fails — fix the inventory first.

---

PHASE 3 — USER STORY MAP

A user story map produces the same information as a flow list, but anchors every screen,
every UI element, and every navigation decision to a concrete human need. This makes gaps
obvious: if a page in the inventory does not appear in any story, it has no justification.

STEP 3A — WRITE THE USER STORIES

For each distinct goal a user can accomplish in the app, write one user story:

  STORY N — [Short name]

  AS A [specific user type from PRD personas]
  I WANT TO [specific action — one sentence, concrete]
  SO THAT [outcome — why this matters to them]

  Acceptance criteria:
    - [Observable UI state or outcome — written as "The user sees / can / cannot..."]
    - [One criterion per bullet. These feed directly into Definition of Done checks.]

  Pages involved: [List every route from Phase 2 that this story touches]

Rules for writing stories:
  - Use the persona names from the PRD (e.g. "Hobbyist Retail Trader", "Prop Trader").
  - One story per user goal. Do not bundle multiple independent goals into one story.
  - Every route in the Phase 2 inventory must appear in at least one story's "Pages involved."
    If a route has no story, it has no product justification — either write the story or
    remove the route.
  - Do not write stories for backend or API behavior. Stories describe what the user
    experiences, not what the server does.

STEP 3B — TRACE EVERY STORY AS A NAVIGATION PATH

For each story, write a step-by-step navigation trace. This is the most important output
of Phase 3. It produces the source of truth for every link, button label, and page
transition in the build sequence.

Format for each trace:

  STORY N — Navigation trace

  Starting state: [URL and what the user sees before the story begins]

  Step 1: [URL]
    User sees: [Exact page title and key visible elements]
    User action: [Click "[exact button or link label]"] or [Type X in Y field] or [Submit form]
    Result: [New URL or state change — be specific: "navigates to /auth/register" or
             "page transitions to 'clarifying' state (same URL)"]

  Step 2: [URL after navigation, or same URL if state changed]
    ...

  End state: [URL and what the user sees when the story is complete]

  Error path: [What happens if the most likely failure occurs — what does the user see,
               what can they do next]

Rules for traces:
  - Name every UI element by its exact visible label, not its function.
    WRONG: "clicks the submit button"
    RIGHT: "clicks 'Run Backtest →'"
  - Every navigation in the trace must correspond to an exit link in the Phase 2 inventory.
    If the trace introduces a navigation not in the inventory, add it to the inventory now.
  - State changes that do not change the URL must be explicitly noted as "(same URL, new state)".
  - Every error path must name the specific user-facing message and the next available action.

STEP 3C — NAVIGATION CROSS-CHECK

After all traces are written, produce a Navigation Cross-Check table:

  | Route | Inbound from (story N, step M) | Outbound to (story N, step M) |
  |-------|-------------------------------|-------------------------------|

Every route must have at least one row in both the Inbound and Outbound columns.
Every outbound navigation in a story trace must appear in this table.

This table is used in Phase 4 to assign Navigation Manifest entries to each build step.

---

PHASE 4 — EXTRACT AND DOCUMENT

Using the outputs of Phases 2 and 3, extract the following before writing any build step.

4A. NON-FUNCTIONAL REQUIREMENTS (NFRs)
  Scan the PRD and design.md and extract every non-functional requirement. List each with:
    - A short name
    - The exact constraint (paraphrased from source)
    - Which step(s) in the build sequence will enforce it

  Common NFR categories to look for:
    - Legal / compliance (e.g. non-dismissible disclaimers, attribution requirements)
    - Security (e.g. report access controls, public vs authenticated routes)
    - Performance (e.g. streaming required, no skeleton loaders)
    - Data integrity (e.g. credits must not be deducted on failed runs)
    - Error visibility (e.g. failures must surface to the user, not just to the console)
    - Accessibility / UX rules (e.g. no modal overlays for certain states)
    - Sharing / virality (e.g. public URLs must be accessible without login)
    - Coming soon / deferred scope (e.g. specific markets greyed out, not absent)

  These NFRs must appear as explicit checklist items in the Definition of Done for the
  relevant step — not mentioned once and forgotten.

4B. TECHNOLOGY RESEARCH REQUIREMENTS
  For each external service or non-trivial library named in the confirmed stack or the PRD,
  list what the builder must look up before implementing the step that uses it. Include the
  specific question that needs answering.

  Example:
    - Exa.ai: Confirm whether `type: "deep"` accepts `additionalQueries`. Check whether
      `outputSchema` is a top-level param or nested under `contents`.
    - Alpaca Market Data: Confirm which plan tier provides historical OHLCV. Confirm
      the correct auth header format and whether the Bars endpoint is v1 or v2.
    - [Auth library]: Read the framework integration guide — confirm the hook handler
      export name and whether session is available in server load functions.

  Each step that touches one of these services must include a "Research first" block at the
  top of its prompt instructing the builder to read the relevant docs before writing code.

4C. DEMO INPUT CATALOGUE
  For each user story identified in Phase 3, define one concrete demo scenario — a specific,
  realistic set of inputs a user could type or paste to trigger a complete, observable run
  through that story. Each demo scenario must include:
    - A name (e.g. "Chip restriction trade hypothesis")
    - The exact text, values, or credentials to use (no placeholders — real strings)
    - The expected visible outcome at each major state transition (tied to the story trace steps)
    - Any seed data, environment variables, or fixtures that must exist first

  These demo scenarios feed directly into the "Demo inputs" and "Smoke test" sections of
  each step. When the same input is reused across multiple steps, note which steps share it
  so the user only has to set it up once.

---

PHASE 5 — WRITE THE BUILD SEQUENCE

Now write the build_sequence.md. Apply every rule below.

SEQUENCING RULES:
  - Functionality before UI polish. Build the capability, then build the interface for it.
  - Backend steps come before the UI steps that depend on them.
  - Each step has one concern. Steps covering multiple unrelated concerns must be split.
  - Steps must be individually verifiable without running the whole app.

  NAVIGATION COMPLETENESS RULE — this is the most important sequencing rule:
    Before writing Step N, open the Phase 2 inventory and Phase 3 Navigation Cross-Check
    table. For every link or button this step's page sends the user away to, verify one of:
      a) The destination route was built in a prior step, OR
      b) This step creates a stub for the destination (a route file that renders a placeholder).
    A step is NOT complete if it wires a link to a non-existent route.
    A stub is a SvelteKit route file that renders only: the page title, a "Coming in Step N"
    notice in --text-muted, and a "← Back" link. It must respond with HTTP 200.

  STORY COVERAGE RULE:
    Every build step that creates or modifies a page must declare which user story/stories
    from Phase 3 it is implementing. The step's Definition of Done acceptance criteria must
    be traceable to the acceptance criteria of those stories.

ERROR HANDLING RULES (include verbatim in the build_sequence.md preamble):

  1. No silent failures. Every try/catch must either surface the error to the user
     (via an error state in the UI) or re-throw it. A catch block that only calls
     console.error() is not acceptable — it is a bug.

  2. Every external call (API, database, auth, email) must be wrapped in try/catch.
     The caught error must produce a user-visible state: an inline error message,
     a toast, or a redirect to an error page. The user must never see a blank screen
     or a frozen UI because of a failed network call.

  3. Loading states are required for any action that takes more than one render cycle.
     The UI must reflect "in progress" before the async operation resolves. A button
     that submits a form must be disabled and show a changed label while the request
     is in flight.

  4. Error messages shown to the user must be actionable. "Something went wrong" with
     no next step is not acceptable. Every user-facing error must include either a
     retry action, a link to another path, or an explanation of what to do next.

  5. Server-side errors must not leak implementation details (stack traces, SQL errors,
     internal paths) to the client. Log the full error server-side; send a sanitised
     message to the UI.

  6. Each step's Definition of Done must include at least one error-path check:
     a specific way to deliberately trigger a failure and confirm that the user sees
     a correct, actionable error state — not a blank screen, not a console log.

STEP FORMAT — each step must contain exactly these sections, in this order:

  ## Step N — [Name]

  [One sentence describing the single concern of this step]

  **Depends on:** [Step numbers, or "none"]
  **Unlocks:** [Step numbers that depend on this step]
  **User stories addressed:** [Story numbers from Phase 3 — use the short name too]

  **Research first (if applicable):**
  Before writing any code for this step, read the following and confirm the answers:
  [Specific questions from Phase 4B, scoped to this step only]

  **Navigation manifest:**
  Every interactive element on this step's page(s) that navigates or submits.
  Every row must be verified in the Definition of Done.

  | Element label | Type | From page | To page / action | Built in step |
  |---------------|------|-----------|-----------------|---------------|
  | "Run Backtest →" | button | / | /backtest/new | Step 3 |
  | "Account" | nav link | /dashboard | /dashboard/account | Step 20 |
  | "Sign up →" | text link | /auth/login | /auth/register | Step 14 |

  For entries where the destination is not yet built: column 5 must name the future step.
  This step must then create a stub route for that destination.

  ### Prompt
  [The full Claude Code prompt as a fenced code block. Must include:
    - Exact file paths for every file to be created or modified
    - Design tokens, CSS variables, and typography rules (referenced by design.md section)
    - Navigation wiring: explicit statement of what this page links to and from
    - Stub creation: for every future-step destination in the Navigation Manifest,
      a stub route file must be created here — never leave a link pointing nowhere
    - Error handling for every async operation in this step (per the rules above)
    - What NOT to build yet — explicit scope boundary]

  ### Definition of Done
  Technical checks — each item must specify HOW to verify it (visual, curl, bun test, DevTools):
  [ ] ...

  Navigation checks — one item per row in the Navigation Manifest:
  [ ] Clicking "[element label]" on [page] navigates to [destination] — confirm in browser address bar
  [ ] Stub at [destination] returns HTTP 200 and renders a visible placeholder — confirm in browser

  Error path checks — at least one per step:
  [ ] Deliberately [specific action to cause failure] — confirm the user sees [specific
      message or state], not a blank screen or console error

  NFR checks — one per NFR this step is responsible for:
  [ ] ...

  Story acceptance checks — one per acceptance criterion of the addressed stories:
  [ ] [Exact criterion from Phase 3 story — "The user sees / can / cannot..."]

  ### Demo inputs
  The exact values to use when manually testing this step. Copy-paste ready.
  No placeholders. If the step requires a prior fixture or seed, state exactly how to
  create it before running the demo.

  | Input | Value |
  |-------|-------|
  | [Field or parameter name] | [Exact string, number, or enum value] |

  Prerequisites (if any): [Specific seed data, env vars, or prior steps that must be
  complete — reference the step number and the exact fixture to create]

  ### Smoke test
  A numbered sequence of actions a non-technical user takes in the browser (or terminal)
  to confirm this step is working from the outside. Written in plain English — no code,
  no DevTools, no curl. Each step describes one action and one expected visible outcome.

  Each smoke test step must correspond to one step in the story navigation trace
  from Phase 3. Reference the story step number in brackets: [Story 2, Step 3].

  1. Open [URL] in the browser. You should see [specific visible element or state].
  2. [Action — click, type, select, wait]. You should see [specific change]. [Story N, Step M]
  3. ...
  Navigation check: Click "[element]". You should land on [URL] — confirm address bar.
  Error scenario: [One action that deliberately triggers the error path.]
     You should see [specific user-facing error message or state — not a blank page].

OUTPUT FORMAT:
- Return a single build_sequence.md file
- Begin the file with a preamble section containing:
    - The confirmed stack (from Phase 1)
    - The completed Page & Route Inventory table (from Phase 2)
    - The User Story Map with all traces (from Phase 3)
    - The Navigation Cross-Check table (from Phase 3C)
    - The NFR list with step assignments (from Phase 4A)
    - The demo input catalogue (from Phase 4C)
    - The error handling rules verbatim (for the builder to reference each session)
    - A dependency graph of all steps (ASCII or Mermaid)
- List all steps in build order
- End with a library quick-reference appendix: exact import patterns and method signatures
  for every non-trivial dependency — the builder must never have to guess how to call a library

---

ANTI-PATTERNS — if you catch yourself doing any of these, stop and fix before proceeding:

  ✗ Wiring a link in a step's prompt without verifying the destination exists or is stubbed
  ✗ Writing "navigate to /some/path" in a step without that path appearing in the Phase 2 inventory
  ✗ Writing a story that does not reference at least one route from the Phase 2 inventory
  ✗ Writing a step that references a user flow but not a user story
  ✗ Leaving a page that only appears in the inventory but in no story trace — remove or justify it
  ✗ Writing "the button takes the user to X" without naming the button's exact visible label
  ✗ Adding an outbound navigation to a page after the step that built it is already written —
    this means the Navigation Manifest was incomplete; go back and add the missing stub
  ✗ Writing a Navigation Manifest row with "Built in step: TBD" — every destination must
    have a committed step number before the build sequence is finalised

---

KNOWN IMPLEMENTATION PITFALLS — rules extracted from prior build sessions.
These apply to any product. Include each applicable rule verbatim in the step prompt
that creates the affected code.

DATA INTEGRITY

  1. Every server action that creates a record must associate it with the authenticated user.
     When an authenticated user triggers a server-side action that persists a record (generated
     content, submitted form, AI output, user-created resource), the record MUST store the
     user's ID at write time. Do not assume a background job or hook will link it later.
     Omitting this orphans the record: the user cannot find, delete, or manage it, and any
     ownership check will incorrectly return 403 or 404.
     Apply to: every API handler or server action that inserts a row on behalf of a user.

  2. Quota and limit error messages must state both the requirement and the current balance.
     When a user hits a usage limit (credits, tokens, API quota, seats), the error must
     quantify both sides: "This action requires 3 credits — you have 1."
     A message like "You've used all your credits" is factually wrong when the user has
     some remaining but not enough, and it provides no path forward.
     Pass the required amount and current balance as structured fields in the error response
     so the UI can render them precisely. Never compute this display string server-side only.

STREAMING ENDPOINTS

  3. Server-Sent Event and ReadableStream endpoints require a safe-close pattern.
     When building a streaming endpoint (SSE, ReadableStream), the stream controller may be
     closed by the client disconnecting during an async operation (DB query, external API call).
     Any subsequent attempt to enqueue or close will throw an unrecoverable error.
     Define a helper at the top of the stream handler:
       function safeClose() { try { controller.close() } catch { /* already closed */ } }
     Use safeClose() for every early-exit path inside the try block.
     Keep one unconditional try/catch around controller.close() in the finally block as the
     definitive close. Never call controller.close() directly inside the try block — only
     via safeClose(). Failure to do this produces misleading "unhandled error" logs and
     broken client states when network conditions are poor.

  4. When AI or NLP extracts structured identifiers from unstructured text, validate against
     a dynamic allowlist from the authoritative source — not a hand-maintained blocklist.
     Unstructured text (user queries, news articles, documents) will produce false-positive
     identifiers (currency codes, acronyms, common words) that no static list anticipates.
     Instead: load the complete set of valid identifiers from the canonical source (a product
     catalogue, an API, a reference table) at startup, cache it with a TTL appropriate to
     how often it changes, and filter extracted values against it. The same source often
     provides display names and metadata, solving the lookup problem at the same time.

EMAIL GATES & ACCESS CONTROL

  5. Collect the user's email BEFORE the expensive or irreversible operation, not after.
     Placing an email gate after a long operation (AI generation, payment processing, file
     upload) wastes resources on users who will not convert, and creates a broken UX: the
     user waits, then hits a gate before seeing the result.
     Correct sequence: intent → clarification → email capture → operation → result shown in full.
     After the operation completes, use the captured email to set any access tokens or cookies
     before navigating to the result page. For authenticated users, skip the email gate entirely.

  6. "One free action per email" limits must be enforced globally, not per-resource.
     When enforcing a per-email usage limit, the check must query whether the email appears
     in the captures table FOR ANY prior record — not just the one currently being accessed.
     Return a distinct status (HTTP 409, a typed error field) so the client can render a
     specific prompt ("create an account to continue") rather than a generic error.
     Apply the same check as a secondary guard at the point of resource creation (defence in depth).

  7. Authenticated users must bypass all anonymous content gates, regardless of ownership.
     If a page uses a gate (email wall, blurred content, partial preview) for anonymous
     visitors, a logged-in user must never see that gate — even if they do not "own" the
     specific resource. Check session presence first in the server load; if a session exists,
     grant full access before evaluating ownership, cookies, or any other access token.

  8. Acquisition CTAs (email capture, waitlist, "sign up" banners) must be hidden for
     authenticated users.
     Any UI element whose purpose is to capture a new user's email or prompt registration
     must not render when the user is already authenticated. Showing a "join the waitlist"
     or "get started free" CTA to someone who already has an account is confusing and erodes
     trust. Gate these elements on the authenticated/anonymous state resolved server-side.

NAVIGATION & STATE

  9. Multi-step flows must not navigate between pages mid-flow.
     If a user action starts a multi-step process (wizard, pipeline, form sequence), every
     step in that sequence must run on the same page (URL unchanged) or carry all collected
     state to the next page via URL parameters. Navigating to a new page without passing
     state forces the user to re-enter information and signals a broken experience.
     If the full flow cannot live on one page, navigate with all prior state encoded in the
     URL and restore that state immediately on mount — before the user sees the page.

  10. Navigation bars must reflect authentication state on every page, including public ones.
      Every page that renders a nav bar must resolve session state server-side and show:
        - Authenticated: primary link to the user's dashboard or home area
        - Anonymous: login and registration links
      Do not assume any page is only ever seen by one type of user. Landing pages, pricing
      pages, and public content pages are frequently reached by both authenticated and
      anonymous visitors. A nav bar that ignores session state sends the wrong signal to
      returning users.

  11. Form field defaults must be inferred from prior user input, not hard-coded.
      When a multi-step flow collects structured data (a form that follows free-text input,
      a confirmation step that follows a selection), the default values of each field must
      be derived from what the user already provided — not set to a global default.
      Hard-coded defaults that contradict the user's stated intent (e.g. defaulting a
      direction field to "buy" when the user typed "sell") produce silent wrong results that
      are difficult to catch and damage trust. Parse the prior input at component
      initialisation and set defaults accordingly.

  12. "Coming soon" placeholders must capture intent, not just inform.
      Every disabled or greyed-out feature in the UI must give the user a way to express
      interest: a button that opens an email capture form, a waitlist modal, or a subscribe
      action. Each item must associate the user's interest with a specific feature identifier
      so product decisions can be based on per-feature demand signal, not just total signups.
      A tooltip or static label alone wastes every impression.

DELETION & OWNERSHIP

  13. Deletion and ownership checks must account for records that may have no owner.
      In any product where records can be created anonymously (before registration, via a
      public API, during an interrupted auth flow), some records will have a null or missing
      owner ID. A deletion endpoint that checks `record.user_id === current_user.id` will
      return 403 for all null-owner records, making them permanently undeletable.
      Safe pattern: treat a record as owned by the requesting authenticated user if its
      stored owner ID matches, OR if it has no owner at all. Apply this same logic to the
      database WHERE clause in the delete query so the row is actually removed, not just
      passed the ownership check. Document which record types can be ownerless and why.
