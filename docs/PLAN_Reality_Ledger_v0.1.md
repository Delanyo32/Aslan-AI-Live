# Reality Ledger — Plan v0.1

Status: agreed via grilling session, 2026-08-15. Phases 0-8 complete the same
day — research (`RESEARCH_Reality_Ledger.md`), schema (migration 0009),
per-role models (`ai.ts` + `reality/config.ts`), XBRL client, cataloger,
investigator, reconciler, `RealityRunner` DO + routes, scratch page
(`/reality.html`). Phase 9 pilot: SMCI run executed locally.

Run it: `curl -X POST -H "x-sec-token: $SEC_SYNC_TOKEN" "http://localhost:5173/api/reality/run?symbol=SMCI"`
Watch:  `curl -N -H "x-sec-token: $SEC_SYNC_TOKEN" "http://localhost:5173/api/reality/run?cik=<cik>"` (SSE)
View:   `http://localhost:5173/reality.html` · JSON: `/api/reality/<cik>`

## What this is

A pipeline that reads a company's SEC filings and produces a per-quarter
**reality statement**: real revenue vs conditional revenue, real spend vs
committed future spend, and a schedule of what is due when.

Filings are treated as adversarial. The stated numbers maximize revenue and
minimize liabilities. This pipeline catalogs every claim, hunts the tricks,
and rebuilds a simple truthful view.

## Decisions made (do not re-litigate without a note here)

| Decision | Choice |
|---|---|
| Output artifact | Reality statement per quarter, not a true balance sheet |
| Number source | Hybrid: XBRL spine + AI for the buried layer |
| Catalog shape | One `ledger_entries` table, `origin` column (xbrl / ai) |
| Filing scope | 2020+ (matches the R2 archive). 10-K, 10-Q, 20-F, 6-K. No 8-K, no proxies in v1. Amendments supersede originals |
| Format coverage | Both families from day one. XBRL path (10-K/10-Q/20-F) and text-only path (6-K, AI double-pass). No rebuild later |
| Agents | Three roles, one-way data flow: cataloger → investigator → reconciler |
| Models | Per-role model choice via OpenRouter. Start strong on OpenAI (pin the current top slug — user said "gpt-5.6 luna" — from OpenRouter's live model list at build time) |
| Pilot | SMCI first (known accounting story = ground truth), then ASML or TSMC (6-K path), then the fleet |
| Runtime | New Durable Object stage machine, run locally against local R2/D1. Same code deploys to prod |
| Output surface v1 | D1 + JSON endpoint + one throwaway HTML page. Terminal integration later |

## The three agents

Numbers flow one way. Nobody silently overwrites.

1. **Cataloger** — per filing. Writes ledger entries. XBRL rows are mechanical
   (no AI). AI reads the filing text only for: conditions, commitments, due
   dates (stated or inferred), footnote qualifiers, one-time items. No judgment
   beyond "what does this filing claim."
2. **Investigator** — cross-filing. Compares filings against each other.
   Hunts: numbers that quietly changed between filings, revenue that appeared
   once then vanished, commitments that got redefined, one-time items dressed
   as recurring. Writes **flags** attached to entries, with citations. Never
   edits a number.
3. **Reconciler** — per quarter. Builds the reality statement from entries +
   flags. Moves conditional revenue out of "real," spreads multi-year spend
   into the quarters it belongs to. Every adjustment cites the entries and
   flags that drove it.

Same discipline as the terminal: code owns numbers, AI explains and judges.

## Phases

### Phase 0 — Research (first, explicitly requested)

Probe real documents before freezing anything. No assumptions.

- Pull SMCI's `data.sec.gov/api/xbrl/companyfacts` JSON. List which us-gaap
  concepts actually appear, at what granularity, per quarter.
- Read one real SMCI 10-K and one 10-Q from R2. Map where the soft layer
  lives: commitments & contingencies note, revenue recognition note, debt
  maturity schedule, purchase obligations table.
- Read one real ASML or TSMC 6-K from R2. Map its structure (no XBRL — what
  do the quarterly tables look like, how consistent are they).
- Deliverable: `docs/RESEARCH_Reality_Ledger.md` pinning:
  - the curated XBRL concept list (~30 concepts)
  - the certainty taxonomy (actual / committed / conditional — refined
    against what filings actually say)
  - the flag taxonomy for the investigator
  - draft prompts for all three agents, grounded in real filing text
  - the 6-K extraction approach (double-pass, reusing the
    `extraction.ts` discipline)
- Gate: schema (Phase 1) is not written until this doc exists.

### Phase 1 — Schema

New file `src/lib/server/db/schema/reality.ts` + drizzle migration.

- `ledger_entries`: id, cik, accession, amount, unit, kind
  (revenue / expense / obligation / contingent_revenue), period, due_date,
  certainty (actual / committed / conditional), source_location (where in the
  doc), notes, origin (xbrl / ai), created_at. Unique on a content hash for
  idempotent re-runs.
- `ledger_flags`: id, cik, entry_ids (json), flag_type, summary, detail,
  citations (json), created_at.
- `reality_statements`: id, cik, quarter, real_revenue, conditional_revenue,
  real_spend, committed_spend, due_schedule (json), narrative,
  adjustments (json — each one citing entry/flag ids), created_at.
- `reality_runs`: run index mirroring `terminal_runs` (session, stage,
  status), for the DO.

### Phase 2 — Per-role models

Small change to `src/lib/server/ai.ts`: `getAiModel(roleOrId?)` accepting an
override. Role → model map lives in the new pipeline's config file. Pin exact
OpenRouter slugs by querying `openrouter.ai/api/v1/models` at build time.
Verify the slug resolves via `getModel()` before wiring it in.

### Phase 3 — XBRL client

`src/lib/server/reality/xbrl.ts`. Fetch companyfacts by CIK (reuse
`SEC_USER_AGENT` + rate-limit discipline from `sec.ts`). Filter to the curated
concept list from Phase 0. Emit mechanical ledger entries (origin: xbrl).
Pure mapping functions, offline-testable with a saved companyfacts fixture.

### Phase 4 — Cataloger

`src/lib/server/reality/cataloger.ts`.

- XBRL family (10-K/10-Q/20-F): mechanical rows from Phase 3 + one AI pass
  over the filing's soft sections (from R2, HTML stripped) for conditional /
  committed / inferred entries.
- 6-K family: AI double-pass over the document text — two independently
  worded prompts, keep only figures that agree within 1% (same rule as
  `extraction.ts`). Soft layer extracted in the same pass.
- Injectable LLM + storage surfaces, offline tests with fixture text
  (house pattern).

### Phase 5 — Investigator

`src/lib/server/reality/investigator.ts`. Input: the full catalog for one
company, in filing order. Compares adjacent filings and same-period claims
across filings. Emits flags only — typed by the Phase 0 taxonomy, every flag
citing entry ids. Deterministic pre-checks in code where possible (e.g. same
(concept, period) reported with different values across filings is a code
check, not an AI guess); AI covers the judgment cases.

### Phase 6 — Reconciler

`src/lib/server/reality/reconciler.ts`. Per quarter: code sums the mechanical
entries into a draft statement; AI proposes adjustments (each citing entries /
flags); code applies them and keeps both the draft and adjusted views.
Language pass reuses `checkLanguageCompliance` — flags and narratives are
observations, never accusations.

### Phase 7 — DO + routes

`RealityRunner` DO extending `StreamingRunner` (same as
`TerminalReportRunner`): stages `cataloging (per filing, checkpointed) →
investigating → reconciling → complete`. Checkpoint per filing so an eviction
resumes, not restarts. Wire into `wrangler.toml` + hooks re-export +
`patch-worker-durable-objects.mjs`.

Routes:
- `POST /api/reality/run?symbol=X` (token-gated like `/api/sec/sync`)
- `GET /api/reality/[cik]` — JSON: statements, flags, entries.

### Phase 8 — Scratch page

One plain page (or static HTML) rendering the JSON: quarterly table, flags
list, drill-down to entries with citations. Throwaway by agreement.

### Phase 9 — Pilot + acceptance

1. Run SMCI end to end locally.
2. Acceptance checks:
   - **Tie-out (mechanical):** cataloged quarterly revenue totals match the
     XBRL-stated totals exactly. If the catalog can't reproduce the stated
     numbers, nothing downstream is trustworthy.
   - **Ground truth (judgment):** investigator flags line up with SMCI's
     documented 2020–2024 events (revenue-recognition settlement, delayed
     10-K, auditor resignation quarters).
   - **Traceability:** every reconciler adjustment resolves to real entry and
     flag ids.
3. Run ASML (or TSMC) to prove the 6-K path.
4. Record per-role token cost from usage logging → decide model downgrades.
5. Only then: the fleet.

## Cost expectations

Pilot (SMCI, ~27 filings): tens of dollars on a strong model, one-time.
XBRL rows are free. Re-runs are incremental (content-hash dedupe + only new
filings), so steady-state cost is one filing's worth per new filing.

## Risks

- **XBRL granularity** may be coarser than hoped for some concepts
  (segment/footnote detail is often text-only). Phase 0 measures this before
  the schema freezes.
- **6-K inconsistency**: foreign quarterly docs vary widely in structure.
  Double-pass agreement is the guard; expect lower coverage than the US path
  and record it honestly (confidence field, not silence).
- **Investigator false positives**: an accusation-shaped flag on innocent
  restatement noise. Mitigation: deterministic pre-checks, evidence-language
  scrub, flags render as observations with citations.
- **Model slug drift**: "gpt-5.6 luna" pinned at build time from the live
  OpenRouter list; config-only change to swap.
