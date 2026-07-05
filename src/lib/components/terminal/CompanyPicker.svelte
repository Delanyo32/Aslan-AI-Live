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
    }
  }
</script>

<form
  class="flex {compact ? '' : 'flex-col sm:flex-row'} gap-3"
  onsubmit={(e) => { e.preventDefault(); handleResolve() }}
>
  <input
    bind:value={query}
    placeholder="AAPL, or Apple Inc."
    disabled={resolving}
    class="flex-1 px-5 py-3 bg-[#fcfbf9] border border-[#e5e5e5] rounded-full font-sans text-sm text-[#171717] placeholder:text-gray-400 focus:outline-none focus:border-[#4338ca] transition-colors disabled:opacity-50"
  />
  <button
    type="submit"
    disabled={resolving || !query.trim()}
    class="bg-[#171717] text-white {compact ? 'px-6' : 'px-7 duration-300'} py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-default"
  >{resolving ? 'Looking up…' : 'Look up →'}</button>
</form>

{@render children?.()}

{#if resolving && candidates !== null}
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
          class="text-left bg-white border border-[#e5e5e5] rounded-2xl hover:border-[#4338ca] transition-all cursor-pointer flex items-center justify-between {compact ? 'px-4 py-3 gap-3' : 'px-5 py-4 gap-4 hover:shadow-sm'}"
        >
          <span class="flex flex-col min-w-0">
            <span class="font-sans text-sm text-[#171717] truncate">{c.name}</span>
            <span class="font-mono text-xs text-gray-400">{c.ticker}</span>
          </span>
          {#if c.is_us}
            <span class="mono-label text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">US listing</span>
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
