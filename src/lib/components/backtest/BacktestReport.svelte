<script lang="ts">
  import { goto } from '$app/navigation';
  import type { BacktestReportRow, RawExaEvent } from '$lib/types/pipeline';
  import EventChart from '$lib/components/charts/EventChart.svelte';
  import PortfolioChart from '$lib/components/charts/PortfolioChart.svelte';
  import TeaserChart from '$lib/components/charts/TeaserChart.svelte';
  import WaitlistModal from '$lib/components/WaitlistModal.svelte';

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
<div class="top-nav">
  <div class="top-nav-left">
    {#if viewContext === 'owner'}
      <a href={backTo} class="nav-back">← {backTo === '/dashboard' ? 'Dashboard' : 'Home'}</a>
    {:else}
      <a href="/" class="nav-wordmark">Aslan Finance</a>
    {/if}
  </div>
  <div class="top-nav-right">
    {#if viewContext === 'owner'}
      <button class="nav-share-btn" onclick={copyShareLink}>{shareText}</button>
      <span class="nav-sep" aria-hidden="true">·</span>
      <span class="nav-visibility" class:nav-visibility--private={!currentIsPublic}>
        {currentIsPublic ? 'Public' : 'Private'}
      </span>
      <button class="nav-visibility-toggle" onclick={toggleVisibility} disabled={visibilityLoading}>
        {visibilityLoading ? 'Updating…' : (currentIsPublic ? 'Make private' : 'Make public')} →
      </button>
      <span class="nav-sep" aria-hidden="true">·</span>
      <button class="nav-delete-btn" onclick={() => { deleteConfirming = true; deleteError = ''; }}>Delete</button>
    {:else}
      <a href="/" class="nav-cta">Run your own backtest — free →</a>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- DISCLAIMER — informational notice, separate from navigation            -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="disclaimer" class:disclaimer--expanded={disclaimerExpanded}>
  <span class="disclaimer-body" class:disclaimer-body--collapsed={!disclaimerExpanded}>
    This report was generated by AI and is for informational purposes only.
    It does not constitute financial advice. AI-identified events and simulated
    trades may be inaccurate or incomplete. Past hypothetical performance does
    not guarantee future results. Always do your own research.
  </span>
  <button
    class="disclaimer-toggle"
    onclick={() => disclaimerExpanded = !disclaimerExpanded}
    aria-label={disclaimerExpanded ? 'Show less' : 'Show more'}
  >{disclaimerExpanded ? 'Show less ▲' : '… Show more ▼'}</button>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- TEASER STATE                                                           -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
{#if teaserMode}
<div class="teaser-body">

  <!-- Headline P&L -->
  <h1 class="headline-pnl" class:loss={summary.total_return_pct < 0}>
    {teaserReturnStr}
  </h1>

  <!-- Sub-stats -->
  <p class="sub-stats mono">
    Date range: {teaserDateRange}&nbsp;&nbsp;·&nbsp;&nbsp;{summary.trade_count} trades simulated&nbsp;&nbsp;·&nbsp;&nbsp;{summary.ticker_count} tickers
  </p>

  <!-- Teaser chart -->
  <TeaserChart portfolio_series={report.backtest_result.portfolio_series} />

  <!-- Blurred trade log preview -->
  <div class="preview-table-wrap">
    <div class="table-scroll">
      <table class="trade-table">
        <thead>
          <tr>
            <th>#</th><th>DATE</th><th>TICKER</th><th>DIR</th>
            <th>ENTRY DATE</th><th>ENTRY $</th><th>EXIT DATE</th><th>EXIT $</th>
            <th>DAYS</th><th>P&L $</th><th>P&L %</th>
          </tr>
        </thead>
        <tbody>
          {#each viewTrades.slice(0, 2) as t, i}
          <tr class:row-alt={i % 2 === 1}>
            <td>{t.id}</td>
            <td>{t.date}</td>
            <td>{t.ticker}</td>
            <td>{t.dir}</td>
            <td>{t.entryDate}</td>
            <td>{fmtPrice(t.entryPrice)}</td>
            <td>{t.exitDate}</td>
            <td>{fmtPrice(t.exitPrice)}</td>
            <td>{t.days}</td>
            <td class:gain={t.pnlDollar >= 0} class:loss={t.pnlDollar < 0}>{fmtPnlDollar(t.pnlDollar)}</td>
            <td class:gain={t.pnlPct >= 0} class:loss={t.pnlPct < 0}>{fmtPnlPct(t.pnlPct)}</td>
          </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <!-- Blurred remaining rows -->
    {#if viewTrades.length > 2}
    <div class="blurred-rows" aria-hidden="true">
      <div class="table-scroll">
        <table class="trade-table">
          <tbody>
            {#each viewTrades.slice(2) as t, i}
            <tr class:row-alt={i % 2 === 1}>
              <td>{t.id}</td>
              <td>{t.date}</td>
              <td>{t.ticker}</td>
              <td>{t.dir}</td>
              <td>{t.entryDate}</td>
              <td>{fmtPrice(t.entryPrice)}</td>
              <td>{t.exitDate}</td>
              <td>{fmtPrice(t.exitPrice)}</td>
              <td>{t.days}</td>
              <td>{fmtPnlDollar(t.pnlDollar)}</td>
              <td>{fmtPnlPct(t.pnlPct)}</td>
            </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    {/if}
  </div>

  <!-- Email gate -->
  <div class="email-gate">
    {#if alreadyUsed}
      <p class="gate-label">You've already run a free backtest.</p>
      <p class="gate-already-used">
        Create a free account to run more backtests and save your reports.
      </p>
      <a href="/auth/register" class="btn-outlined gate-btn">Create free account →</a>
      <p class="gate-login-hint">Already have an account? <a href="/auth/login" class="gate-link">Log in →</a></p>
    {:else}
    <p class="gate-label">See the full report — free</p>
    <form class="gate-form" onsubmit={handleEmailSubmit}>
      <div class="gate-input-wrap">
        <input
          class="gate-input"
          class:input-error={!!emailError}
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          autocomplete="email"
        />
        {#if emailError}
          <p class="gate-error">{emailError}</p>
        {/if}
      </div>
      <button
        class="btn-outlined gate-btn"
        type="submit"
        disabled={gateBtn !== 'Unlock Report →'}
      >{gateBtn}</button>
    </form>
    <p class="social-proof">{report.view_count.toLocaleString()} traders have viewed this backtest</p>
    {/if}
  </div>

</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- FULL REPORT STATE                                                      -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
{:else}
<div class="full-report">

  <!-- OWNER STATE NOTICES ─────────────────────────────────────────────── -->
  {#if viewContext === 'owner'}
  {#if justMadePrivate}
  <div class="private-notice">
    This report is now private — only you can view it.
  </div>
  {/if}

  {#if visibilityError}
  <p class="owner-visibility-error">{visibilityError}</p>
  {/if}

  {#if deleteConfirming}
  <div class="delete-inline">
    Delete this report? This cannot be undone.
    <button class="confirm-delete-yes" onclick={handleDelete} disabled={deleteLoading}>
      {deleteLoading ? 'Deleting…' : 'Confirm delete'}
    </button>
    <button class="confirm-delete-cancel" onclick={() => { deleteConfirming = false; deleteError = ''; }} disabled={deleteLoading}>
      Cancel
    </button>
    {#if deleteError}<span class="owner-error">{deleteError}</span>{/if}
  </div>
  {/if}
  {/if}

  <!-- ② Query & Parameters ─────────────────────────────────────────────── -->
  <section class="report-section">
    <p class="section-label">Query &amp; Parameters</p>
    <div class="query-block">{report.query}</div>
    <div class="params-grid">
      <span class="param-key">Entry</span>
      <span class="param-val mono">{ENTRY_LABELS[report.rule.entry] ?? report.rule.entry}</span>

      <span class="param-key">Exit</span>
      <span class="param-val mono">{EXIT_LABELS[report.rule.exit] ?? report.rule.exit}</span>

      <span class="param-key">Direction</span>
      <span class="param-val mono">{report.rule.direction === 'long' ? 'Long' : 'Short'}</span>

      <span class="param-key">Position size</span>
      <span class="param-val mono">${report.rule.position_size.toLocaleString('en-US')} per trade</span>

      <span class="param-key">Date range</span>
      <span class="param-val mono">{paramsDateRange}</span>

      <span class="param-key">Confidence filter</span>
      <span class="param-val mono">High and Medium only</span>

      <span class="param-key">Tickers</span>
      <span class="param-val mono">{report.confirmed_tickers.join(', ')}</span>

      <span class="param-key">Events found</span>
      <span class="param-val mono">{report.occurrences.length} (High: {highCount}, Medium: {medCount})</span>
    </div>

    {#if !teaserMode}
      {#if userCredits === null}
        <!-- unauthenticated — show nothing -->
      {:else if userCredits === 0}
        <div class="rerun-row">
          <span class="rerun-nocredit">Re-run requires 1 credit.</span>
          <a href="/dashboard/credits" class="rerun-buy">Buy credits →</a>
        </div>
      {:else}
        <div class="rerun-row">
          <a
            href={`/dashboard?rerun=${report.slug}&query=${encodeURIComponent(report.query)}`}
            class="rerun-link"
            onmouseover={(e) => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'}
            onmouseout={(e) => (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'}
          >Re-run with adjusted parameters →</a>
        </div>
      {/if}
    {/if}
  </section>

  <hr class="divider" />

  <!-- ③ Research Narrative ─────────────────────────────────────────────── -->
  <section class="report-section">
    <div class="narrative-label-row">
      <p class="section-label" style="margin-bottom: 0;">AI-Generated Research Narrative</p>
      <span class="ai-badge">AI Generated</span>
    </div>
    <div class="narrative-body">
      {#if report.research_narrative}
        {#each report.research_narrative.split('\n\n').filter(p => p.trim()) as para}
          <p>{para}</p>
        {/each}
      {:else}
        <p class="narrative-placeholder">Research narrative is being generated…</p>
      {/if}
    </div>
  </section>

  <hr class="divider" />

  <!-- ④ Historical Occurrences ──────────────────────────────────────────── -->
  <section class="report-section">
    <p class="section-label">Historical Occurrences</p>

    <!-- Low-confidence toggle -->
    {#if low_confidence_events.length > 0}
    <div class="low-conf-toggle-row">
      {#if !showLow}
      <button class="low-conf-toggle" onclick={() => showLow = true}>
        {low_confidence_events.length} low-confidence event{low_confidence_events.length !== 1 ? 's' : ''} excluded — Show →
      </button>
      {:else}
      <button class="low-conf-toggle low-conf-toggle--open" onclick={() => showLow = false}>
        ← Hide low-confidence events
      </button>
      {/if}
    </div>
    {/if}

    {#each mergedViewEvents as item, idx}
    {#if idx > 0}
    <hr class="divider" style="margin: 32px 0;" />
    {/if}

    {#if item.kind === 'low'}
    <!-- Low-confidence row — no charts, no trade data -->
    <div class="low-conf-event">
      <div class="event-header">
        <span class="mono event-date" style="color: var(--text-secondary);">{item.date}</span>
        <span class="badge-low">LOW</span>
        <span class="low-conf-excluded">excluded from simulation</span>
      </div>
      <div class="low-conf-description">{item.description}</div>
      {#each item.sources as src}
      <p class="event-source">
        {extractPub(src.url)}&nbsp;&nbsp;·&nbsp;&nbsp;"{src.title}"&nbsp;&nbsp;·&nbsp;&nbsp;<a href={src.url} target="_blank" rel="noopener noreferrer" class="source-link">↗</a>
      </p>
      {/each}
    </div>

    {:else}
    <!-- Confirmed event -->
    <div class="event-header">
      <span class="mono event-date">{item.date}</span>
      <span class="confidence-badge" class:badge-high={item.confidence === 'HIGH'} class:badge-medium={item.confidence === 'MEDIUM'}>
        {item.confidence}
      </span>
    </div>
    <p class="event-description">{item.description}</p>

    <!-- Source -->
    {#if item.source.headline}
    <p class="event-source">
      {item.source.pub}&nbsp;&nbsp;·&nbsp;&nbsp;"<a href={item.source.url} target="_blank" rel="noopener noreferrer">{item.source.headline}</a>"&nbsp;&nbsp;·&nbsp;&nbsp;<a href={item.source.url} target="_blank" rel="noopener noreferrer" class="source-link">↗</a>
    </p>
    {/if}

    <!-- Impact window summary -->
    <p class="impact-summary mono">
      Duration: {item.impactDuration} days&nbsp;&nbsp;·&nbsp;&nbsp;Peak CAR: {item.peakCAR}&nbsp;&nbsp;·&nbsp;&nbsp;Window end: {item.windowEnd}
    </p>

    <!-- Per-ticker subsections -->
    {#each item.tickers as tkr, tkrIdx}
    {#if tkrIdx > 0}<hr class="ticker-divider" />{/if}
    <div class="ticker-section">
      <p class="ticker-label section-label">{tkr.ticker}</p>
      {#if tkr.ohlcv.length > 0}
        <div class="event-chart-wrap">
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
        <div class="chart-ph event-chart">
          <span class="chart-ph-label">No chart data</span>
        </div>
      {/if}
      <p class="trade-detail mono">
        Entry {tkr.entry}&nbsp;&nbsp;{fmtPrice(tkr.entryPrice)}
        &nbsp;&nbsp;·&nbsp;&nbsp;
        Exit {tkr.exit}&nbsp;&nbsp;{fmtPrice(tkr.exitPrice)}
        &nbsp;&nbsp;·&nbsp;&nbsp;
        {tkr.dir}
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <span class:gain={tkr.pnlPct >= 0} class:loss={tkr.pnlPct < 0}>{fmtPnlPct(tkr.pnlPct)}</span>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <span class:gain={tkr.pnlDollar >= 0} class:loss={tkr.pnlDollar < 0}>{fmtPnlDollar(tkr.pnlDollar)}</span>
      </p>
    </div>
    {/each}
    {/if}

    {/each}
  </section>

  <hr class="divider" />

  <!-- ⑤ Aggregate Performance ──────────────────────────────────────────── -->
  <section class="report-section">
    <p class="section-label">Aggregate Performance</p>

    <p class="portfolio-value">Final portfolio value: ${summary.final_portfolio_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
    <p class="portfolio-subtitle">(started at ${summary.starting_capital.toLocaleString('en-US')})</p>

    <div class="stats-grid">
      <div class="stat-cell">
        <span class="stat-key">Total return</span>
        <span class="stat-val mono" class:gain={summary.total_return_pct >= 0} class:loss={summary.total_return_pct < 0}>
          {fmtPnlPct(summary.total_return_pct * 100)}
        </span>
      </div>
      <div class="stat-cell">
        <span class="stat-key">Win rate</span>
        <span class="stat-val mono">{(summary.win_rate * 100).toFixed(0)}%</span>
      </div>
      <div class="stat-cell">
        <span class="stat-key">Max drawdown</span>
        <span class="stat-val mono loss">−{(summary.max_drawdown * 100).toFixed(1)}%</span>
      </div>
      <div class="stat-cell">
        <span class="stat-key">Avg hold</span>
        <span class="stat-val mono">{summary.avg_hold_days.toFixed(0)} days</span>
      </div>
    </div>

    {#if summary.best_trade && summary.worst_trade}
    <div class="best-worst">
      <p class="bw-row">
        <span class="bw-label">Best:</span>
        <span class="mono gain">{summary.best_trade.ticker} — {summary.best_trade.event_date}&nbsp;&nbsp;{fmtPnlDollar(summary.best_trade.pnl_dollars)}&nbsp;&nbsp;({fmtPnlPct(summary.best_trade.pnl_pct * 100)})</span>
      </p>
      <p class="bw-row">
        <span class="bw-label">Worst:</span>
        <span class="mono loss">{summary.worst_trade.ticker} — {summary.worst_trade.event_date}&nbsp;&nbsp;{fmtPnlDollar(summary.worst_trade.pnl_dollars)}&nbsp;&nbsp;({fmtPnlPct(summary.worst_trade.pnl_pct * 100)})</span>
      </p>
    </div>
    {/if}

    <div class="portfolio-chart">
      <PortfolioChart
        portfolio_series={report.backtest_result.portfolio_series}
        trade_close_points={tradeClosePoints}
      />
    </div>
  </section>

  <hr class="divider" />

  <!-- ⑥ Performance by Asset ──────────────────────────────────────────── -->
  {#if tickerStats.length > 1}
    <section class="report-section">
      <p class="section-label">Performance by Asset</p>
      <div class="table-scroll">
        <table class="trade-table">
          <thead>
            <tr>
              <th style="text-align:left">TICKER</th>
              <th style="text-align:right">TOTAL P&amp;L</th>
              <th style="text-align:right">RETURN</th>
              <th style="text-align:right">WIN RATE</th>
              <th style="text-align:right">TRADES</th>
            </tr>
          </thead>
          <tbody>
            {#each tickerStats as ts, i}
              <tr class:row-alt={i % 2 === 1}>
                <td style="font-family:'IBM Plex Mono',monospace;font-weight:500">{ts.symbol}</td>
                <td style="text-align:right" class:gain={ts.totalPnl >= 0} class:loss={ts.totalPnl < 0}>
                  {ts.totalPnl >= 0 ? '+' : ''}${ts.totalPnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </td>
                <td style="text-align:right" class:gain={ts.returnPct >= 0} class:loss={ts.returnPct < 0}>
                  {ts.returnPct >= 0 ? '+' : ''}{ts.returnPct.toFixed(1)}%
                </td>
                <td style="text-align:right">{ts.winRate.toFixed(0)}%</td>
                <td style="text-align:right">{ts.tradeCount}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
    <hr class="divider" />
  {/if}

  <!-- ⑦ Trade Log Table ────────────────────────────────────────────────── -->
  <section class="report-section">
    <p class="section-label">All Trades</p>
    <div class="table-scroll">
      <table class="trade-table sortable-table">
        <thead class="sticky-head">
          <tr>
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
              class="sortable-th"
              onclick={() => sortBy(col)}
              title="Sort by {label}"
            >{label}{sortIndicator(col)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sortedTrades as t, i}
          <tr class:row-alt={i % 2 === 1} class="data-row">
            <td>{t.id}</td>
            <td>{t.date}</td>
            <td>{t.ticker}</td>
            <td>{t.dir}</td>
            <td>{t.entryDate}</td>
            <td>{fmtPrice(t.entryPrice)}</td>
            <td>{t.exitDate}</td>
            <td>{fmtPrice(t.exitPrice)}</td>
            <td>{t.days}</td>
            <td class:gain={t.pnlDollar >= 0} class:loss={t.pnlDollar < 0}>{fmtPnlDollar(t.pnlDollar)}</td>
            <td class:gain={t.pnlPct >= 0} class:loss={t.pnlPct < 0}>{fmtPnlPct(t.pnlPct)}</td>
            <td class:gain={t.vsSpy >= 0} class:loss={t.vsSpy < 0}>{fmtPnlPct(t.vsSpy)}</td>
          </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <hr class="divider" />

  <!-- ⑦ Sources ───────────────────────────────────────────────────────── -->
  <section class="report-section">
    <p class="section-label">Sources</p>
    <ul class="sources-list">
      {#each allSources as src}
      <li>
        {src.pub}&nbsp;&nbsp;·&nbsp;&nbsp;"{src.title}"&nbsp;&nbsp;·&nbsp;&nbsp;<a href={src.url} target="_blank" rel="noopener noreferrer">↗ {extractDomain(src.url)}</a>
      </li>
      {/each}
    </ul>
  </section>

  <hr class="divider" />

  <!-- ⑧ Footer CTAs ────────────────────────────────────────────────────── -->
  <section class="report-section footer-ctas">
    <button class="btn-outlined" onclick={copyShareLink}>{shareText}</button>

    <p class="coming-soon-cta">
      Set a live alert for this event — <span class="amber">Coming Soon.</span>
      <!-- svelte-ignore a11y_invalid_attribute -->
      <a href="#" class="amber cta-link" onclick={(e) => { e.preventDefault(); openWaitlist('Live alerts — coming soon', 'live-alerts'); }}>Join the waitlist →</a>
    </p>

    <p class="public-cta">
      <a href="/" class="cta-link">Run your own backtest — free →</a>
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
  /* ── Disclaimer ─────────────────────────────────────────────────────── */
  .disclaimer {
    position: sticky;
    top: 0;
    z-index: 50;
    width: 100%;
    padding: 12px 20px;
    background: var(--bg-surface);
    border-left: 3px solid var(--accent-amber);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .disclaimer-toggle {
    display: none;
  }

  @media (max-width: 640px) {
    .disclaimer {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .disclaimer--expanded {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .disclaimer-body {
      flex: 1;
      min-width: 0;
    }

    .disclaimer-body--collapsed {
      overflow: hidden;
      white-space: nowrap;
    }

    .disclaimer--expanded .disclaimer-body {
      overflow: visible;
      white-space: normal;
      flex: none;
    }

    .disclaimer-toggle {
      display: inline;
      white-space: nowrap;
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      font-size: var(--text-sm);
      cursor: pointer;
      padding: 0;
      line-height: 1.5;
    }
  }

  /* ── Shared utilities ───────────────────────────────────────────────── */
  .mono {
    font-family: 'IBM Plex Mono', monospace;
  }

  .gain { color: var(--accent-gain); }
  .loss { color: var(--accent-loss); }
  .amber { color: var(--accent-amber); }

  .section-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  .divider {
    border: none;
    border-top: 1px solid var(--bg-border);
    margin: 0;
  }

  .btn-outlined {
    background: transparent;
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    padding: 8px 16px;
    cursor: pointer;
    border-radius: 2px;
    transition: background 100ms;
  }

  .btn-outlined:hover {
    background: var(--bg-elevated);
  }

  /* ── Chart placeholder ──────────────────────────────────────────────── */
  .chart-ph {
    background: var(--bg-surface);
    border: 1px solid var(--bg-border);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .chart-ph-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .teaser-chart {
    position: relative;
    height: 240px;
  }

  .event-chart {
    height: 280px;
    margin: 12px 0;
  }

  .event-chart-wrap {
    margin: 12px 0;
  }

  .portfolio-chart {
    margin-top: 24px;
  }

  .chart-gradient-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60%;
    background: linear-gradient(to bottom, transparent, var(--bg-base));
    pointer-events: none;
  }

  /* ── Trade table shared ─────────────────────────────────────────────── */
  .table-scroll {
    overflow-x: auto;
  }

  .trade-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
    color: var(--text-primary);
    white-space: nowrap;
  }

  .trade-table th {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    text-align: left;
    padding: 8px 12px;
    background: var(--bg-base);
    font-weight: 400;
  }

  .trade-table td {
    padding: 8px 12px;
    background: var(--bg-base);
  }

  .trade-table tr.row-alt td {
    background: var(--bg-surface);
  }

  /* ── Teaser body ────────────────────────────────────────────────────── */
  .teaser-body {
    padding: 48px 0 64px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .headline-pnl {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    font-size: var(--text-2xl);
    font-weight: 400;
    color: var(--accent-gain);
    line-height: 1.2;
  }

  .headline-pnl.loss {
    color: var(--accent-loss);
  }

  .sub-stats {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  /* ── Blurred trade preview ──────────────────────────────────────────── */
  .preview-table-wrap {
    display: flex;
    flex-direction: column;
  }

  .blurred-rows {
    filter: blur(4px);
    pointer-events: none;
    user-select: none;
  }

  /* ── Email gate ─────────────────────────────────────────────────────── */
  .email-gate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 0 8px;
  }

  .gate-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-secondary);
  }

  .gate-form {
    display: flex;
    gap: 8px;
    width: 100%;
    max-width: 420px;
  }

  .gate-input-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gate-input {
    width: 100%;
    background: var(--bg-surface);
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    padding: 8px 12px;
    border-radius: 2px;
    outline: none;
  }

  .gate-input:focus {
    border-color: var(--text-secondary);
  }

  .gate-input.input-error {
    border-color: var(--accent-loss);
  }

  .gate-error {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    color: var(--accent-loss);
    margin: 0;
    width: 100%;
    max-width: 420px;
    text-align: left;
  }

  .gate-already-used {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .gate-login-hint {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: 0;
  }

  .gate-link {
    color: var(--text-secondary);
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .gate-link:hover {
    color: var(--text-primary);
    text-decoration-color: var(--text-primary);
  }

  .gate-btn {
    white-space: nowrap;
  }

  .gate-btn:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .social-proof {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  /* ── Full report ────────────────────────────────────────────────────── */
  .full-report {
    padding-bottom: 64px;
  }

  .report-section {
    padding: 32px 0;
  }

  /* ── Query & Parameters ─────────────────────────────────────────────── */
  .query-block {
    background: var(--bg-elevated);
    border-left: 2px solid var(--bg-border);
    padding: 12px 16px;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    margin-bottom: 20px;
  }

  .params-grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 8px 16px;
    align-items: start;
  }

  .param-key {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    padding-top: 1px;
  }

  .param-val {
    font-size: var(--text-sm);
    color: var(--text-primary);
    line-height: 1.8;
  }

  /* ── Re-run CTA ─────────────────────────────────────────────────────── */
  .rerun-row {
    margin-top: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .rerun-link {
    font-size: 13px;
    color: var(--text-secondary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    text-decoration: none;
  }

  .rerun-nocredit {
    font-size: 13px;
    color: var(--accent-amber);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }

  .rerun-buy {
    font-size: 13px;
    color: var(--accent-amber);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    text-decoration: underline;
    text-decoration-color: rgba(245, 158, 11, 0.4);
  }

  .rerun-buy:hover {
    text-decoration-color: var(--accent-amber);
  }

  /* ── Research Narrative ─────────────────────────────────────────────── */
  .narrative-label-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .ai-badge {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent-amber);
    border: 1px solid var(--accent-amber);
    padding: 1px 6px;
    line-height: 1.6;
  }

  .narrative-body {
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .narrative-body p {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    line-height: 1.7;
  }

  .narrative-placeholder {
    color: var(--text-muted) !important;
    font-style: italic;
  }

  /* ── Low-confidence toggle ──────────────────────────────────────────── */
  .low-conf-toggle-row {
    margin-bottom: 24px;
  }

  .low-conf-toggle {
    background: transparent;
    border: 1px solid var(--bg-border);
    color: var(--text-secondary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 13px;
    padding: 4px 10px;
    cursor: pointer;
    transition: color 100ms, border-color 100ms;
  }

  .low-conf-toggle:hover {
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }

  .low-conf-toggle--open {
    border-color: var(--accent-amber);
    color: var(--accent-amber);
  }

  .low-conf-toggle--open:hover {
    color: var(--accent-amber);
    border-color: var(--accent-amber);
  }

  /* ── Low-confidence event row ───────────────────────────────────────── */
  .badge-low {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border: 1px solid var(--bg-border);
    padding: 1px 5px;
  }

  .low-conf-excluded {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 11px;
    color: var(--text-muted);
  }

  .low-conf-description {
    border-left: 1px solid var(--bg-border);
    padding-left: 12px;
    margin: 8px 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 15px;
    color: var(--text-secondary);
    max-width: 720px;
    line-height: 1.6;
  }

  /* ── Historical Occurrences ─────────────────────────────────────────── */
  .event-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .event-date {
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  .confidence-badge {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 6px;
  }

  .badge-high {
    color: var(--text-primary);
    border: 1px solid var(--bg-border);
  }

  .badge-medium {
    color: var(--accent-amber);
    border: 1px solid var(--accent-amber);
  }

  .event-description {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    max-width: 720px;
    margin-bottom: 8px;
    line-height: 1.6;
  }

  .event-source {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .event-source a {
    color: var(--text-secondary);
    text-decoration: none;
  }

  .event-source a:hover {
    color: var(--text-primary);
  }

  .source-link {
    text-decoration: none;
  }

  .impact-summary {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-bottom: 20px;
  }

  .ticker-section {
    padding: 16px 0;
  }

  .ticker-label {
    margin-bottom: 0;
  }

  .ticker-divider {
    border: none;
    border-top: 1px solid var(--bg-border);
    margin: 0;
  }

  .trade-detail {
    font-size: var(--text-sm);
    color: var(--text-primary);
    margin-top: 8px;
  }

  /* ── Aggregate Performance ──────────────────────────────────────────── */
  .portfolio-value {
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    font-size: var(--text-2xl);
    font-weight: 400;
    color: var(--text-primary);
    line-height: 1.2;
    margin-bottom: 4px;
  }

  .portfolio-subtitle {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-bottom: 24px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: var(--bg-border);
    border: 1px solid var(--bg-border);
    margin-bottom: 24px;
  }

  .stat-cell {
    background: var(--bg-base);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-key {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .stat-val {
    font-size: var(--text-lg);
    color: var(--text-primary);
    line-height: 1.3;
  }

  .best-worst {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 0;
  }

  .bw-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    font-size: var(--text-sm);
  }

  .bw-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    color: var(--text-secondary);
    min-width: 44px;
  }

  /* ── Sortable trade table ───────────────────────────────────────────── */
  .sticky-head th {
    position: sticky;
    top: 47px;
    z-index: 10;
    background: var(--bg-base);
  }

  .sortable-th {
    cursor: pointer;
    user-select: none;
  }

  .sortable-th:hover {
    color: var(--text-primary);
  }

  .data-row td {
    transition: background 100ms;
  }

  .data-row:hover td {
    background: var(--bg-elevated) !important;
  }

  /* ── Sources ─────────────────────────────────────────────────────────── */
  .sources-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sources-list li {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .sources-list a {
    color: var(--text-secondary);
    text-decoration: none;
  }

  .sources-list a:hover {
    color: var(--text-primary);
  }

  /* ── Footer CTAs ─────────────────────────────────────────────────────── */
  .footer-ctas {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .coming-soon-cta {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .public-cta {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
  }

  .cta-link {
    color: inherit;
    text-decoration: none;
  }

  .cta-link:hover {
    color: var(--text-primary);
  }

  /* ── Responsive ─────────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .params-grid {
      grid-template-columns: 110px 1fr;
    }

    .gate-form {
      flex-direction: column;
    }
  }

  @media (max-width: 640px) {
    .stats-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* ── Top nav bar ────────────────────────────────────────────────────── */
  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--bg-border);
  }

  .top-nav-left,
  .top-nav-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .nav-back {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-decoration: none;
  }

  .nav-back:hover {
    color: var(--text-primary);
  }

  .nav-wordmark {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-primary);
    text-decoration: none;
  }

  .nav-cta {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-decoration: none;
  }

  .nav-cta:hover {
    color: var(--text-primary);
  }

  .nav-sep {
    color: var(--text-muted);
  }

  .nav-visibility {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .nav-visibility--private {
    color: var(--accent-amber);
  }

  .nav-visibility-toggle {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .nav-visibility-toggle:hover:not(:disabled) {
    text-decoration: underline;
  }

  .nav-visibility-toggle:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .nav-share-btn {
    background: transparent;
    border: 1px solid var(--bg-border);
    color: var(--text-secondary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    padding: 4px 10px;
    cursor: pointer;
  }

  .nav-share-btn:hover {
    border-color: var(--text-secondary);
    color: var(--text-primary);
  }

  .nav-delete-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--accent-loss);
    cursor: pointer;
  }

  .nav-delete-btn:hover {
    text-decoration: underline;
  }

  .private-notice {
    border-left: 3px solid var(--accent-amber);
    padding: 6px 12px;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--accent-amber);
  }

  .owner-visibility-error {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--accent-loss);
    margin: 4px 0 0;
  }

  .delete-inline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .confirm-delete-yes {
    background: transparent;
    border: 1px solid var(--accent-loss);
    color: var(--accent-loss);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    padding: 4px 10px;
    cursor: pointer;
  }

  .confirm-delete-yes:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .confirm-delete-cancel {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .confirm-delete-cancel:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .owner-error {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--accent-loss);
  }
</style>
