<!--
  KPI row of stat tiles (dataviz: a handful of headline numbers is not a chart).
  Values are mono + tabular per the design system: numbers are precise
  instruments. Three columns keeps labels on one line; six squeezed them.
-->
<script lang="ts">
  interface Tile { label: string; value: string; sub?: string }
  interface Props { tiles: Tile[] }
  let { tiles }: Props = $props()
</script>

<div class="grid grid-cols-2 lg:grid-cols-3 gap-px bg-[#e5e5e5] border border-[#e5e5e5] rounded-2xl overflow-hidden">
  {#each tiles as t (t.label)}
    <div class="bg-white px-5 py-4 flex flex-col gap-1.5">
      <span class="mono-label text-[9px] text-gray-500">{t.label}</span>
      <span class="font-mono text-2xl text-gray-900 tracking-tight" style="font-variant-numeric: tabular-nums;">{t.value}</span>
      {#if t.sub}<span class="font-mono text-[10px] text-gray-500">{t.sub}</span>{/if}
    </div>
  {/each}
</div>
