<script lang="ts" module>
  // Mirrors src/lib/server/terminal/resolve.ts ResolveCandidate (server-only type).
  export type Candidate = { ticker: string; name: string; is_us: boolean; exa_entity?: object }

  /** Confirm upserts the chosen candidate and returns its companies id. */
  export async function confirmCompany(candidate: Candidate): Promise<string> {
    const res = await fetch('/api/terminal/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: candidate })
    })
    if (!res.ok) throw new Error('confirm_failed')
    const { company_id } = await res.json()
    return company_id
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    onpick: (c: Candidate) => void
    /** Resolve failed — parent decides how to surface the message. */
    onerror: (message: string) => void
    /** Modal sizing (board add-company) vs page sizing (/terminal). */
    compact?: boolean
    // Bindable so the query + candidate list survive this component being
    // unmounted while the parent shows its confirm step and comes "← Back".
    query?: string
    candidates?: Candidate[] | null
    resolving?: boolean
    /** Rendered between the form and the candidate list (credits footnote). */
    children?: Snippet
  }

  let {
    onpick,
    onerror,
    compact = false,
    query = $bindable(''),
    candidates = $bindable(null),
    resolving = $bindable(false),
    children
  }: Props = $props()

  async function handleResolve() {
    const q = query.trim()
    if (!q) return
    resolving = true
    candidates = null
    try {
      const res = await fetch('/api/terminal/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      })
      if (!res.ok) throw new Error('resolve_failed')
      candidates = (await res.json()).candidates ?? []
    } catch {
      onerror('Could not look up that company. Please try again.')
    } finally {
      resolving = false
    }
  }

  // ── Category browsing ───────────────────────────────────────────────────────
  // Tabs let users pick from a list instead of knowing the ticker. "Search" keeps
  // the Exa lookup; category tabs load {symbol,name,is_us} from /api/stocks/list
  // and select directly (a known company → skip the Exa resolve round-trip).
  // The search box filters the active category server-side (the universe is ~14k).
  const TABS = [
    { key: 'search', label: 'Search' },
    { key: 'graded', label: 'Previously graded' },
    { key: 'board', label: 'On your board' },
    { key: 'major', label: 'Major companies' },
    { key: 'nasdaq', label: 'NASDAQ' },
    { key: 'nyse', label: 'NYSE' },
    { key: 'etf', label: 'ETFs' },
    { key: 'movers', label: 'Movers' }
  ] as const
  type TabKey = (typeof TABS)[number]['key']

  let tab = $state<TabKey>('search')
  let listItems = $state<Candidate[] | null>(null)
  let listLoading = $state(false)
  let listReq = 0 // guards against out-of-order responses

  const selectTab = (key: TabKey) => { tab = key }

  async function loadList(key: TabKey, q: string) {
    listLoading = true
    const myReq = ++listReq
    try {
      const res = await fetch(`/api/stocks/list?category=${key}&q=${encodeURIComponent(q)}`)
      if (myReq !== listReq) return // a newer request superseded this one
      if (!res.ok) throw new Error('list_failed')
      const items = (await res.json()) as { symbol: string; name: string; is_us: boolean }[]
      listItems = items.map((i) => ({ ticker: i.symbol, name: i.name, is_us: i.is_us }))
    } catch {
      if (myReq === listReq) { onerror('Could not load that list. Please try again.'); listItems = [] }
    } finally {
      if (myReq === listReq) listLoading = false
    }
  }

  // Debounced load whenever a category tab is active and the tab or filter changes.
  $effect(() => {
    if (tab === 'search') { listItems = null; return }
    const key = tab
    const q = query.trim()
    const t = setTimeout(() => loadList(key, q), 180)
    return () => clearTimeout(t)
  })
</script>

<!-- Category tabs — browse instead of typing a ticker -->
<div class="flex items-center gap-2 flex-wrap {compact ? 'mb-4' : 'mb-5'}">
  {#each TABS as t (t.key)}
    <button
      type="button"
      onclick={() => selectTab(t.key)}
      class="mono-label text-[10px] px-3 py-1.5 rounded-full border transition-colors cursor-pointer {tab === t.key ? 'bg-[#171717] text-white border-[#171717]' : 'bg-white text-gray-500 border-[#e5e5e5] hover:border-[#4338ca] hover:text-[#4338ca]'}"
    >{t.label}</button>
  {/each}
</div>

<form
  class="flex {compact ? '' : 'flex-col sm:flex-row'} gap-3"
  onsubmit={(e) => { e.preventDefault(); if (tab === 'search') handleResolve() }}
>
  <input
    bind:value={query}
    placeholder={tab === 'search' ? 'AAPL, or Apple Inc.' : 'Filter this list…'}
    disabled={resolving}
    class="flex-1 px-5 py-3 bg-[#fcfbf9] border border-[#e5e5e5] rounded-full font-sans text-sm text-[#171717] placeholder:text-gray-500 focus:border-[#4338ca] transition-colors disabled:opacity-50"
  />
  {#if tab === 'search'}
    <button
      type="submit"
      disabled={resolving || !query.trim()}
      class="bg-[#171717] text-white {compact ? 'px-6' : 'px-7 duration-300'} py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-default"
    >{resolving ? 'Looking up…' : 'Look up →'}</button>
  {/if}
</form>

{@render children?.()}

{#if tab !== 'search'}
  <!-- Category list -->
  {#if listLoading && listItems === null}
    <p class="font-sans text-sm text-gray-500 {compact ? 'mt-6' : 'mt-8'}">Loading…</p>
  {:else if listItems !== null}
    {#if listItems.length === 0}
      <p class="font-sans text-sm text-gray-500 {compact ? 'mt-6' : 'mt-8'}">
        {#if query.trim()}No match for “{query.trim()}”.{:else if tab === 'graded'}You haven't graded any companies yet.{:else if tab === 'board'}Nothing on your board yet.{:else if tab === 'movers'}No movers to show right now.{:else}No companies to show.{/if}
      </p>
    {:else}
      <div class="flex flex-col {compact ? 'mt-6 gap-2 max-h-72 overflow-y-auto' : 'mt-8 gap-3'}">
        {#each listItems as c (c.ticker + c.name)}
          <button
            onclick={() => onpick(c)}
            class="text-left bg-white border border-[#e5e5e5] rounded-2xl hover:border-[#4338ca] transition-colors cursor-pointer flex items-center justify-between {compact ? 'px-4 py-3 gap-3' : 'px-5 py-4 gap-4'}"
          >
            <span class="flex flex-col min-w-0">
              <span class="font-sans text-sm text-[#171717] truncate">{c.name}</span>
              <span class="font-mono text-xs text-gray-500">{c.ticker}</span>
            </span>
            {#if c.is_us}
              <span class="mono-label text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full shrink-0">US listing</span>
            {:else}
              <span class="mono-label text-[9px] text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full shrink-0">Research only</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
{:else if candidates !== null}
  {#if candidates.length === 0}
    <p class="font-sans text-sm text-gray-500 {compact ? 'mt-6' : 'mt-8'}">
      No companies matched “{query}”.{#if !compact} Try a ticker (e.g. AAPL) or a fuller name.{/if}
    </p>
  {:else}
    <div class="flex flex-col {compact ? 'mt-6 gap-2 max-h-72 overflow-y-auto' : 'mt-8 gap-3'}">
      {#if !compact}
        <span class="mono-label text-[10px] text-gray-400">Select a company</span>
      {/if}
      {#each candidates as c (c.ticker + c.name)}
        <button
          onclick={() => onpick(c)}
          class="text-left bg-white border border-[#e5e5e5] rounded-2xl hover:border-[#4338ca] transition-colors cursor-pointer flex items-center justify-between {compact ? 'px-4 py-3 gap-3' : 'px-5 py-4 gap-4'}"
        >
          <span class="flex flex-col min-w-0">
            <span class="font-sans text-sm text-[#171717] truncate">{c.name}</span>
            <span class="font-mono text-xs text-gray-500">{c.ticker}</span>
          </span>
          {#if c.is_us}
            <span class="mono-label text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full shrink-0">US listing</span>
          {:else if compact}
            <span class="mono-label text-[9px] text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full shrink-0">Research only</span>
          {:else}
            <span class="mono-label text-[9px] text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full shrink-0 text-right leading-tight">Research only — price verdict for US listings</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
{/if}
