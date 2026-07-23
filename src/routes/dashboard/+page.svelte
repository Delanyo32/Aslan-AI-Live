<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { toast } from 'svelte-sonner'
  import { Dialog } from 'bits-ui'
  import BoardGrid from '$lib/components/terminal/BoardGrid.svelte'
  import AlertsFeed from '$lib/components/terminal/AlertsFeed.svelte'
  import DimensionDrilldown from '$lib/components/terminal/DimensionDrilldown.svelte'
  import CompanyPicker, { confirmCompany, type Candidate } from '$lib/components/terminal/CompanyPicker.svelte'
  import { gradeStyle } from '$lib/components/terminal/grade'
  import { fmtDate } from '$lib/utils'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type Row = PageData['rows'][number]

  // ── Grade-any-company command bar ───────────────────────────────────────────
  // Hands off to the full run flow at /terminal (resolve → confirm → stream).
  let ticker = $state('')
  function gradeCompany(e: SubmitEvent) {
    e.preventDefault()
    const t = ticker.trim()
    goto(t ? `/terminal?q=${encodeURIComponent(t)}` : '/terminal')
  }

  // ── Market movers: click a suggestion → straight into the grade flow ─────────
  const pickMover = (symbol: string) => goto(`/terminal?q=${encodeURIComponent(symbol)}`)
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
  const fmtVol = (n: number) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : `${n}`

  // Uniform row shape across all three columns (avoids a mixed union in the template).
  const moverCols = $derived([
    { label: 'Gainers', rows: data.movers.gainers.map((g) => ({ symbol: g.symbol, name: g.name, badge: fmtPct(g.percent_change), cls: 'text-emerald-600' })) },
    { label: 'Losers', rows: data.movers.losers.map((g) => ({ symbol: g.symbol, name: g.name, badge: fmtPct(g.percent_change), cls: 'text-red-600' })) },
    { label: 'Most active', rows: data.movers.most_actives.map((a) => ({ symbol: a.symbol, name: a.name, badge: fmtVol(a.volume), cls: 'text-gray-500' })) }
  ])
  const hasMovers = $derived(moverCols.some((c) => c.rows.length > 0))

  // ── Alerts (local copy so the header badge and feed stay in sync) ────────────
  let alerts = $state(structuredClone(data.alerts))
  $effect(() => { alerts = structuredClone(data.alerts) })
  const unread = $derived(alerts.filter((a) => !a.read).length)

  const isNewDesk = $derived(data.rows.length === 0 && data.recentReports.length === 0)

  // Rows with a run kicked off this session — optimistic, cleared on next load.
  // ponytail: local-only; the ~20-min run resolves server-side and invalidateAll clears it.
  let runningIds = $state(new Set<string>())

  // ── Drilldown ───────────────────────────────────────────────────────────────
  // cells travels with it so the composite drawer can list the 9 dimensions.
  let drill = $state<{ companyId: string; dimension: string; cells: Row['cells'] } | null>(null)

  // ── Styled confirm (replaces native confirm() for spend / unwatch) ──────────
  type ConfirmAction = { title: string; body: string; cta: string; danger?: boolean; run: () => void }
  let confirmAction = $state<ConfirmAction | null>(null)
  function runConfirm() {
    const a = confirmAction
    confirmAction = null
    a?.run()
  }

  // ── Add-company modal: resolve → confirm → /watch ───────────────────────────
  type ModalView = 'closed' | 'picking' | 'confirming'
  let modal = $state<ModalView>('closed')
  let query = $state('')
  let candidates = $state<Candidate[] | null>(null)
  let resolving = $state(false)
  let selected = $state<Candidate | null>(null)
  let busy = $state(false)

  function openModal() {
    modal = 'picking'
    query = ''
    candidates = null
    resolving = false
    selected = null
    busy = false
  }

  async function handleWatchConfirm() {
    if (!selected) return
    busy = true
    try {
      const company_id = await confirmCompany(selected)
      const res = await fetch('/api/terminal/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id })
      })
      if (!res.ok) throw new Error('watch_failed')
      toast.success(`${selected.ticker} added to the board.`)
      modal = 'closed'
      await invalidateAll()
    } catch {
      toast.error('Could not add that company to the board. Please try again.')
    } finally {
      busy = false
    }
  }

  // ── Row actions ─────────────────────────────────────────────────────────────
  async function doUnwatch(row: Row) {
    try {
      const res = await fetch('/api/terminal/watch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: row.company.id })
      })
      if (!res.ok) throw new Error('unwatch_failed')
      toast(`${row.company.ticker} removed from the board.`)
      await invalidateAll()
    } catch {
      toast.error('Could not remove that company. Please try again.')
    }
  }

  async function startRun(url: string, body: object | null, row: Row, cost: number) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })
      if (res.status === 402) {
        const b = await res.json()
        toast.error(`Not enough credits — this run costs ${b.required ?? cost}, you have ${b.available ?? 0}.`)
        return
      }
      if (!res.ok) throw new Error('run_failed')
      runningIds = new Set(runningIds).add(row.company.id)
      toast.success(`${row.company.ticker} run started — new grades land on the board when it completes.`)
    } catch {
      toast.error('Could not start the run. Please try again.')
    }
  }

  function handleUnwatch(row: Row) {
    confirmAction = {
      title: `Remove ${row.company.ticker} from the board?`,
      body: `Monitoring stops for ${row.company.name}. You can re-add it any time.`,
      cta: 'Remove',
      danger: true,
      run: () => doUnwatch(row)
    }
  }

  function handleRefresh(row: Row) {
    if (!row.latest_slug) return
    confirmAction = {
      title: `Re-run ${row.company.ticker} now?`,
      body: `Re-grades ${row.company.name} against the latest evidence for ${data.costs.rerun} credits.`,
      cta: `Re-run · ${data.costs.rerun} credits`,
      run: () => startRun(`/api/terminal/report/${row.latest_slug}/rerun`, null, row, data.costs.rerun)
    }
  }

  function handleRunFirst(row: Row) {
    confirmAction = {
      title: `Run the first report for ${row.company.ticker}?`,
      body: `A full nine-framework report on ${row.company.name} at full cost — ${data.costs.report} credits.`,
      cta: `Run report · ${data.costs.report} credits`,
      run: () => startRun('/api/terminal/run', { company_id: row.company.id }, row, data.costs.report)
    }
  }

  async function markRead(ids: string[]) {
    for (const a of alerts) if (ids.includes(a.id)) a.read = true
    try {
      await fetch('/api/terminal/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read: true })
      })
    } catch {
      /* next load re-syncs read state */
    }
  }
</script>

<svelte:head><title>The Desk — Aslan Terminal</title></svelte:head>

<div class="pt-10 pb-24 max-w-7xl mx-auto w-full px-6 sm:px-8 lg:px-12">

  <!-- ── Command bar: grade any company ──────────────────────────────────────── -->
  <section class="grid grid-cols-1 lg:grid-cols-[1fr_auto] lg:items-end gap-8 lg:gap-12 mb-12">
    <div class="max-w-2xl">
      <h1 class="serif-italic text-[#171717] leading-[1.04] mb-5" style="font-size: clamp(2.25rem, 3.5vw + 1rem, 3.5rem);">
        Grade any company.
      </h1>
      <p class="font-serif text-lg text-gray-600 leading-relaxed mb-6 max-w-xl">
        Type a ticker or a name. Nine research frameworks, graded from public evidence —
        then watch it, and the grades keep moving as the evidence does.
      </p>
      <form onsubmit={gradeCompany} class="flex flex-col sm:flex-row gap-3 max-w-lg">
        <input
          bind:value={ticker}
          placeholder="AAPL, or Apple Inc."
          aria-label="Company ticker or name to grade"
          class="flex-1 px-5 py-3.5 bg-white border border-[#e5e5e5] rounded-full font-sans text-sm text-[#171717] placeholder:text-gray-500 focus:border-[#4338ca] transition-colors"
        />
        <button
          type="submit"
          class="bg-[#171717] text-white px-7 py-3.5 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-2"
        >
          Grade it
          <iconify-icon icon="lucide:arrow-right" class="text-base"></iconify-icon>
        </button>
      </form>
      <p class="mono-label text-[9px] text-gray-500 mt-3">{data.costs.report} credits per report · you have {data.credits}</p>
    </div>

    <!-- Status column: what the desk is doing right now -->
    <div class="flex lg:flex-col gap-x-8 gap-y-3 lg:text-right lg:border-l lg:border-[#e5e5e5] lg:pl-10 lg:py-1">
      <div class="flex items-center lg:justify-end gap-2">
        <span class="w-1.5 h-1.5 rounded-full bg-[#4338ca] pulse-status shrink-0"></span>
        <span class="mono-label text-[9px] text-gray-500">Engine live</span>
      </div>
      <div>
        <span class="font-mono text-2xl leading-none block {data.rows.length > 0 ? 'text-[#171717]' : 'text-gray-300'}">{data.rows.length}</span>
        <span class="mono-label text-[9px] text-gray-500 mt-1 block">Watching</span>
      </div>
      <div>
        <span class="font-mono text-2xl leading-none block {unread > 0 ? 'text-[#4338ca]' : 'text-gray-300'}">{unread}</span>
        <span class="mono-label text-[9px] text-gray-500 mt-1 block">Unread</span>
      </div>
    </div>
  </section>

  {#if hasMovers}
    <!-- ── Market movers: Alpaca suggestions, click to grade ──────────────────── -->
    <section class="mb-14">
      <div class="mb-5">
        <h2 class="serif-italic text-2xl lg:text-3xl text-[#171717]">Market movers</h2>
        <p class="font-serif text-base text-gray-600 mt-1">
          Today's biggest US moves — pick one to grade. Warrants, penny stocks, and ETFs filtered out.
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#e5e5e5] border border-[#e5e5e5] rounded-2xl overflow-hidden">
        {#each moverCols as col (col.label)}
          <div class="bg-white p-5">
            <span class="mono-label text-[10px] text-gray-400 block mb-3">{col.label}</span>
            {#if col.rows.length === 0}
              <p class="font-sans text-xs text-gray-400">—</p>
            {:else}
              <ul class="list-none p-0 m-0 flex flex-col gap-1">
                {#each col.rows as it (it.symbol)}
                  <li>
                    <button
                      onclick={() => pickMover(it.symbol)}
                      class="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-[#fcfbf9] border border-transparent hover:border-[#e5e5e5] transition-colors cursor-pointer"
                    >
                      <span class="min-w-0 flex flex-col">
                        <span class="font-mono text-sm text-[#171717]">{it.symbol}</span>
                        <span class="font-sans text-xs text-gray-500 truncate">{it.name}</span>
                      </span>
                      <span class="font-mono text-xs shrink-0 {it.cls}">{it.badge}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if isNewDesk}
    <!-- ── First run: teach the two moves ────────────────────────────────────── -->
    <section class="bg-white border border-[#e5e5e5] rounded-[2rem] p-8 lg:p-12">
      <p class="font-serif text-lg text-gray-600 mb-6 max-w-xl">Your desk is empty. It fills in two moves:</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#e5e5e5] border border-[#e5e5e5] rounded-2xl overflow-hidden">
        <div class="bg-white p-7">
          <span class="font-mono text-sm text-[#4338ca]">01</span>
          <h3 class="serif-italic text-2xl text-[#171717] mt-2 mb-2 leading-snug">Grade a company.</h3>
          <p class="font-serif text-base text-gray-600 leading-relaxed">
            Enter a ticker above. In about twenty minutes you get a full report — nine framework
            grades, an Aslan Score, and, for US listings, a price-reconciliation verdict.
            Every grade traces to its evidence.
          </p>
        </div>
        <div class="bg-white p-7">
          <span class="font-mono text-sm text-[#4338ca]">02</span>
          <h3 class="serif-italic text-2xl text-[#171717] mt-2 mb-2 leading-snug">Watch it.</h3>
          <p class="font-serif text-base text-gray-600 leading-relaxed">
            Add a company to the board and it re-grades itself as new evidence arrives.
            When a grade moves, the change lands here — and in your inbox — with the reason
            and the source behind it.
          </p>
        </div>
      </div>
      <button
        onclick={openModal}
        class="mt-7 bg-white border border-[#e5e5e5] text-[#171717] px-6 py-3 rounded-full font-sans text-sm font-medium hover:border-[#4338ca] hover:text-[#4338ca] transition-colors cursor-pointer inline-flex items-center gap-2"
      >
        <iconify-icon icon="lucide:plus" class="text-base"></iconify-icon>
        Add a company to the board
      </button>
    </section>
  {:else}
    <!-- ── The Board: the living watchlist (hero) ──────────────────────────────── -->
    <section class="mb-14">
      <div class="flex items-end justify-between gap-6 flex-wrap mb-5">
        <div>
          <h2 class="serif-italic text-3xl lg:text-4xl text-[#171717] flex items-center gap-3">
            The Board
            {#if unread > 0}
              <span class="font-sans not-italic text-xs font-medium bg-[#4338ca] text-white rounded-full px-3 py-1">{unread} unread</span>
            {/if}
          </h2>
          <p class="font-serif text-base text-gray-600 mt-1.5">
            Every watched company, re-graded as new evidence arrives · {data.costs.watchMonthly} credits / company / month.
          </p>
        </div>
        <button
          onclick={openModal}
          class="bg-white border border-[#e5e5e5] text-[#171717] px-6 py-2.5 rounded-full font-sans text-sm font-medium hover:border-[#4338ca] hover:text-[#4338ca] transition-colors cursor-pointer inline-flex items-center gap-2 shrink-0"
        >
          <iconify-icon icon="lucide:plus" class="text-base"></iconify-icon>
          Add company
        </button>
      </div>

      {#if data.rows.length > 0}
        <BoardGrid
          rows={data.rows}
          rerunCost={data.costs.rerun}
          reportCost={data.costs.report}
          {runningIds}
          oncell={(row, dimension) => (drill = { companyId: row.company.id, dimension, cells: row.cells })}
          onrefresh={handleRefresh}
          onrun={handleRunFirst}
          onunwatch={handleUnwatch}
        />
      {:else}
        <div class="bg-white border border-[#e5e5e5] rounded-3xl p-10 text-center">
          <p class="font-serif text-lg text-gray-700 mb-1.5">Nothing on the board yet.</p>
          <p class="font-sans text-sm text-gray-500 max-w-md mx-auto mb-6">
            Watch a company and it re-grades itself as new evidence arrives — grade changes land here and in your inbox.
          </p>
          <button
            onclick={openModal}
            class="bg-[#171717] text-white px-6 py-2.5 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            <iconify-icon icon="lucide:plus" class="text-base"></iconify-icon>
            Add your first company
          </button>
        </div>
      {/if}
    </section>

    <!-- ── Recent reports + Alerts ─────────────────────────────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
      <!-- Recent reports -->
      <section class="lg:col-span-7">
        <h2 class="serif-italic text-2xl text-[#171717] mb-1">Recent reports</h2>
        <p class="font-serif text-base text-gray-500 mb-5">Your research trail — every grade you've run.</p>

        {#if data.recentReports.length > 0}
          <ul class="bg-white border border-[#e5e5e5] rounded-3xl overflow-hidden list-none p-0 m-0">
            {#each data.recentReports as r (r.slug)}
              {@const style = gradeStyle(r.grade)}
              <li>
                <a
                  href={`/terminal/${r.slug}`}
                  class="flex items-center gap-4 px-5 py-4 border-b border-[#f0f0f0] last:border-b-0 no-underline group hover:bg-[#fcfbf9] transition-colors"
                >
                  <span class="flex items-center justify-center w-12 h-12 rounded-xl border-2 shrink-0 {style.border} {style.bg} {style.text} font-serif text-2xl leading-none">{r.grade}</span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-2 flex-wrap">
                      <span class="serif-italic text-lg text-[#171717] group-hover:text-[#4338ca] transition-colors leading-tight truncate">{r.name}</span>
                      {#if r.red_banner}
                        <span class="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full shrink-0">
                          <iconify-icon icon="lucide:flag" class="text-xs"></iconify-icon> Red flag
                        </span>
                      {/if}
                    </span>
                    <span class="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span class="font-mono text-xs text-gray-500">{r.ticker}</span>
                      <span class="font-mono text-xs text-gray-300">·</span>
                      <span class="font-mono text-xs text-gray-500">Aslan Score {r.score}/100</span>
                      <span class="font-mono text-xs text-gray-300">·</span>
                      <span class="font-mono text-xs text-gray-500 capitalize">{r.confidence} confidence</span>
                      {#if !r.is_public}
                        <span class="mono-label text-[8px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">Private</span>
                      {/if}
                    </span>
                  </span>
                  <span class="flex flex-col items-end gap-1 shrink-0 text-right">
                    {#if r.is_us}
                      <span class="mono-label text-[8px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">US</span>
                    {:else}
                      <span class="mono-label text-[8px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">Research</span>
                    {/if}
                    <span class="font-mono text-[10px] text-gray-500">{fmtDate(r.created_at, { month: 'short', day: 'numeric' })}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="bg-white border border-[#e5e5e5] rounded-3xl p-8 text-center">
            <p class="font-serif text-lg text-gray-700 mb-1">No reports yet.</p>
            <p class="font-sans text-sm text-gray-500">Grade a company above to start your research trail.</p>
          </div>
        {/if}
      </section>

      <!-- Alerts -->
      <section class="lg:col-span-5">
        <h2 class="serif-italic text-2xl text-[#171717] mb-1">Alerts</h2>
        <p class="font-serif text-base text-gray-500 mb-5">Grade changes on the companies you watch.</p>
        <AlertsFeed {alerts} onread={markRead} />
      </section>
    </div>
  {/if}
</div>

{#if drill}
  <DimensionDrilldown
    companyId={drill.companyId}
    dimension={drill.dimension}
    dimensions={drill.cells}
    onselect={(dimension) => { if (drill) drill = { ...drill, dimension } }}
    onclose={() => (drill = null)}
  />
{/if}

<!-- Styled confirm (spend / unwatch) — replaces native confirm() -->
<Dialog.Root bind:open={() => confirmAction !== null, (o) => { if (!o) confirmAction = null }}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/20 z-[200]" />
    {#if confirmAction}
      <Dialog.Content class="fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white border border-[#e5e5e5] rounded-3xl p-8 z-[201]">
        <Dialog.Title class="font-serif text-xl text-[#171717] mb-2">{confirmAction.title}</Dialog.Title>
        <Dialog.Description class="font-sans text-sm text-gray-600 mb-6">{confirmAction.body}</Dialog.Description>
        <div class="flex items-center gap-4">
          <button
            onclick={runConfirm}
            class="{confirmAction.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#171717] hover:bg-[#4338ca]'} text-white px-6 py-3 rounded-full font-sans text-sm font-medium transition-colors cursor-pointer"
          >{confirmAction.cta}</button>
          <button
            onclick={() => (confirmAction = null)}
            class="mono-label text-[10px] text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer transition-colors"
          >Cancel</button>
        </div>
      </Dialog.Content>
    {/if}
  </Dialog.Portal>
</Dialog.Root>

<!-- Add-company modal (resolve → confirm → watch) -->
<Dialog.Root bind:open={() => modal !== 'closed', (o) => { if (!o) modal = 'closed' }}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/20 z-[200]" />
    <Dialog.Content class="fixed left-1/2 top-24 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg bg-white border border-[#e5e5e5] rounded-3xl p-8 z-[201]">

      {#if modal === 'picking'}
        <span class="mono-label text-[#4338ca] block mb-2">Add to the Board</span>
        <Dialog.Title class="font-serif text-2xl text-[#171717] mb-5">Watch a company</Dialog.Title>

        <CompanyPicker
          compact
          bind:query
          bind:candidates
          bind:resolving
          onpick={(c) => { selected = c; modal = 'confirming' }}
          onerror={(msg) => { toast.error(msg); resolving = false }}
        >
          <p class="mono-label text-[9px] text-gray-500 mt-3">
            Watching costs {data.costs.watchMonthly} credits / month · you have {data.credits}
          </p>
        </CompanyPicker>

      {:else if modal === 'confirming' && selected}
        <span class="mono-label text-[#4338ca] block mb-2">Confirm</span>
        <Dialog.Title class="font-serif text-2xl text-[#171717] mb-4">{selected.name}</Dialog.Title>
        <p class="font-sans text-sm text-gray-600 mb-6">
          Watch <span class="font-mono">{selected.ticker}</span> for
          {data.costs.watchMonthly} credits / month — <span class="text-[#171717]">recurring until you unwatch</span>.
          Its grades re-run as new evidence arrives, and grade changes alert you here and by email.
        </p>
        <div class="flex items-center gap-4">
          <button
            onclick={handleWatchConfirm}
            disabled={busy}
            class="bg-[#171717] text-white px-6 py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >{busy ? 'Adding…' : `Watch ${selected.ticker} →`}</button>
          <button
            onclick={() => (modal = 'picking')}
            disabled={busy}
            class="mono-label text-[10px] text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer transition-colors"
          >← Back</button>
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
