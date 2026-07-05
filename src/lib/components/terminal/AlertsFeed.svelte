<script lang="ts">
  import { gradeStyle } from './grade'
  import { fmtDate } from '$lib/utils'

  // Mirrors the alerts payload of routes/board/+page.server.ts.
  export type BoardAlert = {
    id: string
    company_ticker: string
    dimension: string
    old_grade: string | null
    new_grade: string
    reason: string
    read: boolean
    created_at: string
  }

  interface Props {
    alerts: BoardAlert[]
    // Marks via /api/terminal/alerts and flips `read` in the page's state.
    onread: (ids: string[]) => void
  }

  let { alerts, onread }: Props = $props()

  const unreadIds = $derived(alerts.filter((a) => !a.read).map((a) => a.id))
</script>

<section class="bg-white border border-[#e5e5e5] rounded-3xl p-6">
  <div class="flex items-center justify-between gap-4 mb-4">
    <span class="mono-label text-[10px] text-gray-400">Alerts</span>
    {#if unreadIds.length > 0}
      <button
        onclick={() => onread(unreadIds)}
        class="mono-label text-[9px] text-gray-500 hover:text-[#4338ca] bg-transparent border-none cursor-pointer transition-colors"
      >Mark all read</button>
    {/if}
  </div>

  <ol class="list-none p-0 m-0 flex flex-col">
    {#each alerts as a (a.id)}
      <li>
        <button
          onclick={() => !a.read && onread([a.id])}
          class="w-full text-left bg-transparent border-none cursor-pointer flex items-start gap-3 py-3 border-b border-[#f5f5f5] last:border-b-0 group"
        >
          <span class="w-1.5 h-1.5 rounded-full mt-2 shrink-0 {a.read ? 'bg-transparent' : 'bg-[#4338ca]'}"></span>
          <span class="min-w-0">
            <span class="font-mono text-xs text-gray-900 flex items-center gap-1.5 flex-wrap">
              <span class="font-medium">{a.company_ticker}</span>
              <span class="text-gray-400">{a.dimension}</span>
              {#if a.old_grade}
                <span class={gradeStyle(a.old_grade).text}>{a.old_grade}</span>
                <span class="text-gray-400">→</span>
              {/if}
              <span class="{gradeStyle(a.new_grade).text} font-medium">{a.new_grade}</span>
              <span class="text-gray-300 font-normal text-[10px]">· {fmtDate(a.created_at, { month: 'short', day: 'numeric' })}</span>
            </span>
            <span class="block font-sans text-[13px] leading-snug mt-1 {a.read ? 'text-gray-400' : 'text-gray-700'}">
              {a.reason}
            </span>
          </span>
        </button>
      </li>
    {:else}
      <li class="font-sans text-sm text-gray-500 py-2">
        No alerts yet — grade changes on watched companies will land here.
      </li>
    {/each}
  </ol>
</section>
