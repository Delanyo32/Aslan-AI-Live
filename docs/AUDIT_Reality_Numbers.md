# Reality Ledger number audit — 2026-08-18

An audit of the stored data against the live SEC data and against the
filings' own words. Nothing was fixed. This doc points at what is wrong,
why, and the order to fix it in.

How it was done: the local D1 database (60,991 ledger entries, 915
statements, 262 flags, 35 companies) was queried for suspect shapes, and
spot-checked against live `data.sec.gov` numbers.

---

## What is clean

- **The XBRL spine is exact.** NVDA's stored quarterly revenue matches the
  live SEC figures digit for digit, all quarters checked. Zero drafts have
  negative revenue.
- **Q4 derivation is right.** Derived quarters sum back to the filed years.
- **Big numbers are not automatically wrong.** MSFT's $684B remaining
  performance obligation looked absurd and is genuine (live-confirmed).
- **Flags are mostly clean.** Only 10 of 262 flags cite a suspect entry.

The damage is concentrated in the two places where the AI touches amounts:
the soft-layer cataloger and the reconciler's adjustments.

**Overall: 1,346 of 33,726 AI rows (~4%) are suspect on cheap heuristics
alone.** The classes below overlap; the union is the 1,346.

---

## Failure classes (all verified against real rows)

### 1. The AI does scale math, and misses both ways — ~271 rows

The prompt tells the model to "expand in millions/thousands conventions".
That is multiplication, and it is the single biggest error source.

- **Not expanded (233 rows):** notes say "million"/"billion" but the amount
  is under 10,000. `"Short-term borrowings were $17.9 million"` → stored
  amount `17.9`.
- **Expanded 1000x too far (38 rows):** the AI amount is an exact 1000x or
  1,000,000x of the XBRL amount for the same company and period. Amazon's
  "$6.7 billion of income tax contingencies" → stored `$6.7 trillion`.
- **Mangled outright:** IBM note reads "$344 million for the quarter and
  $1.5 billion for the nine months" → stored `$10,902,500,000,000`. Neither
  number appears in the text.

The 6-K double-pass does not protect against this: both passes get the same
"expand the scale" instruction, so they can agree on the same wrong
multiplication.

### 2. Percentages stored as money — ~453 rows

"Four customers accounted for 21%, 12%, 12% and 11% of revenue" → stored as
`amount 11, unit shares, kind revenue`. The schema has no field for a
percent observation, so the model shoves the percent into `amount` and
picks `shares` to pass validation. 321 rows have `unit=shares` with
`kind revenue/financing` — near all are this pattern.

### 3. Per-share figures stored as claim totals — ~223 rows

ASML's dividend of "€1.37 per ordinary share" → stored as an obligation of
`1.37 EUR`. An exercise price of "$40.00 per share" → a financing entry of
`$40`. Per-share prices are not monetary claims.

### 4. Ranges collapsed by the AI — count unknown, seen repeatedly

"410 to 700 restricted stock units" → stored `700`. HPE guidance "between
US$26.1 billion and US$26.9 billion" → stored `$860.8 billion` (neither
endpoint, pure mangle). The schema has one amount field, so the model picks
— or invents.

### 5. `due_date` used for past events — 354 rows

Rows where `due_date` is before `period_end`: acquisition closing dates,
past redemptions, past payments. "ASML acquired Berliner Glas on October
30" is an event date, not money owed. These leak into the per-quarter due
schedules stored on statements (the forward wall drops them at read time,
the statement `due_schedule` does not).

### 6. Reconciler adjustments gut real quarters — 133 of 915 statements

**The worst user-facing inaccuracy.** The prompt asks the AI for "the
portion attributable to THAT quarter" — that is apportionment, i.e. math.
The model instead cites cumulative balances (RPO, total deferred): DELL
proposed moving $82B of "revenue" out of a $33.4B quarter. The clamp then
moves *the entire quarter's revenue*, so the adjusted view shows **zero or
near-zero revenue for 133 quarters (14.5%)** — AI (C3.ai) has 7+ quarters
at exactly 0; AMAT 2025-10-26 shows $6.8B draft → $0 adjusted. Clamping
turned "AI cited the wrong number" into "the company earned nothing".

### 7. The AI does date math by design

Two prompts ask the model to compute dates: inferred due dates ("through
the next 12 months" → add a year to the period end) and payment-table
column ends ("1-3 years" → period end + 3 years). It usually works, but it
is arithmetic delegated to the model. 158 AI rows carry due dates more than
30 years out.

### 8. 6-K double-pass disagreements are thrown away

`RealityRunner.ts:299` logs them to the run stream and drops them. The
design doc says "disagreements surfaced" — they are not stored anywhere.

### 9. Expense gaps are 17x bigger than believed (code bug, not AI)

121 statements have null expenses, not the 7 remembered: **ORCL 28, DLR 27,
HPE 24**, ASML 7, TSM 7, plus scattered others. Cause: `CONCEPT_MAP`
aliases miss those filers' cost tags (DLR is a REIT — its cost concepts
differ), and `flowValue`'s gate requires `cost_of_revenue` plus a second
component or it returns null.

---

## Where the AI still owns a number (inventory)

| Place | What the AI computes today | What it should return instead |
|---|---|---|
| Soft cataloger `amount` | printed value x scale convention | value exactly as printed + a `scale` field (`units/thousands/millions/billions`); code multiplies |
| 6-K extraction `amount` | same multiplication | same split; code multiplies |
| Ranges | picks/invents one number | `value_low` + `value_high` as printed; code policy decides |
| Percent & per-share items | crammed into `amount` | a `value_type` field (`currency/shares/percent/per_share`); code routes percent/per-share out of amount sums |
| Inferred due dates | date arithmetic in the model | the anchor + offset as stated ("12 months from period end"); code adds |
| Payment-table columns | window-end dates | the column label (`lt1y/y1_3/y3_5/gt5y`); code maps to dates (SCHEDULE_MAP already does this for XBRL) |
| Reconciler `amount` | "portion attributable to the quarter" | entry ids only; code takes the amount from the cited entries, and **rejects** (not clamps) anything above the quarter figure |

---

## Fix plan, in order

Each step is a prompt/schema change plus code-side math. Re-catalog cost
matters: cataloger prompt changes force clearing `catalog_done` (hours,
LLM cost); reconciler/alias changes re-run in seconds.

1. **Stop the gutted quarters (seconds to re-run).** In the reconciler:
   drop, do not clamp, any adjustment whose amount exceeds the quarter's
   own figure; require `revenue_to_conditional` to cite flow entries whose
   period matches the quarter, not balance entries. Then change the schema
   so the AI submits entry ids and no amount at all — code derives the
   amount from the cited entries. Fixes the 133 zero-revenue quarters.
2. **Fix the expense aliases (seconds to re-run).** Probe ORCL/DLR/HPE
   live companyfacts for their actual cost tags; extend `CONCEPT_MAP`;
   revisit the two-component gate. Fixes ~79 of the 121 gaps.
3. **Split value from scale in both extraction prompts (one full
   re-catalog — batch with 4 and 5).** New submit fields:
   `value_as_printed`, `scale`, `value_type`, optional `value_high`.
   Code multiplies, routes percent/per-share rows to a non-amount lane,
   stores both range ends. Kills classes 1-4 at the root.
4. **Take dates away from the model (same re-catalog).** Add `event_date`
   distinct from `due_date`; reject `due_date < period_end` in validation;
   have the model return window labels / stated offsets, code computes the
   ISO dates.
5. **Persist 6-K disagreements (same re-catalog).** Write them as
   `ledger_flags` rows (`extraction_disagreement`) instead of log lines.
6. **Add a post-run audit script.** The queries from this audit
   (unexpanded-scale count, percent-as-amount count, power-of-10 matches
   vs XBRL, gutted-quarter count, null-expense count) as one code-only
   script run after every fleet pass — the regression meter for every
   prompt change.

Steps 1-2 are cheap and independent — do them first and re-reconcile.
Steps 3-5 share one expensive re-catalog — land them together.

---

## Status — implemented 2026-08-18, same day

All six steps landed in one pass:

1. Reconciler: the model submits entry ids only; code sums the cited entries
   (currency rows, matching period + statement currency) and **rejects**
   oversized moves. `add_due` was deleted outright — with amounts coming from
   cited entries, every dated claim already reaches the due schedule via
   `dueFor`, so the action only existed to let the model invent numbers.
2. `us-gaap:CostsAndExpenses` added as the `total_costs` fallback (+ tax) for
   ORCL/DLR/HPE-shaped filers.
3. Both extraction prompts now take value-as-printed + `scale`;
   `value_type` (currency/shares/percent/per_share) routes percents (unit
   `PCT`) and per-share figures to context rows; ranges keep both ends in
   `amount_high`. Code does every multiplication.
4. `event_date` column added; "due" dates in the past are dropped; windows
   (`lt1y/y1_3/y3_5/gt5y`) and bare years become dates in code.
5. 6-K double-pass disagreements persist as `extraction_disagreement` flags
   (they survive the investigate-stage flag rewrite; recatalog clears them).
6. `scripts/audit-reality-numbers.ts` runs every check in this doc.

Migration `0010_conscious_elektra` (amount_high, value_type, event_date).
`POST /api/reality/run?symbol=…&recatalog` wipes a company's ai rows +
catalog checkpoint for prompt changes. Fleet re-cataloged the same day —
re-run the audit script for current counts.

Three follow-ups from the post-recatalog audit, same day:

- **Self-consistency guard** (`noteConsistent`, cataloger.ts): when a row's
  own evidence line prints exactly one "X million/billion/trillion", the
  stored amount must sit within 100x of it, else the row drops. Catches the
  residual double-expansions ("$5.0 billion" stored as 5e12) and
  year-as-amount slips the prompt alone did not stop. A one-off sweep
  deleted 573 stored contradictions.
- **RPO/backlog veto** (reconciler.ts): `revenue_to_conditional` can never
  cite an entry whose wording mentions remaining performance obligations,
  backlog, or RPO — future-order money is not recognized revenue, and a
  sub-cap balance was the one shape the amount cap could not reject.
- **DLR expense fallback**: DLR stopped tagging `CostsAndExpenses` years ago;
  its quarterly total is `OperatingExpenses`. That alias joined `total_costs`,
  and the fallback now fires ONLY for filers with no cost_of_revenue at all —
  a filer with a cost anchor keeps a visible null rather than a silently
  COGS-less total.

Two more rules closed the last reconciler holes (probes: AMZN citing
"performance obligations" without "remaining", NOW citing acquisition
consideration, NBIS/PLTR citing quarter-sized conditional balances):
the RPO veto widened to any "performance obligation" wording, each action
only accepts entries of its own economic kind, and a revenue_to_conditional
move above 50% of the quarter's revenue is rejected as flag territory.

63 offline tests pass; svelte-check clean.

### Final audit, 2026-08-18 ~14:16 (after full recatalog + 573-row sweep)

| Class | Baseline | Final |
|---|---|---|
| Unexpanded scale | 233 | 1 (NBIS "in millions of Russian rubles" phrasing) |
| Percents stored as money | 453 | 0 |
| Per-share on currency claims | 223 | 17 (sub-$4 dividend rows — harmless to sums) |
| Past dates stored as due | 354 | 0 |
| Gutted quarters (adjusted revenue <10% of draft) | 133 | **0** (impossible by construction now) |
| Null-expense quarters | 121 | 42 (TSM 9 = 6-K gaps by design; rest ≤4 scattered) |
| Mangled giant amounts | dozens | 18 USD rows >$500B remain, spot-checked genuine (MSFT RPO etc.) |

35/35 companies re-cataloged and reconciled, 0 failures.
