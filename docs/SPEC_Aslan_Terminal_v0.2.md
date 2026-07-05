# Aslan Terminal — Specification v0.2

**Status:** Draft — eight design tensions resolved by interview, 2026-07-04
**Product:** Evolution of Aslan Finance (news-driven backtest platform → AI equity-intelligence terminal)
**Target users:** Pro/prosumer analysts — people who need depth, citations, and defensible scoring
**Coverage:** **Global research, US verdicts** — any global ticker gets the 9-dimension health report; the price-reconciliation verdict ships only where a real price source exists (US via Alpaca)
**Positioning:** *Evidence, not consensus* — reports grade reality against cited evidence and company guidance; they never cite street estimates or price targets
**Data stack (v1):** Exa.ai (all research/information retrieval) · Alpaca (US prices) · OpenRouter/Anthropic (grading LLM) · Cloudflare Workers + Durable Objects + D1

**v0.2 decisions:** valuation verdict is accuracy-gated beta (§5) · global research/US verdicts (§5.2) · evidence-language standard + private flags (§4.5) · credits meter watchlists (§6.2) · evidence-delta gating for grades (§7) · re-run button + earnings-aware scheduler (§6) · announcement ledger is forward-only (§4.4) · no consensus data, by design (§2.4)

---

## 1. Vision

Bloomberg answers *"what is happening?"* — Aslan Terminal answers *"why is the price where it is, and is the value real?"*

The product grades every company on a set of **health frameworks** (rubrics), each built from web-scale evidence retrieved through Exa. Every grade is cited, every claim traceable to a source, and every framework carries a **false-signal screen** that actively hunts for the deception patterns that fool naive sentiment tools: announcement inflation, misleading deals, accounting games, promotional PR.

The end state per company is a **Value Reality Score** — a weighted composite of nine dimension grades — reconciled against the market price: *"the market is pricing X; the evidence supports Y; here is the gap and why."*

Two surfaces, both v1:

1. **On-demand deep report** — enter any global ticker → multi-step AI research run → scored rubric report with price reconciliation. (Same pipeline UX pattern as Aslan's existing backtest flow.)
2. **Live watchlist** — companies under continuous monitoring; dimension scores update as new evidence arrives; users get change alerts ("Policy risk for TSMC moved B→C: new export-control proposal, 3 sources").

---

## 2. What the Bloomberg Terminal offers, and what we replicate

*(Research verified against university Bloomberg guides, Bloomberg's own docs, and practitioner sources, July 2026.)*

### 2.1 The Terminal's information domains → Aslan equivalents

The Terminal is ~30k functions across every asset class; what matters for us is the **fundamental-analysis core** that pro analysts actually live in. Mapping:

| Bloomberg function | Question it answers | Aslan Terminal equivalent |
|---|---|---|
| DES / BICO / BI | What is this company? Expert primer? | Company card (Exa company entity + Agent-run primer) |
| FA / GF | Normalized fundamentals, 40yr history | Filings extraction (§5.1) — v1 covers recent periods, not 40yr history |
| EE / EM / SURP / ERN / MODL | What's expected, revisions, beat/miss history + reaction | **By design, not replicated.** Positioning is "evidence, not consensus" (v0.2 decision): reports grade against evidence and the company's own guidance record (F1), and reverse-DCF (§5.3) replaces "vs estimates" framing. Reports never cite consensus figures |
| ANR / BRC / RES | Where's the street? Crowded? | Same stance — the street's opinion is not an input to any grade |
| OWN / HDS / FLNG / SI / GPTR | Who owns it, who's buying/selling/short? | F1 signals from filings coverage (13F/13D are public) |
| SPLC | Supply-chain map with % exposure per link | F4 Agent-run supplier/customer map. Bloomberg's own SPLC methodology is ~80% public sources (Reg S-K >10%-customer disclosures, transcripts, presentations) + an estimation layer — i.e., the same raw material Exa reaches |
| CN / TOP / NI / NLRT / KI | Company news, alerts, AI key insights | Watchlist monitors + triage + alerts (§6.2) |
| ECO / GOVT-adjacent | Macro releases, policy | F2 policy monitors (regulator-domain-scoped) |
| MGMT | Who runs it? | F6 executive roster (people Webset) |
| CACS / DVD / MA / MARB | Corporate actions, deals | F8 deal ledger + monitors |
| RV / EQRV / COMP | Cheap vs peers and own history? | §5.4 multiples cross-check over competitor Webset |
| EQS (screener) | Idea generation across universe | v2 (needs scored universe first — the watchlist corpus becomes the screener) |
| DDIS / CAST / DRSK | Debt wall, capital structure, default risk | Partial in F9 extraction (net debt, maturities where disclosed); deep credit = v2 |
| IB chat, ALLQ, BVAL, real-time feeds | Execution, OTC pricing, network | **Explicitly not our game** (see 2.2) |

### 2.2 The three-tier data reality (our positioning)

The research splits Bloomberg's value into three tiers:

1. **Public-source synthesis** — fundamentals, filings, ownership, estimates context, supply chains, news, corporate actions. Bloomberg's edge here is *normalization labor*, not secret data. **This is nearly all of fundamental analysis, and it is attackable with web-scale search + LLM extraction. This is our entire product.**
2. **Licensed feeds** — real-time exchange data, tick history, depth. A cost wall (~$50k–200k+/yr), not a moat. We skip it; Alpaca covers the US price context we need.
3. **Network-contributed** — IB chat (where OTC trades actually execute), dealer quotes, BVAL. Not assemblable at any price. We never compete here.

Consequence: Aslan Terminal is an **analysis terminal, not an execution terminal** — and must source from primary materials (filings, transcripts, press, regulators), never from Bloomberg-derived data.

### 2.3 Analyst workflows we replicate (and improve)

- **Pre-market prep** (market → sector → watchlist → single name): our Board feed, sorted by "most deteriorating," with overnight evidence triaged per dimension.
- **Earnings season** (EE → call → SURP → consensus re-rate): report re-runs on filing/call events; guidance-credibility ledger updates; F9 extraction refreshes.
- **Thesis building** (screen → primer → FA → RV → ANR → OWN → filings): the deep report compresses this 6–10-screen manual assembly into one scored, cited document — this is precisely Bloomberg's weakest spot (see 2.4).
- **Monitoring** (NLRT alert rules + PORT): monitors + materiality triage + delta alerts, with the improvement that alerts carry *graded impact* ("F2 B→C"), not just headlines.
- **Supply-chain read-throughs** (SPLC → Analyze): F4 map + cross-company evidence reuse across the competitor/supplier Websets.

### 2.4 Where Bloomberg is weak — and the competitive field

**Terminal weaknesses an AI-native product exploits:** mnemonic command-line UX with months-long learning curve; all-or-nothing ~$32k/yr pricing (a fundamentals analyst subsidizes FX traders); and — most important — **the Terminal shows data, not answers**. "Why is the stock here," "what changed in the thesis," "summarize the bear case across the last 4 calls" all require manual multi-screen assembly. Bloomberg's own AI (Earnings Call Summaries, Document Insights, ASKB) is add-ons to screens, not a reasoning layer. There is no persistent thesis memory and no proactive "this evidence contradicts your assumption" push.

**The AI-terminal field (July 2026):** AlphaSense ($4B, licensed research + expert calls, enterprise), Rogo ($160M Series D, IB/PE workflows), Hebbia (~$700M, doc reasoning), Brightwave (research memos), Perplexity Finance (free answer-engine terminal on partner APIs), Fiscal.ai (fundamentals copilot), Koyfin (cheap data terminal), Fintool (acquired by Microsoft, Apr 2026). 

**Our wedge — what none of them lead with:** rubric-graded company health with **adversarial false-signal screening** and an **announcement follow-through ledger**, reconciled against market-implied expectations. Competitors summarize documents or answer questions; Aslan Terminal maintains a standing, evidence-cited verdict on whether value is real — and shows its work. The deception-detection stance (§4) is the brand.

---

## 3. Exa.ai capability map

What Exa's API gives us (verified against live docs, July 2026 — note the docs have drifted from older material):

### 3.1 Primitives

| Primitive | What it does | Role in Aslan Terminal |
|---|---|---|
| `POST /search` | Web search; types `instant` (~250ms) → `deep-reasoning` (12–40s). `category` enum: `company`, `news`, `financial report`, `research paper`, `personal site`, `people`. Date filters, `includeDomains`/`excludeDomains` (max 1200). Deep types accept `outputSchema` + `additionalQueries`. | Targeted evidence retrieval per rubric signal |
| `POST /contents` | Page text, query-targeted `highlights` (+ scores), `summary` with **custom JSON schema** (structured per-page extraction), `subpages` + `subpageTarget` ("investor relations"), freshness via `maxAgeHours` (0 = force livecrawl) | Evidence extraction; structured facts from filings/IR pages |
| `POST /answer` | Search + cited answer, `outputSchema` supported | Quick factual lookups inside reports |
| **Agent API** (`POST /agent/runs`) | Async multi-step research runs; `effort` minimal→xhigh; `outputSchema` (validated structured output); `input.data` (pass records to enrich); citations in `output.grounding`; 1h max runtime. Fixed pricing per effort: $0.012 / $0.025 / $0.10 / $0.50 / $1.00 | **The grading engine.** One run per dimension (or per company) with `outputSchema` = our rubric schema |
| **Websets** | Verified entity lists (`company`, `person`, `article`…) with per-item criteria verification + enrichment columns; monitors with `search`/`refresh` behaviors; webhook events | Watchlist container; competitor sets; executive rosters |
| **Monitors API** | Standalone scheduled searches, periods `1h`/`6h`/`1d`/`7d`, webhook push, **automatic dedup across runs** | Continuous per-company news/policy/deal tracking |
| Exa Connect (`dataSources` on Agent runs) | Partner data: `similarweb` (traffic/competitors, $0.03), `fiber` (B2B/funding, $0.02), `financial_datasets` (ticker-keyed **news only**, $0.01), `baselayer` (US business verification), `particle` (podcast transcripts). Additional partners on request via sales (Crunchbase, ZoomInfo, Harmonic, Intellizence, Definitive Healthcare…) — none offer public-equity fundamentals, prices, job postings, or social sentiment, so the §3.2 gaps stand. The agent routes to a partner tool when `outputSchema` field *descriptions* name the source (e.g. `"monthlyVisits": {"description": "from Similarweb"}`) — our schemas must use this | Optional enrichments |
| Company entities | Structured properties on company results: workforce total, HQ, founded, revenue/funding estimates, monthly web traffic + history. **Weekly refresh.** | Firmographic baseline; traffic as demand proxy |

### 3.2 What Exa cannot provide (design constraints)

- **No price/tick/quote data.** V1: Alpaca for US prices. Global tickers get information-layer coverage only; price reconciliation is degraded or extracted opportunistically from filings/news (flagged as low-confidence). Schema designed so a global market-data provider slots in later.
- **No structured point-in-time fundamentals or consensus estimates.** We extract fundamentals from filings via `category:"financial report"` + `contents.summary.schema` (LLM extraction, per-figure source citation required). Slower and riskier than a fundamentals API — acceptable for v1 per product decision; the extraction layer is isolated behind an interface so a provider can replace it.
- **No social firehose.** The `tweet` category no longer exists. Retail/social sentiment is out of scope for v1 scoring (noted in the Investor Sentiment rubric as an evidence gap), or served later by a social-data vendor.
- **No sell-side research, ratings, or price targets** (paywalled). Analyst sentiment is inferred from public reporting about analyst actions, not from the notes themselves.
- **No sub-hourly push; no crawl-lag SLA.** Fastest monitor cadence is 1h. This is an *analysis* terminal, not an execution terminal.
- **No structured supply-chain dataset** (vs Bloomberg SPLC). Supplier/customer maps are inferred by Agent runs from filings, news, and company sites — output carries confidence markers and requires citation.

### 3.3 Rate limits & cost basis

Defaults: `/search` 10 QPS, `/contents` 100 QPS. Search $7/1k (deep $12–15/1k), contents $1/1k pages per content type, monitors $15/1k runs, Agent runs $0.012–$1.00 by effort. These drive the unit economics in §8.

---

## 4. The Framework System (core IP)

### 4.1 Anatomy of a framework

Every dimension is a **framework** with the same five-part shape. This is the "category + how to detect it, rubric-style" structure:

```
Framework
├─ Question        — the single question this dimension answers
├─ Signals         — observable indicators, each with:
│    ├─ polarity (supports health / undermines health)
│    ├─ detection recipe (Exa primitive + query template + category + domains + cadence)
│    └─ weight (how much this signal moves the grade)
├─ Grade anchors   — A–F bands with concrete, checkable descriptions
├─ False-signal screen — deception patterns specific to this dimension,
│    each with its own detection recipe; hits cap or discount the grade
└─ Evidence policy — min sources, source-diversity rule, recency window,
     confidence downgrade rules when evidence is thin
```

**Grading rules (all frameworks):**

- Grades are A–F with a 0–100 underlying score. Every grade ships with a **confidence level** (High/Medium/Low) driven by evidence coverage, source diversity, and recency — a thin evidence base can never produce a confident grade.
- **Every claim cites.** A signal with no retrievable source does not count toward the grade.
- **Independence rule:** company-controlled sources (press releases, IR pages, executive interviews) can *raise questions* but cannot *confirm health* on their own. Confirmation requires at least one independent source (customer, regulator, supplier, journalist, court record, hiring data).
- **False-signal hits are asymmetric:** a confirmed deception pattern caps the dimension grade (typically at C) regardless of positive signals, and always surfaces in the report. Deception detection outranks health measurement.

### 4.2 The nine dimension frameworks

#### F1 — Investor Sentiment & Relationship Health

**Question:** Do the investors who own this company understand it, trust management, and hold for the stated thesis — or is the register churning, hostile, or promotional?

**Signals (detection recipes):**

| Signal | Polarity | Recipe |
|---|---|---|
| Tone and consistency of coverage in financial press | ± | `/search category:"news"` — `"{company} investors OR shareholders"`, 90-day window, highlights |
| Activist involvement, proxy fights, public letters | − (usually) | Monitor `1d`: `"{company} activist investor OR proxy fight OR open letter"` |
| Institutional buying/selling reported in media; 13F coverage | ± | `/search` incl. `includeDomains` on filing-coverage outlets; `financial report` for 13D/G |
| Short-seller reports published against the company | − | Monitor `1d`: `"{company} short seller report"`; `personal site` category for research blogs |
| Guidance credibility: history of raised/met vs cut/missed guidance | ± | Agent run over past 8 quarters of earnings coverage |
| IR conduct: responsiveness, restatements of KPIs, canceled calls | − | `/search category:"news"` + `financial report` |
| Dividend/buyback consistency vs cuts and surprises | ± | `financial report` + news |

**Grade anchors:**
- **A** — Stable, informed base; management guidance historically reliable; no live activist/short campaigns; independent coverage tone matches company narrative.
- **C** — Mixed: churning narrative, guidance credibility questioned at least once in 4 quarters, or one unresolved activist/short thesis with partial merit.
- **F** — Open hostility: credible short reports unanswered, serial guidance misses reframed as beats, mass institutional exit, or evidence of coordinated promotion.

**False-signal screen:**
- *Promotional cadence spike* — abnormal press-release volume in the 60 days before a share offering, lockup expiry, or reported insider sales. Recipe: compare PR frequency (news search, company domain) across trailing windows; cross-reference offering/insider news.
- *Paid promotion network* — same bullish narrative appearing near-simultaneously across low-authority sites. Recipe: search result clustering by publish date + domain authority heuristics.
- *Engineered beats* — guidance walked down mid-quarter then "beaten." Recipe: Agent run comparing guidance-change news vs earnings-result news per quarter.

#### F2 — Policy & Governmental Landscape

**Question:** Do laws, regulators, subsidies, and geopolitics currently favor, tolerate, or threaten this business — and which pending changes could flip that?

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| Open investigations, enforcement actions, consent decrees | − | Monitor `1d` with `includeDomains`: sec.gov, justice.gov, ftc.gov, ec.europa.eu + jurisdiction equivalents |
| Pending legislation/rulemaking touching the sector | ± | Monitor `1d`: `"{sector} regulation OR bill OR rulemaking"`, domain-scoped to legislatures/regulators + trade press |
| Subsidies, tariffs, export controls affecting company or inputs | ± | Monitor `6h` during active policy cycles; news category |
| Lobbying posture and political exposure | ± | `/search` on lobbying-disclosure coverage |
| Licenses/approvals pipeline (FDA, FCC, antitrust clearances) | ± | Monitor `1d`, agency-domain-scoped |
| Jurisdictional concentration (revenue exposed to one government's mood) | − | Agent run over filings: geographic revenue split extraction |

**Grade anchors:**
- **A** — Tailwind: subsidized/protected activity, no open enforcement, diversified jurisdictions.
- **C** — Neutral-contested: sector under active rulemaking with uncertain outcome, or one material investigation with plausible defense.
- **F** — Existential exposure: core revenue depends on a practice regulators have signaled intent to ban, or enforcement already restricting operations.

**False-signal screen:**
- *Compliance theater* — announced "compliance programs" or settlements framed as resolution while the underlying practice continues. Recipe: post-settlement news search for repeat violations.
- *Subsidy dependence dressed as demand* — growth attributable to expiring government programs presented as organic. Recipe: Agent run cross-referencing revenue-driver claims vs subsidy program timelines.
- *Regulatory arbitrage as strategy* — the "moat" is only a licensing loophole. Flagged when the policy dimension is load-bearing for the value-creation grade (F9 cross-check).

#### F3 — Competitive Landscape

**Question:** Is the company gaining or losing ground against current competitors and credible entrants, and is its advantage structural or temporary?

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| Named-competitor set and changes to it | baseline | Webset `entity:"company"`: "competitors of {company}" with criteria; monitor `search` behavior catches entrants |
| Relative web traffic and trajectory | ± | Company entity `webTraffic` (+ `similarweb` connector); compare across the competitor Webset |
| Win/loss coverage: customers switching to/from | ± | Monitor `1d`: `"{company} OR {competitors} wins contract OR switches from"` |
| Pricing-power evidence: price increases sticking vs discounting spirals | ± | News + trade-press search |
| Product-comparison verdicts in trade press and reviews | ± | `/search` trade domains, highlights |
| Patent/IP disputes with competitors | ± | Monitor `7d`: litigation coverage |
| New-entrant funding in the category | − | `fiber` connector / news: "{category} startup raises" |

**Grade anchors:**
- **A** — Share gains confirmed by third parties; pricing power demonstrated; entrants struggling.
- **C** — Holding share in a commoditizing category; wins and losses roughly balanced; advantage explainable but eroding.
- **F** — Verified customer exodus, forced discounting, or a structurally superior substitute scaling unchecked.

**False-signal screen:**
- *TAM inflation* — "market leadership" claimed in a market defined so narrowly (or so broadly) it's meaningless. Recipe: compare company TAM claims vs independent market-size estimates.
- *Vanity benchmarks* — self-published comparisons that independent reviews contradict. Independence rule enforced.
- *Land-grab accounting* — "growth" bought with unsustainable discounts/incentives (cross-check F9 unit economics).

#### F4 — Supply Landscape

**Question:** Can the company reliably and economically get what it needs — inputs, components, capacity, logistics — and how concentrated/fragile is that chain?

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| Named supplier map + single-source dependencies | baseline | Agent run (`effort: high`) over filings, news, teardown/trade press; `outputSchema` = supplier list with confidence per edge |
| Supplier distress: financial trouble, capacity cuts, exits | − | Monitor `1d` over the supplier Webset |
| Input-cost trajectory for key commodities/components | ± | News + trade-press monitors per input |
| Logistics/geography risk (chokepoints, sanctioned regions) | − | Agent run; policy cross-check with F2 |
| Inventory posture reported in filings (build-up vs shortage) | ± | `financial report` extraction |
| Vertical-integration or second-sourcing moves | + | News monitors |

**Grade anchors:**
- **A** — Multi-sourced critical inputs, healthy suppliers, input costs stable/hedged, no chokepoint exposure.
- **C** — One known single-source dependency with a mitigation plan; input costs pressuring but passable.
- **F** — Production hostage to a distressed or geopolitically exposed sole supplier; inventory signals contradict management narrative.

**False-signal screen:**
- *Channel stuffing (supply side)* — inventory piling at distributors framed as "demand." Recipe: distributor/partner complaints and returns coverage; inventory-vs-revenue divergence from filings extraction.
- *Phantom capacity* — announced factories/capacity that never break ground. Recipe: announcement-to-execution tracking (§4.4).
- *Related-party suppliers* — inputs bought from entities tied to insiders. Recipe: filings extraction + news search on supplier ownership.

#### F5 — Demand Landscape

**Question:** Is real end-demand for the product growing, stable, or shrinking — and is it paid, organic demand rather than channel, subsidy, or hype artifacts?

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| Web traffic level + trend vs competitor set | ± | Company entities `webTraffic.history` across Webset |
| Customer reviews volume/tone trajectory | ± | `/search` review platforms, trade press |
| Order books, backlogs, bookings coverage | ± | `financial report` + news extraction |
| Price realization: waitlists/scarcity vs discounting/promotions | ± | News + retail coverage monitors |
| Channel checks in trade press (sell-through vs sell-in) | ± | Trade-domain-scoped search |
| End-market health (the customer's customer) | ± | Agent run on downstream industry conditions |
| Search/attention trends reported by third parties | ± | News coverage of demand indicators |

**Grade anchors:**
- **A** — Multiple independent demand proxies rising together; pricing holding or rising; downstream markets healthy.
- **C** — Headline demand flat; mix of proxies; growth increasingly promotional.
- **F** — Proxies falling while management reports growth (see screen); demand shown to be pull-forward or subsidy-driven.

**False-signal screen:**
- *Sell-in vs sell-through games* — shipping to channel booked as demand. Recipe: distributor inventory coverage + returns/impairment news following strong quarters.
- *Pull-forward masking* — incentives that borrow future demand (one-time discounts, expiring subsidies, pre-buy ahead of price rises). Recipe: Agent run classifying demand drivers per quarter.
- *Metric switching* — company changes its demand KPI (users→"engaged accounts"→"transacting entities") when the old one stalls. Recipe: KPI-definition tracking across consecutive earnings coverage; any unexplained definition change is an automatic flag.

#### F6 — Staffing & Talent Health

**Question:** Is the company attracting, keeping, and productively using the people it needs — especially in the functions its strategy depends on?

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| Headcount level (point-in-time) + reported changes | ± | Company entity `workforce.total` (weekly refresh) + layoffs/hiring news monitors |
| Executive departures/arrivals, especially CFO/CTO/COO | ± | Webset of `person` entities (leadership roster) with monitor `refresh` (title changes) + `1d` news monitor. Note: profile refresh is weekly; news path is faster |
| Key-function hiring intensity (e.g., AI researchers, field sales) | + | `category:"people"` searches on role + company |
| Glassdoor-style morale coverage in press | ± | News search (no direct ratings API — evidence-gap noted) |
| Union actions, strikes, labor disputes | − | Monitor `1d` |
| Founder/insider commitment vs departures-and-selling pattern | ± | News + filings coverage |

**Grade anchors:**
- **A** — Net senior talent inflow in strategy-critical functions; stable executive bench; labor relations quiet.
- **C** — Normal churn; one unexplained senior exit; hiring slowed but targeted.
- **F** — CFO/auditor exits in close succession, exodus in the function the strategy depends on, or sustained hiring freeze contradicting growth narrative.

**False-signal screen:**
- *Stealth layoffs* — "performance management," contractor purges, silent attrition without announcement. Recipe: severance/attrition coverage + workforce.total deltas vs company statements.
- *Title inflation as retention theater* — mass promotions replacing compensation. Weak signal; only flagged when corroborated.
- *Ghost hiring* — job postings maintained for optics without hires (postings data is an evidence gap in v1; inferred only from reporting).

#### F7 — Operations & Execution

**Question:** Does the company reliably convert plans into shipped products, delivered services, and completed projects — on time, at quality, at promised cost?

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| Launch/delivery track record vs announced dates | ± | Announcement-to-execution ledger (§4.4) — the backbone of this dimension |
| Product recalls, outages, quality incidents | − | Monitor `1d`: `"{company} recall OR outage OR defect"` |
| Capex projects: on-time/on-budget coverage | ± | News + filings extraction per project |
| Margin trajectory extracted from filings | ± | `financial report` + `summary.schema` extraction |
| Safety/environmental incidents | − | Regulator-domain monitors (cross-feeds F2) |
| Restructuring frequency ("transformation" every 18 months) | − | News history search |

**Grade anchors:**
- **A** — Ships what it announces, roughly when announced; quality incidents rare and well-handled; margins behave as guided.
- **C** — Slippage common but disclosed; one live quality issue being managed credibly.
- **F** — Chronic delay pattern, repeated recalls/outages, or a "transformation program" treadmill masking execution failure.

**False-signal screen:**
- *Perpetual pilot* — "pilots" and "trials" with marquee names that never convert to production contracts. Recipe: pilot-announcement follow-through tracking at 6/12 months.
- *Restructuring as recurring cost* — "one-time" charges appearing every year. Recipe: filings extraction of special-items frequency.
- *Milestone redefinition* — shipped ≠ announced spec ("launch" that is a waitlist). Recipe: launch-claim vs availability coverage comparison.

#### F8 — Partnerships & Deals

**Question:** Do the company's partnerships, contracts, and M&A actually move revenue, capability, or distribution — or are they press-release assets?

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| New partnerships/contracts with disclosed economics | + | Monitor `1d`: `"{company} partnership OR contract OR deal"`; LLM classifies: economics disclosed? binding? exclusive? |
| Partner-side confirmation and prominence | + | Search from the *partner's* side — does the partner also announce it? Independence rule |
| Renewals vs quiet lapses of past deals | ± | Deal ledger follow-up searches at renewal windows |
| M&A track record: integration success, goodwill impairments | ± | Filings + news history per acquisition |
| Customer-concentration risk in contracts | − | Filings extraction |

**Grade anchors:**
- **A** — Deals have disclosed economics, partner-side confirmation, and later show up in results; acquisitions integrate without impairment.
- **C** — Mix of substantive and promotional deals; one aging unconfirmed "strategic partnership."
- **F** — Deal-flow is press-release theater: undisclosed economics, no partner-side confirmation, serial acquisitions writing down goodwill.

**False-signal screen (this dimension is largely *made of* the screen):**
- *Logo licensing* — "partnership with {BigTech}" that is actually a standard vendor/reseller agreement. Recipe: check partner's own announcement (absent = flag), check disclosed economics (absent = flag).
- *Round-trip deals* — company invests in an entity that becomes a "customer" (revenue round-tripping). Recipe: Agent run cross-referencing investment announcements vs new-customer announcements.
- *MOU inflation* — non-binding memoranda counted in "pipeline" or implied backlog. Recipe: language classification of deal announcements (binding vs intent).
- *Serial-acquirer obscuring organic decline* — growth entirely from roll-ups. Recipe: filings extraction separating organic vs acquired revenue where disclosed; flag when not disclosed.

#### F9 — Value Creation, Distribution & Management (the anchor framework)

**Question:** Is real economic value being created (customers pay more than it costs to serve them), is it distributed sanely (customers/employees/shareholders), and does management allocate capital like owners?

This framework is weighted highest and can **veto** the composite: a company cannot score above B overall with an F9 grade of D or lower, no matter how good the narrative dimensions look.

**Signals:**

| Signal | Polarity | Recipe |
|---|---|---|
| Unit economics evidence: gross margin, cash conversion | ± | `financial report` + `summary.schema` extraction (revenue, GM, OCF, FCF, SBC, share count — each figure cited to its filing) |
| Earnings quality: cash flow tracking net income | ± | Extraction: OCF vs NI divergence across periods |
| Dilution discipline: share count and SBC trajectory | ± | Extraction across filings |
| Capital allocation: buybacks vs price history, M&A discipline, capex returns | ± | Filings + news; Alpaca price context (US) |
| Insider behavior: buying vs selling patterns in coverage | ± | News/filings coverage of insider transactions |
| Customer value evidence: retention, willingness to pay, NPS coverage | + | Independent sources only (reviews, case studies not hosted by company) |
| Management candor: do they name mistakes, or reframe every miss? | ± | LLM tone analysis over earnings-call coverage across quarters |

**Grade anchors:**
- **A** — Cash flows confirm the income statement; dilution modest; capital returns disciplined; customers demonstrably better off; management admits and corrects errors.
- **C** — Value creation real but partially consumed by SBC/dilution; capital allocation mixed; candor selective.
- **F** — Income statement and cash flow tell different stories; value flows mainly to insiders (dilution, related-party payments, buybacks timed around insider sales); customers churn when subsidies stop.

**False-signal screen (misleading-accounting battery, v1 red-flag tier):**
- *Non-GAAP divergence* — widening gap between adjusted and GAAP earnings; "community-adjusted EBITDA" pathology. Recipe: extraction of both figures per period; trend the gap.
- *Accruals red flag* — net income persistently exceeding operating cash flow. Recipe: filings extraction (this is the red-flag tier of forensic accounting; deeper accrual decomposition is v2, see §9).
- *Revenue-recognition change* — accounting-policy changes coinciding with growth inflections. Recipe: filings coverage + news search for restatement/policy language.
- *Auditor events* — auditor resignation/change, qualified opinions, material weaknesses, delayed filings. Recipe: monitor + filings; any hit is an automatic composite cap.
- *Related-party web* — transactions with insider-linked entities. Recipe: filings extraction of related-party sections.
- *Buyback-insider divergence* — company buying back stock while insiders sell. Recipe: cross-reference buyback announcements vs insider-sale coverage.

### 4.3 Composite: the Value Reality Score

- Weighted average of F1–F9; default weights: F9 ×2.0, F5 and F3 ×1.5, others ×1.0. Weights are per-sector tunable (policy weighs more for banks/pharma; supply for hardware).
- **Veto rules:** F9 ≤ D caps composite at B. Any *confirmed* auditor event or round-trip-revenue finding caps composite at C and pins a red banner on the report.
- Every dimension shows grade + confidence + trend arrow (vs last scoring run) + top 3 evidence citations inline.
- The composite is never shown without its dissent: the report always includes a **"Bear case from the evidence"** and **"Bull case from the evidence"** section synthesized from the same citation pool, so the score can't be read as an oracle.

### 4.4 The Announcement Ledger (cross-cutting mechanism)

The single most powerful deception detector is time: companies that announce and don't execute reveal themselves. Aslan Terminal maintains, per company, a **ledger of every dated commitment** it has seen (product launches, factories, partnerships, buybacks, guidance) with scheduled follow-up checks:

- On ingestion (monitor hit or report run), the LLM extracts commitments: `{what, promised_date, source}` → stored in D1.
- A scheduled job re-searches each commitment at promise-date and +6/12 months: did it ship? quietly die? get redefined?
- The company's **Follow-Through Rate** feeds F7 (operations) and F8 (deals), and is displayed as a first-class stat: "Announced 14 dated commitments in 24 months; delivered 6 on time, 3 late, 5 unaccounted for."

This mechanism is cheap (a handful of targeted searches per commitment per check) and compounds: the longer a company is on a watchlist, the harder it becomes for promotional management to fool the system.

**Decision (v0.2): the ledger is forward-only.** No historical backfill in v1 — it accrues from the first time a company is seen. Consequences accepted: day-one reports show an empty ledger (the UI presents it as "tracking started {date}, {n} commitments logged" rather than a hollow stat), and the compounding advantage becomes a retention story rather than a launch story. Historical backfill mining is a v2 candidate (§9).

### 4.5 Publication & language policy (liability posture)

Two rules govern how deception findings reach the world:

1. **Evidence-language standard.** Synthesis prompts enforce an editorial rulebook: every flag is worded as a cited observation, never an accusation. "Filings show operating cash flow trailing net income for 6 consecutive quarters [source]" — never "misleading accounting." "No partner-side announcement found for the 2025-03 partnership [searches run, dates]" — never "fake deal." The style is published short-research: verifiable statements; the reader draws the conclusion. The rulebook is versioned data alongside the rubrics, and the eval set (§9) includes language-compliance checks.
2. **Flags are private by default.** Public shared report URLs show dimension grades, trends, and confidence only. The false-signal detail layer (screen hits, ledger misses, red-flag narratives) renders only for the logged-in report owner. Sharing the grade is viral surface; sharing the accusation surface is not.

Residual risk, explicitly accepted for now: no formal legal review is scheduled (defamation, investment-advice regulation by jurisdiction). Revisit before public launch; the existing AI-disclaimer banner pattern carries over to all reports meanwhile.

---

## 5. "Why is the price here" — the price reconciliation engine

Per product decision, v1 attempts **full quantitative decomposition**, with two guardrails decided in v0.2:

- **Scope: US tickers only.** The verdict requires a real price source (Alpaca). Non-US reports ship the full 9-dimension health analysis with extracted fundamentals and citations, but no valuation verdict — no scraped-price reverse-DCF. The verdict section renders as "available for US listings" rather than a low-confidence guess.
- **Launch mode: accuracy-gated beta.** Before the verdict ships un-flagged, extraction accuracy is measured against a hand-verified truth set (~20 companies, every §5.1 field checked against the actual filings). Until extraction clears a defined threshold (target: ≥98% of figures within rounding of truth), the verdict carries a visible **Beta** label; extracted figures and market-implied expectations always ship, with citations, from day one.

**Pipeline per report:**

1. **Fundamentals extraction** (Exa): latest annual + interim filings via `category:"financial report"`; `contents.summary` with a strict JSON schema (revenue, growth, gross/operating margin, FCF, net debt, share count, SBC). Every figure carries its source URL and filing date. Extraction runs twice with independent prompts; disagreements are surfaced, not averaged.
2. **Price context**: US tickers — Alpaca (current price, market cap inputs, 52-week context, move history for event attribution). Non-US tickers — no price layer in v1 (see scope guardrail above); steps 3–6 are skipped and the report says so plainly.
3. **Reverse-DCF framing**: from market cap, compute the implied growth/margin/duration assumptions ("to justify today's price, the market needs ~X% revenue growth for Y years at Z% FCF margin"). This inverts the unreliability problem: instead of pretending a precise fair value, we state what the price *assumes* and grade those assumptions against the rubric evidence.
4. **Multiples cross-check**: valuation multiples vs the competitor Webset (their figures extracted the same way, cached) and vs the company's own history where extractable.
5. **Reconciliation verdict**: `market-implied expectations` vs `Value Reality Score` → one of: *Priced for more than the evidence supports* / *Roughly priced* / *Priced for less* — with the specific dimension gaps named ("the price assumes demand (F5: C+) re-accelerates and policy risk (F2: D) resolves favorably").
6. **Event attribution timeline** (US v1): major price moves (from Alpaca) aligned against the evidence timeline — which researched events plausibly moved the stock. Reuses Aslan's existing news-event → price-window machinery from the backtest pipeline.

**Stated limitation (in-product):** valuation outputs are ranges with confidence bands, and every number is clickable to its source filing. When extraction confidence is Low, the report says so in the verdict sentence itself, not a footnote.

---

## 6. Product surfaces

### 6.1 On-demand deep report ("Terminal Report")

- Input: ticker or company name (global). Resolution via Exa `category:"company"` + Alpaca allowlist (US).
- Progress UX: streamed pipeline stages (reuses Aslan's SSE + safeClose pattern): *Resolving company → Building competitor set → Researching 9 dimensions → Extracting fundamentals → Screening for false signals → Reconciling price*.
- Output: single scrollable report — composite score header with confidence; price-reconciliation verdict (US listings; Beta-labeled until accuracy-gated, §5); 9 framework cards (grade, trend, confidence, top evidence, false-signal flags); Announcement Ledger stats; Bear/Bull from evidence; full citation appendix.
- **Re-run button**: any report (and any Board company) has "Refresh now," priced in credits — the earnings-day answer for users who won't wait for a monitor tick.
- Every report is shareable via public URL (existing report-sharing infrastructure), with the existing AI-disclaimer banner pattern. Per §4.5, public URLs show grades/trends/confidence only; false-signal detail is owner-only.

### 6.2 Live watchlist ("The Board")

- User adds companies → each becomes a monitored entity:
  - Registered in a **Webset** (company entity + competitor criteria + enrichments).
  - **Monitors** created per dimension bucket (see §7 for the consolidation strategy) with webhook delivery.
  - A **Durable Object per company** owns state: evidence inbox, dimension scores, announcement ledger, rescore scheduling.
- New evidence → LLM triage (relevant? which dimension? materiality?) → if material, dimension rescore → if grade or confidence changes, alert.
- Alerts: in-app feed + email (Resend). Alert format leads with the delta and evidence: "F2 Policy B→C for {co}: {one-line reason} — 3 sources."
- **Metering (v0.2 decision)**: each monitored company burns N credits/month on the existing Polar credit rails — cost scales with usage without committing to final pricing. N is set from §8 unit costs plus margin; deep reports and re-runs are separately credit-priced.
- **Earnings-aware refresh (premium behavior)**: the system tracks earnings dates for watched companies and auto-triggers a high-effort refresh when the call/filing drops, rather than waiting for the next monitor tick. Ships as the premium watchlist tier's headline; the manual re-run button is the v1-core equivalent.
- Board UI: grid of companies × dimensions (grade + trend arrows), sortable by "most deteriorating," with drill-down into any cell's evidence trail. This is the Bloomberg-monitor-wall feeling, rebuilt around health rather than price.

---

## 7. Architecture

```
                    ┌─ Exa /search + /contents ──► evidence retrieval (per-signal recipes)
User ── SvelteKit ──┤  Exa Agent API (outputSchema = rubric) ──► dimension grading runs
 (Workers)          │  Exa Websets ──► watchlist entities, competitor sets, exec rosters
                    │  Exa Monitors ──► webhooks ──► Worker ──► Durable Object (per company)
                    │                                             ├─ evidence inbox + triage
                    │                                             ├─ scores + ledger (persisted to D1)
                    │                                             └─ rescore + alert scheduling
                    ├─ Alpaca ──► US prices, move history
                    └─ OpenRouter/Anthropic ──► triage, extraction QA, synthesis, tone analysis
D1: users, companies, scores history, evidence index, announcement ledger, alerts, reports
```

**Key decisions:**

- **Grading runs on Exa Agent API, synthesis on our LLM.** Agent runs (`effort: medium/high`, `outputSchema` = per-dimension signal schema) do the multi-step retrieval+structuring; our own LLM applies grade anchors, false-signal rules, veto logic, and writes the narrative. Rubric logic stays in our code — deterministic, testable, versioned — rather than inside a vendor's agent.
- **Durable Object per watched company** — serializes evidence ingestion, owns rescore scheduling, survives deploys. Matches the existing DO migration direction of the codebase.
- **Evidence-delta gating (v0.2 decision, reproducibility rule):** a dimension is re-graded *only* when triage marks material new evidence for it; otherwise the stored grade stands. Every published grade is pinned to the evidence-snapshot hash that produced it. A grade can therefore never change from re-sampling alone — alerts are evidence-driven by construction. Red-flag-class evidence bypasses batching and triggers immediate rescore; ordinary evidence batches (rescore at most every N hours).
- **Monitor consolidation:** monitors cost $15/1k runs, so we don't run 9 monitors × 24/day per company. Per company: 1 news monitor @ `6h` (broad: company name + deal/exec/recall/investigation terms — dedup is server-side), 1 policy monitor @ `1d` (regulator domains), 1 competitor-set monitor @ `7d` (Webset search behavior). Triage LLM routes hits to dimensions. Higher cadences are a paid-tier lever later.
- **Score history is append-only in D1** — trend arrows, deterioration sorting, and the Announcement Ledger all need time series.
- **Rubric versioning:** frameworks are data (JSON in repo), not prose in prompts. Reports record the rubric version that produced them; rubric changes never silently rewrite history.

---

## 8. Unit economics (rough, from documented pricing)

**Deep report (one company):**
| Item | Est. cost |
|---|---|
| 9 dimension Agent runs @ medium ($0.10) | $0.90 |
| Fundamentals extraction: ~20 filing pages × (text+summary) | ~$0.06 |
| Competitor set bootstrap (Webset/searches, amortized) | ~$0.10 |
| Targeted searches (~40 @ $7/1k) + contents (~100 pages) | ~$0.40 |
| LLM synthesis/QA (our side) | ~$0.30–0.60 |
| **Total** | **≈ $1.80–2.10** |

An `xhigh` single-run variant ($1.00 + synthesis) is the budget fallback; per-dimension runs are the quality path.

**Watchlist (per company / month):**
| Item | Est. cost |
|---|---|
| News monitor @ 6h (120 runs) + policy @ 1d (30) + competitor @ 7d (4) ≈ 154 runs @ $15/1k | ~$2.30 |
| Contents on ~150 new items | ~$0.30 |
| Triage LLM + weekly incremental rescores | ~$0.50–1.00 |
| Ledger follow-up checks | ~$0.10 |
| **Total** | **≈ $3.20–3.70 / company / month** |

Pricing is deferred per product decision, but these numbers say: deep reports are credit-shaped (existing Polar credits fit), watchlist slots are subscription-shaped. Both existing billing rails apply when pricing is decided.

---

## 9. Constraints, risks, and the v2 line

**Known constraints (accepted for v1):**
- Exa-only fundamentals = LLM extraction from filings. Mitigations: double-extraction with disagreement surfacing, per-figure citations, confidence bands. The extraction layer is behind an interface; a structured provider (EODHD/FMP) can replace it without touching the rubric system.
- Global information coverage, US-only price layer. Non-US price reconciliation is explicitly degraded.
- No social firehose (Exa removed `tweet`); retail sentiment is an acknowledged evidence gap in F1.
- Monitor cadence floor is 1h; we are an analysis terminal, not an execution terminal.
- Non-English sources: Exa coverage exists but is unquantified in docs — treat non-US grades' confidence accordingly.

**Risks:**
- **Extraction hallucination in the valuation path** is the reputational risk. Every number must be citation-clickable; disagreement between extraction passes must block a confident verdict. This rule is not optional.
- **Grade-anchor drift**: LLM grading needs a frozen eval set (10–20 companies with hand-graded dimensions, including known frauds — e.g. historical cases like Wirecard, NKLA-era EV SPACs) run on every rubric/prompt change.
- **Exa doc drift is real** (observed: categories removed, livecrawl deprecated mid-2026). Pin an API-behavior test suite against our Exa usage.
- **Cost blowout** on watchlists if triage is too permissive — rescore debouncing and materiality thresholds are load-bearing.

**Deferred to v2 (schema already accommodates):**
- Filing-level forensic accounting (accrual decomposition, Beneish-style scoring) — needs structured statements; slots into F9's screen tier.
- Global market-data provider (unlocks non-US price verdicts, §5); social-sentiment vendor; job-postings feed for F6.
- Announcement Ledger historical backfill (mining ~24 months of past commitments per company — v1 is forward-only per v0.2 decision).
- Sub-daily alerting tiers; portfolio-level aggregation; sector dashboards.
- Backtest integration: "would trading Aslan grade-changes have made money?" — the existing backtest engine validating the terminal's own signal quality. This is the flywheel between the two halves of the product.

**Explicitly not on the roadmap (positioning, not gaps):** consensus estimates / price targets / sell-side research. "Evidence, not consensus" is the brand; adding an estimates feed would be a strategy change, not a feature add.

---

## 10. Open questions for next session

1. Brand/naming: does this ship as "Aslan Terminal" inside Aslan Finance, or does the terminal become the headline product with backtesting as a feature? (Related: the current landing/funnel is built for retail virality; a pro tool sells differently.)
2. Which 10–20 companies form the frozen eval set (mix of admired operators + known historical frauds)? Doubles as the §5 extraction truth set and the §4.5 language-compliance suite.
3. Non-US ticker resolution UX when there's no Alpaca allowlist to lean on.
4. Credits calibration: N credits/month per monitored company, re-run price, and deep-report price (mechanism decided — credits on Polar rails; numbers pending §8 validation against real usage).
5. Legal review remains unscheduled (accepted residual risk, §4.5) — decide the trigger point (e.g., before public shared URLs go live vs. before paid launch).

**Resolved 2026-07-04 (v0.2):** valuation ships as accuracy-gated beta · global research, US verdicts · evidence-language standard + owner-only flags · credits meter watchlists · evidence-delta gating · re-run button now, earnings-aware scheduler premium · ledger forward-only · no consensus data by design.
