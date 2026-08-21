# Deploying the SEC pipeline to production

How to take what runs locally (filings downloader + Reality Ledger) and stand
it up on aslanfinance.app. Written 2026-08-15.

Ground rules that already bit us once:

- **Deploy as a Worker with `wrangler deploy`, never Pages.** Pages cannot host
  our Durable Objects. The old Git-connected Pages project builds broken
  deploys.
- **Purge the Cloudflare cache after every deploy** that changes CSS/JS hashes,
  or public pages go unstyled. Dashboard → aslanfinance.app → Caching →
  Purge Everything. Wrangler cannot do this (token lacks the scope).
- The custom domain is attached in the dashboard (Worker → Settings →
  Domains & Routes), not in `wrangler.toml`.

---

## 1. One-time setup

### Storage (R2)

```
wrangler r2 bucket create aslan-sec-filings
```

The binding (`SEC_R2`) is already in `wrangler.toml`. Local data is 4.27 GB /
12,096 files; R2 storage costs ~$0.015 per GB-month, so ~$0.07/month. Trivial.

### Database (D1)

The prod database `aslan-ai` already exists (it holds live user data — never
overwrite it wholesale). It just needs the two new migrations (`0008`, `0009`
— SEC tables + Reality Ledger tables):

```
bun run db:migrate:prod
```

### Secrets

```
wrangler secret put SEC_SYNC_TOKEN     # pick a real random value, not dev-sec-token
```

The other secrets (OPENROUTER_API_KEY etc.) are already on the Worker.
`SEC_USER_AGENT` is a plain var, already in `wrangler.toml`.

## 2. Deploy the Worker

```
bun run build        # vite build + patch script (adds DO + scheduled exports to _worker.js)
wrangler deploy
```

DO migration `v4` (`RealityRunner`) is already declared in `wrangler.toml`;
the first deploy applies it. Then purge the cache (see ground rules).

---

## 3. Seed production storage with what we already have

**Recommendation: re-sync from SEC against prod. Do not copy local blobs.**

Why: local R2 lives inside miniflare as hashed blob files, not real filenames.
Copying means writing a mapping script plus ~12,000 `wrangler r2 object put`
calls — roughly the same wall time as re-downloading, with more code and more
ways to fail. Re-syncing also writes the `sec_companies` / `sec_filings` D1
rows itself, so storage and database can never disagree.

One command per company, one at a time (SEC's 10 req/s limit is per-user —
parallel syncs just split the same pipe):

```
for t in NVDA MSFT AMZN SPCX INTC GOOGL META TSM ORCL AMD AVGO MU ARM MRVL QCOM \
         SMCI DELL HPE ANET VRT ASML AMAT LRCX KLAC CRWV NBIS IBM EQIX DLR \
         PLTR NOW SNOW CRM AI; do
  curl -N -X POST -H "x-sec-token: $SEC_SYNC_TOKEN" \
    "https://aslanfinance.app/api/sec/sync?symbol=$t"
done
```

Expect **2–3 hours total** (4.27 GB at SEC's ~2 GB/hour effective rate). The
sync is resumable: a crash re-fetches only what has no D1 row yet.

### Reality Ledger results (optional, saves ~$5 + ~3 hours)

The local fleet run produced `ledger_entries`, `ledger_flags`,
`reality_statements`. Two options:

1. **Re-run in prod** — one POST per company to `/api/reality/run`, same as
   local. Simple, few dollars, ~3 hours with 4 in parallel.
2. **Copy the tables** — export ONLY these tables from local D1 and replay
   into prod. Never a full export; prod D1 has live user data.

```
wrangler d1 export aslan-ai --local  --output reality.sql \
  --table=ledger_entries --table=ledger_flags --table=reality_statements
wrangler d1 execute aslan-ai --remote --file=reality.sql
```

If the file is too big for one `execute`, split it with `split -l`.
Option 1 is less fiddly; option 2 is free. Either works.

---

## 4. Keeping filings fresh: the cron trigger (to build)

Nothing scheduled exists yet. The plan:

**`wrangler.toml`:**

```toml
[triggers]
crons = ["0 */6 * * *"]   # every 6 hours
```

**Handler:** the SvelteKit adapter's `_worker.js` only exports `default`
(fetch). `scripts/patch-worker-durable-objects.mjs` already appends exports
post-build — extend it to wrap the default export with a `scheduled` handler,
or export one from `src/hooks.server.ts` the same way the DO classes are.

The handler itself is small because the logic already exists:

- Read `sec_companies`, order by `last_synced_at` ascending (stalest first).
- For each, call `syncSymbol` (`src/lib/server/sec.ts`) — it fetches only
  filings not yet in D1, so a daily pass is a handful of requests per company,
  seconds not minutes.
- Stop early if nearing the cron time limit; the next firing picks up where
  it left off because `last_synced_at` ordering is the queue.

Later (not now): after a sync finds new filings for a company, kick a
`RealityRunner` run for that CIK so the ledger stays current automatically.

---

## 5. Getting data for the rest of the companies

### Adding a company to the current pipeline

Just sync it — the endpoint resolves any ticker via SEC and backfills to 2020:

```
curl -N -X POST -H "x-sec-token: $SEC_SYNC_TOKEN" \
  "https://aslanfinance.app/api/sec/sync?symbol=TICKER"
```

A big filer takes a few minutes; then one POST to `/api/reality/run` for the
AI pass (under $1 per company).

### Going wide: every SEC filer

Napkin math (grounded in our measured rates, not verified at scale):

| Scope | Size | Time at SEC's rate limit |
|---|---|---|
| All ~8,000 operating companies, core forms, since 2020 | ~300–600 GB, ~500k filings | 1–2 weeks nonstop |
| Literally all of EDGAR, every form, since 1993 | several TB | months — don't crawl this |

The 10 req/s limit is per user and cannot be parallelized around.

### The shortcut: `companyfacts.zip` (check before relying on it)

SEC publishes a bulk file with every company's tagged XBRL numbers:
`https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip`
(~15 GB, refreshed nightly). One download replaces per-company
`data.sec.gov` fetches for the whole market.

**One-time check needed:** confirm the per-CIK JSON inside the zip has the
same shape `src/lib/server/reality/xbrl.ts` expects from the live
companyfacts API. It should be the identical document, but verify against
one CIK we already have (e.g. diff against the R2-cached SMCI response)
before building on it.

Limits to remember: it is numbers only. The cataloging stage (the AI text
pass) still needs the actual filing documents, so going wide on *documents*
still costs the crawl time above. Bulk facts + crawl-on-demand per company
we actually analyze is the cheap path.

---

## 6. Order of operations (first prod stand-up)

1. `wrangler r2 bucket create aslan-sec-filings`
2. `bun run db:migrate:prod`
3. `wrangler secret put SEC_SYNC_TOKEN`
4. `bun run build && wrangler deploy`
5. Purge the Cloudflare cache (dashboard)
6. Seed: run the sync loop from section 3 (~2–3 h)
7. Reality results: copy tables or re-run (section 3)
8. Build + deploy the cron trigger (section 4)
9. Verify: `curl https://aslanfinance.app/api/reality/0001375365` returns SMCI data
