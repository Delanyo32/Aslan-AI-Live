# Pages — Aslan Finance

## Landing Page `/` — `src/routes/+page.svelte`

### Dependency Tree
```
src/routes/+page.svelte
  └── src/routes/+layout.svelte          (root layout — wraps all routes)
        └── src/lib/components/layout/Container.svelte
        └── src/app.css                  (global styles, Tailwind v4 theme)
  └── src/lib/components/WaitlistModal.svelte
        └── bits-ui (Dialog)
  └── src/routes/+page.server.ts         (server load — returns user)
```

### Sections
1. **Nav** — inline, with conditional login/dashboard links
2. **Hero** — large display heading, textarea input, market type selector bar, Run Backtest CTA
3. **Recent Backtests** — only shown to anonymous users; link to /backtests
4. **How It Works** — 3-step numbered list (01/02/03)
5. **Example Report** — blockquote + stats summary + data table with 3 sample rows
6. **Roadmap** — short text note
7. **Pricing** — pricing table (Starter/Pro/Power) + Credit Costs table + CTA
8. **Footer** — inline, copyright + legal links

### Key Files to Pass as Context
```
src/routes/+page.svelte
src/routes/+layout.svelte
src/lib/components/layout/Container.svelte
src/lib/components/WaitlistModal.svelte
src/app.css
```

---

## Backtest Gallery `/backtests` — `src/routes/backtests/+page.svelte`

### Dependency Tree
```
src/routes/backtests/+page.svelte
  └── src/routes/+layout.svelte
  └── src/lib/components/charts/TeaserChart.svelte
  └── src/routes/backtests/+page.server.ts
```

---

## Backtest Report `/backtest/[slug]` — `src/routes/backtest/[slug]/+page.svelte`

### Dependency Tree
```
src/routes/backtest/[slug]/+page.svelte
  └── src/routes/+layout.svelte
  └── src/lib/components/backtest/BacktestReport.svelte
  └── src/lib/components/charts/PortfolioChart.svelte
  └── src/lib/components/charts/EventChart.svelte
  └── src/routes/backtest/[slug]/+page.server.ts
```

---

## Dashboard `/dashboard` — `src/routes/dashboard/+page.svelte`

### Dependency Tree
```
src/routes/dashboard/+page.svelte
  └── src/routes/dashboard/+layout.svelte  (dashboard nav)
        └── src/lib/auth-client.ts
  └── src/routes/+layout.svelte
  └── src/lib/components/backtest/BacktestInput.svelte
  └── src/lib/components/backtest/StepCard.svelte
  └── src/lib/components/backtest/ProcessingLog.svelte
  └── src/lib/components/backtest/ResearchResults.svelte
  └── [other backtest pipeline components]
  └── src/routes/dashboard/+page.server.ts
  └── src/routes/dashboard/+layout.server.ts
```

---

## Auth Pages

### Login `/auth/login` — `src/routes/auth/login/+page.svelte`
```
src/routes/auth/login/+page.svelte
  └── src/routes/+layout.svelte
  └── src/lib/auth-client.ts
```

### Register `/auth/register` — `src/routes/auth/register/+page.svelte`
```
src/routes/auth/register/+page.svelte
  └── src/routes/+layout.svelte
  └── src/lib/auth-client.ts
```

---

## Dashboard Account `/dashboard/account`

### Dependency Tree
```
src/routes/dashboard/account/+page.svelte
  └── src/routes/dashboard/+layout.svelte
  └── src/lib/auth-client.ts
```

---

## Dashboard Credits `/dashboard/credits`

### Dependency Tree
```
src/routes/dashboard/credits/+page.svelte
  └── src/routes/dashboard/+layout.svelte
  └── Polar SDK integration
```
