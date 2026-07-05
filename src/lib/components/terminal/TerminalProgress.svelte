<script lang="ts">
  import { onMount } from 'svelte'
  import { subscribeSSE } from '$lib/sse'
  import { STAGE_TO_DISPLAY, DISPLAY_STAGES, dimensionFromLogLine, isReplay } from './progress-model'

  interface Props {
    sessionId: string
    companyLabel: string
    oncomplete: (slug: string) => void
    onerror: (message: string) => void
    oncancelled: () => void
  }

  let { sessionId, companyLabel, oncomplete, onerror, oncancelled }: Props = $props()

  let activeIndex = $state(-1)            // -1 until the first stage_started
  let dimensionCount = $state(0)
  const seenDimensions = new Set<string>()
  let logLines = $state<{ time: string; text: string }[]>([])
  let elapsed = $state(0)                 // seconds

  // Idempotent replay guard (see progress-model.ts). Drop any event whose
  // monotonic SSE id we've already processed, so every handler below is
  // idempotent without per-handler logic.
  let maxSeenId = 0
  function replayed(e: Event): boolean {
    const lastEventId = (e as MessageEvent).lastEventId
    if (isReplay(lastEventId, maxSeenId)) return true
    const id = Number(lastEventId)
    if (Number.isFinite(id) && id > 0) maxSeenId = id
    return false
  }

  let teardownSSE: () => void = () => {}
  let clock: ReturnType<typeof setInterval> | null = null

  function teardown() {
    if (clock) { clearInterval(clock); clock = null }
    teardownSSE()
  }

  function stamp(): string {
    return new Date().toTimeString().slice(0, 8)
  }

  function handleCancel() {
    if (!confirm('Cancel this run? No credits will be charged.')) return
    teardown()
    // Fire-and-forget: the DELETE tells the DO to stop; UI returns immediately.
    fetch(`/api/terminal/run?session_id=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {})
    oncancelled()
  }

  onMount(() => {
    clock = setInterval(() => { elapsed += 1 }, 1000)

    teardownSSE = subscribeSSE(`/api/terminal/run?session_id=${encodeURIComponent(sessionId)}`, {
      // Deviation from ProcessingLog's 45s → 60s: terminal research gaps run
      // ~2 min between events (one Exa agent run per dimension), so a short
      // window false-trips. The timer is only armed while the transport is
      // actively reconnecting and is cancelled by any received event OR by a
      // successful reconnect (cancelGraceOnOpen) — so a legitimate multi-minute
      // idle gap on a healthy socket never trips it; only a stuck reconnect does.
      graceMs: 60_000,
      cancelGraceOnOpen: true,
      onfatal: () => {
        teardown()
        onerror('Connection lost. The run continues in the background — reopen this report from your board at /board.')
      },
      on: {
        stage_started: (e) => {
          if (replayed(e)) return
          const { stage } = JSON.parse(e.data)
          const idx = STAGE_TO_DISPLAY[stage]
          if (idx !== undefined) activeIndex = Math.max(activeIndex, idx)
        },
        // Liveness only — receiving it resets the watchdog.
        stage_done: () => {},
        log: (e) => {
          if (replayed(e)) return
          const { message } = JSON.parse(e.data)
          logLines = [...logLines, { time: stamp(), text: message }]
          // Per-dimension progress: "F3 Competitive Landscape: 7 findings, …"
          const dim = dimensionFromLogLine(message)
          if (dim) {
            seenDimensions.add(dim)
            dimensionCount = Math.min(seenDimensions.size, 9)
          }
        },
        result: (e) => {
          if (replayed(e)) return
          const { slug } = JSON.parse(e.data)
          teardown()
          oncomplete(slug)
        },
        error: (e) => {
          // Named server error event carries a JSON payload — terminal.
          if (!(e instanceof MessageEvent) || !e.data) return
          try {
            const { message } = JSON.parse(e.data)
            if (replayed(e)) return
            teardown()
            onerror(message === 'cancelled' ? 'Run cancelled.' : (message || 'The run failed. Please try again.'))
          } catch {
            /* transport-level error without payload — the watchdog handles it */
          }
        }
      }
    })

    return teardown
  })

  const mmss = $derived(
    `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  )
  const latest = $derived(logLines.length ? logLines[logLines.length - 1] : null)
</script>

<div class="flex flex-col gap-6">

  <!-- Header: elapsed + honest long-run framing + cancel -->
  <div class="flex items-center justify-between gap-4 flex-wrap">
    <div class="flex flex-col gap-1">
      <span class="mono-label text-[10px] text-[#4338ca]">Building report — {companyLabel}</span>
      <span class="font-sans text-sm text-gray-500">A full run takes ~20 minutes. Leave this open, or find the finished report from the Board later.</span>
    </div>
    <div class="flex items-center gap-4 shrink-0">
      <span class="font-mono text-sm text-gray-500 tabular-nums">{mmss}</span>
      <button
        class="mono-label text-[10px] text-gray-400 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer"
        onclick={handleCancel}
      >Cancel run</button>
    </div>
  </div>

  <!-- Stage list -->
  <ol class="flex flex-col gap-0.5">
    {#each DISPLAY_STAGES as label, i}
      {@const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending'}
      <li class="flex items-center gap-3 py-2">
        <span
          class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors
            {state === 'done' ? 'bg-emerald-500' : state === 'active' ? 'bg-[#4338ca] pulse-status' : 'bg-gray-200'}"
        ></span>
        <span
          class="font-sans text-sm {state === 'pending' ? 'text-gray-400' : 'text-[#171717]'}"
        >{label}</span>
        {#if i === 2 && state !== 'pending'}
          <span class="font-mono text-xs text-gray-400 tabular-nums">{dimensionCount}/9</span>
        {/if}
        {#if state === 'done'}
          <span class="mono-label text-[9px] text-emerald-600 ml-auto">✓</span>
        {/if}
      </li>
    {/each}
  </ol>

  <!-- Latest log line ticker + recent history -->
  {#if latest}
    <div class="flex flex-col gap-2">
      <p class="font-mono text-xs text-[#4338ca] m-0 truncate">{latest.text}</p>
      {#if logLines.length > 1}
        <div class="border-l-2 border-indigo-100 pl-4 flex flex-col gap-1 max-h-48 overflow-y-auto">
          {#each logLines.slice(-10) as line}
            <div class="flex gap-3 font-mono text-xs leading-[1.6]">
              <span class="text-gray-400 shrink-0 select-none">{line.time}</span>
              <span class="text-gray-600">{line.text}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

</div>
