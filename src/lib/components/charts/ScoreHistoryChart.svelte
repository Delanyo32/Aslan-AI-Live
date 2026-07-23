<!--
  Score-over-time line chart for the terminal board (dimension_scores history).
  Plain SVG + Svelte 5 $derived scales — same dependency-free approach as
  PortfolioChart. Two modes:
    - full (default): padded y-axis, date x-axis, hover tooltip. Drill-down panel.
    - mini: bare sparkline (no axes/tooltip), for a board-cell composite trend.
  y-domain is padded (not fixed 0–100) so small real moves stay visible; the
  line takes its colour from the caller via `currentColor` (grade colour class).
-->
<script lang="ts">
  interface Props {
    data: { date: string; score: number; grade?: string }[]
    mini?: boolean
    colorClass?: string // tailwind text-* class → line/dot via currentColor
    height?: number
  }

  let { data, mini = false, colorClass = 'text-[#171717]', height }: Props = $props()

  // Oldest → newest, left → right (callers may pass newest-first).
  const series = $derived(
    [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  )

  // ── Layout ─────────────────────────────────────────────────────────────────
  const H = $derived(height ?? (mini ? 28 : 140))
  const MT = $derived(mini ? 3 : 10)
  const MR = $derived(mini ? 3 : 30) // right — y-axis labels (full only)
  const MB = $derived(mini ? 3 : 20) // bottom — x-axis labels (full only)
  const ML = 3

  let cw = $state(320) // container width seed; bind:clientWidth sets the real value on mount
  const IW = $derived(cw - ML - MR)
  const IH = $derived(H - MT - MB)

  // ── Data extents ───────────────────────────────────────────────────────────
  const xMin = $derived(series.length ? new Date(series[0].date).getTime() : 0)
  const xMax = $derived(series.length ? new Date(series[series.length - 1].date).getTime() : 1)
  const sMin = $derived(series.length ? Math.min(...series.map((d) => d.score)) : 0)
  const sMax = $derived(series.length ? Math.max(...series.map((d) => d.score)) : 100)
  // Pad ±5, clamp to [0,100]; guarantee a non-zero span for a flat line.
  const yLo = $derived(Math.max(0, Math.min(sMin - 5, 95)))
  const yHi = $derived(Math.min(100, Math.max(sMax + 5, yLo + 1)))
  const xSpan = $derived(xMax - xMin || 1)
  const ySpan = $derived(yHi - yLo || 1)

  // ── Scale helpers ──────────────────────────────────────────────────────────
  function xs(date: string): number {
    return ML + ((new Date(date).getTime() - xMin) / xSpan) * IW
  }
  function ys(score: number): number {
    return MT + IH - ((score - yLo) / ySpan) * IH
  }

  const linePath = $derived.by(() => {
    if (series.length < 2) return ''
    return series
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(d.date).toFixed(1)},${ys(d.score).toFixed(1)}`)
      .join(' ')
  })

  // ── Axis ticks (full only) ──────────────────────────────────────────────────
  const xTicks = $derived.by(() => {
    const n = series.length
    if (mini || n < 2) return []
    const count = Math.min(4, n)
    return Array.from({ length: count }, (_, i) => series[Math.round((i / (count - 1)) * (n - 1))])
  })
  const yTicks = $derived.by(() => {
    if (mini || !series.length) return [] as number[]
    return [yLo, (yLo + yHi) / 2, yHi]
  })

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // ── Tooltip (full only) ─────────────────────────────────────────────────────
  let tip = $state<{ x: number; y: number; date: string; score: number; grade?: string } | null>(null)

  function onMove(e: MouseEvent) {
    if (mini || !series.length) return
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    let best = series[0]
    let bestDist = Infinity
    for (const d of series) {
      const dist = Math.abs(xs(d.date) - mx)
      if (dist < bestDist) {
        bestDist = dist
        best = d
      }
    }
    tip = { x: xs(best.date), y: ys(best.score), date: best.date, score: best.score, grade: best.grade }
  }
  function onLeave() {
    tip = null
  }
</script>

<div class="relative w-full {colorClass}" bind:clientWidth={cw}>
  <svg
    width={cw}
    height={H}
    viewBox={`0 0 ${cw} ${H}`}
    role="img"
    aria-label="Score over time"
    onmousemove={onMove}
    onmouseleave={onLeave}
  >
    {#if linePath}
      <path d={linePath} fill="none" stroke="currentColor" stroke-width={mini ? 1.25 : 1.75} />
      <!-- Last point marker -->
      {#if series.length}
        <circle cx={xs(series[series.length - 1].date)} cy={ys(series[series.length - 1].score)} r={mini ? 1.75 : 3} fill="currentColor" />
      {/if}
    {/if}

    {#if !mini}
      {#each xTicks as t, i (t.date)}
        <text
          x={xs(t.date)}
          y={H - 6}
          fill="var(--text-muted, #9ca3af)"
          font-size="10"
          text-anchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
        >{fmtDate(t.date)}</text>
      {/each}
      {#each yTicks as v, i (i)}
        <text x={cw - 2} y={ys(v) + 3} fill="var(--text-muted, #9ca3af)" font-size="10" font-family="'IBM Plex Mono', monospace" text-anchor="end">{Math.round(v)}</text>
      {/each}

      {#if tip}
        <line x1={tip.x} y1={MT} x2={tip.x} y2={H - MB} stroke="var(--text-muted, #9ca3af)" stroke-width="1" stroke-dasharray="3,3" />
        <circle cx={tip.x} cy={tip.y} r="4" fill="currentColor" />
      {/if}
    {/if}
  </svg>

  {#if !mini && tip}
    <div
      class="absolute bg-white border border-[#e5e5e5] rounded-md py-1 px-2 pointer-events-none flex flex-col gap-0.5"
      style:left="{Math.min(tip.x + 8, cw - 96)}px"
      style:top="{Math.max(tip.y - 40, 0)}px"
    >
      <span class="font-mono text-[10px] text-gray-400">{fmtDate(tip.date)}</span>
      <span class="font-mono text-xs text-gray-900">{tip.score}/100{tip.grade ? ` · ${tip.grade}` : ''}</span>
    </div>
  {/if}
</div>

<style>
  svg {
    display: block;
  }
</style>
