<script lang="ts">
  import { goto } from '$app/navigation'
  import { toast } from 'svelte-sonner'
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
  import { fmtDate } from '$lib/utils'
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
      toast.error('Could not delete. Try again.')
      return
    }
    reports = reports.filter(r => r.slug !== slug)
    pendingDelete = null
    toast.success('Report deleted.')
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
  let editingStep = $state<'query' | 'tickers' | 'rule' | null>(null)
  let pendingQuery = $state<string | null>(null)
  let pendingTickerPayload = $state<{ tickers: ConfirmedTickerWithDirection[]; totalPortfolioValue: number } | null>(null)
  type Preset = 'aggressive' | 'moderate' | 'conservative'
  let selectedPreset = $state<Preset>('moderate')

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isFlowActive = $derived(view !== 'input')
  const isProcessing = $derived(view === 'processing' || view === 'confirming_rule')

  const staleUnderstanding = $derived(editingStep === 'query')
  const staleTickers       = $derived(editingStep === 'query')
  const staleRule          = $derived(editingStep === 'query' || editingStep === 'tickers')

  const displayQuery = $derived(pendingQuery ?? currentQuery)

  const perTickerSize = $derived(
    confirmedTickers && confirmedTickers.length > 0
      ? Math.floor(totalPortfolioValue / confirmedTickers.length)
      : 0
  )

  const defaultDirection = $derived.by<'long' | 'short'>(() => {
    if (confirmedTickers && confirmedTickers.length > 0) {
      const shorts = confirmedTickers.filter(t => t.direction === 'short').length
      return shorts > confirmedTickers.length / 2 ? 'short' : 'long'
    }
    return researchSummary?.direction_hint === 'short' ? 'short' : 'long'
  })

  // ── Auto-start from URL params ─────────────────────────────────────────────
  onMount(() => {
    if (data.pendingQuery) {
      handleRun(data.pendingQuery)
    }
  })

  // ── Handlers ────────────────────────────────────────────────────────────────
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
      toast.error(message)
      understandError = message
      view = 'input'
    })
  }

  function handleResearchContinue() {
    completedSteps = { ...completedSteps, understanding: true }
    view = 'confirming_tickers'
  }

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
      toast.error('Failed to start pipeline. Please try again.')
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
      toast.error('No tradeable events found. Try refining your query.')
    } else if (d.message === 'no_trades') {
      errorState = { kind: 'no_trades' }
      toast.error('No trades generated with this strategy.')
    } else if (d.message === 'insufficient_credits') {
      errorState = { kind: 'insufficient_credits', required: d.required ?? 1, available: d.available ?? 0 }
      toast.error('Insufficient credits to run this backtest.')
    } else if (
      d.message === 'exa_search_failed'  ||
      d.message === 'price_fetch_failed' ||
      d.message === 'ai_api_error'
    ) {
      errorState = { kind: 'api_error', stage: d.stage }
      toast.error(d.stage === 'detection' ? 'News search failed. Try again.' : 'Price data unavailable. Try again.')
    } else {
      errorState = { kind: 'generic', message: d.message }
      toast.error(d.message || 'Something went wrong. Please try again.')
    }
    view = 'input'
  }

  function handleProcessingCancelled() {
    completedSteps = { ...completedSteps, rule: false }
    editingStep = null
    view = 'reviewing'
  }

  function handleEditQuery() { editingStep = 'query' }

  function handleSaveQuery(newQuery: string) {
    pendingQuery = newQuery
    editingStep  = null
  }

  function handleRerunFromQuery() {
    if (!pendingQuery) return
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

  function handleEditTickers() { editingStep = 'tickers' }

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

  const fmtMonthYear = (iso: string) =>
    fmtDate(iso + 'T00:00:00Z', { month: 'short', year: 'numeric', timeZone: 'UTC' })
</script>

{#if waitlistOpen}
  <WaitlistModal
    title="Get early access to live alerts"
    interest="live_alerts"
    onclose={() => waitlistOpen = false}
  />
{/if}

<div class="pt-8 pb-20 max-w-7xl mx-auto w-full px-8 lg:px-24 relative">
  <div class="absolute inset-0 mesh-gradient pointer-events-none" aria-hidden="true"></div>

  <div class="relative z-10 space-y-16">

    <!-- ── Run New Backtest ──────────────────────────────────────────────────── -->
    <section class="bg-white border border-[#e5e5e5] rounded-[3rem] p-10 lg:p-14 shadow-sm">
      {#if !isFlowActive}
        <span class="mono-label text-[#4338ca] block mb-2">Terminal</span>
        <h2 class="serif-italic text-4xl lg:text-5xl text-[#171717] mb-10">Scale your conviction.</h2>
      {/if}

      <div class="flex flex-col gap-4">

        <!-- Summary cards for completed steps -->
        {#if completedSteps.query}
          <div class="flex flex-col">
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
              <div class="py-3 px-0 flex flex-col gap-0.5" class:opacity-50={staleUnderstanding}>
                <p class="mono-label text-[9px] text-gray-400 m-0">Research</p>
                <p class="font-sans text-sm text-[#171717] m-0">{researchSummary.event_description}</p>
                <p class="font-mono text-xs text-gray-400 m-0">{researchEvents.filter(e => e.condition_met).length} tradeable event{researchEvents.filter(e => e.condition_met).length !== 1 ? 's' : ''} found</p>
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

          <!-- Rerun banners -->
          {#if pendingQuery !== null && editingStep === null}
            <div class="flex items-center gap-4 flex-wrap px-5 py-4 bg-white border border-[#e5e5e5] border-l-2 border-l-[#4338ca] rounded-2xl">
              <span class="font-sans text-sm text-gray-500 flex-1 min-w-[160px]">Query changed — downstream steps will rerun.</span>
              <button
                class="bg-[#171717] text-white px-6 py-2 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-all duration-300 cursor-pointer whitespace-nowrap"
                onclick={handleRerunFromQuery}
              >Rerun from Step 2 →</button>
              <button
                class="mono-label text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer bg-transparent border-none"
                onclick={handleCancelEdit}
              >Discard</button>
            </div>
          {:else if pendingTickerPayload !== null && editingStep === null}
            <div class="flex items-center gap-4 flex-wrap px-5 py-4 bg-white border border-[#e5e5e5] border-l-2 border-l-[#4338ca] rounded-2xl">
              <span class="font-sans text-sm text-gray-500 flex-1 min-w-[160px]">Instruments changed — processing will rerun.</span>
              <button
                class="bg-[#171717] text-white px-6 py-2 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-all duration-300 cursor-pointer whitespace-nowrap"
                onclick={handleRerunFromTickers}
              >Rerun from Step 5 →</button>
              <button
                class="mono-label text-[10px] text-gray-400 hover:text-gray-600 underline cursor-pointer bg-transparent border-none"
                onclick={handleCancelEdit}
              >Discard</button>
            </div>
          {/if}
        {/if}

        <!-- Active step -->
        {#if view === 'input'}

          {#if errorState.kind === 'no_events'}
            <div class="flex flex-col gap-2 bg-[#faf5ff] border border-indigo-100 rounded-2xl p-5">
              <p class="font-sans text-sm text-gray-600 m-0">No historical events found matching your hypothesis.</p>
              <p class="font-sans text-sm text-gray-600 m-0">Try broadening the date range, adjusting the event description, or checking the ticker.</p>
              <button
                class="mono-label text-[10px] text-[#4338ca] cursor-pointer bg-transparent border-none text-left hover:text-indigo-700 transition-colors"
                onclick={handleRefineQuery}
              >Refine query →</button>
            </div>

          {:else if errorState.kind === 'no_trades'}
            <div class="flex flex-col gap-2 bg-[#faf5ff] border border-indigo-100 rounded-2xl p-5">
              <p class="font-sans text-sm text-gray-600 m-0">Events were found but no tradeable positions could be modelled.</p>
              <p class="font-sans text-sm text-gray-600 m-0">Try a different ticker selection or broaden the event description.</p>
              <button
                class="mono-label text-[10px] text-[#4338ca] cursor-pointer bg-transparent border-none text-left hover:text-indigo-700 transition-colors"
                onclick={handleRefineQuery}
              >Refine query →</button>
            </div>

          {:else if errorState.kind === 'insufficient_credits'}
            <div class="flex items-center gap-3 flex-wrap bg-[#171717] text-white rounded-2xl p-5 font-sans text-sm">
              This backtest costs {errorState.required} credit{errorState.required !== 1 ? 's' : ''} — you have {errorState.available}. Buy more to continue.
              <a href="/dashboard/credits" class="text-white underline underline-offset-2 hover:text-indigo-200 transition-colors">Buy credits →</a>
            </div>
            <BacktestInput onrun={handleRun} initialValue={currentQuery} />

          {:else if errorState.kind === 'api_error'}
            <div class="flex items-center gap-3 flex-wrap px-5 py-4 bg-white border border-[#e5e5e5] border-l-2 border-l-[#4338ca] rounded-2xl font-sans text-sm text-[#171717]">
              Something went wrong retrieving {errorState.stage === 'detection' ? 'news data' : 'price data'}. Your credits were not deducted.
              <button
                class="mono-label text-[10px] text-[#4338ca] cursor-pointer bg-transparent border-none hover:text-indigo-700 transition-colors whitespace-nowrap"
                onclick={() => { errorState = { kind: 'none' }; handleRun(currentQuery) }}
              >Try again →</button>
            </div>
            <BacktestInput onrun={handleRun} initialValue={currentQuery} />

          {:else if errorState.kind === 'generic'}
            <div class="flex items-center gap-3 flex-wrap px-5 py-4 bg-white border border-[#e5e5e5] border-l-2 border-l-[#4338ca] rounded-2xl font-sans text-sm text-[#171717]">
              {errorState.message}
              <button
                class="mono-label text-[10px] text-[#4338ca] cursor-pointer bg-transparent border-none hover:text-indigo-700 transition-colors whitespace-nowrap"
                onclick={() => { errorState = { kind: 'none' }; handleRun(currentQuery) }}
              >Try again →</button>
            </div>
            <BacktestInput onrun={handleRun} initialValue={currentQuery} />

          {:else}
            {#if understandError}
              <p class="font-sans text-sm text-gray-500 m-0 px-1">{understandError}</p>
            {/if}
            <BacktestInput onrun={handleRun} initialValue={currentQuery} />
          {/if}

        {:else if view === 'researching'}
          <div class="flex flex-col gap-3">
            <span class="mono-label text-[10px] text-[#4338ca] block">Researching your hypothesis…</span>
            {#if researchLogs.length > 0}
              <div class="flex flex-col gap-0.5 border-l-2 border-indigo-100 pl-4">
                {#each researchLogs as logLine}
                  <p class="font-mono text-xs text-gray-400 m-0">{logLine}</p>
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
            onentryexitsuggestions={handleEntryExitSuggestions}
            oncomplete={handleComplete}
            onerror={handleError}
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
          <p class="font-sans text-sm text-gray-400 m-0 py-1">Edit any step above to adjust your backtest, then rerun.</p>

        {/if}

      </div>
    </section>

    <!-- ── My Backtests ──────────────────────────────────────────────────────── -->
    {#if !isFlowActive}
    <section>
      <div class="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <span class="mono-label text-[#4338ca] block mb-2">Archive</span>
          <h2 class="serif-italic text-4xl text-[#171717]">My Backtests</h2>
        </div>
        <div class="flex items-center gap-2">
          {#each [['date', 'Date ↓'], ['return', 'Return'], ['ticker', 'Tickers']] as [key, label]}
            <button
              onclick={() => sortKey = key as SortKey}
              class="px-4 py-1.5 rounded-full mono-label text-[10px] cursor-pointer transition-all duration-300 border
                {sortKey === key
                  ? 'border-[#171717] bg-[#171717] text-white'
                  : 'border-[#e5e5e5] text-gray-400 hover:text-gray-600 hover:border-gray-300 bg-white'}"
            >{label}</button>
          {/each}
        </div>
      </div>

      {#if sortedReports.length === 0}
        <div class="bg-white border border-[#e5e5e5] rounded-3xl p-12 text-center">
          <p class="serif-italic text-xl text-gray-400 mb-3">No backtests yet.</p>
          <p class="mono-label text-[9px] text-gray-400">Run your first one above.</p>
        </div>
      {:else}
        <div class="flex flex-col gap-4">
          {#each sortedReports as report (report.slug)}
            <div class="bg-white border border-[#e5e5e5] rounded-3xl p-8 premium-transition hover:border-[#4338ca] hover:shadow-xl hover:shadow-indigo-500/5 group">
              <div class="flex flex-col lg:flex-row justify-between gap-6">
                <!-- Left: query + actions -->
                <div class="flex-1 min-w-0">
                  <h3 class="serif-italic text-2xl lg:text-3xl text-[#171717] leading-tight mb-4 group-hover:text-[#4338ca] transition-colors duration-300">
                    {report.query}
                  </h3>
                  <div class="flex items-center gap-4">
                    <a
                      href="/backtest/{report.slug}"
                      class="mono-label text-[10px] text-[#4338ca] flex items-center gap-1 no-underline border-b border-transparent hover:border-indigo-400 pb-0.5 transition-colors"
                    >
                      View result
                      <iconify-icon icon="lucide:arrow-up-right" class="text-sm"></iconify-icon>
                    </a>
                    <button
                      class="mono-label text-[10px] text-gray-400 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer"
                      onclick={() => {
                        pendingDelete = pendingDelete === report.slug ? null : report.slug
                        deleteErrors = { ...deleteErrors, [report.slug]: '' }
                      }}
                    >Delete</button>
                  </div>

                  {#if pendingDelete === report.slug}
                    <div class="mt-4 flex items-center gap-3 flex-wrap">
                      <span class="font-sans text-sm text-gray-500">Delete this backtest?</span>
                      <button
                        class="px-4 py-1.5 bg-red-50 border border-red-200 text-red-600 mono-label text-[9px] rounded-full hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
                        onclick={() => confirmDelete(report.slug)}
                        disabled={deleteLoading === report.slug}
                      >{deleteLoading === report.slug ? 'Deleting…' : 'Confirm'}</button>
                      <button
                        class="px-4 py-1.5 bg-white border border-[#e5e5e5] text-gray-400 mono-label text-[9px] rounded-full hover:border-gray-300 transition-colors cursor-pointer"
                        onclick={() => { pendingDelete = null }}
                        disabled={deleteLoading === report.slug}
                      >Cancel</button>
                      {#if deleteErrors[report.slug]}
                        <span class="mono-label text-[9px] text-red-500">{deleteErrors[report.slug]}</span>
                      {/if}
                    </div>
                  {/if}
                </div>

                <!-- Right: stats -->
                <div class="flex gap-8 items-start lg:border-l lg:border-gray-100 lg:pl-8 shrink-0">
                  <div>
                    <span class="mono-label text-gray-400 text-[9px] mb-2 block">Return</span>
                    <span class="font-mono text-2xl font-bold {report.total_return_pct >= 0 ? 'text-[#4338ca]' : 'text-gray-400'}">
                      {formatPct(report.total_return_pct)}
                    </span>
                  </div>
                  <div>
                    <span class="mono-label text-gray-400 text-[9px] mb-2 block">Details</span>
                    <span class="block font-mono text-xs text-gray-600 mb-1">{report.ticker_count} TICKER{report.ticker_count !== 1 ? 'S' : ''}</span>
                    <span class="block mono-label text-[9px] text-gray-400">{fmtMonthYear(report.date_from)}–{fmtMonthYear(report.date_to)}</span>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
    {/if}

  </div>
</div>
