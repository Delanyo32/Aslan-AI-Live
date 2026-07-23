<!--
  Stock-price line chart for the grade page (daily closes at grading time).
  Plain SVG + $derived scales, same dependency-free approach as ScoreHistoryChart,
  but with an auto (unbounded) y-domain and $ formatting — prices aren't 0–100.
  The graded point (last close / price at grading) is marked and labelled.
-->
<script lang="ts">
  interface Props {
    data: { date: string; close: number }[]
    gradedPrice?: number
    height?: number
  }

  let { data, gradedPrice, height = 160 }: Props = $props()

  const series = $derived(
    [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  )

  // ── Layout ─────────────────────────────────────────────────────────────────
  const H = $derived(height)
  const MT = 12
  const MR = 44 // y-axis labels
  const MB = 20 // x-axis labels
  const ML = 4
  let cw = $state(320)
  const IW = $derived(cw - ML - MR)
  const IH = $derived(H - MT - MB)

  // ── Extents (auto y-domain, padded ~4%) ─────────────────────────────────────
  const xMin = $derived(series.length ? new Date(series[0].date).getTime() : 0)
  const xMax = $derived(series.length ? new Date(series[series.length - 1].date).getTime() : 1)
  const pMin = $derived(series.length ? Math.min(...series.map((d) => d.close)) : 0)
  const pMax = $derived(series.length ? Math.max(...series.map((d) => d.close)) : 1)
  const pad = $derived((pMax - pMin || pMax || 1) * 0.04)
  const yLo = $derived(Math.max(0, pMin - pad))
  const yHi = $derived(Math.max(pMax + pad, yLo + 0.01))
  const xSpan = $derived(xMax - xMin || 1)
  const ySpan = $derived(yHi - yLo || 1)

  const xs = (date: string) => ML + ((new Date(date).getTime() - xMin) / xSpan) * IW
  const ys = (v: number) => MT + IH - ((v - yLo) / ySpan) * IH

  const linePath = $derived.by(() => {
    if (series.length < 2) return ''
    return series.map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(d.date).toFixed(1)},${ys(d.close).toFixed(1)}`).join(' ')
  })

  const last = $derived(series.length ? series[series.length - 1] : null)
  const gradedVal = $derived(gradedPrice ?? last?.close ?? 0)

  const xTicks = $derived.by(() => {
    const n = series.length
    if (n < 2) return []
    const count = Math.min(4, n)
    return Array.from({ length: count }, (_, i) => series[Math.round((i / (count - 1)) * (n - 1))])
  })
  const yTicks = $derived([yLo, (yLo + yHi) / 2, yHi])

  const money = (n: number) =>
    n >= 1000 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // ── Hover ───────────────────────────────────────────────────────────────────
  let tip = $state<{ x: number; y: number; date: string; close: number } | null>(null)
  function onMove(e: MouseEvent) {
    if (!series.length) return
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    let best = series[0]
    let bestDist = Infinity
    for (const d of series) {
      const dist = Math.abs(xs(d.date) - mx)
      if (dist < bestDist) { bestDist = dist; best = d }
    }
    tip = { x: xs(best.date), y: ys(best.close), date: best.date, close: best.close }
  }
  const onLeave = () => (tip = null)
</script>

<div class="relative w-full text-[#4338ca]" bind:clientWidth={cw}>
  <svg width={cw} {height} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label="Stock price over time" onmousemove={onMove} onmouseleave={onLeave}>
    {#if linePath}
      <path d={linePath} fill="none" stroke="currentColor" stroke-width="1.75" />
      {#if last}
        <circle cx={xs(last.date)} cy={ys(gradedVal)} r="4" fill="currentColor" />
        <circle cx={xs(last.date)} cy={ys(gradedVal)} r="7" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4" />
      {/if}
    {/if}

    {#each xTicks as t, i (t.date)}
      <text x={xs(t.date)} y={H - 6} fill="#9ca3af" font-size="10" font-family="'IBM Plex Mono', monospace" text-anchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>{fmtDate(t.date)}</text>
    {/each}
    {#each yTicks as v, i (i)}
      <text x={cw - 2} y={ys(v) + 3} fill="#9ca3af" font-size="10" font-family="'IBM Plex Mono', monospace" text-anchor="end">{money(v)}</text>
    {/each}

    {#if tip}
      <line x1={tip.x} y1={MT} x2={tip.x} y2={H - MB} stroke="#9ca3af" stroke-width="1" stroke-dasharray="3,3" />
      <circle cx={tip.x} cy={tip.y} r="3.5" fill="currentColor" />
    {/if}
  </svg>

  {#if tip}
    <div class="absolute bg-white border border-[#e5e5e5] rounded-md py-1 px-2 pointer-events-none flex flex-col gap-0.5" style:left="{Math.min(tip.x + 8, cw - 96)}px" style:top="{Math.max(tip.y - 40, 0)}px">
      <span class="font-mono text-[10px] text-gray-400">{fmtDate(tip.date)}</span>
      <span class="font-mono text-xs text-gray-900">{money(tip.close)}</span>
    </div>
  {/if}
</div>

<style>
  svg { display: block; }
</style>
