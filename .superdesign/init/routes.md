# Routes — Aslan Finance (SvelteKit)

## Router: SvelteKit file-based routing

## Route Map

| Route                        | File                                          | Auth Required | Description                        |
|------------------------------|-----------------------------------------------|---------------|------------------------------------|
| `/`                          | `src/routes/+page.svelte`                     | No            | Landing page (hero, how-it-works, pricing) |
| `/backtests`                 | `src/routes/backtests/+page.svelte`           | No            | Public backtest gallery            |
| `/backtest/[slug]`           | `src/routes/backtest/[slug]/+page.svelte`     | No            | Individual backtest report         |
| `/backtest/stub`             | `src/routes/backtest/stub/+page.svelte`       | No            | Dev stub page                      |
| `/dashboard`                 | `src/routes/dashboard/+page.svelte`           | Yes           | Main app — backtest input          |
| `/dashboard/account`         | `src/routes/dashboard/account/+page.svelte`  | Yes           | Account settings                   |
| `/dashboard/credits`         | `src/routes/dashboard/credits/+page.svelte`  | Yes           | Credit purchase / usage            |
| `/auth/login`                | `src/routes/auth/login/+page.svelte`         | No            | Login page                         |
| `/auth/register`             | `src/routes/auth/register/+page.svelte`      | No            | Register page                      |
| `/auth/check-email`          | `src/routes/auth/check-email/+page.svelte`   | No            | Check-email confirmation           |

## Layouts

| Layout File                               | Applies To          | Description                                  |
|-------------------------------------------|---------------------|----------------------------------------------|
| `src/routes/+layout.svelte`               | All routes          | Imports app.css, wraps in `Container`        |
| `src/routes/dashboard/+layout.svelte`     | /dashboard/**       | Dashboard nav with auth, credits display     |

## API Routes

| Route                                  | Method | Description                      |
|----------------------------------------|--------|----------------------------------|
| `/api/waitlist`                        | POST   | Waitlist signup                  |
| `/api/pipeline/run`                    | POST   | Start backtest pipeline          |
| `/api/pipeline/research`               | POST   | Research phase                   |
| `/api/pipeline/understand`             | POST   | Understand phase                 |
| `/api/pipeline/confirm-tickers`        | POST   | Ticker confirmation               |
| `/api/pipeline/detect-events`          | POST   | Event detection                  |
| `/api/pipeline/impact-windows`         | POST   | Impact window analysis            |
| `/api/pipeline/simulate`               | POST   | Trade simulation                 |
