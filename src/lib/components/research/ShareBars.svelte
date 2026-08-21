<!--
  Part-to-whole as horizontal 100% stacked bars, one row per year/entity
  (dataviz: stacked bar, horizontal for long-named categories). Legend on top,
  percent labels inside segments wide enough to hold them.
-->
<script lang="ts">
  import { inkOn } from './viz'

  interface Part { label: string; value: number; color: string }
  interface Row { label: string; parts: Part[] }
  interface Props { rows: Row[]; fmt: (v: number) => string }
  let { rows, fmt }: Props = $props()

  const legend = $derived.by(() => {
    const seen = new Map<string, string>()
    for (const r of rows) for (const p of r.parts) if (!seen.has(p.label)) seen.set(p.label, p.color)
    return [...seen.entries()]
  })
  const total = (r: Row) => r.parts.reduce((a, p) => a + p.value, 0)

  let tip = $state<{ ri: number; pi: number; x: number; y: number } | null>(null)
</script>

<div class="relative w-full">
  <div class="flex items-center gap-4 mb-3 flex-wrap">
    {#each legend as [label, color] (label)}
      <span class="mono-label text-[10px] text-gray-600 flex items-center gap-1.5">
        <span class="w-2.5 h-2.5 rounded-sm inline-block" style:background={color}></span>{label}
      </span>
    {/each}
  </div>
  <div class="flex flex-col gap-2">
    {#each rows as r, ri (r.label)}
      {@const t = total(r)}
      <div class="flex items-center gap-3">
        <span class="mono-label text-[10px] text-gray-500 w-14 shrink-0 text-right">{r.label}</span>
        <div class="flex-1 flex h-7 rounded overflow-hidden" style:gap="2px">
          {#each r.parts.filter((p) => p.value > 0) as p, pi (p.label)}
            {@const share = p.value / t}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="h-full flex items-center justify-center min-w-0"
              style:width="{share * 100}%"
              style:background={p.color}
              onmouseenter={(e) => {
                const el = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const wrap = (e.currentTarget as HTMLElement).closest('.relative')!.getBoundingClientRect()
                tip = { ri, pi, x: el.left - wrap.left + el.width / 2, y: el.top - wrap.top }
              }}
              onmouseleave={() => (tip = null)}
            >
              {#if share >= 0.08}
                <span class="font-mono text-[10px]" style:color={inkOn(p.color)}>{Math.round(share * 100)}%</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  {#if tip}
    {@const r = rows[tip.ri]}
    {@const p = r.parts.filter((x) => x.value > 0)[tip.pi]}
    <div class="absolute bg-white border border-[#e5e5e5] rounded-md py-1 px-2 pointer-events-none z-10"
      style:left="{tip.x}px" style:top="{tip.y - 34}px" style:transform="translateX(-50%)">
      <span class="font-mono text-[11px] text-gray-900">{p.label}: {fmt(p.value)} ({Math.round((p.value / total(r)) * 100)}%)</span>
    </div>
  {/if}
</div>
