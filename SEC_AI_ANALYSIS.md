# Reality Ledger — SEC AI analysis pipeline

Reads a company's SEC filings and rebuilds the truth. Filings are treated as
adversarial: presentation maximizes revenue and minimizes liabilities. This
pipeline catalogs every monetary claim, hunts the tricks, and produces a
simplified per-quarter **reality statement**.

Built 2026-08-15. Plan: `docs/PLAN_Reality_Ledger_v0.1.md`. Research that
grounded every design choice: `docs/RESEARCH_Reality_Ledger.md`.

Not user-facing yet. Operator-only, run with `curl`.

---

## Use it

Filings must be synced first (see `SEC_ENPOINT.md`). Then:

```
# start a run (one company per call; runs for different companies go in parallel)
curl -X POST -H "x-sec-token: $SEC_SYNC_TOKEN" \
  "http://localhost:5173/api/reality/run?symbol=SMCI"

# watch progress (SSE stream; add &status for a JSON snapshot instead)
curl -N -H "x-sec-token: $SEC_SYNC_TOKEN" \
  "http://localhost:5173/api/reality/run?cik=0001375365"

# cancel
curl -X DELETE -H "x-sec-token: $SEC_SYNC_TOKEN" \
  "http://localhost:5173/api/reality/run?cik=0001375365"

# read the results (open, no token — everything derives from public filings)
curl "http://localhost:5173/api/reality/0001375365"
```

Viewer: **`http://localhost:5173/reality.html`** — a throwaway scratch page.
Enter a 10-digit CIK (`0001375365` SMCI, `0000937966` ASML). Real terminal
integration comes later.

`SEC_SYNC_TOKEN` is the same token the filings downloader uses
(`dev-sec-token` locally, a secret in prod).

---

## How it works

### The core rule

**Code owns every number. AI owns judgment and prose.** Hardened 2026-08-18
(`docs/AUDIT_Reality_Numbers.md`): the model reports every figure EXACTLY as
printed plus the printed scale word ("millions"), the printed date or window
label ("1-3 years"), and range ends — code does ALL multiplication and ALL
date arithmetic. The reconciler's model call cites entry ids only; code sums
the cited entries and REJECTS (never clamps) anything bigger than the
quarter's own figure. Every AI output is validated by code; uncited claims
are dropped; banned accusatory language is replaced with neutral templates
(`checkLanguageCompliance`, shared with the terminal). Numbers flow one way:

```
cataloger writes entries → investigator writes flags → reconciler derives statements
```

Nobody edits a number after it is written. Amendments mark old entries
`superseded`, never delete them — a restatement's before/after is evidence.

### The stages (RealityRunner Durable Object, one instance per CIK)

| Stage | What happens | AI? |
|---|---|---|
| `xbrl` | Fetch SEC companyfacts JSON (cached in R2, 24h). Map ~30 curated concepts to exact "mechanical" ledger entries. | No |
| `cataloging` | One filing per alarm. Strip HTML (kills the `ix:header` XBRL dump). One whole-document pass catalogs the soft layer: commitments, debt maturities, guarantees, related-party dealings, customer financing, off-balance-sheet structures. 6-Ks: classify the exhibits, then double-pass number extraction. | Yes |
| `investigating` | Deterministic checks (zero tokens) + ONE judgment pass over the catalog. Writes flags. | Both |
| `reconciling` | Code builds per-quarter draft statements. ONE AI call cites entry ids + narratives; code derives each adjustment amount from the cited entries and applies it. Draft AND adjusted are both kept. | Both |

Crash-safe: each filing is checkpointed; an eviction resumes at the next
filing. One expensive unit per alarm (CompanyMonitor discipline).

### Two number sources, one catalog

- **XBRL** — SEC's machine-readable tagged figures (`data.sec.gov` companyfacts,
  free JSON per CIK). Exact, no AI, quarterly for US filers. This is the spine.
- **AI text passes** — the buried layer XBRL can't see: note prose, conditions,
  inferred due dates, counterparties. And for foreign filers' 6-Ks (no XBRL at
  all): number extraction using the double-pass rule — two independently-worded
  prompts, keep only values that agree within 1%, disagreements surfaced and
  never averaged.

Both land in one `ledger_entries` table. `origin` says which ("xbrl" / "ai").
Idempotent: re-runs dedupe on `(cik, content_hash)`.

### Format coverage (all filing families, by design)

| Filer | Quarterly numbers | Annual numbers | Soft layer |
|---|---|---|---|
| US (10-K/10-Q) | XBRL | XBRL | AI pass over the primary doc |
| Foreign (20-F/6-K) | 6-K double-pass (exhibits classified per filing — names are unstable) | XBRL from the 20-F | AI pass over results docs |

Quirks handled (all probe-verified, not assumed):
- **Q4 is never filed** — derived: FY − (Q1+Q2+Q3).
- **Half-year-only prints** (ASML's July 6-K) — derived: Q2 = H1 − Q1.
  Verified: derived Q2-2026 = €9.33B, matches the printed exhibit figure.
- **Week-based fiscal calendars** (ASML quarters end June 28/29, exhibits
  round differently) — dates within 6 days are the same period; duplicate
  frames merge.
- **Currencies**: entries carry their filing currency (USD / EUR / TWD). No FX
  conversion in v1 — each company's statements render in its own currency.
- **Two taxonomies**: concept aliases cover us-gaap and ifrs-full (names
  verified against live SMCI / ASML / TSM facts).

---

## What a reality statement holds (per quarter)

| Field | Plain meaning |
|---|---|
| `revenue` | What they claim they earned |
| `expenses` | P&L spend: cost of revenue + R&D + S&M + G&A + tax |
| `net_income` | Bottom line as filed |
| `conditional_deferred` | Cash collected for work not yet delivered — not real revenue yet |
| `backlog_rpo` | Signed orders not yet delivered or paid. Kept separate (overlaps deferred) |
| `committed_balance` | Debt + leases + purchase commitments at quarter end — promised money |
| `due_schedule` | Dated obligations stated as of that quarter |
| `q4_derived` | True when the quarter was computed from a cumulative period |

Each statement stores **draft** (pure code sums) and **adjusted** (after the
reconciler's cited adjustments), plus the list of adjustments that actually
applied and a narrative. Allowed adjustments only: move revenue↔conditional,
move expense↔committed. Amounts come from the cited entries (code-summed);
an uncited adjustment, or one bigger than the quarter's own figure, never
applies. Dated claims land on the due schedule automatically — there is no
add_due action.

**Forward schedule** (in the JSON + viewer): every due-dated entry grouped by
the calendar quarter it falls due — the wall of obligations ahead. Lump sums
stay lumps; nothing is spread or invented. Financing items (money coming
back) are their own bucket, not mixed into outflows.

---

## The flags (investigator output)

Deterministic — computed in code, zero AI cost:

| Flag | Trigger |
|---|---|
| `filing_cadence` | A 10-K/10-Q/20-F filed far past its deadline, or ≥3 periodic filings bunched on one day |
| `value_revision` | Same figure, same period, materially different values across filings (after a power-of-10 noise filter; AI judges substantive vs clerical) |
| `tagging_quality` | ≥3 scale-shift tagging errors — sloppy controls signal |
| `conditional_ratio` | Deferred revenue growing >2× faster than revenue over up to 8 quarters |
| `receivables_ratio` | Receivables + customer financing growing >2× faster than revenue — sales booked, cash not arriving |
| `cash_conversion` | Two straight years of positive net income with operating cash below 60% of it |
| `extraction_disagreement` | A 6-K figure the two extraction passes read differently — dropped from the ledger, kept on record |

AI-judged — one pass over the catalog, evidence-language enforced:

| Flag | Hunts |
|---|---|
| `vanishing_item` | A claim appears once, then never again |
| `redefinition` | A metric or commitment quietly changes scope or date |
| `one_time_dressing` | One-time items presented as recurring |
| `related_party_exposure` | Commitments / credit / loans concentrated with related parties |
| `subsequent_event` | Post-period events that recontextualize the quarter |
| `off_balance_sheet` | Sole-tenant build-to-suit deals, lender guarantees, uncommenced leases, backstopped entities |
| `circular_financing` | Financing a party that also shows up as a customer — revenue funded by the company's own cash |

Flags cite entry ids. They never change a number.

---

## Proven on real companies (2026-08-15, local runs)

**SMCI** (pilot; chosen because its 2020–2024 accounting story is public
ground truth): 2,244 entries, 13 flags, 27 quarters.
- Deterministic: 10-K filed **240 days late**; 10-Q 148 days late; 3 filings
  bunched on 2025-02-25; 7 XBRL scale errors; deferred revenue 7.6x vs
  revenue 2.8x.
- AI: related-party commitments to Ablecom/Compuware ($152.3M inside the
  $6.2B purchase-commitment wall); the CEO's unsecured personal loan tracked
  across periods and its repayment caught as a subsequent event; the SEC
  settlement liability revision judged substantive; **circular_financing** on
  the Compuware trade-credit-plus-distributor loop; the uncommenced
  datacenter lease and a receivables-sale facility as off-balance-sheet.
- Tie-out: XBRL `PurchaseObligation` = $6,200,000,000 = the note's "$6.2
  billion", exactly.

**ASML** (foreign-format proof): 2,241 entries, 6 flags, 31 EUR quarters.
- **circular_financing**: ASML advancing funds to Carl Zeiss SMT while buying
  from them — its real co-investment structure.
- A capital-expenditure claim that changed **sign** between two filings.
- Quarterly revenue verified against printed exhibits (Q2-2025 €7.69B,
  derived Q2-2026 €9.33B — both match).

**Cost**: fractions of a cent per filing pass on `openai/gpt-5.6-luna`
(~$0.001 per 10-K soft pass measured). A full company run is well under $1.

---

## Data model (D1, migration `0009_long_speed.sql`)

| Table | One row is |
|---|---|
| `ledger_entries` | One monetary claim from one filing: amount, unit, kind (revenue / expense / obligation / contingent_revenue / context / financing), certainty (actual / committed / conditional), period, due_date (+ `inferred_due`), counterparty + `related_party`, source location, origin, `superseded`, content hash |
| `ledger_flags` | One investigator finding: type, origin (deterministic / ai), evidence-language summary, cited entry ids |
| `reality_statements` | One company-quarter: fiscal label, currency, draft, adjusted, adjustments, narrative |
| `reality_runs` | Run index for the DO (session, stage, status, error) |

All keyed on CIK (stable across ticker changes), deliberately not joined to
the Exa `companies` table — this pipeline runs off the SEC archive.

---

## Files

| File | What it is |
|---|---|
| `src/lib/server/reality/xbrl.ts` | companyfacts fetch + curated concept map → mechanical entries |
| `src/lib/server/reality/cataloger.ts` | HTML stripping, soft-layer pass, 6-K classify + double-pass extraction |
| `src/lib/server/reality/investigator.ts` | Deterministic checks + the AI judgment pass → flags |
| `src/lib/server/reality/reconciler.ts` | Quarter frames, derivations, drafts, adjustment application, forward schedule |
| `src/lib/server/reality/config.ts` | Per-role model map (all `openai/gpt-5.6-luna` for now) + R2 cache tunables |
| `src/lib/server/durable-objects/RealityRunner.ts` | The stage machine (extends `StreamingRunner`) |
| `src/lib/server/db/schema/reality.ts` | The four tables |
| `src/routes/api/reality/run/+server.ts` | Start / stream / cancel (token-gated) |
| `src/routes/api/reality/[cik]/+server.ts` | The read model (open) |
| `static/reality.html` | Scratch viewer |
| `src/lib/server/ai.ts` | Now takes a model id per call; `CUSTOM_MODELS` covers models newer than pi-ai's registry |

Tests: `bun test src/lib/server/reality/` — 63 offline tests, LLM surfaces
injected, fixtures shaped from the real probe data.
Number audit: `bun scripts/audit-reality-numbers.ts` — per-class regression
counts from `docs/AUDIT_Reality_Numbers.md`.

---

## Known limits (deliberate, v1)

- **Undisclosed financing is invisible.** If money reaches a customer through
  a third party with no guarantee and no concentration disclosure, filings
  don't show it. The symptoms (receivables_ratio, cash_conversion,
  conditional_ratio) are the proxy.
- ~~Lump sums stay lumps.~~ Changed 2026-08-17: the forward wall spreads.
  Filed payment schedules (by-year XBRL maturity tags for debt / leases /
  purchases) spread evenly across their disclosed windows (`disclosed`);
  remaining dated lumps are straight-lined from statement date to due date
  (`estimated` — labeled, never mixed into disclosed); "after year five" stays
  one unspread bucket at the 5-year boundary. Ledger rows stay as filed — all
  spreading happens at read time in `forwardSchedule`. Latest vintage wins for
  both schedules and restated lumps; AI lumps whose family (debt/lease/purchase,
  keyword-classified) already has a filed schedule are dropped to avoid double
  counting.
- ~~Re-runs re-catalog.~~ Fixed 2026-08-17: `catalog_done` survives across runs
  in the DO storage, so a re-run only redoes the code stages (XBRL, investigate,
  reconcile) — seconds, not an hour. Clear the DO's `catalog_done` if cataloger
  prompts change materially.
- ~~Cataloger occasionally emits a computed or mangled amount.~~ Fixed
  2026-08-18: the model now reports values as printed + a scale word and code
  multiplies; percent and per-share figures route to `value_type`-tagged
  context rows; ranges keep both ends (`amount_high`); past event dates go to
  `event_date`, never `due_date`. Regression meter:
  `bun scripts/audit-reality-numbers.ts` after any fleet pass. A cataloger
  prompt change now re-runs with `POST /api/reality/run?symbol=…&recatalog`
  (wipes the company's ai rows + catalog checkpoint).
- **Dimensional XBRL** (per-customer, per-segment tagged facts) lives in
  filing-level XBRL, not companyfacts — a future upgrade; the AI text pass
  covers it today.
- **Local only.** Filings archive and all results live in local R2/D1.
  Deploying = `wrangler deploy` (the DO binding `REALITY_RUNNER` and migration
  `v4` are already in `wrangler.toml`) + sync filings to prod R2.

## Next

1. **TSM run** — last new wrinkle (IFRS taxonomy, TWD, some XBRL-tagged 6-Ks).
2. **The fleet** — the other 32 companies, one POST each; run a few at a time
   (each company's SEC fetches share the 10 req/s courtesy limit).
3. Prompt tightening from fleet output; then terminal integration.
