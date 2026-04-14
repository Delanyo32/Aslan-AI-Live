<script lang="ts">
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import BacktestInput from '$lib/components/backtest/BacktestInput.svelte'
  import UnderstandPreview from '$lib/components/backtest/UnderstandPreview.svelte'
  import type { ClarifyAnswers } from '$lib/components/backtest/UnderstandPreview.svelte'
  import TickerConfirmation from '$lib/components/backtest/TickerConfirmation.svelte'
  import ProcessingLog from '$lib/components/backtest/ProcessingLog.svelte'
  import RuleSelector from '$lib/components/backtest/RuleSelector.svelte'
  import QuerySummaryCard from '$lib/components/backtest/QuerySummaryCard.svelte'
  import UnderstandSummaryCard from '$lib/components/backtest/UnderstandSummaryCard.svelte'
  import TickerSummaryCard from '$lib/components/backtest/TickerSummaryCard.svelte'
  import RuleSummaryCard from '$lib/components/backtest/RuleSummaryCard.svelte'
  import WaitlistModal from '$lib/components/WaitlistModal.svelte'
  import type { PageData } from './$types'
  import type {
    RankedTicker,
    RawExaEvent,
    UnderstandResponse,
    ConfirmedTickerWithDirection
  } from '$lib/types/pipeline'

  let { data }: { data: PageData } = $props()

  // ── Waitlist modal ──────────────────────────────────────────────────────────
  let waitlistOpen = $state(false)

  // ── Sort (client-side) ──────────────────────────────────────────────────────
  type SortKey = 'date' | 'return' | 'ticker'
  let sortKey = $state<SortKey>('date')

  // ── Reports (mutable copy for reactive deletion) ────────────────────────────
  let reports = $state([...data.reports])

  const sortedReports = $derived(
    [...reports].sort((a, b) => {
      if (sortKey === 'date')   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortKey === 'return') return b.total_return_pct - a.total_return_pct
      return b.ticker_count - a.ticker_count
    })
  )

  // ── Inline delete confirm ───────────────────────────────────────────────────
  let pendingDelete = $state<string | null>(null)
  let deleteLoading = $state<string | null>(null)
  let deleteErrors  = $state<Record<string, string>>({})

  async function confirmDelete(slug: string) {
    deleteLoading = slug
    const res = await fetch(`/api/reports/${slug}/delete`, { method: 'POST' })
    deleteLoading = null
    if (!res.ok) {
      deleteErrors[slug] = 'Could not delete. Try again.'
      return
    }
    reports = reports.filter(r => r.slug !== slug)
    pendingDelete = null
  }

  // ── Pipeline state machine ──────────────────────────────────────────────────
  type ViewState =
    | 'input'
    | 'understanding'
    | 'previewing'
    | 'confirming_tickers'
    | 'processing'
    | 'confirming_rule'
    | 'reviewing'

  type ErrorState =
    | { kind: 'none' }
    | { kind: 'no_events' }
    | { kind: 'no_trades' }
    | { kind: 'api_error'; stage: string }
    | { kind: 'insufficient_credits'; required: number; available: number }
    | { kind: 'generic'; message: string }

  type CompletedStep = 'query' | 'understanding' | 'tickers' | 'rule'

  let view                 = $state<ViewState>('input')
  let currentQuery         = $state('')
  let understandResult     = $state<UnderstandResponse | null>(null)
  let rankedTickers        = $state<RankedTicker[] | null>(null)
  let previewArticles      = $state<RawExaEvent[]>([])
  let confirmedTickers     = $state<ConfirmedTickerWithDirection[] | null>(null)
  let totalPortfolioValue  = $state(0)
  let sessionId            = $state<string | null>(null)
  let streamUrl            = $state<string | null>(null)
  let entryExitSuggestions = $state<any>(null)
  let errorState           = $state<ErrorState>({ kind: 'none' })
  let understandError      = $state('')

  // ── Summary card state ──────────────────────────────────────────────────────
  let completedSteps = $state<Record<CompletedStep, boolean>>({
    query: false, understanding: false, tickers: false, rule: false
  })
  // Which step is being edited (null = none)
  let editingStep = $state<'query' | 'tickers' | 'rule' | null>(null)
  // Pending values saved but not yet rerun
  let pendingQuery = $state<string | null>(null)
  let pendingTickerPayload = $state<{ tickers: ConfirmedTickerWithDirection[]; totalPortfolioValue: number } | null>(null)
  // Selected preset for rule summary card display
  type Preset = 'aggressive' | 'moderate' | 'conservative'
  let selectedPreset = $state<Preset>('moderate')

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isFlowActive = $derived(view !== 'input')
  const isProcessing = $derived(view === 'processing' || view === 'confirming_rule')

  // Stale: steps that are downstream of the step being edited
  const staleUnderstanding = $derived(editingStep === 'query')
  const staleTickers       = $derived(editingStep === 'query')
  const staleRule          = $derived(editingStep === 'query' || editingStep === 'tickers')

  // Display query: pending edit takes precedence over confirmed query
  const displayQuery = $derived(pendingQuery ?? currentQuery)

  // Per-ticker position size for RuleSelector display
  const perTickerSize = $derived(
    confirmedTickers && confirmedTickers.length > 0
      ? Math.floor(totalPortfolioValue / confirmedTickers.length)
      : 0
  )

  // Default direction from event spec
  const defaultDirection = $derived<'long' | 'short'>(
    understandResult?.event_spec.direction_hint === 'short' ? 'short' : 'long'
  )

  // ── Auto-start from URL params (homepage handoff or rerun) ─────────────────
  onMount(() => {
    if (data.pendingQuery) {
      handleRun(data.pendingQuery)
    }
  })

  // ── Step 1 → Step 2: Understand + detect-events ────────────────────────────
  async function handleRun(query: string) {
    currentQuery     = query
    pendingQuery     = null
    errorState       = { kind: 'none' }
    understandError  = ''
    view             = 'understanding'

    try {
      const understandRes = await fetch('/api/pipeline/understand', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query }),
      })
      if (!understandRes.ok) throw new Error('understand failed')
      const understood: UnderstandResponse = await understandRes.json()
      understandResult = understood

      const detectRes = await fetch('/api/pipeline/detect-events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          event_spec: understood.event_spec,
          exa_search: understood.exa_search,
        }),
      })
      if (!detectRes.ok) throw new Error('detect-events failed')
      const detectData = await detectRes.json()

      rankedTickers   = detectData.ranked_tickers ?? []
      previewArticles = (detectData.raw_events ?? []).slice(0, 3)

      completedSteps = { ...completedSteps, query: true }
      view = 'previewing'
    } catch (e) {
      console.error('[dashboard] understand/detect failed:', e)
      understandError = 'Could not analyse your query. Please try again.'
      view = 'input'
    }
  }

  // ── Step 2 → Step 3: User confirmed understanding ──────────────────────────
  function handlePreviewContinue(_answers: ClarifyAnswers) {
    completedSteps = { ...completedSteps, understanding: true }
    view = 'confirming_tickers'
  }

  // ── Step 3 → Processing: Tickers + direction + portfolio confirmed ──────────
  function handleTickersConfirmed(payload: { tickers: ConfirmedTickerWithDirection[]; totalPortfolioValue: number }) {
    if (!understandResult) return
    confirmedTickers    = payload.tickers
    totalPortfolioValue = payload.totalPortfolioValue
    pendingTickerPayload = null
    sessionId           = crypto.randomUUID()

    const paramsObj = {
      query:                currentQuery,
      session_id:           sessionId,
      event_spec:           understandResult.event_spec,
      exa_search:           understandResult.exa_search,
      confirmed_tickers:    payload.tickers,
      total_portfolio_value: payload.totalPortfolioValue,
      is_rerun:             !!data.rerunSlug,
      source_report_slug:   data.rerunSlug ?? undefined,
    }
    streamUrl = `/api/pipeline/run?params=${encodeURIComponent(JSON.stringify(paramsObj))}`
    completedSteps = { ...completedSteps, tickers: true }
    view = 'processing'
  }

  function handleRefineQuery() {
    errorState = { kind: 'none' }
    completedSteps = { query: false, understanding: false, tickers: false, rule: false }
    editingStep = null
    pendingQuery = null
    pendingTickerPayload = null
    view = 'input'
  }

  function handleEntryExitSuggestions(d: { suggestions: any }) {
    entryExitSuggestions = d.suggestions
    view = 'confirming_rule'
  }

  function handleRuleConfirmed(preset: Preset) {
    selectedPreset = preset
    completedSteps = { ...completedSteps, rule: true }
    view = 'processing'
  }

  function handleComplete(backtestId: string) {
    goto(`/backtest/${backtestId}`)
  }

  function handleError(d: { message: string; stage: string; required?: number; available?: number }) {
    if (d.message === 'no_events' || d.message === 'no_events_for_confirmed_tickers') {
      errorState = { kind: 'no_events' }
    } else if (d.message === 'no_trades') {
      errorState = { kind: 'no_trades' }
    } else if (d.message === 'insufficient_credits') {
      errorState = { kind: 'insufficient_credits', required: d.required ?? 1, available: d.available ?? 0 }
    } else if (
      d.message === 'exa_search_failed'  ||
      d.message === 'price_fetch_failed' ||
      d.message === 'ai_api_error'
    ) {
      errorState = { kind: 'api_error', stage: d.stage }
    } else {
      errorState = { kind: 'generic', message: d.message }
    }
    view = 'input'
  }

  // ── Cancel during processing ────────────────────────────────────────────────
  function handleProcessingCancelled() {
    completedSteps = { ...completedSteps, rule: false }
    editingStep = null
    view = 'reviewing'
  }

  // ── Back-navigation: edit query ─────────────────────────────────────────────
  function handleEditQuery() {
    editingStep = 'query'
  }

  function handleSaveQuery(newQuery: string) {
    pendingQuery = newQuery
    editingStep  = null
  }

  async function handleRerunFromQuery() {
    if (!pendingQuery) return
    // Clear all downstream state
    understandResult = null
    rankedTickers    = null
    previewArticles  = []
    confirmedTickers = null
    entryExitSuggestions = null
    pendingTickerPayload = null
    completedSteps = { query: false, understanding: false, tickers: false, rule: false }
    editingStep = null
    await handleRun(pendingQuery)
  }

  // ── Back-navigation: edit tickers ───────────────────────────────────────────
  function handleEditTickers() {
    editingStep = 'tickers'
  }

  function handleSaveTickers(payload: { tickers: ConfirmedTickerWithDirection[]; totalPortfolioValue: number }) {
    pendingTickerPayload = payload
    editingStep = null
  }

  function handleRerunFromTickers() {
    if (!pendingTickerPayload) return
    entryExitSuggestions = null
    completedSteps = { ...completedSteps, rule: false }
    editingStep = null
    handleTickersConfirmed(pendingTickerPayload)
  }

  // ── Back-navigation: cancel edit ───────────────────────────────────────────
  function handleCancelEdit() {
    pendingQuery = null
    pendingTickerPayload = null
    editingStep = null
  }

  // ── Formatters ──────────────────────────────────────────────────────────────
  function formatPct(pct: number): string {
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${(pct * 100).toFixed(1)}%`
  }

  function fmtMonthYear(iso: string): string {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      year:  'numeric',
      timeZone: 'UTC'
    })
  }
</script>

{#if waitlistOpen}
  <WaitlistModal
    title="Get early access to live alerts"
    interest="live_alerts"
    onclose={() => waitlistOpen = false}
  />
{/if}

{#if !isFlowActive}
<!-- ── My Backtests ─────────────────────────────────────────────────────────── -->
<section class="section">
  <div class="section-header">
    <span class="section-label">MY BACKTESTS</span>
    <div class="sort-controls">
      <button class="sort-btn" class:active={sortKey === 'date'}   onclick={() => sortKey = 'date'}>Date ↓</button>
      <span class="sort-sep" aria-hidden="true">|</span>
      <button class="sort-btn" class:active={sortKey === 'return'} onclick={() => sortKey = 'return'}>Return</button>
      <span class="sort-sep" aria-hidden="true">|</span>
      <button class="sort-btn" class:active={sortKey === 'ticker'} onclick={() => sortKey = 'ticker'}>Ticker</button>
    </div>
  </div>

  {#if sortedReports.length === 0}
    <p class="empty-state">No backtests yet. Run your first one below.</p>
  {:else}
    <div class="reports-list">
      {#each sortedReports as report (report.slug)}
        <div class="report-item">
          <div class="report-row">
            <span class="col-query">{report.query}</span>
            <span class="col-tickers mono">{report.ticker_count} ticker{report.ticker_count !== 1 ? 's' : ''}</span>
            <span class="col-pnl mono" class:gain={report.total_return_pct >= 0} class:loss={report.total_return_pct < 0}>
              {formatPct(report.total_return_pct)}
            </span>
            <span class="col-dates mono">{fmtMonthYear(report.date_from)}–{fmtMonthYear(report.date_to)}</span>
            <div class="col-actions">
              <a href="/backtest/{report.slug}" class="view-link">↗ View</a>
              <button
                class="delete-btn"
                onclick={() => {
                  pendingDelete = pendingDelete === report.slug ? null : report.slug
                  deleteErrors = { ...deleteErrors, [report.slug]: '' }
                }}
              >Delete</button>
            </div>
          </div>

          {#if pendingDelete === report.slug}
            <div class="delete-confirm">
              Delete this backtest? This cannot be undone.
              <button class="confirm-yes" onclick={() => confirmDelete(report.slug)} disabled={deleteLoading === report.slug}>
                {deleteLoading === report.slug ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button class="confirm-cancel" onclick={() => { pendingDelete = null }} disabled={deleteLoading === report.slug}>Cancel</button>
              {#if deleteErrors[report.slug]}
                <span class="confirm-error">{deleteErrors[report.slug]}</span>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
{/if}

<!-- ── Run New Backtest ─────────────────────────────────────────────────────── -->
<section class="section">
  {#if !isFlowActive}
    <span class="section-label">RUN NEW BACKTEST</span>
  {/if}

  <div class="backtest-input-area">

    <!-- ── Summary cards: shown for every completed step ───────────────────── -->
    {#if completedSteps.query}
      <div class="summary-stack">
        <QuerySummaryCard
          query={displayQuery}
          stale={false}
          editable={!isProcessing}
          expanded={editingStep === 'query'}
          onEdit={handleEditQuery}
          onSave={handleSaveQuery}
          onCancel={handleCancelEdit}
        />

        {#if completedSteps.understanding && understandResult}
          <UnderstandSummaryCard
            understand={understandResult}
            articles={previewArticles}
            stale={staleUnderstanding}
          />
        {/if}

        {#if completedSteps.tickers && confirmedTickers && rankedTickers}
          <TickerSummaryCard
            tickers={confirmedTickers}
            portfolioValue={totalPortfolioValue}
            rankedTickers={rankedTickers}
            {defaultDirection}
            stale={staleTickers}
            editable={!isProcessing}
            expanded={editingStep === 'tickers'}
            onEdit={handleEditTickers}
            onSave={handleSaveTickers}
            onCancel={handleCancelEdit}
          />
        {/if}

        {#if completedSteps.rule && entryExitSuggestions}
          <RuleSummaryCard
            suggestions={entryExitSuggestions}
            positionSize={perTickerSize}
            sessionId={sessionId!}
            {selectedPreset}
            stale={staleRule}
            editable={!isProcessing}
            expanded={editingStep === 'rule'}
            onEdit={() => editingStep = 'rule'}
            onSave={(preset) => { selectedPreset = preset; completedSteps = { ...completedSteps, rule: true }; editingStep = null }}
            onCancel={handleCancelEdit}
          />
        {/if}
      </div>

      <!-- ── Rerun banner: shown after saving an edit ─────────────────────── -->
      {#if pendingQuery !== null && editingStep === null}
        <div class="rerun-banner">
          <span class="rerun-msg">Query changed — downstream steps will rerun.</span>
          <button class="rerun-btn" onclick={handleRerunFromQuery}>Rerun from Step 2 →</button>
          <button class="rerun-cancel" onclick={handleCancelEdit}>Discard</button>
        </div>
      {:else if pendingTickerPayload !== null && editingStep === null}
        <div class="rerun-banner">
          <span class="rerun-msg">Instruments changed — processing will rerun.</span>
          <button class="rerun-btn" onclick={handleRerunFromTickers}>Rerun from Step 5 →</button>
          <button class="rerun-cancel" onclick={handleCancelEdit}>Discard</button>
        </div>
      {/if}
    {/if}

    <!-- ── Active step ───────────────────────────────────────────────────────── -->
    {#if view === 'input'}

      {#if errorState.kind === 'no_events'}
        <div class="no-events-state">
          <p class="ne-msg">No historical events found matching your hypothesis.</p>
          <p class="ne-msg">Try broadening the date range, adjusting the event description, or checking the ticker.</p>
          <button class="refine-link" onclick={handleRefineQuery}>Refine query →</button>
        </div>

      {:else if errorState.kind === 'no_trades'}
        <div class="no-events-state">
          <p class="ne-msg">Events were found but no tradeable positions could be modelled.</p>
          <p class="ne-msg">Try a different ticker selection or broaden the event description.</p>
          <button class="refine-link" onclick={handleRefineQuery}>Refine query →</button>
        </div>

      {:else if errorState.kind === 'insufficient_credits'}
        <div class="credits-warning">
          This backtest costs {errorState.required} credit{errorState.required !== 1 ? 's' : ''} — you have {errorState.available}. Buy more to continue.
          <a href="/dashboard/credits" class="buy-link">Buy credits →</a>
        </div>
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />

      {:else if errorState.kind === 'api_error'}
        <div class="api-error">
          Something went wrong retrieving {errorState.stage === 'detection' ? 'news data' : 'price data'}. Your credits were not deducted.
          <button class="retry-link" onclick={() => { errorState = { kind: 'none' }; handleRun(currentQuery) }}>Try again →</button>
        </div>
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />

      {:else if errorState.kind === 'generic'}
        <div class="api-error">
          {errorState.message}
          <button class="retry-link" onclick={() => { errorState = { kind: 'none' }; handleRun(currentQuery) }}>Try again →</button>
        </div>
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />

      {:else}
        {#if understandError}
          <p class="understand-error">{understandError}</p>
        {/if}
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />
      {/if}

    {:else if view === 'understanding'}
      <p class="understanding-msg">Analysing your hypothesis…</p>

    {:else if view === 'previewing' && understandResult}
      <UnderstandPreview
        understand={understandResult}
        articles={previewArticles}
        oncontinue={handlePreviewContinue}
        onrefine={handleRefineQuery}
      />

    {:else if view === 'confirming_tickers' && rankedTickers}
      <TickerConfirmation
        ranked_tickers={rankedTickers}
        {defaultDirection}
        onconfirmed={handleTickersConfirmed}
      />

    {:else if view === 'processing' || view === 'confirming_rule'}
      <ProcessingLog
        streamUrl={streamUrl!}
        sessionId={sessionId!}
        onentryexitsuggestions={handleEntryExitSuggestions}
        oncomplete={handleComplete}
        onerror={handleError}
        ontickercandidates={() => {}}
        oncancelled={handleProcessingCancelled}
      />

      {#if view === 'confirming_rule' && entryExitSuggestions}
        <RuleSelector
          suggestions={entryExitSuggestions}
          position_size={perTickerSize}
          sessionId={sessionId!}
          initialPreset={selectedPreset}
          onconfirmed={handleRuleConfirmed}
        />
      {/if}

    {:else if view === 'reviewing'}
      <p class="review-hint">Edit any step above to adjust your backtest, then rerun.</p>

    {/if}

  </div>
</section>

<style>
  /* ── Sections ───────────────────────────────────────────────────────────── */
  .section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 48px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .section-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  /* ── Sort Controls ──────────────────────────────────────────────────────── */
  .sort-controls { display: flex; align-items: center; gap: 8px; }
  .sort-sep { font-size: var(--text-xs); color: var(--text-muted); user-select: none; }
  .sort-btn {
    background: transparent; border: none; padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-muted); cursor: pointer;
  }
  .sort-btn:hover, .sort-btn.active { color: var(--text-primary); }

  /* ── Reports List ───────────────────────────────────────────────────────── */
  .reports-list { border-top: 1px solid var(--bg-border); }
  .report-item  { border-bottom: 1px solid var(--bg-border); }

  .report-row {
    display: flex; align-items: center; gap: 16px;
    padding: 12px 0; flex-wrap: wrap;
  }

  .col-query {
    flex: 1; min-width: 180px;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  @media (max-width: 640px) {
    .report-row { gap: 6px 12px; }
    .col-query  { flex-basis: 100%; min-width: 0; }
    .col-actions { margin-left: auto; }
  }

  .mono { font-family: 'IBM Plex Mono', monospace; font-size: var(--text-sm); }
  .col-tickers { color: var(--text-secondary); white-space: nowrap; }
  .col-pnl { white-space: nowrap; min-width: 64px; text-align: right; }
  .col-pnl.gain { color: var(--accent-gain); }
  .col-pnl.loss { color: var(--accent-loss); }
  .col-dates { color: var(--text-secondary); white-space: nowrap; }

  .col-actions {
    display: flex; align-items: center; gap: 12px;
    white-space: nowrap; margin-left: auto;
  }

  .view-link {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-secondary); text-decoration: none;
  }
  .view-link:hover { color: var(--text-primary); }

  .delete-btn {
    background: transparent; border: none;
    color: var(--text-secondary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); padding: 0; cursor: pointer;
  }
  .delete-btn:hover { color: var(--accent-loss); }

  .delete-confirm {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 0 14px;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-secondary);
  }
  .confirm-yes {
    background: transparent; border: 1px solid var(--accent-loss);
    color: var(--accent-loss);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs); padding: 4px 10px; cursor: pointer;
    border-radius: 2px; transition: background 100ms;
  }
  .confirm-yes:hover { background: rgba(248, 113, 113, 0.1); }
  .confirm-cancel {
    background: transparent; border: 1px solid var(--bg-border);
    color: var(--text-secondary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs); padding: 4px 10px; cursor: pointer;
    border-radius: 2px; transition: background 100ms;
  }
  .confirm-cancel:hover { background: var(--bg-elevated); }
  .confirm-error { font-size: var(--text-xs); color: var(--accent-loss); }

  /* ── Empty State ────────────────────────────────────────────────────────── */
  .empty-state {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-secondary);
    text-align: center; padding: 32px 0;
  }

  /* ── Backtest input area ────────────────────────────────────────────────── */
  .backtest-input-area { display: flex; flex-direction: column; gap: 12px; }

  /* ── Summary cards stack ────────────────────────────────────────────────── */
  .summary-stack {
    border-top: 1px solid var(--bg-border);
    display: flex;
    flex-direction: column;
  }

  /* ── Rerun banner ───────────────────────────────────────────────────────── */
  .rerun-banner {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 10px 12px;
    background: rgba(245, 158, 11, 0.05);
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .rerun-msg {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    flex: 1;
    min-width: 160px;
  }

  .rerun-btn {
    background: transparent;
    border: 1px solid var(--bg-border);
    padding: 6px 14px;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-primary);
    cursor: pointer;
    border-radius: 2px;
    transition: background 100ms;
    white-space: nowrap;
  }

  .rerun-btn:hover {
    background: var(--bg-elevated);
  }

  .rerun-cancel {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .rerun-cancel:hover {
    color: var(--text-secondary);
  }

  /* ── Review hint (post-cancel) ──────────────────────────────────────────── */
  .review-hint {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin: 0;
    padding: 4px 0;
  }

  /* ── Understanding loading ──────────────────────────────────────────────── */
  .understanding-msg {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-muted); margin: 0;
  }

  .understand-error {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--accent-loss); margin: 0;
  }

  /* ── Credits Warning ────────────────────────────────────────────────────── */
  .credits-warning {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 12px;
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.3);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--accent-amber);
  }
  .buy-link {
    color: var(--accent-amber);
    text-decoration: underline;
    text-decoration-color: rgba(245, 158, 11, 0.4);
  }
  .buy-link:hover { text-decoration-color: var(--accent-amber); }

  /* ── Pipeline error states ──────────────────────────────────────────────── */
  .no-events-state { display: flex; flex-direction: column; gap: 8px; }
  .ne-msg {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-secondary); margin: 0;
  }
  .refine-link {
    background: transparent; border: none; padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--text-secondary);
    cursor: pointer; text-decoration: underline;
    text-decoration-color: var(--bg-border); text-align: left;
  }
  .refine-link:hover { color: var(--text-primary); text-decoration-color: var(--text-primary); }

  .api-error {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 12px;
    border: 1px solid rgba(248, 113, 113, 0.2);
    background: rgba(248, 113, 113, 0.05);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--accent-loss);
  }
  .retry-link {
    background: transparent; border: none; padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm); color: var(--accent-loss);
    cursor: pointer; text-decoration: underline;
    text-decoration-color: rgba(248, 113, 113, 0.4); white-space: nowrap;
  }
  .retry-link:hover { text-decoration-color: var(--accent-loss); }
</style>
