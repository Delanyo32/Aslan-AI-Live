<script lang="ts">
  import type { DimensionId } from '$lib/types/terminal'
  import { DIMENSION_NAMES, DIMENSION_SHORT, gradeStyle, TREND, type Trend } from './grade'
  import ScoreHistoryChart from '$lib/components/charts/ScoreHistoryChart.svelte'

  // Mirrors BoardRow in the dashboard loader (server-only module).
  type Cell = { grade: string; score: number; confidence: string; trend: Trend }
  type Mover = { dim: string; from: string; to: string; delta: number } | null
  type Row = {
    company: { id: string; ticker: string; name: string; is_us: boolean }
    cells: Record<string, Cell>
    deterioration: number
    latest_slug: string | null
    flagged: boolean
    composite_series: { date: string; score: number }[]
    mover: Mover
  }

  interface Props {
    rows: Row[]
    rerunCost: number
    reportCost: number
    runningIds?: Set<string>
    oncell: (row: Row, dimension: string) => void
    onrefresh: (row: Row) => void
    onrun: (row: Row) => void
    onunwatch: (row: Row) => void
  }

  let { rows, rerunCost, reportCost, runningIds = new Set(), oncell, onrefresh, onrun, onunwatch }: Props = $props()

  type SortMode = 'deteriorating' | 'name' | 'composite'
  let sort = $state<SortMode>('deteriorating')

  const sorted = $derived.by(() => {
    const copy = [...rows]
    if (sort === 'name') copy.sort((a, b) => a.company.ticker.localeCompare(b.company.ticker))
    else if (sort === 'composite')
      copy.sort((a, b) => (b.cells.composite?.score ?? -1) - (a.cells.composite?.score ?? -1))
    else copy.sort((a, b) => b.deterioration - a.deterioration)
    return copy
  })
</script>

<div class="bg-white border border-[#e5e5e5] rounded-3xl overflow-hidden">
  <!-- Sort control -->
  <div class="flex items-center gap-2 px-6 py-3.5 border-b border-[#f0f0f0] flex-wrap">
    <span class="mono-label text-[9px] text-gray-400">Sort</span>
    {#each [['deteriorating', 'Most deteriorating'], ['name', 'Name'], ['composite', 'Score']] as [mode, label]}
      <button
        onclick={() => (sort = mode as SortMode)}
        class="mono-label text-[9px] px-3 py-1.5 rounded-full border transition-colors cursor-pointer
          {sort === mode
            ? 'bg-[#171717] text-white border-[#171717]'
            : 'bg-white text-gray-500 border-[#e5e5e5] hover:border-gray-400'}"
      >{label}</button>
    {/each}
  </div>

  <div class="overflow-x-auto">
    <table class="w-full border-collapse">
      <thead>
        <tr class="border-b border-[#e5e5e5]">
          <th class="text-left px-6 py-3 mono-label text-[9px] text-gray-400 font-normal">Company</th>
          <th class="text-left px-3 py-3 mono-label text-[9px] text-gray-400 font-normal">Aslan Score</th>
          <th class="text-left px-3 py-3 mono-label text-[9px] text-gray-400 font-normal">90-day trend</th>
          <th class="text-left px-3 py-3 mono-label text-[9px] text-gray-400 font-normal">Biggest move</th>
          <th class="px-6 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as row (row.company.id)}
          {@const c = row.cells.composite}
          <tr class="border-b border-[#f5f5f5] last:border-b-0 hover:bg-[#fcfbf9] transition-colors">
            <!-- Company -->
            <td class="px-6 py-4 align-middle whitespace-nowrap">
              {#if row.latest_slug}
                <a href={`/terminal/${row.latest_slug}`} class="no-underline group">
                  <span class="font-mono text-sm text-[#171717] font-medium group-hover:text-[#4338ca] transition-colors">{row.company.ticker}</span>
                  <span class="block font-sans text-[11px] text-gray-400 max-w-[220px] truncate">{row.company.name}</span>
                </a>
              {:else}
                <span class="font-mono text-sm text-[#171717] font-medium">{row.company.ticker}</span>
                <span class="block font-sans text-[11px] text-gray-400 max-w-[220px] truncate">{row.company.name}</span>
              {/if}
              {#if row.flagged}
                <span class="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-red-700" title="Confirmed red-flag in the latest report">
                  <iconify-icon icon="lucide:flag" class="text-xs"></iconify-icon> Red flag
                </span>
              {/if}
            </td>

            <!-- Aslan Score -->
            <td class="px-3 py-4 align-middle whitespace-nowrap">
              {#if c}
                {@const style = gradeStyle(c.grade)}
                {@const trend = TREND[c.trend]}
                <button
                  onclick={() => oncell(row, 'composite')}
                  title={`Aslan Score — ${c.score}/100 · ${trend.label} · ${c.confidence} confidence`}
                  class="inline-flex items-center gap-2 cursor-pointer"
                >
                  <span class="inline-flex items-center gap-1 rounded-lg border {style.border} {style.bg} px-2.5 py-1
                    {c.confidence === 'low' ? 'border-dashed' : ''}">
                    <span class="font-serif text-lg leading-none {style.text}">{c.grade}</span>
                    <span class="text-xs leading-none {trend.class}">{trend.arrow}</span>
                  </span>
                  <span class="font-mono text-xs text-gray-500 tabular-nums">{c.score}<span class="text-gray-300">/100</span></span>
                </button>
              {:else}
                <span class="text-gray-300">·</span>
              {/if}
            </td>

            <!-- 90-day trend sparkline -->
            <td class="px-3 py-4 align-middle">
              {#if row.composite_series.length >= 2}
                {@const style = gradeStyle(c?.grade ?? 'C')}
                <button onclick={() => oncell(row, 'composite')} class="block w-28 cursor-pointer align-middle" title="Open score history">
                  <ScoreHistoryChart data={row.composite_series} mini colorClass={style.text} height={34} />
                </button>
              {:else}
                <span class="font-mono text-[10px] text-gray-400">building…</span>
              {/if}
            </td>

            <!-- Biggest move -->
            <td class="px-3 py-4 align-middle whitespace-nowrap">
              {#if row.mover}
                {@const mv = row.mover}
                {@const down = mv.delta < 0}
                <button
                  onclick={() => oncell(row, mv.dim)}
                  title={`Open ${DIMENSION_NAMES[mv.dim as DimensionId]} · ${mv.from} → ${mv.to}`}
                  class="inline-flex items-center gap-1.5 cursor-pointer group"
                >
                  <span class="font-sans text-[12px] text-gray-500 group-hover:text-[#4338ca] transition-colors">{DIMENSION_SHORT[mv.dim as DimensionId]}</span>
                  <span class="font-serif text-sm leading-none {gradeStyle(mv.from).text} opacity-50">{mv.from}</span>
                  <span class="text-[11px] leading-none {down ? 'text-red-600' : 'text-emerald-600'}">{down ? '↓' : '↑'}</span>
                  <span class="font-serif text-sm leading-none {gradeStyle(mv.to).text}">{mv.to}</span>
                </button>
              {:else}
                <span class="font-mono text-[11px] text-gray-400">— stable</span>
              {/if}
            </td>

            <!-- Actions -->
            <td class="px-6 py-4 align-middle whitespace-nowrap text-right">
              {#if runningIds.has(row.company.id)}
                <span class="inline-flex items-center gap-1.5 mono-label text-[9px] text-[#4338ca] border border-[#e5e5e5] rounded-full px-3 py-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#4338ca] pulse-status"></span> Running…
                </span>
              {:else if row.latest_slug}
                <button
                  onclick={() => onrefresh(row)}
                  title={`Re-run report · ${rerunCost} credits`}
                  class="mono-label text-[9px] text-gray-500 hover:text-[#4338ca] bg-transparent border border-[#e5e5e5] hover:border-[#4338ca] rounded-full px-3 py-1.5 cursor-pointer transition-colors"
                >Refresh now</button>
              {:else}
                <button
                  onclick={() => onrun(row)}
                  title={`Run first report · ${reportCost} credits`}
                  class="mono-label text-[9px] text-white bg-[#171717] hover:bg-[#4338ca] border border-[#171717] rounded-full px-3 py-1.5 cursor-pointer transition-colors"
                >Run first report</button>
              {/if}
              <button
                onclick={() => onunwatch(row)}
                title="Remove from board"
                class="mono-label text-[9px] text-gray-500 hover:text-red-600 bg-transparent border-none cursor-pointer ml-2 transition-colors"
              >Unwatch</button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="px-6 py-12 text-center font-sans text-sm text-gray-500">
              Nothing on the board yet — add a company to start monitoring its nine health frameworks.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
