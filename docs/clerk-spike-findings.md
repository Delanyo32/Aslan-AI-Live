# Clerk migration — spike findings

Branch: `spike/clerk-auth-billing`. Goal: de-risk the two unknowns before committing to the
full better-auth→Clerk + Polar→Clerk-subscriptions migration on SvelteKit + Cloudflare Workers.

## Result: green light, with one required deviation from the community docs

| Risk | Verdict |
|---|---|
| SvelteKit has no first-class Clerk SDK | **Softer than feared.** `svelte-clerk@1.1.11` (community) declares `svelte: ^5.29.0` (app is on 5.55) and ships `ClerkProvider`, `SignIn`, `SignUp`, `UserButton`, `UserProfile`, **`PricingTable`**, `Show`, `useSignIn/useSignUp`, plus a `/webhooks` `verifyWebhook`. |
| Clerk billing UI is React-only | **False for SvelteKit.** `svelte-clerk` exposes `<PricingTable/>` as a real Svelte component. |
| `@clerk/backend` won't bundle for Workers | **Cleared (build level).** `npm run build` (adapter-cloudflare) bundles `@clerk/backend` + webhook verify with no Node-builtin breakage; `wrangler.toml` already has `nodejs_compat`. Both spike endpoints compiled into the Worker output. |

## The one required deviation (important)

`svelte-clerk`'s default server hook **cannot be used as-documented on adapter-cloudflare.**
Its `withClerkHandler` resolves `SECRET_KEY`/`PUBLISHABLE_KEY` from `$env/dynamic/private|public`
**at module-init** (`dist/server/constants.js`) and builds a **singleton `clerkClient`** from them.
Under adapter-cloudflare, `$env/dynamic/private` is **empty at module load** (this repo already
documented that in `src/lib/server/auth.ts`) — so the secret is `undefined`.

**Fix (proven in the spike):** skip `withClerkHandler`; call `@clerk/backend` directly with keys
read from `event.platform.env` **per request**. Both `createClerkClient({secretKey, publishableKey})`
and `verifyWebhook(request, {signingSecret})` accept per-call keys, so this side-steps the trap.
The `svelte-clerk` **client** components (`ClerkProvider`, `PricingTable`, `UserButton`, …) are
still fine — they read `PUBLIC_*` in the browser, not at server module-init.

Spike artifacts demonstrating the pattern:
- `src/routes/api/spike/clerk/+server.ts` — per-request `authenticateRequest` → `{signedIn, userId}`
- `src/routes/api/spike/webhook/+server.ts` — per-request `verifyWebhook` → `{type}`

So `hooks.server.ts` gets a small custom handle (mirror `withClerkHandler`'s handshake-redirect +
cookie-decoration logic, but read keys from `platform.env`), composed via `sequence()` with the
existing db/guard handle.

## Proven live (dev instance, 2026-07-22)

- **Session verify:** `GET /api/spike/clerk` → `200 {signedIn:false, status:"signed-out"}` — `@clerk/backend` read keys from `platform.env` per-request and authenticated against Clerk.
- **Webhook signature:** real `user.created` (created via `clerk users create`) delivered through the Clerk relay (`clerk webhooks listen`, pinned token `c_jQn8WxP1v5`) to `/api/spike/webhook` with a genuine `svix-signature`; handler returned `forward_status 200` — `verifyWebhook` validated the signature against `CLERK_WEBHOOK_SIGNING_SECRET` from `platform.env`. Test user deleted after.

Local test recipe (repeatable):
```
npx clerk@latest webhooks listen --token "$(npx clerk@latest webhooks token)" \
  --forward-to http://localhost:5173/api/spike/webhook --json
# register the printed relay URL as a Dashboard webhook endpoint, copy its whsec_ secret
# put it in .dev.vars as CLERK_WEBHOOK_SIGNING_SECRET, start `npm run dev`
npx clerk@latest users create --email x@example.com --password '<strong>' --yes   # fires user.created
```

## Still not proven

- Handshake→307 redirect round-trip (needs a real signed-in browser session, not an API call).
- `<PricingTable/>` → checkout drawer → subscription end-to-end (needs billing enabled + plans).

## To take it live (interactive — you must run these)

```
! clerk auth login                       # browser OAuth
! clerk apps create "Aslan Terminal" --json
! clerk link --app app_xxx
! clerk env pull                         # writes PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY
! clerk enable billing --for user
# create starter/pro/power User Plans (Dashboard or `clerk config patch`)
# add a webhook endpoint -> /api/spike/webhook, copy signing secret
```

Then set the Worker secrets and deploy:
```
wrangler secret put CLERK_SECRET_KEY
wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
# PUBLIC_CLERK_PUBLISHABLE_KEY -> wrangler.toml [vars]
wrangler deploy
curl https://<host>/api/spike/clerk      # expect {ok:true, signedIn:false}
```

If those return cleanly, the full migration (per the plan) is mechanical.

## Notes / cleanup

- `npm install svelte-clerk` created `package-lock.json`; repo scripts use `bun` (`bun test`).
  On real adoption use `bun add svelte-clerk` and drop the stray lockfile.
- Spike endpoints under `src/routes/api/spike/` are throwaway — delete before merge.
