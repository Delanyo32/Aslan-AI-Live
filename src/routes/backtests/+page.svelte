<script lang="ts">
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type BacktestSummary = {
    total_return_pct: number
    win_rate: number
    ticker_count: number
    event_count?: number
  }

  let activeFilter = $state<'all' | 'top' | 'winrate'>('all')

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

<div class="min-h-screen bg-[#fcfbf9] text-[#171717]">

  <!-- ── Header (Fixed) ──────────────────────────────────────────────────────── -->
  <header class="fixed top-0 left-0 w-full z-[100] h-20 bg-[#fcfbf9] border-b border-[#e5e5e5] px-8 lg:px-12 flex items-center justify-between">
    <a href="/" class="serif-italic text-2xl font-bold tracking-tight text-gray-900 no-underline">Aslan Finance</a>

    <nav class="hidden md:flex items-center gap-12">
      <a href="/#how-it-works" class="mono-label text-gray-600 hover:text-black nav-underline no-underline">Methodology</a>
      <a href="/backtests"     class="mono-label text-black nav-underline no-underline">Backtests</a>
      <a href="/#pricing"     class="mono-label text-gray-600 hover:text-black nav-underline no-underline">Pricing</a>
    </nav>

    <div class="flex items-center gap-4">
      <div class="hidden lg:flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e5e5] rounded-full">
        <span class="w-2 h-2 bg-green-500 rounded-full pulse-status"></span>
        <span class="mono-label text-[10px] tracking-widest text-gray-500">System Online</span>
      </div>
      {#if data.user}
        <a href="/dashboard" class="bg-[#171717] text-white px-6 py-2.5 rounded-full mono-label hover:bg-[#4338ca] transition-colors duration-500 no-underline">
          Dashboard →
        </a>
      {:else}
        <a href="/auth/login"    class="mono-label text-gray-600 hover:text-black no-underline hidden md:block">Login</a>
        <a href="/auth/register" class="bg-[#171717] text-white px-6 py-2.5 rounded-full mono-label hover:bg-[#4338ca] transition-colors duration-500 no-underline">
          Initialize
        </a>
      {/if}
    </div>
  </header>

  <!-- ── Hero (Dark) ─────────────────────────────────────────────────────────── -->
  <section class="relative bg-[#171717] pt-44 pb-32 px-8 lg:px-24 overflow-hidden border-b border-white/5">
    <div class="absolute inset-0 mesh-gradient pointer-events-none opacity-40" aria-hidden="true"></div>
    <div class="relative z-10 max-w-7xl mx-auto">
      <span class="mono-label text-[#4338ca] mb-8 block">Community Intelligence</span>
      <h1 class="serif-italic text-[clamp(2.5rem,8vw,6rem)] leading-[0.85] tracking-tighter text-white mb-16">
        Public Results
      </h1>
      <div class="flex flex-wrap gap-4">
        {#each [['all', 'All Results'], ['top', 'Top Gainers'], ['winrate', 'Highest Win Rate']] as [val, label] (val)}
          <button
            onclick={() => activeFilter = val as 'all' | 'top' | 'winrate'}
            class="px-6 py-2 rounded-full mono-label text-[10px] cursor-pointer transition-colors duration-300 border
              {activeFilter === val
                ? 'border-[#4338ca] bg-[#4338ca] text-white'
                : 'border-white/10 text-white/40 hover:text-white hover:border-white bg-transparent'}"
          >{label}</button>
        {/each}
      </div>
    </div>
  </section>

  <!-- ── Card Gallery ────────────────────────────────────────────────────────── -->
  <main class="max-w-7xl mx-auto px-8 lg:px-24 py-12">
    {#if data.reports.length === 0}
      <div class="py-32 text-center flex flex-col items-center gap-8">
        <p class="serif-italic text-2xl text-gray-400">No public results yet.</p>
        <a href="/auth/register" class="bg-[#171717] text-white px-6 py-2.5 rounded-full mono-label hover:bg-[#4338ca] transition-colors duration-500 no-underline">
          Run the first backtest →
        </a>
      </div>
    {:else}
      <div class="flex flex-col gap-1">
        {#each data.reports as report (report.slug)}
          {@const s = summary(report)}
          <a
            href="/backtest/{report.slug}?ref=backtests"
            class="group block p-8 md:p-12 bg-white border border-[#e5e5e5] rounded-3xl premium-transition no-underline hover:border-[#4338ca]"
          >
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <!-- Left: query + tickers + date -->
              <div class="flex-1 min-w-0">
                <h3 class="serif-italic text-3xl md:text-4xl text-[#171717] leading-tight mb-4 transition-colors duration-300 group-hover:text-[#4338ca]">
                  {report.query}
                </h3>
                <div class="flex items-center gap-4 flex-wrap">
                  <span class="mono-label text-[11px] text-gray-400">Tickers:</span>
                  <span class="font-mono text-[13px] font-bold text-gray-600">
                    {report.confirmed_tickers.slice(0, 5).join(', ')}{report.confirmed_tickers.length > 5 ? ` +${report.confirmed_tickers.length - 5}` : ''}
                  </span>
                  <span class="mono-label text-[10px] text-gray-400">{formatDate(report.created_at)}</span>
                </div>
              </div>

              <!-- Right: stats -->
              {#if s}
                <div class="flex items-start gap-8 md:gap-12 lg:gap-16 lg:border-l lg:border-gray-100 lg:pl-12 xl:pl-16 shrink-0">
                  <div class="flex flex-col">
                    <span class="mono-label text-[9px] text-gray-400 mb-2">Return</span>
                    <span class="font-mono text-xl md:text-2xl font-bold {s.total_return_pct >= 0 ? 'text-[#4338ca]' : 'text-red-400'}">
                      {formatPct(s.total_return_pct)}
                    </span>
                  </div>
                  <div class="flex flex-col">
                    <span class="mono-label text-[9px] text-gray-400 mb-2">Win Rate</span>
                    <span class="font-mono text-xl md:text-2xl font-bold text-gray-900">
                      {formatWinRate(s.win_rate)}
                    </span>
                  </div>
                  {#if s.event_count != null}
                    <div class="flex flex-col">
                      <span class="mono-label text-[9px] text-gray-400 mb-2">Events</span>
                      <span class="font-mono text-xl md:text-2xl font-bold text-gray-400">
                        {s.event_count} Found
                      </span>
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="lg:border-l lg:border-gray-100 lg:pl-12 xl:pl-16">
                  <span class="font-mono text-2xl text-gray-300">—</span>
                </div>
              {/if}
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </main>

  <!-- ── Footer ─────────────────────────────────────────────────────────────── -->
  <footer class="bg-[#171717] text-white pt-32 pb-12 px-8 lg:px-24 relative mt-32 rounded-t-[5rem]">
    <!-- Radial glow -->
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-indigo-500/20 blur-[100px] pointer-events-none" aria-hidden="true"></div>

    <div class="max-w-6xl mx-auto">
      <!-- Quote -->
      <div class="mb-24 text-center">
        <p class="serif-italic text-4xl md:text-5xl leading-tight mb-8">
          "In the intersection of logic and intuition<br class="hidden md:block"> lies the truth of the market."
        </p>
        <p class="mono-label text-gray-500">— The Aslan Core</p>
      </div>

      <!-- 3-col grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-16 border-t border-white/10 pt-20 mb-16" style="font-family: 'Inter', sans-serif;">
        <div>
          <h5 class="mono-label text-xs mb-8 text-gray-500">Platform</h5>
          <div class="flex flex-col gap-3 text-gray-400">
            <a href="/#how-it-works" class="hover:text-white transition-colors no-underline">Methodology</a>
            <a href="/backtests"     class="hover:text-white transition-colors no-underline">Backtests</a>
            <a href="/#pricing"     class="hover:text-white transition-colors no-underline">Pricing</a>
          </div>
        </div>
        <div>
          <h5 class="mono-label text-xs mb-8 text-gray-500">Legal</h5>
          <div class="flex flex-col gap-3 text-gray-400">
            <a href="/disclaimer" class="hover:text-white transition-colors no-underline">Disclaimer</a>
            <a href="/terms"      class="hover:text-white transition-colors no-underline">Terms</a>
            <a href="/privacy"    class="hover:text-white transition-colors no-underline">Privacy</a>
          </div>
        </div>
        <div>
          <h5 class="mono-label text-xs mb-8 text-gray-500">Account</h5>
          <div class="flex flex-col gap-3 text-gray-400">
            <a href="/auth/login"    class="hover:text-white transition-colors no-underline">Log in</a>
            <a href="/auth/register" class="hover:text-white transition-colors no-underline">Create account</a>
          </div>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
        <span class="serif-italic text-2xl">Aslan Finance</span>
        <span class="mono-label text-[10px] text-gray-500">© 2025 Aslan Finance. All rights reserved.</span>
      </div>
    </div>
  </footer>

</div>
