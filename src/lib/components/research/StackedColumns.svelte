<!--
  Vertical stacked columns with 2px surface gaps between segments (dataviz mark
  spec). Used for the obligation wall bands and the filed-vs-reality year pairs.
  `sub` groups adjacent columns under one shared label (e.g. a year).
-->
<script lang="ts">
  import { BASELINE, INK_LABEL, INK_MUTED } from './viz'

  interface Part { label: string; value: number; color: string }
  interface Col { label: string; sub?: string; parts: Part[] }
  interface Props { cols: Col[]; fmt: (v: number) => string; height?: number }
  let { cols, fmt, height = 220 }: Props = $props()

  const MT = 22 // top total labels
  const MB = 34 // column + group labels
  let cw = $state(640)
  const IH = $derived(height - MT - MB)
  const total = (c: Col) => c.parts.reduce((a, p) => a + p.value, 0)
  const max = $derived(Math.max(...cols.map(total), 1))
  const slot = $derived(cw / cols.length)
  const barW = $derived(Math.min(72, slot * 0.6))

  let tip = $state<number | null>(null)
</script>

<div class="relative w-full" bind:clientWidth={cw}>
  <svg width={cw} {height} viewBox={`0 0 ${cw} ${height}`} role="img">
    {#each cols as c, i (c.label + i)}
      {@const cx = slot * i + slot / 2}
      {@const t = total(c)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g onmouseenter={() => (tip = i)} onmouseleave={() => (tip = null)}>
        <rect x={slot * i} y="0" width={slot} height={height - 12} fill={tip === i ? '#f4f2ed' : 'transparent'} />
        {#each c.parts.filter((p) => p.value > 0) as p, j (p.label)}
          {@const below = c.parts.filter((q, k) => q.value > 0 && k < c.parts.indexOf(p)).reduce((a, q) => a + q.value, 0)}
          {@const h = (p.value / max) * IH}
          <rect
            x={cx - barW / 2}
            y={MT + IH - ((below + p.value) / max) * IH + (j > 0 ? 1 : 0)}
            width={barW}
            height={Math.max(h - (j > 0 ? 2 : 0), 0)}
            rx={below + p.value >= t ? 3 : 0}
            fill={p.color}
          />
        {/each}
        <text x={cx} y={MT + IH - (t / max) * IH - 6} font-size="10" font-family="'IBM Plex Mono', monospace" fill={INK_LABEL} text-anchor="middle">{fmt(t)}</text>
        <text x={cx} y={height - 22} font-size="10" font-family="'IBM Plex Mono', monospace" fill={INK_MUTED} text-anchor="middle">{c.label}</text>
        {#if c.sub}
          <text x={cx} y={height - 8} font-size="9" font-family="'IBM Plex Mono', monospace" fill={INK_MUTED} text-anchor="middle">{c.sub}</text>
        {/if}
      </g>
    {/each}
    <line x1="0" y1={MT + IH} x2={cw} y2={MT + IH} stroke={BASELINE} stroke-width="1" />
  </svg>
  {#if tip !== null}
    {@const c = cols[tip]}
    <div class="absolute bg-white border border-[#e5e5e5] rounded-md py-1.5 px-2.5 pointer-events-none z-10 flex flex-col gap-0.5"
      style:left="{Math.min(slot * tip + slot / 2, cw - 200)}px" style:top="0px">
      <span class="font-mono text-[10px] text-gray-500">{c.sub ? `${c.sub} · ` : ''}{c.label}</span>
      {#each c.parts.filter((p) => p.value > 0) as p (p.label)}
        <span class="font-mono text-[11px] text-gray-900 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-sm inline-block" style:background={p.color}></span>{p.label}: {fmt(p.value)}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  svg { display: block; }
</style>
