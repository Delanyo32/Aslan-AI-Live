<script lang="ts">
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type BacktestSummary = {
    total_return_pct: number
    win_rate: number
    ticker_count: number
  }

  function summary(report: typeof data.reports[0]): BacktestSummary | null {
    const r = report.backtest_result as any
    return r?.summary ?? null
  }

  function formatPct(pct: number): string {
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${(pct * 100).toFixed(1)}%`
  }

  function formatWinRate(rate: number): string {
    return `${Math.round(rate * 100)}%`
  }

  function formatDate(val: string | Date): string {
    return new Date(val).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
      timeZone: 'UTC',
    })
  }
</script>

<svelte:head>
  <title>Public Backtests — Aslan AI</title>
  <meta name="description" content="Browse publicly shared news-driven backtest results from the Aslan AI community." />
</svelte:head>

<div class="page">
  <header class="page-header">
    <span class="page-label">COMMUNITY BACKTESTS</span>
    <p class="page-desc">Public results shared by Aslan users.</p>
  </header>

  {#if data.reports.length === 0}
    <p class="empty">No public backtests yet.</p>
  {:else}
    <div class="list">
      {#each data.reports as report (report.slug)}
        {@const s = summary(report)}
        <a href="/backtest/{report.slug}?ref=backtests" class="row">
          <span class="col-query">{report.query}</span>

          <span class="col-tickers mono">
            {report.confirmed_tickers.slice(0, 4).join(', ')}{report.confirmed_tickers.length > 4 ? ` +${report.confirmed_tickers.length - 4}` : ''}
          </span>

          {#if s}
            <span class="col-return mono" class:gain={s.total_return_pct >= 0} class:loss={s.total_return_pct < 0}>
              {formatPct(s.total_return_pct)}
            </span>
            <span class="col-winrate mono">{formatWinRate(s.win_rate)} win</span>
          {:else}
            <span class="col-return mono">—</span>
            <span class="col-winrate mono">—</span>
          {/if}

          <span class="col-date mono">{formatDate(report.created_at)}</span>
          <span class="col-link" aria-hidden="true">↗</span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 40px 0;
  }

  .page-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .page-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .page-desc {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: 0;
  }

  .empty {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
    padding: 48px 0;
    margin: 0;
  }

  .list {
    border-top: 1px solid var(--bg-border);
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--bg-border);
    text-decoration: none;
    flex-wrap: wrap;
    transition: background 80ms;
  }

  .row:hover {
    background: var(--bg-elevated);
  }

  .col-query {
    flex: 1;
    min-width: 180px;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mono {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
  }

  .col-tickers {
    color: var(--text-secondary);
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .col-return {
    white-space: nowrap;
    min-width: 60px;
    text-align: right;
  }

  .col-return.gain { color: var(--accent-gain); }
  .col-return.loss { color: var(--accent-loss); }

  .col-winrate {
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .col-date {
    color: var(--text-muted);
    white-space: nowrap;
  }

  .col-link {
    color: var(--text-muted);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    margin-left: auto;
  }

  @media (max-width: 640px) {
    .row { gap: 8px 12px; }
    .col-query { flex-basis: 100%; }
    .col-link { display: none; }
  }
</style>
