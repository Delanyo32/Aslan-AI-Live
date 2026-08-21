<!--
  Multi-series line chart for /research (plain SVG, PriceChart's approach).
  x = evenly spaced category labels (quarters or years), y = zero-based unless
  auto. Wide: direct labels at line ends (dataviz relief rule). Narrow
  (<520px): a legend row replaces the end labels so the plot keeps its width.
  Crosshair tooltip on hover.
-->
<script lang="ts">
  import { BASELINE, GRID, INK_LABEL, INK_MUTED, fmtQ } from './viz'

  interface Series { label: string; color: string; dashed?: boolean; values: (number | null)[] }
  interface Props {
    labels: string[]
    series: Series[]
    yFmt: (v: number) => string
    height?: number
    yBase?: 'zero' | 'auto'
    ariaLabel: string
  }
  let { labels, series, yFmt, height = 240, yBase = 'zero', ariaLabel }: Props = $props()

  const MT = 12
  const MB = 20
  const ML = 4
  let cw = $state(640)
  const compact = $derived(cw < 520)
  const MR = $derived(compact ? 12 : 110)
  const IW = $derived(cw - ML - MR)
  const IH = $derived(height - MT - MB)

  const vals = $derived(series.flatMap((s) => s.values).filter((v): v is number => v !== null))
  const yMax = $derived(vals.length ? Math.max(...vals) * 1.05 : 1)
  const yMin = $derived(yBase === 'zero' ? 0 : vals.length ? Math.min(...vals) * 0.95 : 0)
  const xs = (i: number) => ML + (labels.length > 1 ? (i / (labels.length - 1)) * IW : IW / 2)
  const ys = (v: number) => MT + IH - ((v - yMin) / (yMax - yMin || 1)) * IH

  const path = (s: Series) => {
    let d = ''
    let pen = false
    s.values.forEach((v, i) => {
      if (v === null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`
      pen = true
    })
    return d
  }

  const lastIdx = (s: Series) => { for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return i; return -1 }

  // Direct labels, nudged apart when line ends collide.
  const endLabels = $derived.by(() => {
    const raw = series
      .map((s) => ({ s, i: lastIdx(s) }))
      .filter((e) => e.i >= 0)
      .map((e) => ({ label: e.s.label, color: e.s.color, y: ys(e.s.values[e.i]!) }))
      .sort((a, b) => a.y - b.y)
    for (let i = 1; i < raw.length; i++) if (raw[i].y - raw[i - 1].y < 14) raw[i].y = raw[i - 1].y + 14
    return raw
  })

  const yTicks = $derived([yMin, (yMin + yMax) / 2, yMax])
  const xTickIdx = $derived.by(() => {
    const n = labels.length
    if (n < 2) return [0]
    const count = Math.min(compact ? 4 : 5, n)
    return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (n - 1)))
  })

  let tip = $state<{ i: number; x: number } | null>(null)
  function onMove(e: MouseEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    let best = 0
    for (let i = 0; i < labels.length; i++) if (Math.abs(xs(i) - mx) < Math.abs(xs(best) - mx)) best = i
    tip = { i: best, x: xs(best) }
  }
</script>

<div class="relative w-full" bind:clientWidth={cw}>
  {#if compact && series.length > 1}
    <div class="flex items-center gap-4 mb-2 flex-wrap">
      {#each series as s (s.label)}
        <span class="font-mono text-[10px] flex items-center gap-1.5" style:color={INK_LABEL}>
          <span class="w-2 h-2 rounded-full inline-block" style:background={s.color}></span>{s.label}
        </span>
      {/each}
    </div>
  {/if}
  <svg width={cw} {height} viewBox={`0 0 ${cw} ${height}`} role="img" aria-label={ariaLabel} onmousemove={onMove} onmouseleave={() => (tip = null)}>
    {#each yTicks as v, i (i)}
      <line x1={ML} y1={ys(v)} x2={ML + IW} y2={ys(v)} stroke={i === 0 ? BASELINE : GRID} stroke-width="1" />
    {/each}
    {#each series as s (s.label)}
      <path d={path(s)} fill="none" stroke={s.color} stroke-width="2" stroke-dasharray={s.dashed ? '5,4' : undefined} stroke-linejoin="round" />
    {/each}
    {#if !compact}
      {#each endLabels as l (l.label)}
        <circle cx={ML + IW + 6} cy={l.y} r="3" fill={l.color} />
        <text x={ML + IW + 12} y={l.y + 3} font-size="10" font-family="'IBM Plex Mono', monospace" fill={INK_LABEL}>{l.label}</text>
      {/each}
    {/if}
    {#each xTickIdx as i, k (i)}
      <text x={xs(i)} y={height - 5} font-size="10" font-family="'IBM Plex Mono', monospace" fill={INK_MUTED} text-anchor={i === 0 ? 'start' : k === xTickIdx.length - 1 ? 'end' : 'middle'}>{fmtQ(labels[i])}</text>
    {/each}
    {#each yTicks.slice(1) as v, i (i)}
      <text x={ML + 2} y={ys(v) - 4} font-size="10" font-family="'IBM Plex Mono', monospace" fill={INK_MUTED}>{yFmt(v)}</text>
    {/each}
    {#if tip}
      <line x1={tip.x} y1={MT} x2={tip.x} y2={MT + IH} stroke={INK_MUTED} stroke-width="1" stroke-dasharray="3,3" />
      {#each series as s (s.label)}
        {#if s.values[tip.i] !== null}
          <circle cx={tip.x} cy={ys(s.values[tip.i]!)} r="3.5" fill={s.color} />
        {/if}
      {/each}
    {/if}
  </svg>

  {#if tip}
    <div class="absolute bg-white border border-[#e5e5e5] rounded-md py-1.5 px-2.5 pointer-events-none flex flex-col gap-0.5 z-10"
      style:left="{Math.min(tip.x + 10, cw - 150)}px" style:top="0px">
      <span class="font-mono text-[10px] text-gray-500">{labels[tip.i]}</span>
      {#each series as s (s.label)}
        {#if s.values[tip.i] !== null}
          <span class="font-mono text-[11px] text-gray-900 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full inline-block" style:background={s.color}></span>
            {s.label}: {yFmt(s.values[tip.i]!)}
          </span>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  svg { display: block; }
</style>
