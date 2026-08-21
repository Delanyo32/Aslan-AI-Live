<!--
  Dumbbell chart: before → after per item (reported debt → total committed).
  One hue, two shades (dataviz form table). Horizontal, sorted by caller.
-->
<script lang="ts">
  import { BASELINE, BLUE_DARK, BLUE_LIGHT, INK_LABEL, INK_MUTED, fmtMoney } from './viz'

  interface Item { label: string; a: number; b: number }
  interface Props { items: Item[]; aLabel: string; bLabel: string; currency?: string }
  let { items, aLabel, bLabel, currency = 'USD' }: Props = $props()

  const ROW = 26
  const ML = 58 // ticker labels
  const MR = 64 // end-value labels
  const MT = 6
  let cw = $state(640)
  const IW = $derived(cw - ML - MR)
  const height = $derived(items.length * ROW + MT + 4)
  const max = $derived(Math.max(...items.map((d) => Math.max(d.a, d.b)), 1) * 1.02)
  const x = (v: number) => ML + (v / max) * IW
  const y = (i: number) => MT + i * ROW + ROW / 2

  let tip = $state<{ i: number; px: number; py: number } | null>(null)
</script>

<div class="relative w-full" bind:clientWidth={cw}>
  <div class="flex items-center gap-5 mb-2">
    <span class="mono-label text-[10px] text-gray-600 flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" style:background={BLUE_LIGHT}></span>{aLabel}</span>
    <span class="mono-label text-[10px] text-gray-600 flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" style:background={BLUE_DARK}></span>{bLabel}</span>
  </div>
  <svg width={cw} {height} viewBox={`0 0 ${cw} ${height}`} role="img">
    {#each items as d, i (d.label)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g onmouseenter={() => (tip = { i, px: x(Math.max(d.a, d.b)), py: y(i) })} onmouseleave={() => (tip = null)}>
        <rect x="0" y={y(i) - ROW / 2} width={cw} height={ROW} fill={tip?.i === i ? '#f4f2ed' : 'transparent'} />
        <text x={ML - 8} y={y(i) + 3} font-size="10" font-family="'IBM Plex Mono', monospace" fill={INK_LABEL} text-anchor="end">{d.label}</text>
        <line x1={x(Math.min(d.a, d.b))} y1={y(i)} x2={x(Math.max(d.a, d.b))} y2={y(i)} stroke={BASELINE} stroke-width="2" />
        <circle cx={x(d.a)} cy={y(i)} r="4.5" fill={BLUE_LIGHT} />
        <circle cx={x(d.b)} cy={y(i)} r="4.5" fill={BLUE_DARK} />
        <text x={x(Math.max(d.a, d.b)) + 9} y={y(i) + 3} font-size="10" font-family="'IBM Plex Mono', monospace" fill={INK_MUTED}>{fmtMoney(d.b, currency)}</text>
      </g>
    {/each}
  </svg>
  {#if tip}
    {@const d = items[tip.i]}
    <div class="absolute bg-white border border-[#e5e5e5] rounded-md py-1.5 px-2.5 pointer-events-none z-10 flex flex-col gap-0.5"
      style:left="{Math.min(tip.px + 12, cw - 190)}px" style:top="{tip.py - 14}px">
      <span class="font-mono text-[10px] text-gray-500">{d.label}</span>
      <span class="font-mono text-[11px] text-gray-900">{aLabel}: {fmtMoney(d.a, currency)}</span>
      <span class="font-mono text-[11px] text-gray-900">{bLabel}: {fmtMoney(d.b, currency)}</span>
    </div>
  {/if}
</div>

<style>
  svg { display: block; }
</style>
