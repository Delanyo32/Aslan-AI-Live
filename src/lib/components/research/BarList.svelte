<!--
  Magnitude comparison, low → high: horizontal bars, one sequential hue
  (dataviz: sequential is the safe default). Value direct-labeled at each end.
-->
<script lang="ts">
  interface Item { label: string; value: number; hint?: string }
  interface Props { items: Item[]; fmt?: (v: number) => string }
  let { items, fmt = (v) => v.toLocaleString('en-US') }: Props = $props()
  const max = $derived(Math.max(...items.map((d) => d.value), 1))
</script>

<div class="flex flex-col gap-2">
  {#each items as d (d.label)}
    <div class="flex items-center gap-3" title={d.hint}>
      <!-- Plain-tracking mono, not .mono-label: its 0.35em letter-spacing truncates long labels. -->
      <span class="font-mono text-[10px] uppercase tracking-wide text-gray-600 w-36 sm:w-52 shrink-0 text-right truncate">{d.label}</span>
      <div class="flex-1 h-4 flex items-center">
        <div class="h-4 rounded-r-[3px]" style:width="{(d.value / max) * 100}%" style:background="#2a78d6"></div>
        <span class="font-mono text-[10px] text-gray-600 ml-2 whitespace-nowrap" style="font-variant-numeric: tabular-nums;">{fmt(d.value)}</span>
      </div>
    </div>
  {/each}
</div>
