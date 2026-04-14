# Aslan Finance

News-driven backtest platform. Research any market event hypothesis, backtest it against historical price data, and get a full trade simulation in seconds.

**Stack:** SvelteKit · Cloudflare Workers · Cloudflare D1 (SQLite) · Drizzle ORM · better-auth · Polar (payments) · Exa · Alpaca

---

## Local Development

### 1. Install dependencies

```bash
bun install
```

### 2. Configure local secrets

Edit `.dev.vars` (gitignored, already created) with your values:

| Key | Where to get it |
|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 |
| `RESEND_API_KEY` | resend.com dashboard |
| `POLAR_ACCESS_TOKEN` | polar.sh → Settings → API |
| `POLAR_WEBHOOK_SECRET` | polar.sh → Webhooks |
| `OPENROUTER_API_KEY` | openrouter.ai dashboard |
| `ALPACA_API_KEY` | alpaca.markets dashboard |
| `ALPACA_API_SECRET` | alpaca.markets dashboard |
| `EXA_API_KEY` | exa.ai dashboard |
| `PUBLIC_BASE_URL` | `http://localhost:5173` |

### 3. Set up the local D1 database

```bash
bun run db:migrate:local
```

Applies the schema to a local SQLite file in `.wrangler/state/v3/d1/`. Re-run after adding new migrations.

### 4. Start the dev server

```bash
bun run dev
```

App runs at `http://localhost:5173`. Cloudflare D1 is emulated locally — no remote connection needed.

### 5. Forward Polar webhooks (payments)

In a **separate terminal**, start the Polar webhook forwarder so `order.created` events reach your local server:

```bash
polar listen http://localhost:5173/api/webhooks/polar
```

> Install the Polar CLI first if needed: `npm install -g @polar-sh/cli`

The CLI prints a webhook secret — use that value as `POLAR_WEBHOOK_SECRET` in `.dev.vars`.

---

## Database Migrations

### Generate a new migration after schema changes

```bash
bun run db:generate
```

Drizzle reads `src/lib/server/db/schema/` and outputs a new `.sql` file to `src/lib/server/db/migrations/drizzle/`.

### Apply locally

```bash
bun run db:migrate:local
```

### Apply to production

```bash
bun run db:migrate:prod
```

---

## Deploy to Production (Cloudflare)

### Step 1 — Create the D1 database

```bash
npx wrangler d1 create aslan-ai
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding        = "DB"
database_name  = "aslan-ai"
database_id    = "YOUR-DATABASE-ID-HERE"
migrations_dir = "src/lib/server/db/migrations/drizzle"
```

### Step 2 — Set production secrets

Secrets are never committed — set them via Wrangler:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put POLAR_ACCESS_TOKEN
npx wrangler secret put POLAR_WEBHOOK_SECRET
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put ALPACA_API_KEY
npx wrangler secret put ALPACA_API_SECRET
npx wrangler secret put EXA_API_KEY
```

Non-secret public config goes in the `[vars]` section of `wrangler.toml`:

```toml
[vars]
PUBLIC_BASE_URL = "https://your-domain.com"
```

### Step 3 — Apply migrations to production

```bash
bun run db:migrate:prod
```

### Step 4 — Build and deploy

```bash
bun run build
npx wrangler pages deploy .svelte-kit/cloudflare
```

Or connect the GitHub repo in the Cloudflare Pages dashboard for automatic deploys on push.

### Step 5 — Configure the Polar production webhook

In the Polar dashboard → Webhooks, add:

```
https://your-domain.com/api/webhooks/polar
```

Select the `order.created` event and use the same `POLAR_WEBHOOK_SECRET` from Step 2.

---

## Scripts Reference

| Command | What it does |
|---|---|
| `bun run dev` | Start local dev server (D1 emulated) |
| `bun run build` | Production build |
| `bun run check` | TypeScript + Svelte type check |
| `bun run db:generate` | Generate new Drizzle migration from schema |
| `bun run db:migrate:local` | Apply migrations to local D1 |
| `bun run db:migrate:prod` | Apply migrations to remote D1 |
| `bun run db:studio` | Open Drizzle Studio (requires Cloudflare API creds) |
| `bun run db:seed` | Seed sample backtest reports locally |
| `bun run seed:polar` | Seed Polar product IDs into the app |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | 32-char random secret for session signing |
| `GOOGLE_CLIENT_ID` | Optional | Enables Google OAuth login |
| `GOOGLE_CLIENT_SECRET` | Optional | Enables Google OAuth login |
| `RESEND_API_KEY` | Yes | Email delivery (verification, report links) |
| `POLAR_ACCESS_TOKEN` | Yes | Polar payments API |
| `POLAR_WEBHOOK_SECRET` | Yes | Validates incoming Polar webhook payloads |
| `OPENROUTER_API_KEY` | Yes | AI completions via OpenRouter |
| `ALPACA_API_KEY` | Yes | Market price data |
| `ALPACA_API_SECRET` | Yes | Market price data |
| `EXA_API_KEY` | Yes | Semantic news search |
| `PUBLIC_BASE_URL` | Yes | Full origin URL (`https://your-domain.com`) |
| `POLAR_PRODUCT_STARTER` | Yes | Polar product ID for Starter credit pack |
| `POLAR_PRODUCT_PRO` | Yes | Polar product ID for Pro credit pack |
| `POLAR_PRODUCT_POWER` | Yes | Polar product ID for Power credit pack |
