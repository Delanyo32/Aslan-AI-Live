# SEC filings downloader

Downloads a company's SEC filings into R2 storage and records them in the
database, so a second run only fetches what is new.

Not wired into the app. You call it with `curl`.

---

## Use it

```
curl -N -X POST -H "x-sec-token: $SEC_SYNC_TOKEN" \
  "https://aslanfinance.app/api/sec/sync?symbol=NVDA"
```

`curl -N` means "show output as it arrives". A full backfill takes a few
minutes, and the endpoint prints one line per filing while it works.

### Settings

| Setting | Meaning | Default |
|---|---|---|
| `symbol` | Stock ticker. Required. | — |
| `since` | Oldest filing date to keep, as `YYYY-MM-DD`. | `2020-01-01` |
| `limit` | Stop after this many filings. For testing. | no limit |

A bad `since` is rejected with an error, not ignored. `2021-02-30` looks like a
date but is not a real day, so it fails.

### What you see

```
NVDA  CIK 0001045810  NVIDIA CORP  (since 2020-01-01)
102 core filings in window, 0 already stored, 102 to fetch
8-K       2026-07-02   1 docs  22 KB
10-Q      2026-05-28   4 docs  1.2 MB
...
{"cik":"0001045810","ticker":"NVDA","added":102,"skipped":0,"failed":0,...}
```

`CIK` is the ID number SEC gives each company. It never changes, even when a
company changes its ticker.

---

## What it stores

### Files

Files go to the R2 bucket `aslan-sec-filings`. R2 is Cloudflare's file storage.

```
sec/{cik}/{accession}/{filename}
```

`accession` is SEC's ID for one filing, like `0000320193-26-000018`.

Example:

```
sec/0000320193/0000320193-26-000018/aapl-20260730.htm
sec/0000320193/0000320193-26-000018/a8-kex991q3202606272026.htm
```

Keys use the CIK, not the ticker. Meta changed its ticker from FB to META and
kept the same CIK. Using tickers would have split one company across two folders
forever.

### Which files inside a filing

Every `.htm` and `.txt` document. Images, spreadsheet data, and stylesheets are
skipped.

This matters. An 8-K's main document is often a short cover page. The actual
news sits in a separate attachment. Apple's July 2026 8-K: cover page 38 KB,
earnings release 173 KB. Main-document-only would have missed the news.

Files are saved exactly as SEC sent them. No text stripping. You can strip HTML
later straight from storage, without downloading anything again.

### Database

Two tables in the existing D1 database. D1 is Cloudflare's SQLite.

**`sec_companies`** — one row per company: `cik`, `ticker`, `name`,
`last_synced_at`.

`last_synced_at` only gets set when a run finishes completely. A run that was
cut short leaves it empty, so a half-done company never looks finished.

**`sec_filings`** — one row per filing: `accession`, `cik`, `form`,
`filing_date`, `report_date`, `primary_document`, `r2_prefix`, `doc_count`,
`bytes`, `downloaded_at`.

The row is written **last**, only after every file is safely stored. So a
crash leaves no row, and the next run re-downloads that filing. That is how
resuming works.

---

## Which filings

| Kind | Forms |
|---|---|
| US companies | `10-K`, `10-Q`, `8-K`, `DEF 14A` and their amendments |
| Foreign companies | `20-F`, `40-F`, `6-K` and their amendments |

Everything else is skipped. Form 4 (insider share trades) alone is 587 of
Apple's newest 1,000 filings, and it is a table of numbers, not a report.

**`6-K` is not optional.** Foreign companies do not file `8-K` or `10-Q`. They
file `20-F` once a year and put everything else in a `6-K`: quarterly results,
monthly revenue, press releases.

| Company | Without `6-K` | With `6-K` |
|---|---|---|
| TSMC | 7 | 363 |
| Nebius | 7 | 161 |
| ASML | 7 | 65 |
| Arm | 3 | 35 |

To change the list, edit `CORE_FORMS` in `src/lib/server/sec.ts`.

---

## Setup

Once, before the first production run:

```
wrangler r2 bucket create aslan-sec-filings
wrangler secret put SEC_SYNC_TOKEN
bun run db:migrate:prod
```

For local work, `SEC_SYNC_TOKEN` goes in `.dev.vars`, then:

```
bun run db:migrate:local
bun run dev
```

`SEC_USER_AGENT` is already set in `wrangler.toml`. It is not a secret.

---

## Things that will bite you

**SEC blocks you without an email address.** `www.sec.gov` returns 403 unless
`User-Agent` says who you are and the string contains an `@`. `User-Agent` is a
header naming the caller. A fake address technically passes, but SEC treats it
as how they reach you before blocking you, so keep it real.

| User-Agent sent | Result |
|---|---|
| `Aslan-AI/1.0 (sec-bot@aslanfinance.app)` | 200 |
| `Aslan-AI/1.0` | 403 |
| `Mozilla/5.0` | 403 |

**SEC allows 10 requests per second.** Each run keeps itself just under that.
Running two syncs at the same time would double the rate. Do them one at a time.

**Big documents are slow.** SEC sends large files at about 160 KB per second.
Microsoft's 8.6 MB annual report takes 55 seconds. The per-request limit is
180 seconds for that reason.

**Old filings look broken but are not.** Filings from the 1990s list their
documents with blank filenames. Only one combined `.txt` file can be fetched.
The code falls back to that. You only hit this if you set `since` before 2001.

**Some companies are not on SEC at all.** Samsung is not registered, so no
filings exist to download. SpaceX is registered and does file.

---

## What is downloaded today

Local storage only. Nothing in production yet.

**34 companies. 3,980 filings. 12,096 files. 4.27 GB. Back to 2020-01-02.**

- **Named:** NVIDIA, Microsoft, Amazon, SpaceX, Intel, Alphabet, Meta, TSMC, Oracle
- **Chips:** AMD, Broadcom, Micron, Arm, Marvell, Qualcomm
- **Servers and networking:** Super Micro, Dell, HPE, Arista, Vertiv
- **Chip equipment:** ASML, Applied Materials, Lam Research, KLA
- **Cloud and data centers:** CoreWeave, Nebius, IBM, Equinix, Digital Realty
- **AI software:** Palantir, ServiceNow, Snowflake, Salesforce, C3.ai

Apple is also in there, from testing.

---

## Files

| File | What it is |
|---|---|
| `src/routes/api/sec/sync/+server.ts` | The endpoint. Checks the token, streams progress. |
| `src/lib/server/sec.ts` | All the logic. |
| `src/lib/server/sec.test.ts` | Tests. 19 of them. |
| `src/lib/server/db/schema/sec.ts` | The two tables. |
| `wrangler.toml` | R2 bucket binding and `SEC_USER_AGENT`. |

Run the tests with `bun test src/lib/server/sec.test.ts`.

---

## Three bugs worth remembering

These were all found by running the thing, not by reading the code.

**1. Cancelling a run used to freeze everything after it.**
The rate limiter was one shared object for the whole worker. A cancelled request
left its slot stuck forever, and every later request queued behind it. The
endpoint went silent for 30 minutes. Each run now builds its own limiter, so a
cancelled run takes its queue with it.

**2. Hanging up used to keep the download running.**
Closing `curl` left the server downloading to the end with nobody watching. It
now notices and stops. Measured: 4 more filings instead of all 102.

**3. Large files nearly blew the memory limit.**
Documents were loaded whole into memory, 4 at a time. The largest in the archive
is 32.3 MB, and a Worker only gets 128 MB. Files now flow straight to storage in
chunks. Storage needs to know the size up front and SEC never sends one, so the
size comes from SEC's folder listing.
