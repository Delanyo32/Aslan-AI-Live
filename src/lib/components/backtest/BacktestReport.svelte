<script lang="ts">
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import type { BacktestReportRow, RawExaEvent } from '$lib/types/pipeline';
  import EventChart from '$lib/components/charts/EventChart.svelte';
  import PortfolioChart from '$lib/components/charts/PortfolioChart.svelte';
  import WaitlistModal from '$lib/components/WaitlistModal.svelte';
  import { hostOf } from '$lib/utils';
  import { Tooltip } from 'bits-ui';

  interface Props {
    report: BacktestReportRow;
    viewContext: 'owner' | 'email_access' | 'public_link';
    backTo?: string;
    low_confidence_events: RawExaEvent[];
    userCredits?: number | null;
  }

  let { report, viewContext, backTo = '/dashboard', low_confidence_events, userCredits = null }: Props = $props();

  // ── Disclaimer toggle (mobile) ────────────────────────────────────────────
  let disclaimerExpanded = $state(false);

  // ── Low-confidence events toggle ──────────────────────────────────────────
  let showLow = $state(false);

  let shareText   = $state('Copy share link  ↗');

  // ── Waitlist modal ────────────────────────────────────────────────────────
  let waitlistOpen     = $state(false);
  let waitlistTitle    = $state('');
  let waitlistInterest = $state('');

  function openWaitlist(title: string, interest: string) {
    waitlistTitle    = title;
    waitlistInterest = interest;
    waitlistOpen     = true;
  }

  // ── Sort state ────────────────────────────────────────────────────────────
  let sortCol = $state('');
  let sortDir = $state<'asc' | 'desc'>('asc');

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Capitalized first domain label ("bloomberg.com" → "Bloomberg"); unparseable URLs pass through.
  function extractPub(url: string): string {
    const host = hostOf(url);
    if (host === null) return url;
    const domain = host.split('.')[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  const ENTRY_LABELS: Record<string, string> = {
    event_day:      'Market open on event day',
    next_day:       'Market open next trading day',
    two_days_after: 'Market open 2 days after event',
  };

  const EXIT_LABELS: Record<string, string> = {
    peak_car_date: 'Peak CAR date (Aggressive)',
    impact_end:    'Impact window end date (Moderate)',
    fixed_5_days:  '5 trading days after entry (Conservative)',
  };

  function fmtMonth(iso: string): string {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function fmtDate(iso: string): string {
    return iso.replace(/-/g, '.');
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const summary   = $derived(report.backtest_result.summary);
  const allTrades = $derived(report.backtest_result.trades);

  // Per-ticker performance breakdown
  const tickerStats = $derived.by(() => {
    const map = new Map<string, { pnl: number; wins: number; count: number; notional: number }>();
    for (const t of allTrades) {
      const s = map.get(t.ticker) ?? { pnl: 0, wins: 0, count: 0, notional: t.notional };
      s.pnl   += t.pnl_dollars;
      s.wins  += t.pnl_dollars > 0 ? 1 : 0;
      s.count += 1;
      map.set(t.ticker, s);
    }
    return [...map.entries()]
      .map(([symbol, s]) => ({
        symbol,
        totalPnl:   s.pnl,
        returnPct:  s.notional > 0 ? (s.pnl / (s.notional * s.count)) * 100 : 0,
        winRate:    s.count > 0 ? (s.wins / s.count) * 100 : 0,
        tradeCount: s.count,
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);
  });

  // Points on the portfolio line where a trade closed (used for dots)
  const tradeClosePoints = $derived.by(() => {
    const exitDates = new Set(allTrades.map(t => t.exit_date));
    return report.backtest_result.portfolio_series.filter(p => exitDates.has(p.date));
  });

  // Date range from occurrences for params block
  const paramsDateRange = $derived.by(() => {
    const dates = report.occurrences.map(o => o.event_date).sort();
    if (dates.length === 0) return '—';
    return `${fmtMonth(dates[0])} – ${fmtMonth(dates[dates.length - 1])}`;
  });

  const highCount = $derived(report.occurrences.filter(o => o.confidence === 'HIGH').length);
  const medCount  = $derived(report.occurrences.filter(o => o.confidence === 'MEDIUM').length);

  // Trade rows for table display
  const viewTrades = $derived(
    allTrades.map((t, i) => ({
      id:         i + 1,
      date:       t.event_date,
      ticker:     t.ticker,
      dir:        t.direction === 'long' ? 'Long' : 'Short',
      entryDate:  t.entry_date,
      entryPrice: t.entry_price,
      exitDate:   t.exit_date,
      exitPrice:  t.exit_price,
      days:       t.hold_days,
      pnlDollar:  t.pnl_dollars,
      pnlPct:     t.pnl_pct * 100,
      vsSpy:      t.abnormal_return_vs_benchmark * 100,
    }))
  );

  const sortedTrades = $derived.by(() => {
    if (!sortCol) return viewTrades;
    const col = sortCol;
    return [...viewTrades].sort((a, b) => {
      const av = a[col as keyof typeof a];
      const bv = b[col as keyof typeof a];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  });

  // Event view (combines occurrences + impact windows + trades)
  const viewEvents = $derived.by(() =>
    report.occurrences
      .filter(o => o.confidence !== 'LOW')
      .map(occ => {
        const primarySource = occ.sources[0];
        const windows       = report.impact_windows.filter(w => w.event_date === occ.event_date);
        const maxDuration   = windows.length > 0 ? Math.max(...windows.map(w => w.impact_duration_days)) : 0;
        const maxPeakCar    = windows.length > 0 ? Math.max(...windows.map(w => w.peak_car)) : 0;
        const hasOverride   = windows.some(w => w.override_event !== null);
        const eventTrades   = allTrades.filter(t => t.event_date === occ.event_date);

        return {
          date:        occ.event_date,
          description: occ.description,
          confidence:  occ.confidence as 'HIGH' | 'MEDIUM',
          source: {
            pub:      primarySource ? extractPub(primarySource.url) : 'Unknown',
            headline: primarySource?.title ?? '',
            url:      primarySource?.url   ?? '#',
          },
          impactDuration: maxDuration,
          peakCAR:    `${maxPeakCar >= 0 ? '+' : ''}${(maxPeakCar * 100).toFixed(1)}%`,
          windowEnd:  hasOverride ? 'Override event' : 'Mean reversion',
          tickers: eventTrades.map(t => {
            const win = report.impact_windows.find(
              w => w.event_date === occ.event_date && w.ticker === t.ticker,
            );
            return {
              ticker:            t.ticker,
              entry:             t.entry_date,
              entryPrice:        t.entry_price,
              exit:              t.exit_date,
              exitPrice:         t.exit_price,
              dir:               t.direction === 'long' ? 'Long' : 'Short',
              direction_raw:     t.direction,
              pnlPct:            t.pnl_pct * 100,
              pnlDollar:         t.pnl_dollars,
              ohlcv:             win?.ohlcv     ?? [],
              impact_window_end: win?.impact_end ?? t.exit_date,
            };
          }),
        };
      })
  );

  // Deduplicated sources list
  const allSources = $derived.by(() => {
    const seen    = new Set<string>();
    const sources: { url: string; title: string; pub: string }[] = [];
    for (const occ of report.occurrences) {
      for (const src of occ.sources) {
        if (!seen.has(src.url)) {
          seen.add(src.url);
          sources.push({ url: src.url, title: src.title, pub: extractPub(src.url) });
        }
      }
    }
    return sources;
  });

  // Combined confirmed + low-confidence list for Section ④ rendering
  type ConfirmedItem = { kind: 'confirmed' } & (typeof viewEvents)[0]
  type LowItem = { kind: 'low'; date: string; description: string; sources: RawExaEvent['sources'] }
  type MergedItem = ConfirmedItem | LowItem

  const mergedViewEvents = $derived.by((): MergedItem[] => {
    const confirmed: MergedItem[] = viewEvents.map(e => ({ ...e, kind: 'confirmed' as const }))
    if (!showLow) return confirmed
    const low: MergedItem[] = low_confidence_events.map(e => ({
      kind: 'low' as const,
      date: e.event_date,
      description: e.description,
      sources: e.sources,
    }))
    return [...confirmed, ...low].sort((a, b) => a.date.localeCompare(b.date))
  })

  // ── Chart time filter ─────────────────────────────────────────────────────
  let chartFilter = $state<'all' | '1y'>('all');

  const filteredSeries = $derived.by(() => {
    if (chartFilter === 'all') return report.backtest_result.portfolio_series;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoff = oneYearAgo.toISOString().slice(0, 10);
    const series = report.backtest_result.portfolio_series.filter(p => p.date >= cutoff);
    return series.length > 0 ? series : report.backtest_result.portfolio_series;
  });

  const filteredClosePoints = $derived.by(() => {
    const seriesDates = new Set(filteredSeries.map(p => p.date));
    return tradeClosePoints.filter(p => seriesDates.has(p.date));
  });

  // ── Secondary metric derivations ──────────────────────────────────────────
  const avgWin = $derived.by(() => {
    const wins = allTrades.filter(t => t.pnl_dollars > 0);
    if (wins.length === 0) return null;
    return wins.reduce((s, t) => s + t.pnl_pct * 100, 0) / wins.length;
  });

  const avgLoss = $derived.by(() => {
    const losses = allTrades.filter(t => t.pnl_dollars < 0);
    if (losses.length === 0) return null;
    return losses.reduce((s, t) => s + t.pnl_pct * 100, 0) / losses.length;
  });

  const profitFactor = $derived.by(() => {
    const gross = allTrades.filter(t => t.pnl_dollars > 0).reduce((s, t) => s + t.pnl_dollars, 0);
    const loss  = Math.abs(allTrades.filter(t => t.pnl_dollars < 0).reduce((s, t) => s + t.pnl_dollars, 0));
    return loss === 0 ? null : gross / loss;
  });

  // ── Sort helpers ──────────────────────────────────────────────────────────
  function sortBy(col: string) {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = 'asc';
    }
  }

  function sortIndicator(col: string): string {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      shareText = 'Copied!';
      setTimeout(() => { shareText = 'Copy share link  ↗'; }, 1500);
    } catch {
      toast.error(`Clipboard unavailable — copy this link manually: ${window.location.href}`, { duration: 8000 });
    }
  }

  // ── Owner controls ────────────────────────────────────────────────────────
  let currentIsPublic   = $state(report.is_public);
  let visibilityLoading = $state(false);
  let visibilityError   = $state('');
  let justMadePrivate   = $state(false);
  let deleteConfirming  = $state(false);
  let deleteLoading     = $state(false);
  let deleteError       = $state('');

  async function toggleVisibility() {
    if (visibilityLoading) return;
    visibilityLoading = true;
    visibilityError = '';
    const target = !currentIsPublic;
    try {
      const res = await fetch(`/api/reports/${report.slug}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: target }),
      });
      if (res.ok) {
        currentIsPublic = target;
        if (!target) justMadePrivate = true;
        if (target) justMadePrivate = false;
      } else {
        visibilityError = 'Could not update visibility. Try again.';
      }
    } catch {
      visibilityError = 'Could not update visibility. Try again.';
    } finally {
      visibilityLoading = false;
    }
  }

  async function handleDelete() {
    if (deleteLoading) return;
    deleteLoading = true;
    deleteError = '';
    try {
      const res = await fetch(`/api/reports/${report.slug}/delete`, { method: 'POST' });
      if (res.ok) {
        goto('/dashboard');
      } else {
        deleteError = 'Deletion failed. Try again.';
      }
    } catch {
      deleteError = 'Deletion failed. Try again.';
    } finally {
      deleteLoading = false;
    }
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  function fmtPrice(n: number): string {
    return '$' + n.toFixed(2);
  }

  function fmtPnlDollar(n: number): string {
    const sign = n >= 0 ? '+' : '−';
    return sign + '$' + Math.abs(n).toLocaleString('en-US');
  }

  function fmtPnlPct(n: number): string {
    const sign = n >= 0 ? '+' : '−';
    return sign + Math.abs(n).toFixed(1) + '%';
  }
</script>

<div class="min-h-screen bg-[#fcfbf9]">

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- FIXED HEADER                                                           -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<header class="fixed top-0 left-0 w-full z-[100] h-20 bg-[#fcfbf9]/90 backdrop-blur-md border-b border-[#e5e5e5] px-8 lg:px-12 flex items-center justify-between">
  <div class="flex items-center gap-8">
    {#if viewContext === 'owner'}
      <a href={backTo} class="mono-label text-[10px] text-gray-500 no-underline hover:text-black transition-colors flex items-center gap-2">
        ← {backTo === '/dashboard' ? 'Dashboard' : 'Home'}
      </a>
    {:else}
      <a href="/" class="serif-italic text-2xl font-bold tracking-tight text-gray-900 no-underline">Aslan Finance</a>
      <div class="hidden md:block h-4 w-px bg-[#e5e5e5]"></div>
      <a href="/" class="hidden md:flex items-center gap-2 mono-label text-[10px] text-gray-500 no-underline hover:text-black transition-colors">
        ← Back to Terminal
      </a>
    {/if}
  </div>

  <div class="flex items-center gap-4 flex-wrap justify-end">
    <div class="hidden lg:flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e5e5] rounded-full">
      <span class="w-2 h-2 bg-green-500 rounded-full pulse-status"></span>
      <span class="mono-label text-[10px] tracking-widest text-gray-500">Analysis Complete</span>
    </div>

    {#if viewContext === 'owner'}
      <button onclick={copyShareLink} class="mono-label text-[10px] text-gray-500 hover:text-black transition-colors cursor-pointer bg-transparent border-none">{shareText}</button>
      <span class="text-[#CCCCCC]" aria-hidden="true">·</span>
      <span class="mono-label text-[10px] text-gray-500">{currentIsPublic ? 'Public' : 'Private'}</span>
      <button onclick={toggleVisibility} disabled={visibilityLoading}
        class="mono-label text-[10px] text-gray-500 hover:text-black transition-colors cursor-pointer bg-transparent border-none disabled:opacity-50">
        {visibilityLoading ? 'Updating…' : (currentIsPublic ? 'Make private' : 'Make public')} →
      </button>
      <span class="text-[#CCCCCC]" aria-hidden="true">·</span>
      <button onclick={() => { deleteConfirming = true; deleteError = ''; }}
        class="mono-label text-[10px] text-red-400 hover:text-red-600 cursor-pointer bg-transparent border-none">
        Delete
      </button>
      <span class="text-[#CCCCCC]" aria-hidden="true">·</span>
    {/if}

    <button onclick={() => window.print()}
      class="hidden sm:block bg-white border border-[#e5e5e5] text-black px-5 py-2 rounded-full mono-label text-[10px] hover:border-black transition-colors duration-300 cursor-pointer">
      Export PDF
    </button>
    <a href={viewContext === 'owner' ? '/dashboard' : '/auth/register'}
      class="bg-[#171717] text-white px-6 py-2.5 rounded-full mono-label text-[10px] hover:bg-[#4338ca] transition-colors duration-500 no-underline">
      New Query →
    </a>
  </div>
</header>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- DISCLAIMER (sticky below fixed header)                                 -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div
  class="sticky top-20 z-40 w-full px-8 lg:px-12 py-2.5 bg-[#fcfbf9]/95 backdrop-blur-sm border-b border-[#e5e5e5] font-sans text-sm text-[#525252] leading-relaxed
         sm:block
         max-sm:flex max-sm:items-center max-sm:gap-1"
  class:max-sm:flex-col={disclaimerExpanded}
  class:max-sm:items-start={disclaimerExpanded}
>
  <span
    class="flex-1 min-w-0"
    class:max-sm:overflow-hidden={!disclaimerExpanded}
    class:max-sm:whitespace-nowrap={!disclaimerExpanded}
  >
    This report was generated by AI and is for informational purposes only.
    It does not constitute financial advice. AI-identified events and simulated
    trades may be inaccurate or incomplete. Past hypothetical performance does
    not guarantee future results. Always do your own research.
  </span>
  <button
    class="hidden max-sm:inline whitespace-nowrap shrink-0 bg-transparent border-none text-[#525252] font-sans text-sm cursor-pointer p-0 leading-relaxed"
    onclick={() => disclaimerExpanded = !disclaimerExpanded}
    aria-label={disclaimerExpanded ? 'Show less' : 'Show more'}
  >{disclaimerExpanded ? 'Show less ▲' : '… Show more ▼'}</button>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- CONTENT                                                                -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<!-- MAIN: Hero + KPIs + Chart + Secondary metrics -->
<main class="pt-32 pb-24 px-8 lg:px-12 max-w-[1440px] mx-auto">

  {#if viewContext === 'owner' && (justMadePrivate || visibilityError)}
    <div class="mb-6 border-l-[3px] border-[#e5e5e5] px-3 py-1.5 font-sans text-sm text-[#525252]">
      {#if justMadePrivate}This report is now private — only you can view it.{/if}
      {#if visibilityError}<span class="text-red-400">{visibilityError}</span>{/if}
    </div>
  {/if}

  <!-- Report Hero -->
  <div class="mb-16 opacity-0 animate-slide-up">
    <div class="flex items-center gap-4 mb-6 flex-wrap">
      <span class="mono-label text-[#4338ca] text-[10px]">Report #{report.slug.slice(0, 8).toUpperCase()}</span>
      {#if highCount >= 3}
        <span class="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-mono uppercase tracking-widest rounded">High Conviction</span>
      {:else if highCount >= 1}
        <span class="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-mono uppercase tracking-widest rounded">Medium Conviction</span>
      {/if}
      <span class="text-gray-400 font-mono text-xs">{fmtMonth(String(report.created_at))}</span>
    </div>
    <div class="max-w-4xl">
      <h1 class="serif-italic text-4xl md:text-5xl lg:text-6xl leading-[1.1] tracking-tight text-gray-900">
        {report.query}
      </h1>
    </div>
  </div>

  <!-- Primary KPIs Grid -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-12 opacity-0 animate-slide-up" style="animation-delay: 0.1s;">
    <div class="bg-white border border-[#e5e5e5] p-6 rounded-2xl premium-transition hover-lift">
      <span class="mono-label text-[10px] text-gray-400 block mb-4">Total Return</span>
      <span class="text-3xl lg:text-4xl font-mono tracking-tighter {summary.total_return_pct >= 0 ? 'text-[#171717]' : 'text-red-500'}">
        {fmtPnlPct(summary.total_return_pct * 100)}
      </span>
    </div>
    <div class="bg-white border border-[#e5e5e5] p-6 rounded-2xl premium-transition hover-lift">
      <span class="mono-label text-[10px] text-gray-400 block mb-4">Win Rate</span>
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="text-3xl lg:text-4xl font-mono tracking-tighter text-[#171717]">{(summary.win_rate * 100).toFixed(0)}%</span>
        <span class="text-sm font-mono text-gray-400">{summary.trade_count} Trades</span>
      </div>
    </div>
    <div class="bg-white border border-[#e5e5e5] p-6 rounded-2xl premium-transition hover-lift">
      <span class="mono-label text-[10px] text-gray-400 block mb-4">Max Drawdown</span>
      <span class="text-3xl lg:text-4xl font-mono tracking-tighter text-[#171717]">
        −{(summary.max_drawdown * 100).toFixed(1)}%
      </span>
    </div>
    <div class="bg-white border border-[#e5e5e5] p-6 rounded-2xl premium-transition hover-lift">
      <span class="mono-label text-[10px] text-gray-400 block mb-4">Events Found</span>
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="text-3xl lg:text-4xl font-mono tracking-tighter text-[#171717]">{summary.event_count}</span>
        <span class="text-sm font-mono text-gray-400">{summary.ticker_count} ticker{summary.ticker_count !== 1 ? 's' : ''}</span>
      </div>
    </div>
  </div>

  <!-- Equity Curve Section -->
  <div class="bg-white border border-[#e5e5e5] rounded-[2rem] p-8 mb-12 opacity-0 animate-slide-up" style="animation-delay: 0.2s;">
    <div class="flex justify-between items-center mb-8 flex-wrap gap-4">
      <h3 class="serif-italic text-2xl">Cumulative Equity Curve</h3>
      <div class="flex gap-2">
        <button
          onclick={() => chartFilter = 'all'}
          class="px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors cursor-pointer border-none
            {chartFilter === 'all' ? 'bg-gray-100 text-black' : 'bg-transparent text-gray-500 hover:text-black'}"
        >All Time</button>
        <button
          onclick={() => chartFilter = '1y'}
          class="px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors cursor-pointer border-none
            {chartFilter === '1y' ? 'bg-gray-100 text-black' : 'bg-transparent text-gray-500 hover:text-black'}"
        >1Y</button>
      </div>
    </div>
    <PortfolioChart portfolio_series={filteredSeries} trade_close_points={filteredClosePoints} />
  </div>

  <!-- Secondary Metrics Row -->
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 border-t border-[#e5e5e5] pt-10 pb-4 mb-8 opacity-0 animate-slide-up" style="animation-delay: 0.3s;">
    <div>
      <span class="mono-label text-[9px] text-gray-400 block mb-2">Avg Win</span>
      <span class="font-mono text-lg {avgWin != null && avgWin >= 0 ? 'text-green-600' : 'text-gray-900'}">
        {avgWin != null ? fmtPnlPct(avgWin) : '—'}
      </span>
    </div>
    <div>
      <span class="mono-label text-[9px] text-gray-400 block mb-2">Avg Loss</span>
      <span class="font-mono text-lg {avgLoss != null && avgLoss < 0 ? 'text-red-500' : 'text-gray-900'}">
        {avgLoss != null ? fmtPnlPct(avgLoss) : '—'}
      </span>
    </div>
    <div>
      <span class="mono-label text-[9px] text-gray-400 block mb-2">Hold Period</span>
      <span class="font-mono text-lg text-gray-900">{summary.avg_hold_days.toFixed(0)} days</span>
    </div>
    <div>
      <span class="mono-label text-[9px] text-gray-400 block mb-2">Profit Factor</span>
      <span class="font-mono text-lg text-gray-900">{profitFactor != null ? profitFactor.toFixed(2) : '—'}</span>
    </div>
    <div>
      <span class="mono-label text-[9px] text-gray-400 block mb-2">Final Value</span>
      <span class="font-mono text-lg text-gray-900">${summary.final_portfolio_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
    </div>
    <div>
      <span class="mono-label text-[9px] text-gray-400 block mb-2">Data Quality</span>
      <span class="font-mono text-lg {highCount > 0 ? 'text-[#4338ca]' : 'text-gray-900'}">{highCount > 0 ? 'Tier 1' : 'Tier 2'}</span>
    </div>
  </div>

</main>

<!-- PHASE 01 — Analysis -->
<section class="py-16 px-8 lg:px-12 border-t-4 border-black bg-[#fcfbf9]">
  <div class="max-w-[1440px] mx-auto">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-12">

      <!-- Left sidebar label -->
      <div class="lg:col-span-3">
        <span class="mono-label text-[10px] text-[#4338ca]">Phase 01 — Analysis</span>
        <p class="serif-italic text-2xl mt-4 text-gray-900">Research Narrative</p>
      </div>

      <!-- Right content column -->
      <div class="lg:col-span-9 border-l-4 border-black pl-8 lg:pl-16 py-4">
        <span class="mono-label text-[10px] bg-black text-white px-2 py-1 inline-block mb-8">AI Generated</span>

        {#if report.research_narrative}
          {#each report.research_narrative.split('\n\n').filter(p => p.trim()) as para, i}
            {#if i === 0}
              <p class="text-2xl font-serif text-gray-900 leading-relaxed italic mb-8">{para}</p>
            {:else}
              <p class="text-xl font-serif text-gray-700 leading-relaxed mb-4">{para}</p>
            {/if}
          {/each}
        {:else}
          <p class="text-xl font-serif text-gray-700 leading-relaxed italic">Research narrative is being generated…</p>
        {/if}

        <!-- Thesis Configuration card -->
        <div class="mt-16 bg-[#F5F5F5] p-10 rounded-2xl border border-[#e5e5e5]">
          <span class="mono-label text-[10px] text-gray-500 block mb-6">Thesis Configuration</span>
          <p class="font-serif italic text-base text-black mb-6">{report.query}</p>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <span class="text-xs text-gray-500 uppercase font-mono block mb-1">Signal Confirmation</span>
              <span class="text-sm font-mono">{ENTRY_LABELS[report.rule.entry] ?? report.rule.entry}</span>
            </div>
            <div>
              <span class="text-xs text-gray-500 uppercase font-mono block mb-1">Exit Logic</span>
              <span class="text-sm font-mono">{EXIT_LABELS[report.rule.exit] ?? report.rule.exit}</span>
            </div>
            <div>
              <span class="text-xs text-gray-500 uppercase font-mono block mb-1">Positioning</span>
              <span class="text-sm font-mono">{report.rule.direction === 'long' ? 'Long' : 'Short'} · ${report.rule.position_size.toLocaleString('en-US')} per trade</span>
            </div>
            <div>
              <span class="text-xs text-gray-500 uppercase font-mono block mb-1">Time Horizon</span>
              <span class="text-sm font-mono">{paramsDateRange}</span>
            </div>
            <div>
              <span class="text-xs text-gray-500 uppercase font-mono block mb-1">Tickers</span>
              <span class="text-sm font-mono">{report.confirmed_tickers.join(', ')}</span>
            </div>
            <div>
              <span class="text-xs text-gray-500 uppercase font-mono block mb-1">Events Found</span>
              <span class="text-sm font-mono">{report.occurrences.length} (High: {highCount}, Medium: {medCount})</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</section>

<!-- PHASE 02 — Data -->
<section class="py-24 px-8 lg:px-24 bg-[#171717] text-[#fcfbf9] border-t border-white/5">
  <div class="max-w-7xl mx-auto">

    <!-- Section header -->
    <div class="mb-16 border-b border-[#fcfbf9]/10 pb-10 flex flex-col md:flex-row justify-between items-end gap-8">
      <div class="flex flex-col gap-3">
        <span class="mono-label text-[10px] tracking-[0.4em] text-indigo-400">Phase 02 — Data</span>
        <h2 class="serif-italic text-4xl md:text-5xl tracking-tight">
          Asset <span class="opacity-40">Breakdown</span>
        </h2>
      </div>
    </div>

    <!-- Compact ticker metrics row -->
    {#if tickerStats.length > 1}
    <div class="flex gap-12 overflow-x-auto pb-8 mb-8">
      {#each tickerStats as ts}
        <div class="shrink-0">
          <span class="mono-label text-[10px] opacity-40 block mb-2">{ts.symbol}</span>
          <span class="font-mono text-xl {ts.totalPnl >= 0 ? 'text-indigo-400 font-bold' : 'text-gray-600'}">
            {ts.returnPct >= 0 ? '+' : ''}{ts.returnPct.toFixed(1)}%
          </span>
          <span class="font-mono text-[10px] opacity-30 block mt-1 tracking-widest uppercase">{ts.winRate.toFixed(0)}% WR · {ts.tradeCount} trades</span>
        </div>
      {/each}
    </div>
    {/if}

    <!-- All Trades table (Intelligence Output style) -->
    <div class="overflow-x-auto">
      <table class="w-full border-collapse font-mono text-sm">
        <thead>
          <tr class="border-b border-[#fcfbf9]/10 text-left">
            {#each [
              ['id',         '#'],
              ['date',       'DATE'],
              ['ticker',     'TICKER'],
              ['dir',        'DIR'],
              ['entryDate',  'ENTRY DATE'],
              ['entryPrice', 'ENTRY $'],
              ['exitDate',   'EXIT DATE'],
              ['exitPrice',  'EXIT $'],
              ['days',       'DAYS'],
              ['pnlDollar',  'P&L $'],
              ['pnlPct',     'P&L %'],
              ['vsSpy',      'vs SPY'],
            ] as [col, label]}
            <th
              class="pb-6 mono-label text-[10px] font-normal tracking-widest uppercase opacity-30 px-3 whitespace-nowrap cursor-pointer select-none hover:opacity-60 transition-opacity duration-100"
              class:text-right={col === 'pnlDollar' || col === 'pnlPct' || col === 'vsSpy'}
              onclick={() => sortBy(col)}
              title="Sort by {label}"
            >{label}{sortIndicator(col)}</th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-[#fcfbf9]/5">
          {#each sortedTrades as t}
          <tr class="hover:bg-white/[0.03] transition-colors duration-300">
            <td class="py-5 px-3 text-gray-600">{t.id}</td>
            <td class="py-5 px-3 text-gray-500">{fmtDate(t.date)}</td>
            <td class="py-5 px-3 text-indigo-400 font-bold">{t.ticker}</td>
            <td class="py-5 px-3 text-gray-500 text-[11px] tracking-widest uppercase">{t.dir}</td>
            <td class="py-5 px-3 text-gray-500">{fmtDate(t.entryDate)}</td>
            <td class="py-5 px-3 text-gray-400">{fmtPrice(t.entryPrice)}</td>
            <td class="py-5 px-3 text-gray-500">{fmtDate(t.exitDate)}</td>
            <td class="py-5 px-3 text-gray-400">{fmtPrice(t.exitPrice)}</td>
            <td class="py-5 px-3 text-gray-500">{t.days}</td>
            <td class="py-5 px-3 text-right"
              class:text-indigo-400={t.pnlDollar >= 0} class:font-bold={t.pnlDollar >= 0}
              class:text-gray-600={t.pnlDollar < 0}>{fmtPnlDollar(t.pnlDollar)}</td>
            <td class="py-5 px-3 text-right"
              class:text-indigo-400={t.pnlPct >= 0} class:font-bold={t.pnlPct >= 0}
              class:text-gray-600={t.pnlPct < 0}>{fmtPnlPct(t.pnlPct)}</td>
            <td class="py-5 px-3 text-right"
              class:text-indigo-400={t.vsSpy >= 0} class:font-bold={t.vsSpy >= 0}
              class:text-gray-600={t.vsSpy < 0}>{fmtPnlPct(t.vsSpy)}</td>
          </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Intelligence Feed / Sources -->
    <div class="mt-20 pt-10 border-t border-white/5">
      <span class="mono-label text-[10px] opacity-40 block mb-6">Intelligence Feed / Sources Cited</span>
      <ul class="list-none flex flex-col gap-4 p-0 m-0">
        {#each allSources as src, i}
          <li class="font-sans text-[13px] text-[#fcfbf9]/60 flex items-start gap-4">
            <span class="opacity-40 uppercase tracking-widest text-[9px] mt-1 shrink-0">Source {String.fromCharCode(65 + i)}</span>
            <span>{src.pub}&nbsp;&nbsp;·&nbsp;&nbsp;"{src.title}"&nbsp;&nbsp;·&nbsp;&nbsp;<a href={src.url} target="_blank" rel="noopener noreferrer" class="text-indigo-400/60 no-underline hover:text-indigo-400 transition-colors duration-100">↗ {hostOf(src.url) ?? src.url}</a></span>
          </li>
        {/each}
      </ul>
    </div>

    <!-- Re-run / action footer -->
    {#if userCredits === 0}
      <div class="mt-16 pt-10 border-t border-white/5 text-center">
        <p class="text-[13px] text-[#fcfbf9]/40 font-sans">Re-run requires 1 credit.&nbsp;&nbsp;<a href="/dashboard/credits" class="text-indigo-400/60 hover:text-indigo-400 transition-colors duration-100">Buy credits →</a></p>
      </div>
    {:else if userCredits != null && userCredits > 0}
      <div class="mt-16 pt-10 border-t border-white/5 text-center">
        <a href={`/dashboard?rerun=${report.slug}&query=${encodeURIComponent(report.query)}`}
          class="inline-flex items-center gap-4 group text-[#fcfbf9]/40 hover:text-[#fcfbf9] transition-all duration-500 no-underline">
          <span class="mono-label text-[11px] border-b border-transparent group-hover:border-[#fcfbf9] pb-1 tracking-[0.2em]">Re-run Terminal Analysis</span>
          <iconify-icon icon="lucide:arrow-right" class="group-hover:translate-x-2 transition-transform duration-500 text-indigo-400"></iconify-icon>
        </a>
      </div>
    {/if}

  </div>
</section>

<!-- CTA BAR -->
<div class="border-t-4 border-black bg-[#fcfbf9]">
  <div class="py-24 px-8 lg:px-12 max-w-[1440px] mx-auto">
    <h2 class="serif-italic text-4xl mb-4">Ready to refine your edge?</h2>
    <p class="text-gray-500 font-serif text-lg mb-10">Adjust your parameters, tighten your thesis, or explore a new signal.</p>
    <div class="flex items-center gap-4 flex-wrap">
      <button
        class="bg-white border-2 border-black text-black px-8 py-4 mono-label text-[10px] hover:bg-black hover:text-white transition-colors duration-300 cursor-pointer"
        onclick={copyShareLink}
      >{shareText}</button>
      <a
        href={viewContext === 'owner' ? '/dashboard' : '/auth/register'}
        class="bg-black text-white px-10 py-4 mono-label text-[10px] hover:bg-[#4338ca] transition-colors duration-300 no-underline"
      >Run New Thesis →</a>
    </div>
    <p class="font-sans text-sm text-[#525252] mt-6">
      Set a live alert for this event — <span class="text-[#525252]">Coming Soon.</span>
      <!-- svelte-ignore a11y_invalid_attribute -->
      <a href="#" class="text-black underline decoration-[#E5E5E5] hover:decoration-black transition-colors duration-100" onclick={(e) => { e.preventDefault(); openWaitlist('Live alerts — coming soon', 'live-alerts'); }}>Join the waitlist →</a>
    </p>
  </div>
</div>

<!-- APPENDIX — Historical Event Log -->
<section class="py-24 px-8 lg:px-12 bg-[#171717] text-[#fcfbf9]">
  <div class="max-w-[1440px] mx-auto">

    <div class="flex flex-col md:flex-row justify-between items-end border-b border-[#fcfbf9]/10 pb-8 mb-12 gap-8">
      <div class="flex flex-col gap-3">
        <span class="mono-label text-indigo-400 text-[10px]">Appendix — Evidence</span>
        <h2 class="serif-italic text-5xl tracking-tight">Historical Event Log</h2>
      </div>
      {#if low_confidence_events.length > 0}
        <button
          onclick={() => showLow = !showLow}
          class="mono-label text-[10px] text-gray-400 hover:text-white transition-colors cursor-pointer bg-transparent border-none self-start md:self-end"
        >{showLow ? '← Hide' : 'Show →'} low-confidence ({low_confidence_events.length})</button>
      {/if}
    </div>

    <div class="flex flex-col gap-8">
      {#each mergedViewEvents as item, idx (item.date + idx)}

        {#if item.kind === 'low'}
        <div class="bg-white/[0.01] border border-white/5 rounded-2xl p-6 opacity-60">
          <div class="flex items-center gap-3 mb-2">
            <span class="mono-label text-[10px] text-gray-500">Low Confidence</span>
            <span class="font-mono text-xs text-gray-600">{item.date}</span>
          </div>
          <p class="text-gray-500 text-sm leading-relaxed">{item.description}</p>
          {#each item.sources.slice(0, 1) as src}
            <a href={src.url} target="_blank" rel="noopener noreferrer"
              class="mono-label text-[10px] text-gray-600 hover:text-gray-400 flex items-center gap-1 transition-colors no-underline mt-2 w-fit">
              ↗ {extractPub(src.url)}
            </a>
          {/each}
        </div>

        {:else}
        <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all duration-300 group">

          <!-- Date badge + vertical line -->
          <div class="flex flex-col items-start mb-6">
            <span class="px-3 py-1 font-mono text-xs rounded {item.confidence === 'HIGH' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-white/10 text-gray-400'}">
              {item.date} · {item.confidence}
            </span>
            <div class="w-px h-12 bg-white/10 ml-4 mt-2"></div>
          </div>

          <!-- Title (serif italic) -->
          <h4 class="serif-italic text-2xl text-white mb-4 leading-snug">{item.description}</h4>

          {#if item.source.headline}
            <a href={item.source.url} target="_blank" rel="noopener noreferrer"
              class="mono-label text-[10px] text-gray-500 hover:text-[#4338ca] flex items-center gap-1 transition-colors no-underline w-fit mb-4">
              ↗ {item.source.pub} · "{item.source.headline.slice(0, 60)}{item.source.headline.length > 60 ? '…' : ''}"
            </a>
          {/if}
          <p class="font-mono text-xs text-gray-600 mb-6">
            Duration: {item.impactDuration}d · Peak CAR: {item.peakCAR} · {item.windowEnd}
          </p>

          {#each item.tickers as tkr, tkrIdx}
            <div class="mt-6 pt-6 border-t {tkrIdx === 0 ? 'border-white/5' : 'border-white/[0.03]'}">
              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex-1">
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <span class="mono-label text-[9px] text-gray-500 block mb-1">Entry</span>
                      <span class="font-mono text-white text-sm">{tkr.entry}</span>
                      <span class="font-mono text-gray-400 text-xs block">{fmtPrice(tkr.entryPrice)}</span>
                    </div>
                    <div>
                      <span class="mono-label text-[9px] text-gray-500 block mb-1">Exit</span>
                      <span class="font-mono text-white text-sm">{tkr.exit}</span>
                      <span class="font-mono text-gray-400 text-xs block">{fmtPrice(tkr.exitPrice)}</span>
                    </div>
                    <div>
                      <span class="mono-label text-[9px] text-gray-500 block mb-1">Ticker</span>
                      <span class="font-mono text-white text-sm font-bold">{tkr.ticker}</span>
                    </div>
                    <div>
                      <span class="mono-label text-[9px] text-gray-500 block mb-1">Direction</span>
                      <span class="font-mono text-white text-sm">{tkr.dir}</span>
                    </div>
                  </div>
                  {#if tkr.ohlcv.length > 0}
                    <div class="h-[280px] rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden group-hover:border-white/10 transition-colors">
                      <EventChart
                        ohlcv={tkr.ohlcv}
                        entry_date={tkr.entry}
                        entry_price={tkr.entryPrice}
                        exit_date={tkr.exit}
                        exit_price={tkr.exitPrice}
                        impact_window_end={tkr.impact_window_end}
                        direction={tkr.direction_raw}
                      />
                    </div>
                  {:else}
                    <div class="chart-ph h-44">
                      <span class="font-sans text-sm text-gray-600">No chart data</span>
                    </div>
                  {/if}
                </div>
                <!-- P&L sidebar pill -->
                <div class="bg-white/5 p-4 rounded-xl shrink-0 self-start min-w-[120px]">
                  <span class="mono-label text-[9px] text-gray-500 block mb-2">P&L</span>
                  <span class="font-mono text-lg {tkr.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}">{fmtPnlPct(tkr.pnlPct)}</span>
                  <span class="font-mono text-xs text-gray-400 block">{fmtPnlDollar(tkr.pnlDollar)}</span>
                </div>
              </div>
            </div>
          {/each}

        </div>
        {/if}

      {/each}
    </div>

    <!-- Dark footer -->
    <div class="mt-24 pt-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-start gap-8">
      <div>
        <span class="serif-italic text-2xl text-white">Aslan Finance</span>
        <p class="font-mono text-xs text-gray-500 mt-2">AI-powered event-driven backtesting</p>
      </div>
      <div class="flex gap-8 flex-wrap">
        <a href="/" class="mono-label text-[10px] text-gray-500 hover:text-white transition-colors no-underline">Terminal</a>
        <a href="/backtests" class="mono-label text-[10px] text-gray-500 hover:text-white transition-colors no-underline">Gallery</a>
        <a href="/auth/register" class="mono-label text-[10px] text-gray-500 hover:text-white transition-colors no-underline">Sign Up</a>
      </div>
      <p class="mono-label text-[10px] text-gray-600">© {new Date().getFullYear()} Aslan Finance</p>
    </div>

  </div>
</section>

</div>

<!-- Delete confirmation overlay -->
{#if deleteConfirming}
  <div class="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center px-4">
    <div class="bg-white p-8 rounded-2xl max-w-sm w-full border border-[#e5e5e5]">
      <p class="font-sans text-sm text-[#525252] mb-4">Delete this report? This cannot be undone.</p>
      <div class="flex items-center gap-3 flex-wrap">
        <button
          class="bg-transparent border border-red-400 text-red-400 font-sans text-sm px-4 py-2 cursor-pointer rounded-none disabled:opacity-50 disabled:cursor-default hover:bg-red-50 transition-colors"
          onclick={handleDelete}
          disabled={deleteLoading}
        >{deleteLoading ? 'Deleting…' : 'Confirm delete'}</button>
        <button
          class="bg-transparent border-none p-0 font-sans text-sm text-[#525252] cursor-pointer disabled:opacity-50 hover:text-black transition-colors"
          onclick={() => { deleteConfirming = false; deleteError = ''; }}
          disabled={deleteLoading}
        >Cancel</button>
        {#if deleteError}<span class="font-sans text-sm text-red-400">{deleteError}</span>{/if}
      </div>
    </div>
  </div>
{/if}

{#if waitlistOpen}
  <WaitlistModal
    title={waitlistTitle}
    interest={waitlistInterest}
    onclose={() => { waitlistOpen = false; }}
  />
{/if}

<style>
  .chart-ph {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
</style>
