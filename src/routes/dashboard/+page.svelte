<script lang="ts">
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import BacktestInput from '$lib/components/backtest/BacktestInput.svelte'
  import ResearchResults from '$lib/components/backtest/ResearchResults.svelte'
  import TickerConfirmation from '$lib/components/backtest/TickerConfirmation.svelte'
  import ProcessingLog from '$lib/components/backtest/ProcessingLog.svelte'
  import RuleSelector from '$lib/components/backtest/RuleSelector.svelte'
  import QuerySummaryCard from '$lib/components/backtest/QuerySummaryCard.svelte'
  import TickerSummaryCard from '$lib/components/backtest/TickerSummaryCard.svelte'
  import RuleSummaryCard from '$lib/components/backtest/RuleSummaryCard.svelte'
  import WaitlistModal from '$lib/components/WaitlistModal.svelte'
  import type { PageData } from './$types'
  import type {
    RankedTicker,
    ResearchEvent,
    ResearchSummary,
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
    | 'researching'
    | 'previewing_research'
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

  let view                  = $state<ViewState>('input')
  let currentQuery          = $state('')
  let researchEvents        = $state<ResearchEvent[]>([])
  let lowConfidenceEvents   = $state<ResearchEvent[]>([])
  let researchSummary       = $state<ResearchSummary | null>(null)
  let researchLogs          = $state<string[]>([])
  let rankedTickers         = $state<RankedTicker[] | null>(null)
  let confirmedTickers      = $state<ConfirmedTickerWithDirection[] | null>(null)
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

  // Default direction: majority of confirmed tickers, falling back to research summary hint
  const defaultDirection = $derived.by<'long' | 'short'>(() => {
    if (confirmedTickers && confirmedTickers.length > 0) {
      const shorts = confirmedTickers.filter(t => t.direction === 'short').length
      return shorts > confirmedTickers.length / 2 ? 'short' : 'long'
    }
    return researchSummary?.direction_hint === 'short' ? 'short' : 'long'
  })

  // ── Auto-start from URL params (homepage handoff or rerun) ─────────────────
  onMount(() => {
    if (data.pendingQuery) {
      handleRun(data.pendingQuery)
    }
  })

  // ── Step 1 → Step 2: Agentic research via SSE ─────────────────────────────
  function handleRun(query: string) {
    currentQuery          = query
    pendingQuery          = null
    errorState            = { kind: 'none' }
    understandError       = ''
    researchEvents        = []
    lowConfidenceEvents   = []
    researchSummary       = null
    researchLogs          = []
    view                  = 'researching'

    const params = new URLSearchParams({ query })
    const source = new EventSource(`/api/pipeline/research?${params}`)

    source.addEventListener('log', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      researchLogs = [...researchLogs, data.message]
    })

    source.addEventListener('result', (e) => {
      source.close()
      const data = JSON.parse((e as MessageEvent).data)
      researchEvents      = data.research_events      ?? []
      lowConfidenceEvents = data.low_confidence_events ?? []
      rankedTickers       = data.ranked_tickers        ?? []
      researchSummary     = data.summary               ?? null
      completedSteps      = { ...completedSteps, query: true }
      view = 'previewing_research'
    })

    source.addEventListener('error', (e) => {
      source.close()
      let message = 'Could not research your query. Please try again.'
      try {
        const data = JSON.parse((e as MessageEvent).data)
        if (data.message === 'research_agent_limit_exceeded') {
          message = 'Research agent hit its search limit. Try a more specific query.'
        }
      } catch { /* connection-level error — use default message */ }
      console.error('[dashboard] research failed:', message)
      understandError = message
      view = 'input'
    })
  }

  // ── Step 2 → Step 3: User confirmed research results ──────────────────────
  function handleResearchContinue() {
    completedSteps = { ...completedSteps, understanding: true }
    view = 'confirming_tickers'
  }

  // ── Step 3 → Processing: Tickers + direction + portfolio confirmed ──────────
  async function handleTickersConfirmed(payload: { tickers: ConfirmedTickerWithDirection[]; totalPortfolioValue: number }) {
    confirmedTickers    = payload.tickers
    totalPortfolioValue = payload.totalPortfolioValue
    pendingTickerPayload = null
    sessionId           = crypto.randomUUID()

    const paramsObj = {
      query:                 currentQuery,
      session_id:            sessionId,
      research_events:       researchEvents,
      research_summary:      researchSummary,
      confirmed_tickers:     payload.tickers,
      total_portfolio_value: payload.totalPortfolioValue,
      is_rerun:              !!data.rerunSlug,
      source_report_slug:    data.rerunSlug ?? undefined,
    }
    const res = await fetch('/api/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paramsObj),
    })
    if (!res.ok) {
      errorState = { kind: 'generic', message: 'Failed to start pipeline. Please try again.' }
      view = 'input'
      return
    }
    streamUrl = `/api/pipeline/run?session_id=${sessionId}`
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

  function handleRerunFromQuery() {
    if (!pendingQuery) return
    // Clear all downstream state
    researchEvents      = []
    lowConfidenceEvents = []
    researchSummary     = null
    researchLogs        = []
    rankedTickers       = null
    confirmedTickers    = null
    entryExitSuggestions = null
    pendingTickerPayload = null
    completedSteps = { query: false, understanding: false, tickers: false, rule: false }
    editingStep = null
    handleRun(pendingQuery)
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
<section class="flex flex-col gap-4 border-t-4 border-black pt-5 mb-12">
  <div class="flex items-center justify-between flex-wrap gap-3">
    <span class="font-display text-xl font-bold tracking-[-0.025em] text-black">MY BACKTESTS</span>
    <div class="flex items-center gap-2">
      <button
        class="bg-transparent border-none p-0 font-mono text-xs tracking-[0.08em] uppercase cursor-pointer transition-colors duration-100"
        class:text-black={sortKey === 'date'}
        class:text-[#E5E5E5]={sortKey !== 'date'}
        onclick={() => sortKey = 'date'}
      >Date ↓</button>
      <span class="text-xs text-[#E5E5E5] select-none" aria-hidden="true">|</span>
      <button
        class="bg-transparent border-none p-0 font-mono text-xs tracking-[0.08em] uppercase cursor-pointer transition-colors duration-100"
        class:text-black={sortKey === 'return'}
        class:text-[#E5E5E5]={sortKey !== 'return'}
        onclick={() => sortKey = 'return'}
      >Return</button>
      <span class="text-xs text-[#E5E5E5] select-none" aria-hidden="true">|</span>
      <button
        class="bg-transparent border-none p-0 font-mono text-xs tracking-[0.08em] uppercase cursor-pointer transition-colors duration-100"
        class:text-black={sortKey === 'ticker'}
        class:text-[#E5E5E5]={sortKey !== 'ticker'}
        onclick={() => sortKey = 'ticker'}
      >Ticker</button>
    </div>
  </div>

  {#if sortedReports.length === 0}
    <p class="font-sans text-sm text-text-secondary text-center py-8">No backtests yet. Run your first one below.</p>
  {:else}
    <div class="border-t border-black">
      {#each sortedReports as report (report.slug)}
        <div class="border-b border-[#E5E5E5]">
          <div class="flex items-center gap-4 py-3 flex-wrap max-sm:gap-x-3 max-sm:gap-y-1.5">
            <span class="flex-1 min-w-[180px] font-sans text-sm text-text-primary overflow-hidden text-ellipsis whitespace-nowrap max-sm:basis-full max-sm:min-w-0">{report.query}</span>
            <span class="font-mono text-sm text-text-secondary whitespace-nowrap">{report.ticker_count} ticker{report.ticker_count !== 1 ? 's' : ''}</span>
            <span
              class="font-mono text-sm whitespace-nowrap min-w-[64px] text-right"
              class:text-accent-gain={report.total_return_pct >= 0}
              class:text-accent-loss={report.total_return_pct < 0}
            >
              {formatPct(report.total_return_pct)}
            </span>
            <span class="font-mono text-sm text-text-secondary whitespace-nowrap">{fmtMonthYear(report.date_from)}–{fmtMonthYear(report.date_to)}</span>
            <div class="flex items-center gap-3 whitespace-nowrap ml-auto max-sm:ml-auto">
              <a href="/backtest/{report.slug}" class="font-sans text-sm text-text-secondary no-underline hover:text-text-primary transition-colors duration-100">↗ View</a>
              <button
                class="bg-transparent border-none font-sans text-sm text-text-secondary p-0 cursor-pointer hover:text-accent-loss transition-colors duration-100"
                onclick={() => {
                  pendingDelete = pendingDelete === report.slug ? null : report.slug
                  deleteErrors = { ...deleteErrors, [report.slug]: '' }
                }}
              >Delete</button>
            </div>
          </div>

          {#if pendingDelete === report.slug}
            <div class="flex items-center gap-3 flex-wrap py-2.5 pb-3.5 font-sans text-sm text-text-secondary">
              Delete this backtest? This cannot be undone.
              <button
                class="bg-transparent border border-accent-loss text-accent-loss font-sans text-xs px-2.5 py-1 cursor-pointer rounded-none transition-colors duration-100 hover:bg-accent-loss hover:text-white disabled:opacity-50"
                onclick={() => confirmDelete(report.slug)}
                disabled={deleteLoading === report.slug}
              >
                {deleteLoading === report.slug ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                class="bg-transparent border border-black text-[#525252] font-sans text-xs px-2.5 py-1 cursor-pointer rounded-none transition-colors duration-100 hover:bg-black hover:text-white disabled:opacity-50"
                onclick={() => { pendingDelete = null }}
                disabled={deleteLoading === report.slug}
              >Cancel</button>
              {#if deleteErrors[report.slug]}
                <span class="text-xs text-accent-loss">{deleteErrors[report.slug]}</span>
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
<section class="flex flex-col gap-4 border-t-4 border-black pt-5 mb-12">
  {#if !isFlowActive}
    <span class="font-display text-xl font-bold tracking-[-0.025em] text-black">RUN NEW BACKTEST</span>
  {/if}

  <div class="flex flex-col gap-3">

    <!-- ── Summary cards: shown for every completed step ───────────────────── -->
    {#if completedSteps.query}
      <div class="border-t border-black flex flex-col">
        <QuerySummaryCard
          query={displayQuery}
          stale={false}
          editable={!isProcessing}
          expanded={editingStep === 'query'}
          onEdit={handleEditQuery}
          onSave={handleSaveQuery}
          onCancel={handleCancelEdit}
        />

        {#if completedSteps.understanding && researchSummary}
          <div class="py-2 px-0 flex flex-col gap-0.5" class:opacity-50={staleUnderstanding}>
            <p class="font-sans text-xs text-text-muted m-0 uppercase tracking-[0.08em]">RESEARCH</p>
            <p class="font-sans text-sm text-text-secondary m-0">{researchSummary.event_description}</p>
            <p class="font-mono text-xs text-text-muted m-0">{researchEvents.filter(e => e.condition_met).length} tradeable event{researchEvents.filter(e => e.condition_met).length !== 1 ? 's' : ''} found</p>
          </div>
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
        <div class="flex items-center gap-4 flex-wrap px-3 py-2.5 border border-black border-l-4 border-l-black">
          <span class="font-sans text-sm text-text-secondary flex-1 min-w-[160px]">Query changed — downstream steps will rerun.</span>
          <button
            class="bg-transparent border border-black rounded-none px-3.5 py-1.5 font-sans text-sm text-text-primary cursor-pointer whitespace-nowrap transition-colors duration-100 hover:bg-white"
            onclick={handleRerunFromQuery}
          >Rerun from Step 2 →</button>
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-[#AAAAAA] cursor-pointer underline decoration-black hover:text-text-secondary transition-colors duration-100"
            onclick={handleCancelEdit}
          >Discard</button>
        </div>
      {:else if pendingTickerPayload !== null && editingStep === null}
        <div class="flex items-center gap-4 flex-wrap px-3 py-2.5 border border-black border-l-4 border-l-black">
          <span class="font-sans text-sm text-text-secondary flex-1 min-w-[160px]">Instruments changed — processing will rerun.</span>
          <button
            class="bg-transparent border border-black rounded-none px-3.5 py-1.5 font-sans text-sm text-text-primary cursor-pointer whitespace-nowrap transition-colors duration-100 hover:bg-white"
            onclick={handleRerunFromTickers}
          >Rerun from Step 5 →</button>
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-[#AAAAAA] cursor-pointer underline decoration-black hover:text-text-secondary transition-colors duration-100"
            onclick={handleCancelEdit}
          >Discard</button>
        </div>
      {/if}
    {/if}

    <!-- ── Active step ───────────────────────────────────────────────────────── -->
    {#if view === 'input'}

      {#if errorState.kind === 'no_events'}
        <div class="flex flex-col gap-2 border-l-4 border-l-black pl-4">
          <p class="font-sans text-sm text-[#525252] m-0">No historical events found matching your hypothesis.</p>
          <p class="font-sans text-sm text-[#525252] m-0">Try broadening the date range, adjusting the event description, or checking the ticker.</p>
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-[#525252] cursor-pointer underline decoration-[#E5E5E5] text-left hover:text-black hover:decoration-black transition-colors duration-100"
            onclick={handleRefineQuery}
          >Refine query →</button>
        </div>

      {:else if errorState.kind === 'no_trades'}
        <div class="flex flex-col gap-2 border-l-4 border-l-black pl-4">
          <p class="font-sans text-sm text-[#525252] m-0">Events were found but no tradeable positions could be modelled.</p>
          <p class="font-sans text-sm text-[#525252] m-0">Try a different ticker selection or broaden the event description.</p>
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-[#525252] cursor-pointer underline decoration-[#E5E5E5] text-left hover:text-black hover:decoration-black transition-colors duration-100"
            onclick={handleRefineQuery}
          >Refine query →</button>
        </div>

      {:else if errorState.kind === 'insufficient_credits'}
        <div class="flex items-center gap-3 flex-wrap p-4 bg-black font-sans text-sm text-white">
          This backtest costs {errorState.required} credit{errorState.required !== 1 ? 's' : ''} — you have {errorState.available}. Buy more to continue.
          <a href="/dashboard/credits" class="text-white underline decoration-white/50 hover:decoration-white transition-colors duration-100">Buy credits →</a>
        </div>
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />

      {:else if errorState.kind === 'api_error'}
        <div class="flex items-center gap-3 flex-wrap px-3 py-2.5 border border-black border-l-4 border-l-black font-sans text-sm text-black">
          Something went wrong retrieving {errorState.stage === 'detection' ? 'news data' : 'price data'}. Your credits were not deducted.
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-black cursor-pointer underline decoration-[#E5E5E5] whitespace-nowrap hover:decoration-black transition-colors duration-100"
            onclick={() => { errorState = { kind: 'none' }; handleRun(currentQuery) }}
          >Try again →</button>
        </div>
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />

      {:else if errorState.kind === 'generic'}
        <div class="flex items-center gap-3 flex-wrap px-3 py-2.5 border border-black border-l-4 border-l-black font-sans text-sm text-black">
          {errorState.message}
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-black cursor-pointer underline decoration-[#E5E5E5] whitespace-nowrap hover:decoration-black transition-colors duration-100"
            onclick={() => { errorState = { kind: 'none' }; handleRun(currentQuery) }}
          >Try again →</button>
        </div>
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />

      {:else}
        {#if understandError}
          <p class="font-sans text-sm text-accent-loss m-0">{understandError}</p>
        {/if}
        <BacktestInput onrun={handleRun} initialValue={currentQuery} />
      {/if}

    {:else if view === 'researching'}
      <div class="flex flex-col gap-2">
        <p class="font-sans text-sm text-[#AAAAAA] m-0">Researching your hypothesis…</p>
        {#if researchLogs.length > 0}
          <div class="flex flex-col gap-0.5 border-l-2 border-[#E5E5E5] pl-3">
            {#each researchLogs as logLine}
              <p class="font-mono text-xs text-text-muted m-0">{logLine}</p>
            {/each}
          </div>
        {/if}
      </div>

    {:else if view === 'previewing_research'}
      <ResearchResults
        events={researchEvents}
        lowConfidence={lowConfidenceEvents}
        rankedTickers={rankedTickers ?? []}
        oncontinue={handleResearchContinue}
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
          defaultDirection={defaultDirection}
          onconfirmed={handleRuleConfirmed}
        />
      {/if}

    {:else if view === 'reviewing'}
      <p class="font-sans text-sm text-[#AAAAAA] m-0 py-1">Edit any step above to adjust your backtest, then rerun.</p>

    {/if}

  </div>
</section>
