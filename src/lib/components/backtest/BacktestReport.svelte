<script lang="ts">
  import { goto } from '$app/navigation';
  import type { BacktestReportRow, RawExaEvent } from '$lib/types/pipeline';
  import EventChart from '$lib/components/charts/EventChart.svelte';
  import PortfolioChart from '$lib/components/charts/PortfolioChart.svelte';
  import TeaserChart from '$lib/components/charts/TeaserChart.svelte';
  import WaitlistModal from '$lib/components/WaitlistModal.svelte';
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

  // ── Gate state ────────────────────────────────────────────────────────────
  let teaserMode  = $state(viewContext === 'public_link');
  let email       = $state('');
  let emailError  = $state('');
  let alreadyUsed = $state(false);
  let gateBtn     = $state('Unlock Report →');
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
  function extractPub(url: string): string {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const domain   = hostname.split('.')[0];
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch {
      return url;
    }
  }

  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
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

  // Teaser headline return string
  const teaserReturnStr = $derived.by(() => {
    const pct  = summary.total_return_pct;
    const sign = pct >= 0 ? '+' : '−';
    return `${sign}${(Math.abs(pct) * 100).toFixed(0)}% across ${summary.event_count} events`;
  });

  // Date range from portfolio series for teaser sub-stats
  const teaserDateRange = $derived.by(() => {
    const series = report.backtest_result.portfolio_series;
    if (series.length === 0) return '—';
    return `${fmtMonth(series[0].date)} – ${fmtMonth(series[series.length - 1].date)}`;
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
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleEmailSubmit(e: SubmitEvent) {
    e.preventDefault();
    emailError = '';

    if (!EMAIL_RE.test(email)) {
      emailError = 'Enter a valid email address';
      return;
    }

    gateBtn = 'Opening report…';

    try {
      const res = await fetch(`/api/reports/${report.slug}/capture-email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      if (res.status === 409) {
        alreadyUsed = true;
        gateBtn     = 'Unlock Report →';
        return;
      }
      if (!res.ok) {
        emailError = 'Something went wrong — please try again';
        gateBtn    = 'Unlock Report →';
        return;
      }
    } catch {
      emailError = 'Something went wrong — please try again';
      gateBtn    = 'Unlock Report →';
      return;
    }

    teaserMode = false;
    window.scrollTo({ top: 0 });
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // clipboard unavailable
    }
    shareText = 'Copied!';
    setTimeout(() => { shareText = 'Copy share link  ↗'; }, 1500);
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

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- TOP NAV — unified navigation bar                                       -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="flex items-center justify-between gap-3 py-[14px] border-b-4 border-black bg-white">
  <div class="flex items-center gap-3 flex-wrap">
    {#if viewContext === 'owner'}
      <a href={backTo} class="font-sans text-xs uppercase tracking-[0.08em] text-[#525252] no-underline transition-colors duration-100 hover:text-black">← {backTo === '/dashboard' ? 'Dashboard' : 'Home'}</a>
    {:else}
      <a href="/" class="font-display italic text-[20px] font-normal text-black no-underline">Aslan Finance</a>
    {/if}
  </div>
  <div class="flex items-center gap-3 flex-wrap">
    {#if viewContext === 'owner'}
      <button
        class="bg-transparent border border-black text-black font-sans text-xs tracking-[0.05em] px-3 py-1 cursor-pointer rounded-none transition-colors duration-100 hover:bg-black hover:text-white"
        onclick={copyShareLink}
      >{shareText}</button>
      <span class="text-[#CCCCCC]" aria-hidden="true">·</span>
      <span class="font-sans text-xs tracking-[0.05em] text-[#525252]">
        {currentIsPublic ? 'Public' : 'Private'}
      </span>
      <button
        class="bg-transparent border-none p-0 font-sans text-xs tracking-[0.05em] text-[#525252] cursor-pointer transition-colors duration-100 hover:text-black hover:underline disabled:opacity-50 disabled:cursor-default"
        onclick={toggleVisibility}
        disabled={visibilityLoading}
      >{visibilityLoading ? 'Updating…' : (currentIsPublic ? 'Make private' : 'Make public')} →</button>
      <span class="text-[#CCCCCC]" aria-hidden="true">·</span>
      <button
        class="bg-transparent border-none p-0 font-sans text-xs tracking-[0.05em] text-accent-loss cursor-pointer hover:underline"
        onclick={() => { deleteConfirming = true; deleteError = ''; }}
      >Delete</button>
    {:else}
      <a href="/" class="font-sans text-xs uppercase tracking-[0.08em] text-[#525252] no-underline transition-colors duration-100 hover:text-black">Run your own backtest — free →</a>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- DISCLAIMER — informational notice, separate from navigation            -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div
  class="sticky top-0 z-50 w-full px-5 py-3 bg-[#FAFAFA] border-l-[3px] border-black font-sans text-sm text-[#525252] leading-relaxed
         sm:block
         max-sm:flex max-sm:items-center max-sm:gap-1"
  class:max-sm:flex-col={disclaimerExpanded}
  class:max-sm:items-start={disclaimerExpanded}
  class:max-sm:gap-1-5={disclaimerExpanded}
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
<!-- TEASER STATE                                                           -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
{#if teaserMode}
<div class="py-12 pb-16 flex flex-col gap-6">

  <!-- Editorial label -->
  <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252]">Backtest Result · {report.query.slice(0, 60)}{report.query.length > 60 ? '…' : ''}</p>

  <!-- Headline P&L -->
  <h1
    class="font-display italic text-6xl max-md:text-5xl max-sm:text-4xl font-normal leading-[1.1] tracking-tighter"
    class:text-accent-gain={summary.total_return_pct >= 0}
    class:text-accent-loss={summary.total_return_pct < 0}
  >
    {teaserReturnStr}
  </h1>

  <!-- Sub-stats -->
  <p class="font-mono text-sm text-[#525252]">
    Date range: {teaserDateRange}&nbsp;&nbsp;·&nbsp;&nbsp;{summary.trade_count} trades simulated&nbsp;&nbsp;·&nbsp;&nbsp;{summary.ticker_count} tickers
  </p>

  <!-- Teaser chart -->
  <TeaserChart portfolio_series={report.backtest_result.portfolio_series} />

  <!-- Blurred trade log preview -->
  <div class="flex flex-col">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse font-mono text-sm text-black whitespace-nowrap">
        <thead>
          <tr>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">#</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">DATE</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">TICKER</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">DIR</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">ENTRY DATE</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">ENTRY $</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">EXIT DATE</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">EXIT $</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">DAYS</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">P&amp;L $</th>
            <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">P&amp;L %</th>
          </tr>
        </thead>
        <tbody>
          {#each viewTrades.slice(0, 2) as t, i}
          <tr>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.id}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.date}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.ticker}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.dir}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.entryDate}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{fmtPrice(t.entryPrice)}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.exitDate}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{fmtPrice(t.exitPrice)}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.days}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0} class:text-accent-gain={t.pnlDollar >= 0} class:text-accent-loss={t.pnlDollar < 0}>{fmtPnlDollar(t.pnlDollar)}</td>
            <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0} class:text-accent-gain={t.pnlPct >= 0} class:text-accent-loss={t.pnlPct < 0}>{fmtPnlPct(t.pnlPct)}</td>
          </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <!-- Blurred remaining rows -->
    {#if viewTrades.length > 2}
    <div class="blurred-rows" aria-hidden="true">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-sm text-black whitespace-nowrap">
          <tbody>
            {#each viewTrades.slice(2) as t, i}
            <tr>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.id}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.date}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.ticker}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.dir}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.entryDate}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{fmtPrice(t.entryPrice)}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.exitDate}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{fmtPrice(t.exitPrice)}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{t.days}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{fmtPnlDollar(t.pnlDollar)}</td>
              <td class="px-3 py-2 border-b border-[#E5E5E5]" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{fmtPnlPct(t.pnlPct)}</td>
            </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    {/if}
  </div>

  <!-- Email gate -->
  <div class="flex flex-col items-center gap-3 pt-8 pb-2">
    {#if alreadyUsed}
      <p class="font-display italic text-lg text-black">You've already run a free backtest.</p>
      <p class="font-sans text-sm text-[#525252] m-0">
        Create a free account to run more backtests and save your reports.
      </p>
      <a href="/auth/register" class="bg-black border-2 border-black text-white font-sans text-xs uppercase tracking-[0.1em] px-6 py-[10px] cursor-pointer rounded-none transition-colors duration-100 hover:bg-white hover:text-black">Create free account →</a>
      <p class="font-sans text-sm text-text-muted m-0">Already have an account? <a href="/auth/login" class="text-[#525252] underline decoration-[#E5E5E5] hover:text-black hover:decoration-black transition-colors duration-100">Log in →</a></p>
    {:else}
    <p class="font-display italic text-lg text-black">See the full report — free</p>
    <form class="flex gap-0 w-full max-w-[420px] border-2 border-black" onsubmit={handleEmailSubmit}>
      <div class="flex-1 flex flex-col">
        <input
          class="w-full bg-white border-none border-r border-black text-black font-sans text-sm px-[14px] py-[10px] rounded-none outline-none placeholder:text-[#BBBBBB] placeholder:italic focus:bg-[#F5F5F5]"
          class:border-accent-loss={!!emailError}
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          autocomplete="email"
        />
        {#if emailError}
          <p class="font-sans text-xs text-accent-loss mt-1 mb-0 px-[14px] w-full max-w-[420px] text-left">{emailError}</p>
        {/if}
      </div>
      <button
        class="whitespace-nowrap bg-black border-none text-white font-sans text-xs uppercase tracking-[0.1em] px-5 py-[10px] cursor-pointer rounded-none transition-colors duration-100 hover:bg-white hover:text-black disabled:opacity-50 disabled:cursor-default"
        type="submit"
        disabled={gateBtn !== 'Unlock Report →'}
      >{gateBtn}</button>
    </form>
    <p class="font-sans text-sm text-text-muted">{report.view_count.toLocaleString()} traders have viewed this backtest</p>
    {/if}
  </div>

</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- FULL REPORT STATE                                                      -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
{:else}
<div class="pb-16">

  <!-- OWNER STATE NOTICES ─────────────────────────────────────────────── -->
  {#if viewContext === 'owner'}
  {#if justMadePrivate}
  <div class="border-l-[3px] border-[#E5E5E5] px-3 py-1.5 font-sans text-sm text-[#525252]">
    This report is now private — only you can view it.
  </div>
  {/if}

  {#if visibilityError}
  <p class="font-sans text-sm text-accent-loss mt-1">{visibilityError}</p>
  {/if}

  {#if deleteConfirming}
  <div class="flex items-center gap-2 flex-wrap py-2.5 font-sans text-sm text-[#525252]">
    Delete this report? This cannot be undone.
    <button
      class="bg-transparent border border-accent-loss text-accent-loss font-sans text-sm px-[10px] py-1 cursor-pointer rounded-none disabled:opacity-50 disabled:cursor-default"
      onclick={handleDelete}
      disabled={deleteLoading}
    >{deleteLoading ? 'Deleting…' : 'Confirm delete'}</button>
    <button
      class="bg-transparent border-none p-0 font-sans text-sm text-[#525252] cursor-pointer disabled:opacity-50 disabled:cursor-default"
      onclick={() => { deleteConfirming = false; deleteError = ''; }}
      disabled={deleteLoading}
    >Cancel</button>
    {#if deleteError}<span class="font-sans text-sm text-accent-loss">{deleteError}</span>{/if}
  </div>
  {/if}
  {/if}

  <!-- ② Query & Parameters ─────────────────────────────────────────────── -->
  <section class="py-8">
    <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-4">Query &amp; Parameters</p>
    <div class="bg-[#F5F5F5] border-l-4 border-black px-4 py-3 font-serif italic text-base text-black mb-5" style="font-family:'Source Serif 4',Georgia,serif;">{report.query}</div>
    <div class="grid gap-x-4 gap-y-2 items-start" style="grid-template-columns:140px 1fr;">
      <span class="font-sans text-sm text-[#525252] pt-px">Entry</span>
      <span class="font-mono text-sm text-black leading-[1.8]">{ENTRY_LABELS[report.rule.entry] ?? report.rule.entry}</span>

      <span class="font-sans text-sm text-[#525252] pt-px">Exit</span>
      <span class="font-mono text-sm text-black leading-[1.8]">{EXIT_LABELS[report.rule.exit] ?? report.rule.exit}</span>

      <span class="font-sans text-sm text-[#525252] pt-px">Direction</span>
      <span class="font-mono text-sm text-black leading-[1.8]">{report.rule.direction === 'long' ? 'Long' : 'Short'}</span>

      <span class="font-sans text-sm text-[#525252] pt-px">Position size</span>
      <span class="font-mono text-sm text-black leading-[1.8]">${report.rule.position_size.toLocaleString('en-US')} per trade</span>

      <span class="font-sans text-sm text-[#525252] pt-px">Date range</span>
      <span class="font-mono text-sm text-black leading-[1.8]">{paramsDateRange}</span>

      <span class="font-sans text-sm text-[#525252] pt-px">Confidence filter</span>
      <span class="font-mono text-sm text-black leading-[1.8]">High and Medium only</span>

      <span class="font-sans text-sm text-[#525252] pt-px">Tickers</span>
      <span class="font-mono text-sm text-black leading-[1.8]">{report.confirmed_tickers.join(', ')}</span>

      <span class="font-sans text-sm text-[#525252] pt-px">Events found</span>
      <span class="font-mono text-sm text-black leading-[1.8]">{report.occurrences.length} (High: {highCount}, Medium: {medCount})</span>
    </div>

    {#if !teaserMode}
      {#if userCredits === null}
        <!-- unauthenticated — show nothing -->
      {:else if userCredits === 0}
        <div class="mt-4 flex items-center gap-3 flex-wrap">
          <span class="text-sm text-[#525252] font-sans">Re-run requires 1 credit.</span>
          <a href="/dashboard/credits" class="text-sm text-black font-sans underline decoration-[#E5E5E5] hover:decoration-black transition-colors duration-100">Buy credits →</a>
        </div>
      {:else}
        <div class="mt-4 flex items-center gap-3 flex-wrap">
          <a
            href={`/dashboard?rerun=${report.slug}&query=${encodeURIComponent(report.query)}`}
            class="text-sm text-[#525252] font-sans no-underline hover:underline transition-colors duration-100"
          >Re-run with adjusted parameters →</a>
        </div>
      {/if}
    {/if}
  </section>

  <hr class="border-none border-t-4 border-black m-0" />

  <!-- ③ Research Narrative ─────────────────────────────────────────────── -->
  <section class="py-8">
    <div class="flex items-center gap-2.5 mb-4">
      <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-0">AI-Generated Research Narrative</p>
      <span class="font-mono text-[10px] uppercase tracking-widest bg-black text-white px-2 py-px leading-[1.6]">AI Generated</span>
    </div>
    <div class="max-w-[720px] flex flex-col gap-4">
      {#if report.research_narrative}
        {#each report.research_narrative.split('\n\n').filter(p => p.trim()) as para}
          <p class="text-lg text-black leading-[1.75]" style="font-family:'Source Serif 4',Georgia,serif;">{para}</p>
        {/each}
      {:else}
        <p class="text-lg leading-[1.75] text-text-muted italic" style="font-family:'Source Serif 4',Georgia,serif;">Research narrative is being generated…</p>
      {/if}
    </div>
  </section>

  <hr class="border-none border-t-4 border-black m-0" />

  <!-- ④ Historical Occurrences ──────────────────────────────────────────── -->
  <section class="py-8">
    <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-4">Historical Occurrences</p>

    <!-- Low-confidence toggle -->
    {#if low_confidence_events.length > 0}
    <div class="mb-6">
      {#if !showLow}
      <button
        class="bg-transparent border border-black text-[#525252] font-sans text-sm px-[10px] py-1 cursor-pointer rounded-none transition-colors duration-100 hover:text-black hover:border-black"
        onclick={() => showLow = true}
      >{low_confidence_events.length} low-confidence event{low_confidence_events.length !== 1 ? 's' : ''} excluded — Show →</button>
      {:else}
      <button
        class="bg-transparent border border-black text-[#525252] font-sans text-sm px-[10px] py-1 cursor-pointer rounded-none transition-colors duration-100 hover:text-black"
        onclick={() => showLow = false}
      >← Hide low-confidence events</button>
      {/if}
    </div>
    {/if}

    {#each mergedViewEvents as item, idx}
    {#if idx > 0}
    <hr class="border-none border-t-4 border-black my-8" />
    {/if}

    {#if item.kind === 'low'}
    <!-- Low-confidence row — no charts, no trade data -->
    <div>
      <div class="flex items-center gap-3 mb-2">
        <span class="font-mono text-sm text-[#525252]">{item.date}</span>
        <span class="font-mono text-xs uppercase tracking-[0.05em] text-text-muted border border-[#E5E5E5] px-[5px] py-px">LOW</span>
        <span class="font-sans text-xs text-text-muted">excluded from simulation</span>
      </div>
      <div class="border-l-2 border-[#E5E5E5] pl-3 my-2 font-sans text-base text-[#525252] max-w-[720px] leading-[1.6]">{item.description}</div>
      {#each item.sources as src}
      <p class="font-sans text-sm text-[#525252] mb-2">
        {extractPub(src.url)}&nbsp;&nbsp;·&nbsp;&nbsp;"{src.title}"&nbsp;&nbsp;·&nbsp;&nbsp;<a href={src.url} target="_blank" rel="noopener noreferrer" class="text-[#525252] no-underline hover:text-black">↗</a>
      </p>
      {/each}
    </div>

    {:else}
    <!-- Confirmed event -->
    <div class="flex items-center gap-3 mb-2">
      <span class="font-mono text-sm text-black">{item.date}</span>
      {#if item.confidence === 'HIGH'}
        <span class="font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-px bg-black text-white border border-black">{item.confidence}</span>
      {:else}
        <span class="font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-px text-[#525252] border border-[#525252]">{item.confidence}</span>
      {/if}
    </div>
    <p class="text-base text-black max-w-[720px] mb-2 leading-[1.6]" style="font-family:'Source Serif 4',Georgia,serif;">{item.description}</p>

    <!-- Source -->
    {#if item.source.headline}
    <p class="font-sans text-sm text-[#525252] mb-2">
      {item.source.pub}&nbsp;&nbsp;·&nbsp;&nbsp;"<a href={item.source.url} target="_blank" rel="noopener noreferrer" class="text-[#525252] no-underline hover:text-black">{item.source.headline}</a>"&nbsp;&nbsp;·&nbsp;&nbsp;<a href={item.source.url} target="_blank" rel="noopener noreferrer" class="text-[#525252] no-underline hover:text-black">↗</a>
    </p>
    {/if}

    <!-- Impact window summary -->
    <p class="font-mono text-sm text-[#525252] mb-5">
      Duration: {item.impactDuration} days&nbsp;&nbsp;·&nbsp;&nbsp;Peak CAR: {item.peakCAR}&nbsp;&nbsp;·&nbsp;&nbsp;Window end: {item.windowEnd}
    </p>

    <!-- Per-ticker subsections -->
    {#each item.tickers as tkr, tkrIdx}
    {#if tkrIdx > 0}<hr class="border-none border-t border-[#E5E5E5] m-0" />{/if}
    <div class="py-4">
      <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-0">{tkr.ticker}</p>
      {#if tkr.ohlcv.length > 0}
        <div class="my-3">
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
        <div class="chart-ph h-[280px] my-3">
          <span class="font-sans text-sm text-text-muted">No chart data</span>
        </div>
      {/if}
      <p class="font-mono text-sm text-black mt-2">
        Entry {tkr.entry}&nbsp;&nbsp;{fmtPrice(tkr.entryPrice)}
        &nbsp;&nbsp;·&nbsp;&nbsp;
        Exit {tkr.exit}&nbsp;&nbsp;{fmtPrice(tkr.exitPrice)}
        &nbsp;&nbsp;·&nbsp;&nbsp;
        {tkr.dir}
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <span class:text-accent-gain={tkr.pnlPct >= 0} class:text-accent-loss={tkr.pnlPct < 0}>{fmtPnlPct(tkr.pnlPct)}</span>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <span class:text-accent-gain={tkr.pnlDollar >= 0} class:text-accent-loss={tkr.pnlDollar < 0}>{fmtPnlDollar(tkr.pnlDollar)}</span>
      </p>
    </div>
    {/each}
    {/if}

    {/each}
  </section>

  <hr class="border-none border-t-4 border-black m-0" />

  <!-- ⑤ Aggregate Performance ──────────────────────────────────────────── -->
  <section class="py-8">
    <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-4">Aggregate Performance</p>

    <p class="font-display italic text-5xl max-sm:text-4xl font-normal text-black leading-[1.1] mb-1 tracking-tighter">Final portfolio value: ${summary.final_portfolio_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
    <p class="font-sans text-sm text-[#525252] mb-6">(started at ${summary.starting_capital.toLocaleString('en-US')})</p>

    <div class="grid grid-cols-4 max-md:grid-cols-2 max-sm:grid-cols-2 gap-px bg-black border border-black mb-6">
      <div class="group bg-white p-4 flex flex-col gap-1 transition-colors duration-100 hover:bg-black cursor-default">
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger class="font-mono text-xs uppercase tracking-[0.08em] text-[#525252] group-hover:text-[#AAAAAA] transition-colors duration-100 text-left w-fit">Total return</Tooltip.Trigger>
            <Tooltip.Content class="bg-black text-white font-sans text-xs px-3 py-2 border border-[#333] z-50" sideOffset={6}>Net P&L as a percentage of starting capital</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
        <span class="font-mono text-lg leading-[1.3] group-hover:text-white transition-colors duration-100" class:text-accent-gain={summary.total_return_pct >= 0} class:text-accent-loss={summary.total_return_pct < 0}>
          {fmtPnlPct(summary.total_return_pct * 100)}
        </span>
      </div>
      <div class="group bg-white p-4 flex flex-col gap-1 transition-colors duration-100 hover:bg-black cursor-default">
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger class="font-mono text-xs uppercase tracking-[0.08em] text-[#525252] group-hover:text-[#AAAAAA] transition-colors duration-100 text-left w-fit">Win rate</Tooltip.Trigger>
            <Tooltip.Content class="bg-black text-white font-sans text-xs px-3 py-2 border border-[#333] z-50" sideOffset={6}>Percentage of trades that closed profitably</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
        <span class="font-mono text-lg leading-[1.3] text-black group-hover:text-white transition-colors duration-100">{(summary.win_rate * 100).toFixed(0)}%</span>
      </div>
      <div class="group bg-white p-4 flex flex-col gap-1 transition-colors duration-100 hover:bg-black cursor-default">
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger class="font-mono text-xs uppercase tracking-[0.08em] text-[#525252] group-hover:text-[#AAAAAA] transition-colors duration-100 text-left w-fit">Max drawdown</Tooltip.Trigger>
            <Tooltip.Content class="bg-black text-white font-sans text-xs px-3 py-2 border border-[#333] z-50" sideOffset={6}>Largest peak-to-trough portfolio decline</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
        <span class="font-mono text-lg leading-[1.3] text-accent-loss group-hover:text-white transition-colors duration-100">−{(summary.max_drawdown * 100).toFixed(1)}%</span>
      </div>
      <div class="group bg-white p-4 flex flex-col gap-1 transition-colors duration-100 hover:bg-black cursor-default">
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger class="font-mono text-xs uppercase tracking-[0.08em] text-[#525252] group-hover:text-[#AAAAAA] transition-colors duration-100 text-left w-fit">Avg hold</Tooltip.Trigger>
            <Tooltip.Content class="bg-black text-white font-sans text-xs px-3 py-2 border border-[#333] z-50" sideOffset={6}>Mean number of calendar days per trade</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
        <span class="font-mono text-lg leading-[1.3] text-black group-hover:text-white transition-colors duration-100">{summary.avg_hold_days.toFixed(0)} days</span>
      </div>
    </div>

    {#if summary.best_trade && summary.worst_trade}
    <div class="flex flex-col gap-1.5">
      <p class="flex items-baseline gap-3 text-sm">
        <span class="font-sans text-[#525252] min-w-[44px]">Best:</span>
        <span class="font-mono text-accent-gain">{summary.best_trade.ticker} — {summary.best_trade.event_date}&nbsp;&nbsp;{fmtPnlDollar(summary.best_trade.pnl_dollars)}&nbsp;&nbsp;({fmtPnlPct(summary.best_trade.pnl_pct * 100)})</span>
      </p>
      <p class="flex items-baseline gap-3 text-sm">
        <span class="font-sans text-[#525252] min-w-[44px]">Worst:</span>
        <span class="font-mono text-accent-loss">{summary.worst_trade.ticker} — {summary.worst_trade.event_date}&nbsp;&nbsp;{fmtPnlDollar(summary.worst_trade.pnl_dollars)}&nbsp;&nbsp;({fmtPnlPct(summary.worst_trade.pnl_pct * 100)})</span>
      </p>
    </div>
    {/if}

    <div class="mt-6">
      <PortfolioChart
        portfolio_series={report.backtest_result.portfolio_series}
        trade_close_points={tradeClosePoints}
      />
    </div>
  </section>

  <hr class="border-none border-t-4 border-black m-0" />

  <!-- ⑥ Performance by Asset ──────────────────────────────────────────── -->
  {#if tickerStats.length > 1}
    <section class="py-8">
      <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-4">Performance by Asset</p>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-sm text-black whitespace-nowrap">
          <thead>
            <tr>
              <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">TICKER</th>
              <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-right px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">TOTAL P&amp;L</th>
              <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-right px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">RETURN</th>
              <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-right px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">WIN RATE</th>
              <th class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-right px-3 py-2 bg-[#F5F5F5] border-b border-black font-normal">TRADES</th>
            </tr>
          </thead>
          <tbody>
            {#each tickerStats as ts, i}
              <tr>
                <td class="px-3 py-2 border-b border-[#E5E5E5] font-mono font-medium" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{ts.symbol}</td>
                <td class="px-3 py-2 border-b border-[#E5E5E5] text-right" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0} class:text-accent-gain={ts.totalPnl >= 0} class:text-accent-loss={ts.totalPnl < 0}>
                  {ts.totalPnl >= 0 ? '+' : ''}${ts.totalPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </td>
                <td class="px-3 py-2 border-b border-[#E5E5E5] text-right" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0} class:text-accent-gain={ts.returnPct >= 0} class:text-accent-loss={ts.returnPct < 0}>
                  {ts.returnPct >= 0 ? '+' : ''}{ts.returnPct.toFixed(1)}%
                </td>
                <td class="px-3 py-2 border-b border-[#E5E5E5] text-right" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{ts.winRate.toFixed(0)}%</td>
                <td class="px-3 py-2 border-b border-[#E5E5E5] text-right" class:bg-[#FAFAFA]={i % 2 === 1} class:bg-white={i % 2 === 0}>{ts.tradeCount}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
    <hr class="border-none border-t-4 border-black m-0" />
  {/if}

  <!-- ⑦ Trade Log Table ────────────────────────────────────────────────── -->
  <section class="py-8">
    <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-4">All Trades</p>
    <div class="overflow-x-auto border border-black">
      <table class="w-full border-collapse font-mono text-sm text-black">
        <thead>
          <tr class="bg-[#F5F5F5] border-b border-black">
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
              class="font-sans text-[10px] uppercase tracking-[0.08em] text-[#525252] text-left px-3 py-2.5 font-normal whitespace-nowrap cursor-pointer select-none hover:text-black transition-colors duration-100"
              onclick={() => sortBy(col)}
              title="Sort by {label}"
            >{label}{sortIndicator(col)}</th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-black">
          {#each sortedTrades as t}
          <tr class="transition-colors duration-100 hover:bg-[#F5F5F5]">
            <td class="px-3 py-2 whitespace-nowrap">{t.id}</td>
            <td class="px-3 py-2 whitespace-nowrap">{t.date}</td>
            <td class="px-3 py-2 whitespace-nowrap">{t.ticker}</td>
            <td class="px-3 py-2 whitespace-nowrap">{t.dir}</td>
            <td class="px-3 py-2 whitespace-nowrap">{t.entryDate}</td>
            <td class="px-3 py-2 whitespace-nowrap">{fmtPrice(t.entryPrice)}</td>
            <td class="px-3 py-2 whitespace-nowrap">{t.exitDate}</td>
            <td class="px-3 py-2 whitespace-nowrap">{fmtPrice(t.exitPrice)}</td>
            <td class="px-3 py-2 whitespace-nowrap">{t.days}</td>
            <td class="px-3 py-2 whitespace-nowrap" class:text-accent-gain={t.pnlDollar >= 0} class:text-accent-loss={t.pnlDollar < 0}>{fmtPnlDollar(t.pnlDollar)}</td>
            <td class="px-3 py-2 whitespace-nowrap" class:text-accent-gain={t.pnlPct >= 0} class:text-accent-loss={t.pnlPct < 0}>{fmtPnlPct(t.pnlPct)}</td>
            <td class="px-3 py-2 whitespace-nowrap" class:text-accent-gain={t.vsSpy >= 0} class:text-accent-loss={t.vsSpy < 0}>{fmtPnlPct(t.vsSpy)}</td>
          </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <hr class="border-none border-t-4 border-black m-0" />

  <!-- ⑦ Sources ───────────────────────────────────────────────────────── -->
  <section class="py-8">
    <p class="font-mono text-xs uppercase tracking-[0.1em] text-[#525252] mb-4">Sources</p>
    <ul class="list-none flex flex-col gap-2 p-0 m-0">
      {#each allSources as src}
      <li class="font-sans text-sm text-[#525252]">
        {src.pub}&nbsp;&nbsp;·&nbsp;&nbsp;"{src.title}"&nbsp;&nbsp;·&nbsp;&nbsp;<a href={src.url} target="_blank" rel="noopener noreferrer" class="text-[#525252] no-underline hover:text-black transition-colors duration-100">↗ {extractDomain(src.url)}</a>
      </li>
      {/each}
    </ul>
  </section>

  <hr class="border-none border-t-4 border-black m-0" />

  <!-- ⑧ Footer CTAs ────────────────────────────────────────────────────── -->
  <section class="py-8 flex flex-col gap-4">
    <button
      class="self-start bg-black border-2 border-black text-white font-sans text-xs uppercase tracking-[0.1em] px-6 py-[10px] cursor-pointer rounded-none transition-colors duration-100 hover:bg-white hover:text-black"
      onclick={copyShareLink}
    >{shareText}</button>

    <p class="font-sans text-sm text-[#525252]">
      Set a live alert for this event — <span class="text-[#525252]">Coming Soon.</span>
      <!-- svelte-ignore a11y_invalid_attribute -->
      <a href="#" class="text-black underline decoration-[#E5E5E5] hover:decoration-black transition-colors duration-100" onclick={(e) => { e.preventDefault(); openWaitlist('Live alerts — coming soon', 'live-alerts'); }}>Join the waitlist →</a>
    </p>

    <p class="font-sans text-sm">
      <a href="/" class="text-black no-underline hover:underline transition-colors duration-100">Run your own backtest — free →</a>
    </p>
  </section>

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
  /* ── Blurred teaser rows (filter: blur cannot be done with Tailwind arbitrary safely in scoped) */
  .blurred-rows {
    filter: blur(4px);
    pointer-events: none;
    user-select: none;
  }

  /* ── Chart placeholder (shared base for flex centering) */
  .chart-ph {
    background: #F5F5F5;
    border: 1px solid #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  /* ── Disclaimer responsive flex direction on mobile expansion */
  @media (max-width: 640px) {
    .disclaimer-expanded {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
  }
</style>
