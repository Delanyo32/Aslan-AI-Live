# Reality Ledger — Phase 0 Research

Date: 2026-08-15. Gates Phase 1 (schema) per `PLAN_Reality_Ledger_v0.1.md`.
Everything below was probed against live data, not assumed. Probe artifacts
(companyfacts JSONs, the SMCI FY2024 10-K, ASML 6-K exhibits) were pulled from
`data.sec.gov` / `www.sec.gov` with the standard `SEC_USER_AGENT`.

## What was probed

| Source | What |
|---|---|
| `data.sec.gov/api/xbrl/companyfacts/CIK0001375365` | SMCI: 478 us-gaap concepts, 344 with 2020+ facts |
| `data.sec.gov/api/xbrl/companyfacts/CIK0000937966` | ASML: 623 us-gaap concepts, EUR, 20-F only |
| `data.sec.gov/api/xbrl/companyfacts/CIK0001046179` | TSM: 334 ifrs-full concepts, TWD, 20-F + 6-K |
| SMCI FY2024 10-K (accession 0001375365-25-000004, 3.7MB) | note structure + soft layer |
| ASML Q2-2026 quarterly 6-K (0001628280-26-048235) | exhibit structure, text vs images |
| Local D1 `sec_filings` | filing cadence, 6-K naming drift |

## Findings

### F1 — The XBRL spine works for US filers, at quarterly grain

SMCI has the full income statement, cash flow, and the reality-layer balance
items quarterly since 2020: revenue, cost, every opex line, OCF, capex,
inventory, receivables, **deferred revenue** (`ContractWithCustomerLiability*`),
**backlog** (`RevenueRemainingPerformanceObligation`, 27 facts), **purchase
obligations** (`PurchaseObligation`, 27 facts), debt, leases, loss-contingency
accruals. Every fact carries `accn`, `form`, `filed`, `start/end` — provenance
is free.

**Tie-out verified:** XBRL `PurchaseObligation` @ 2024-06-30 = 6,200,000,000 —
exactly the "$6.2 billion" in the 10-K commitments note.

### F2 — Foreign filers: annual XBRL only; quarterly is 6-K text

- ASML: us-gaap tags, **EUR**, facts from 20-F only (15 revenue facts 2020+,
  all annual). Quarterly numbers exist only in 6-K exhibits.
- TSM: **ifrs-full** tags, **TWD**, facts from 20-F *and* some tagged 6-Ks.

Consequences (all confirmed, all schema-relevant):
- entries need a `currency` column (USD / EUR / TWD…). v1 does **no FX
  conversion** — each company's reality statement is in its filing currency.
- concept mapping must support two taxonomies. Verified IFRS names differ
  non-obviously: `ContractLiabilities` (not `CurrentContractLiabilities`),
  `CurrentTradeReceivables`, `LongtermBorrowings`,
  `CurrentPortionOfLongtermBorrowings`, `CurrentLeaseLiabilities`.

### F3 — 6-K quarterly tables are real HTML text (not images)

ASML's `financialstatementsusgaa.htm` (27KB) contains the full US-GAAP income
statement as text (797 numeric tokens); the JPGs alongside are charts. The
archive's skip-images policy loses nothing. BUT:

- The 6-K primary document is a cover page; the numbers live in exhibits.
- Exhibit naming is unstable across years (`form6kq4results…htm`,
  `form6k.htm`, `d893761d6k.htm`). Filenames cannot route — each 6-K needs a
  cheap classification pass (read the first ~2KB of each doc, decide:
  quarterly-results exhibit / press release / other).
- Not every 6-K is quarterly results (AGM notices, annual-report transmittals).
  Non-results 6-Ks are catalog no-ops.

### F4 — Cross-filing revisions exist, but need a noise filter

104 (concept, period) pairs on SMCI carry different values across filings.
Dominated by **power-of-10 tagging errors** (1753000 vs 1753000000;
authorized shares 100,000,000 vs 1,000,000,000). Two lessons:

1. The deterministic revision check must drop same-digits/scale-shift pairs
   before flagging — otherwise it's all noise.
2. The noise is itself signal: repeated tagging sloppiness = a control-quality
   flag (`tagging_quality`), counted deterministically. SMCI — a company with
   a real internal-controls history — is measurably sloppy here.

Some residual diffs (e.g. D&A 32.5M vs 24.8M for the same year) are
different-statement-context values, not restatements — the AI judges the
survivors; code never auto-flags a revision as deception.

### F5 — Filing cadence is a deterministic deception signal

Visible in `sec_filings` dates alone: SMCI filed no 10-K in 2024; the FY2024
10-K arrived 2025-02-25 — six months late, the same day as two overdue 10-Qs.
The known auditor-resignation/special-committee story, readable from a date
column. `filing_cadence` flags cost zero AI tokens.

### F6 — The 10-K soft layer is where the reality entries live

SMCI FY2024 10-K note map (typical of US filers):

| Note | Content | Feeds |
|---|---|---|
| 3 Revenue | disaggregation, contract liabilities, RPO, returns reserves, SSP judgment | conditional revenue |
| 7 Lines of Credit / Term Loans | facilities, maturities | committed spend, due dates |
| 8 Convertible Notes | terms, conversion conditions | committed / conditional |
| 9 Leases | payment schedules | committed spend |
| 10 Related Party | see below | related-party exposure |
| 13 Commitments & Contingencies | purchase commitments, litigation | committed spend, contingencies |
| 16 Subsequent Events | post-period bombshells | flags |

Real examples cataloged from this one filing — the calibration set for the
cataloger prompt:
- $6.2B non-cancelable purchase commitments "primarily through the next 12
  months" → committed expenditure, due ≈ FY2025, tied to XBRL.
- $152.3M of those commitments are **to related parties** → committed +
  related_party.
- $26.4M loss liabilities for committed purchases of products **they don't
  expect to sell** → real loss hiding inside a commitment note.
- CEO personally borrowed **$12.9M from the spouse of the related supplier's
  CEO — unsecured, no maturity date** (Note 10 prose). Not a company
  liability; exactly the governance subtext the investigator must flag.

### F7 — Inline-XBRL mechanics

- The FY2024 10-K is 3.7MB HTML → 0.8MB stripped text. Naive tag-stripping
  keeps the `ix:hidden` inline-XBRL context dump (thousands of tokens of tag
  soup). The HTML→text step must remove `ix:hidden` blocks (and prefer the
  document body) before any AI pass.
- Filings carry **dimensional** facts companyfacts never serves — SMCI tags
  related-party purchases (`AblecomAndCompuwareMember × RelatedPartyMember ×
  CostOfGoodsTotalMember`). v1 gets this via the AI text pass; parsing
  filing-level XBRL for dimensions is a clean future upgrade, not a v1 need.

### F8 — Q4 must be derived

10-Ks report annual periods; there is no Q4 10-Q. Quarterly income-statement
series therefore compute Q4 = FY − (Q1+Q2+Q3) in code. Instant (balance-sheet)
concepts don't have this problem. Fiscal calendars vary (SMCI FY ends June 30)
— quarters are keyed by the company's fiscal calendar from the facts
themselves (`fy`, `fp`, `start`, `end`), never by calendar assumption.

## Curated concept map (internal → taxonomy aliases)

Verified present in the probed data unless marked °(check at build time).
Aliases are tried in order; first hit wins. `kind` and `certainty` are what
the mechanical rows get stamped with.

| Internal concept | us-gaap aliases | ifrs-full aliases | kind / certainty |
|---|---|---|---|
| revenue | RevenueFromContractWithCustomerExcludingAssessedTax, Revenues° | Revenue | revenue / actual |
| cost_of_revenue | CostOfRevenue, CostOfGoodsAndServicesSold° | CostOfSales | expense / actual |
| gross_profit | GrossProfit | GrossProfit | derived check |
| rnd_expense | ResearchAndDevelopmentExpense | ResearchAndDevelopmentExpense | expense / actual |
| sales_marketing | SellingAndMarketingExpense, SellingGeneralAndAdministrativeExpense° | °SellingExpense | expense / actual |
| general_admin | GeneralAndAdministrativeExpense | °AdministrativeExpense | expense / actual |
| operating_income | OperatingIncomeLoss | °ProfitLossFromOperatingActivities | derived check |
| net_income | NetIncomeLoss | ProfitLoss | derived check |
| income_tax | IncomeTaxExpenseBenefit | °IncomeTaxExpenseContinuingOperations | expense / actual |
| sbc | ShareBasedCompensation°, AllocatedShareBasedCompensationExpense | °KeyManagementPersonnelCompensationSharebasedPayment | expense / actual |
| ocf | NetCashProvidedByUsedInOperatingActivities | CashFlowsFromUsedInOperatingActivities | cash check |
| capex | PaymentsToAcquirePropertyPlantAndEquipment | PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities | expense / actual |
| capex_unpaid | CapitalExpendituresIncurredButNotYetPaid | ° | expense / committed |
| cash | CashAndCashEquivalentsAtCarryingValue°, CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents | CashAndCashEquivalents | context |
| receivables | AccountsReceivableNetCurrent | CurrentTradeReceivables | context |
| inventory | InventoryNet | Inventories | context |
| deferred_rev_current | ContractWithCustomerLiabilityCurrent | ContractLiabilities | revenue / conditional |
| deferred_rev_noncurrent | ContractWithCustomerLiabilityNoncurrent | (in ContractLiabilities) | revenue / conditional |
| backlog_rpo | RevenueRemainingPerformanceObligation | ° | revenue / conditional |
| debt_short | ShortTermBorrowings, LongTermDebtCurrent° | CurrentPortionOfLongtermBorrowings | obligation / committed |
| debt_long | LongTermDebtNoncurrent, LongTermDebt | LongtermBorrowings | obligation / committed |
| lease_liability | OperatingLeaseLiability | CurrentLeaseLiabilities + °NoncurrentLeaseLiabilities | obligation / committed |
| purchase_obligation | PurchaseObligation, UnrecordedUnconditionalPurchaseObligation° | ° | obligation / committed |
| loss_contingency | LossContingencyAccrualAtCarryingValue | °ProvisionsCurrent | obligation / conditional |
| shares_diluted | WeightedAverageNumberOfDilutedSharesOutstanding | °DilutedWeightedAverageNumberOfShares° | context |

~25 internal concepts. "context" rows anchor the reconciler (cash position,
working capital direction) without being statement lines. "derived check"
rows are consistency tests (revenue − cost ≈ gross_profit), not new data.

## Certainty taxonomy (refined against real filing language)

- **actual** — recognized in the period, unconditional. All mechanical
  statement lines.
- **committed** — a firm obligation; cash hasn't moved yet. Purchase
  commitments, debt maturities, lease schedules, capex incurred-not-paid.
  Carries `due_date` (stated or inferred; "primarily through the next 12
  months" → infer end of next fiscal year, note the inference).
- **conditional** — depends on events or judgment. Deferred revenue (cash
  received, delivery owed), RPO/backlog (contracted, not delivered), returns
  reserves / variable consideration, contingencies, loss liabilities on
  committed purchases.

Plus one orthogonal boolean the SMCI probe forced: **related_party** on any
entry, with a free-text `counterparty`. Related-party exposure is not a
certainty level — a related-party sale can be perfectly actual — it's a
dimension the investigator aggregates over.

## Flag taxonomy (investigator)

Deterministic (code, zero tokens):
1. `filing_cadence` — late / missing / bunched filings (from `sec_filings`).
2. `value_revision` — same (concept, period), materially different values
   across filings, after the power-of-10 / same-digits filter. AI judges the
   survivors before the flag publishes.
3. `tagging_quality` — count of scale-shift tagging errors per filer.
4. `conditional_ratio` — conditional revenue (deferred + RPO) growing
   materially faster than actual revenue over N quarters.

AI-judged (over the catalog, filing order):
5. `vanishing_item` — an entry appears once, then never again.
6. `redefinition` — a metric or commitment quietly changes definition/scope.
7. `one_time_dressing` — one-time items presented as recurring.
8. `related_party_exposure` — concentration of commitments/loans/sales with
   related parties (seeded by `related_party` entries).
9. `subsequent_event` — post-period events that recontextualize the quarter.

Every flag: type, summary (evidence language — reuse
`checkLanguageCompliance`), cited entry ids, cited source locations. Flags
never edit numbers.

## Draft prompts

Full wording lives with the code; these pin role, inputs, and rules.

**Cataloger / soft-layer pass** (per filing; input = stripped note sections,
not the whole document):
> You catalog claims from one SEC filing into a ledger. For each distinct
> monetary claim in these note sections, output: amount, currency, kind
> (revenue / expense / obligation / contingent_revenue), the period it
> belongs to, due_date (stated, or inferred — say which and why in notes),
> certainty (actual / committed / conditional), counterparty + related_party
> if the text names one, the note/section it came from, and a one-line
> evidence-language note. Catalog what the filing says, including unfavorable
> items (loss liabilities, guarantees, personal loans involving officers).
> Do not judge, do not net amounts, do not skip small items that involve
> related parties. Never invent an amount not printed in the text.

**6-K classifier** (per document, first ~2KB):
> Is this document a quarterly-results exhibit (statements or a results press
> release), or something else (AGM notice, transmittal, presentation)?

**6-K number extraction** — double-pass, verbatim discipline from
`extraction.ts`: two independently-worded prompts extract the internal-concept
figures (with currency and period per column — these tables carry Q and
half-year columns side by side); keep only values agreeing within 1%;
0 = not-found placeholder, dropped; disagreements surfaced, never averaged.

**Investigator** (per company; input = catalog + deterministic-flag
candidates, in filing order):
> You audit a catalog of claims a company made across sequential SEC filings.
> Numbers are final — never recompute or restate them. Find: items that
> appear once and vanish; commitments whose scope or date quietly changed;
> one-time items presented as recurring; related-party concentration;
> revisions (candidates attached) that look substantive rather than clerical.
> For each finding: flag type, the entry ids, and a one-line observation in
> evidence language — describe what the filings show, never accuse.

**Reconciler** (per quarter; input = code-built draft statement + entries +
flags):
> The draft statement's numbers are computed and final. Propose adjustments
> only of these forms: move an amount between real and conditional revenue;
> move an amount between actual and committed spend; attach a due-schedule
> entry. Every adjustment must cite entry ids and (where relevant) flag ids,
> with a one-line evidence-language rationale. Output the adjustment list and
> a short narrative for the quarter. Code applies the adjustments; both draft
> and adjusted views are kept.

## Schema addenda vs PLAN v0.1

- `ledger_entries`: add `currency`, `counterparty`, `related_party` (bool),
  `inferred_due` (bool — due_date was inferred, not stated), `taxonomy_tag`
  (the source XBRL concept for mechanical rows).
- `ledger_flags`: `flag_type` from the taxonomy above; add `origin`
  (deterministic / ai).
- `reality_statements`: add `currency`; keep both `draft` (mechanical sums)
  and `adjusted` views with the adjustment list between them.
- New tiny table or config: the concept map (internal ↔ us-gaap ↔ ifrs-full
  aliases). Config file, not DB — it versions with code like rubrics do.

## Implementation gotchas (probe-verified)

1. Strip `ix:hidden` blocks in HTML→text, or the AI reads XBRL tag soup.
2. Q4 income-statement values are derived: FY − (Q1+Q2+Q3). Fiscal calendar
   comes from the facts (`fy`/`fp`/`start`/`end`), never assumed.
3. companyfacts is one fetch per company (~3.5MB for SMCI) — cache in R2
   beside the filings; refresh on new filings, respect the 10 req/s gate.
4. The revision check needs the scale-noise filter before anything is flagged.
5. 6-K exhibits: classify per document; cover pages and AGM 6-Ks are no-ops.
6. Amendments (10-K/A etc.): catalog from the amendment, keep the original's
   entries superseded-not-deleted — a restatement's before/after IS
   investigator input.
7. Foreign currency: no conversion in v1; statements render in filing
   currency.

## Open items (deliberately deferred)

- Filing-level dimensional XBRL (related-party, segment splits) — future
  upgrade; v1 covers it via the AI text pass.
- FX normalization for cross-company comparison — not needed until the fleet
  view exists.
- TSM's tagged 6-Ks (ifrs facts from 6-K forms) — a freebie to exploit when
  the TSM run happens; the concept map already handles the namespace.
