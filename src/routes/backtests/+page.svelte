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

<nav class="flex items-center py-5 border-b-2 border-black bg-white">
  <a href="/" class="font-display italic font-normal text-[22px] text-black no-underline tracking-[-0.01em]">Aslan Finance</a>
  <div class="ml-auto flex items-center gap-7 max-sm:gap-4">
    <a href="/#how-it-works" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">How it works</a>
    <a href="/pricing" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Pricing</a>
    <a href="/backtests" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline border-b-2 border-black pb-px">Backtests</a>
    {#if data.user}
      <a href="/dashboard" class="font-sans text-xs tracking-[0.1em] uppercase bg-black text-white px-[18px] py-2 border-2 border-black no-underline transition-colors duration-100 hover:bg-white hover:text-black">Dashboard →</a>
    {:else}
      <a href="/auth/login" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Login</a>
      <a href="/auth/register" class="font-sans text-xs tracking-[0.1em] uppercase bg-black text-white px-[18px] py-2 border-2 border-black no-underline transition-colors duration-100 hover:bg-white hover:text-black">Register →</a>
    {/if}
  </div>
</nav>

<div class="bg-white flex flex-col py-10 pb-16">
  <header class="border-t-4 border-black pt-8 pb-8 flex flex-col gap-2">
    <span class="font-mono text-[10px] font-normal tracking-[0.1em] uppercase text-[#525252]">Community Backtests</span>
    <h1 class="font-display italic text-[clamp(2.5rem,6vw,4.5rem)] font-bold text-black leading-none tracking-[-0.025em]">Public Results</h1>
    <p class="italic text-base text-[#525252] m-0" style="font-family:'Source Serif 4',Georgia,serif">Backtest results shared by Aslan users.</p>
  </header>

  {#if data.reports.length === 0}
    <p class="italic text-base text-[#525252] text-center py-12 m-0" style="font-family:'Source Serif 4',Georgia,serif">No public backtests yet.</p>
  {:else}
    <div class="border-t-4 border-black flex flex-col">
      <div class="flex items-center gap-4 py-2 border-b border-black font-mono text-[10px] uppercase tracking-[0.1em] text-[#525252] max-sm:hidden">
        <span class="flex-1 min-w-[180px]">Query</span>
        <span class="max-w-[200px]">Tickers</span>
        <span class="min-w-[60px] text-right">Return</span>
        <span>Win Rate</span>
        <span>Date</span>
        <span class="ml-auto" aria-hidden="true"></span>
      </div>
      {#each data.reports as report (report.slug)}
        {@const s = summary(report)}
        <a
          href="/backtest/{report.slug}?ref=backtests"
          class="flex items-center gap-4 py-3 border-b border-[#E5E5E5] no-underline flex-wrap transition-colors duration-100 hover:bg-[#F5F5F5] max-sm:gap-x-3 max-sm:gap-y-2"
        >
          <span class="flex-1 min-w-[180px] font-sans text-sm text-black overflow-hidden text-ellipsis whitespace-nowrap max-sm:basis-full">
            {report.query}
          </span>

          <span class="font-mono text-sm text-[#525252] whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
            {report.confirmed_tickers.slice(0, 4).join(', ')}{report.confirmed_tickers.length > 4 ? ` +${report.confirmed_tickers.length - 4}` : ''}
          </span>

          {#if s}
            <span
              class="font-mono text-sm whitespace-nowrap min-w-[60px] text-right"
              class:text-accent-gain={s.total_return_pct >= 0}
              class:text-accent-loss={s.total_return_pct < 0}
            >
              {formatPct(s.total_return_pct)}
            </span>
            <span class="font-mono text-sm text-[#525252] whitespace-nowrap">{formatWinRate(s.win_rate)}</span>
          {:else}
            <span class="font-mono text-sm text-black whitespace-nowrap min-w-[60px] text-right">—</span>
            <span class="font-mono text-sm text-[#525252] whitespace-nowrap">—</span>
          {/if}

          <span class="font-mono text-sm text-[#AAAAAA] whitespace-nowrap">{formatDate(report.created_at)}</span>
          <span class="font-sans text-sm text-[#AAAAAA] ml-auto max-sm:hidden" aria-hidden="true">↗</span>
        </a>
      {/each}
    </div>
  {/if}
</div>
