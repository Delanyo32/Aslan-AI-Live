<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { toast } from 'svelte-sonner'
  import { Dialog } from 'bits-ui'
  import BoardGrid from '$lib/components/terminal/BoardGrid.svelte'
  import AlertsFeed from '$lib/components/terminal/AlertsFeed.svelte'
  import DimensionDrilldown from '$lib/components/terminal/DimensionDrilldown.svelte'
  import CompanyPicker, { confirmCompany, type Candidate } from '$lib/components/terminal/CompanyPicker.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type Row = PageData['rows'][number]

  // Alerts state lives here so the header badge and the feed stay in sync.
  let alerts = $state(structuredClone(data.alerts))
  $effect(() => { alerts = structuredClone(data.alerts) })
  const unread = $derived(alerts.filter((a) => !a.read).length)

  let drill = $state<{ companyId: string; dimension: string } | null>(null)

  // ── Add-company modal: WP4.2's resolve → confirm flow, ending in /watch ────
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

      const watchRes = await fetch('/api/terminal/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id })
      })
      if (!watchRes.ok) throw new Error('watch_failed')

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

  async function handleUnwatch(row: Row) {
    if (!confirm(`Remove ${row.company.ticker} from the board? Monitoring stops for this company.`)) return
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

  async function startRun(url: string, body: object | null, ticker: string, cost: number) {
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
      toast.success(`${ticker} run started — new grades land on the board when it completes.`)
    } catch {
      toast.error('Could not start the run. Please try again.')
    }
  }

  function handleRefresh(row: Row) {
    if (!row.latest_slug) return
    if (!confirm(`Re-run ${row.company.ticker} now for ${data.costs.rerun} credits?`)) return
    startRun(`/api/terminal/report/${row.latest_slug}/rerun`, null, row.company.ticker, data.costs.rerun)
  }

  function handleRunFirst(row: Row) {
    if (!confirm(`Run the first report for ${row.company.ticker} at full cost — ${data.costs.report} credits?`)) return
    startRun('/api/terminal/run', { company_id: row.company.id }, row.company.ticker, data.costs.report)
  }

  async function markRead(ids: string[]) {
    // Optimistic: flip locally, then persist via the alerts API.
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

<svelte:head><title>The Board — Aslan Terminal</title></svelte:head>

<div class="pt-8 pb-20 max-w-7xl mx-auto w-full px-8 lg:px-12">
  <a href="/dashboard" class="mono-label text-[10px] text-gray-500 no-underline hover:text-black transition-colors">← Dashboard</a>

  <!-- Header -->
  <div class="mt-6 mb-8 flex items-end justify-between gap-6 flex-wrap">
    <div>
      <span class="mono-label text-[#4338ca] block mb-2">Aslan Terminal</span>
      <h1 class="serif-italic text-4xl lg:text-5xl text-[#171717] flex items-center gap-4">
        The Board
        {#if unread > 0}
          <span class="font-sans not-italic text-xs font-medium bg-[#4338ca] text-white rounded-full px-3 py-1">
            {unread} unread
          </span>
        {/if}
      </h1>
      <p class="font-sans text-sm text-gray-500 mt-2">
        Every watched company, re-graded as new evidence arrives. {data.costs.watchMonthly} credits / company / month.
      </p>
    </div>
    <button
      onclick={openModal}
      class="bg-[#171717] text-white px-7 py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors duration-300 cursor-pointer"
    >+ Add company</button>
  </div>

  <BoardGrid
    rows={data.rows}
    rerunCost={data.costs.rerun}
    reportCost={data.costs.report}
    oncell={(row, dimension) => (drill = { companyId: row.company.id, dimension })}
    onrefresh={handleRefresh}
    onrun={handleRunFirst}
    onunwatch={handleUnwatch}
  />

  <div class="mt-8 max-w-3xl">
    <AlertsFeed {alerts} onread={markRead} />
  </div>
</div>

{#if drill}
  <DimensionDrilldown
    companyId={drill.companyId}
    dimension={drill.dimension}
    onclose={() => (drill = null)}
  />
{/if}

<!-- Add-company modal (resolve → confirm → watch) -->
<Dialog.Root bind:open={() => modal !== 'closed', (o) => { if (!o) modal = 'closed' }}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/20 z-[200]" />
    <Dialog.Content class="fixed left-1/2 top-24 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg bg-white border border-[#e5e5e5] rounded-3xl shadow-2xl p-8 z-[201]">

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
          <p class="mono-label text-[9px] text-gray-400 mt-3">
            Watching costs {data.costs.watchMonthly} credits / month · you have {data.credits}
          </p>
        </CompanyPicker>

      {:else if modal === 'confirming' && selected}
        <span class="mono-label text-[#4338ca] block mb-2">Confirm</span>
        <Dialog.Title class="font-serif text-2xl text-[#171717] mb-4">{selected.name}</Dialog.Title>
        <p class="font-sans text-sm text-gray-600 mb-6">
          Watch <span class="font-mono">{selected.ticker}</span> on the board for
          {data.costs.watchMonthly} credits / month. Its grades re-run as new evidence arrives,
          and grade changes alert you here and by email.
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
            class="mono-label text-[10px] text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer transition-colors"
          >← Back</button>
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
