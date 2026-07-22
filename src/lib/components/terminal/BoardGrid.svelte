<script lang="ts">
  import type { DimensionId } from '$lib/types/terminal'
  import { DIMENSION_NAMES, DIMENSION_SHORT, gradeStyle, TREND, type Trend } from './grade'

  // Mirrors BoardRow in the dashboard loader (server-only module).
  type Cell = { grade: string; score: number; confidence: string; trend: Trend }
  type Row = {
    company: { id: string; ticker: string; name: string; is_us: boolean }
    cells: Record<string, Cell>
    deterioration: number
    latest_slug: string | null
    flagged: boolean
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

  const COLUMNS = ['composite', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'] as const
  const DIMS = COLUMNS.filter((c) => c !== 'composite') as DimensionId[]

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

  function colTitle(col: string): string {
    return col === 'composite' ? 'Aslan Score' : DIMENSION_NAMES[col as DimensionId]
  }
</script>

<div class="bg-white border border-[#e5e5e5] rounded-3xl overflow-hidden">
  <!-- Sort control -->
  <div class="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] flex-wrap">
    <span class="mono-label text-[9px] text-gray-400">Sort</span>
    {#each [['deteriorating', 'Most deteriorating'], ['name', 'Name'], ['composite', 'Composite']] as [mode, label]}
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
    <table class="w-full border-collapse font-mono text-xs">
      <thead>
        <tr class="border-b border-[#e5e5e5]">
          <th class="text-left px-5 py-3 mono-label text-[9px] text-gray-400 font-normal">Company</th>
          {#each COLUMNS as col}
            <th class="px-2 py-3 mono-label text-[9px] text-gray-400 font-normal text-center" title={colTitle(col)}>
              {col === 'composite' ? 'Score' : col}
            </th>
          {/each}
          <th class="px-5 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as row (row.company.id)}
          <tr class="border-b border-[#f5f5f5] last:border-b-0 hover:bg-[#fcfbf9] transition-colors">
            <td class="px-5 py-3 whitespace-nowrap">
              {#if row.latest_slug}
                <a href={`/terminal/${row.latest_slug}`} class="no-underline group">
                  <span class="text-sm text-[#171717] font-medium group-hover:text-[#4338ca] transition-colors">{row.company.ticker}</span>
                  <span class="block font-sans text-[11px] text-gray-400 max-w-[180px] truncate">{row.company.name}</span>
                </a>
              {:else}
                <span class="text-sm text-[#171717] font-medium">{row.company.ticker}</span>
                <span class="block font-sans text-[11px] text-gray-400 max-w-[180px] truncate">{row.company.name}</span>
              {/if}
              {#if row.flagged}
                <span class="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-red-700" title="Confirmed red-flag in the latest report">
                  <iconify-icon icon="lucide:flag" class="text-xs"></iconify-icon> Red flag
                </span>
              {/if}
              {#if row.deterioration > 0}
                <span class="block text-[10px] text-red-600 mt-0.5">−{row.deterioration} pts / 30d</span>
              {/if}
            </td>
            {#each COLUMNS as col}
              {@const cell = row.cells[col]}
              <td class="px-1.5 py-2 text-center">
                {#if cell}
                  {@const style = gradeStyle(cell.grade)}
                  {@const trend = TREND[cell.trend]}
                  <button
                    onclick={() => oncell(row, col)}
                    title={`${colTitle(col)} — ${cell.score}/100 · ${trend.label} · ${cell.confidence} confidence`}
                    class="inline-flex items-center justify-center gap-1 min-w-[52px] px-2 py-1.5 rounded-lg border {style.border} {cell.confidence === 'low' ? 'border-dashed' : ''} {style.bg} cursor-pointer hover:ring-2 hover:ring-[#4338ca]/30 transition-shadow"
                  >
                    <span class="font-serif text-sm leading-none {style.text}">{cell.grade}</span>
                    <span class="text-[11px] leading-none {trend.class}">{trend.arrow}</span>
                  </button>
                {:else}
                  <span class="text-gray-300">·</span>
                {/if}
              </td>
            {/each}
            <td class="px-5 py-3 whitespace-nowrap text-right">
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
            <td colspan={COLUMNS.length + 2} class="px-5 py-12 text-center font-sans text-sm text-gray-500">
              Nothing on the board yet — add a company to start monitoring its nine health frameworks.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Legend: decode the columns and the low-confidence convention without hovering. -->
  <div class="px-5 py-3 border-t border-[#f0f0f0] flex flex-wrap items-center gap-x-4 gap-y-1.5">
    <span class="font-mono text-[11px] text-gray-600"><span class="text-[#4338ca] font-medium">Score</span> Aslan Score</span>
    {#each DIMS as id}
      <span class="font-mono text-[11px] text-gray-600"><span class="text-[#4338ca] font-medium">{id}</span> {DIMENSION_SHORT[id]}</span>
    {/each}
    <span class="font-mono text-[11px] text-gray-500 inline-flex items-center gap-1.5">
      <span class="w-4 h-3 rounded border border-dashed border-gray-400 inline-block"></span> low confidence
    </span>
  </div>
</div>
