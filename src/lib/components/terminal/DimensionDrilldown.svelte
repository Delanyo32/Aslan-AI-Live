<script lang="ts">
  import { Dialog } from 'bits-ui'
  import type { DimensionId, ScreenHit } from '$lib/types/terminal'
  import { DIMENSION_IDS } from '$lib/types/terminal'
  import { DIMENSION_NAMES, gradeStyle, CONFIDENCE_LABEL, TREND, type Trend, citationDomain, faviconUrl } from './grade'
  import ScoreHistoryChart from '$lib/components/charts/ScoreHistoryChart.svelte'
  import { fmtDate } from '$lib/utils'
  import type { Confidence } from '$lib/types/terminal'

  interface Props {
    companyId: string
    dimension: string
    // Latest grade per dimension — lets the composite view list the nine frameworks.
    dimensions?: Record<string, { grade: string; score: number; confidence: string; trend: string }>
    onselect?: (dim: string) => void
    onclose: () => void
  }

  let { companyId, dimension, dimensions, onselect, onclose }: Props = $props()

  // Response shape of /board/drilldown/[company]/[dimension].
  type HistoryRow = {
    id: string
    grade: string
    score: number
    confidence: Confidence
    flags: ScreenHit[]
    evidence_hash: string
    rubric_version: string
    report_id: string | null
    created_at: string
  }
  type EvidenceRow = {
    id: string
    url: string
    title: string | null
    source_domain: string
    published_at: string | null
    snippet: string | null
    origin: string
    created_at: string
  }
  type Payload = {
    company: { ticker: string; name: string }
    history: HistoryRow[]
    evidence: EvidenceRow[]
  }

  let payload = $state<Payload | null>(null)
  let failed = $state(false)

  $effect(() => {
    payload = null
    failed = false
    fetch(`/board/drilldown/${companyId}/${dimension}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body) => (payload = body))
      .catch(() => (failed = true))
  })

  const dimName = $derived(
    dimension === 'composite' ? 'Aslan Score' : DIMENSION_NAMES[dimension as DimensionId]
  )
  const latest = $derived(payload?.history[0] ?? null)

  // History is newest-first; delta of row i is vs the next (older) row.
  function delta(rows: HistoryRow[], i: number): number | null {
    return i + 1 < rows.length ? rows[i].score - rows[i + 1].score : null
  }
</script>

<!-- Right-side drill-down panel. Mounted only while open — closing just tells the parent. -->
<Dialog.Root bind:open={() => true, (o) => { if (!o) onclose() }}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/20 z-[200]" />
    <Dialog.Content class="fixed right-0 top-0 h-full w-full max-w-xl bg-white border-l border-[#e5e5e5] overflow-y-auto z-[201]">
    <div class="p-8 flex flex-col gap-8">

      <div class="flex items-start justify-between gap-4">
        <div>
          {#if dimension !== 'composite' && onselect}
            <button onclick={() => onselect('composite')} class="mono-label text-[10px] text-gray-400 hover:text-[#4338ca] bg-transparent border-none p-0 mb-2 cursor-pointer transition-colors">← Aslan Score</button>
          {/if}
          <span class="mono-label text-[10px] text-gray-400 block mb-1">
            {payload?.company.ticker ?? ''} · {dimension === 'composite' ? 'Aslan Score' : dimension}
          </span>
          <Dialog.Title level={3} class="font-serif text-2xl text-[#171717] leading-snug">{dimName}</Dialog.Title>
        </div>
        <button
          onclick={onclose}
          class="mono-label text-[10px] text-gray-400 hover:text-black bg-transparent border border-[#e5e5e5] rounded-full px-3 py-1.5 cursor-pointer transition-colors shrink-0"
        >Close ✕</button>
      </div>

      {#if failed}
        <p class="font-sans text-sm text-gray-500">Could not load this drill-down. Try again.</p>
      {:else if !payload}
        <p class="font-sans text-sm text-gray-400 animate-pulse">Loading…</p>
      {:else}
        <!-- Latest grade -->
        {#if latest}
          {@const style = gradeStyle(latest.grade)}
          <div class="flex items-center gap-5">
            <div class="flex items-center justify-center w-16 h-16 rounded-xl border-2 {style.border} {style.bg} shrink-0">
              <span class="font-serif text-3xl leading-none {style.text}">{latest.grade}</span>
            </div>
            <div class="font-mono text-[11px] text-gray-500 flex flex-col gap-1 min-w-0">
              <span class="text-gray-900 text-sm">{latest.score}<span class="text-gray-400">/100</span> · {CONFIDENCE_LABEL[latest.confidence]}</span>
              <span>rubric v{latest.rubric_version} · {fmtDate(latest.created_at)}</span>
            </div>
            {#if payload.history.length >= 2}
              <div class="ml-auto w-28 shrink-0" title="{payload.history.length} grades over time">
                <ScoreHistoryChart
                  data={payload.history.map((h) => ({ date: h.created_at, score: h.score }))}
                  mini
                  colorClass={style.text}
                  height={40}
                />
              </div>
            {/if}
          </div>
        {/if}

        <!-- Composite: the nine frameworks, each a drill-in (keeps the board a focus list). -->
        {#if dimension === 'composite' && dimensions}
          <section>
            <span class="mono-label text-[10px] text-gray-400 block mb-2">Dimensions</span>
            <div class="flex flex-col">
              {#each DIMENSION_IDS as id}
                {@const dc = dimensions[id]}
                {#if dc}
                  {@const st = gradeStyle(dc.grade)}
                  {@const tr = TREND[dc.trend as Trend]}
                  <button
                    onclick={() => onselect?.(id)}
                    class="flex items-center gap-3 py-2.5 border-b border-[#f5f5f5] last:border-b-0 text-left group cursor-pointer bg-transparent"
                  >
                    <span class="font-mono text-[10px] text-gray-400 w-5 shrink-0">{id}</span>
                    <span class="font-sans text-[13px] text-gray-700 group-hover:text-[#4338ca] transition-colors flex-1 truncate">{DIMENSION_NAMES[id]}</span>
                    <span class="font-mono text-[11px] text-gray-400 tabular-nums">{dc.score}</span>
                    <span class="text-[11px] {tr.class} w-3 text-center shrink-0">{tr.arrow}</span>
                    <span class="font-serif text-base leading-none {st.text} w-6 text-center shrink-0">{dc.grade}</span>
                  </button>
                {/if}
              {/each}
            </div>
          </section>
        {/if}

        <!-- Grade history (append-only dimension_scores rows, newest first) -->
        <section>
          <span class="mono-label text-[10px] text-gray-400 block mb-3">Grade history</span>
          <ol class="list-none p-0 m-0 flex flex-col">
            {#each payload.history as h, i (h.id)}
              {@const style = gradeStyle(h.grade)}
              {@const d = delta(payload.history, i)}
              <li class="flex items-start gap-3 py-3 border-b border-[#f5f5f5] last:border-b-0">
                <span class="font-serif text-lg leading-none {style.text} w-6 text-center shrink-0 mt-0.5">{h.grade}</span>
                <div class="min-w-0 font-mono text-[11px] text-gray-500 flex flex-col gap-0.5">
                  <span class="text-gray-900">
                    {h.score}/100
                    {#if d !== null}
                      <span class={d < 0 ? 'text-red-600' : d > 0 ? 'text-emerald-600' : 'text-gray-400'}>
                        ({d > 0 ? '+' : ''}{d})
                      </span>
                    {/if}
                    · {h.confidence}
                  </span>
                  <span>{fmtDate(h.created_at)} · {h.report_id ? 'report run' : 'watchlist rescore'}</span>
                  {#each h.flags as flag}
                    <div class="border border-red-200 bg-red-50/60 rounded-lg px-2.5 py-1.5 mt-1 font-sans text-[12px] text-red-800 leading-snug">
                      <span class="mono-label text-[8px] text-red-700 block mb-0.5">Flag · {flag.status} · {flag.action}</span>
                      {flag.summary}
                      {#if flag.detail}
                        <span class="block text-red-700/70 mt-1 pt-1 border-t border-red-200">{flag.detail}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </li>
            {:else}
              <li class="font-sans text-sm text-gray-500 py-3">No grades yet for this dimension.</li>
            {/each}
          </ol>
        </section>

        <!-- Evidence trail (per-dimension; composite drills in via Dimensions above) -->
        {#if dimension !== 'composite'}
        <section>
          <span class="mono-label text-[10px] text-gray-400 block mb-3">Evidence trail · {payload.evidence.length}</span>
          <ul class="list-none p-0 m-0 flex flex-col gap-3">
            {#each payload.evidence as e (e.id)}
              <li>
                <a href={e.url} target="_blank" rel="noopener noreferrer"
                  class="flex items-start gap-2.5 no-underline group">
                  <img src={faviconUrl(e.url)} alt="" width="14" height="14" class="mt-1 rounded-sm shrink-0 opacity-70" loading="lazy" />
                  <span class="min-w-0">
                    <span class="font-mono text-[10px] text-gray-400">
                      {citationDomain(e.url)} · {e.published_at ? fmtDate(e.published_at) : fmtDate(e.created_at)} · {e.origin.replace('_', ' ')}
                    </span>
                    <span class="block font-sans text-[13px] text-gray-700 group-hover:text-black group-hover:underline leading-snug truncate">
                      {e.title ?? e.url}
                    </span>
                    {#if e.snippet}
                      <span class="block font-sans text-[12px] text-gray-400 leading-snug line-clamp-2">{e.snippet}</span>
                    {/if}
                  </span>
                </a>
              </li>
            {:else}
              <li class="font-sans text-sm text-gray-500">No evidence items tagged with this dimension yet.</li>
            {/each}
          </ul>
        </section>
        {/if}
      {/if}
    </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
