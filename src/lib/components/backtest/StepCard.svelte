<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    stale?: boolean;
    expanded?: boolean;
    editable?: boolean;
    onEdit?: () => void;
    summary: Snippet;
    children?: Snippet;
  }

  let {
    label,
    stale = false,
    expanded = false,
    editable = true,
    onEdit,
    summary,
    children,
  }: Props = $props();
</script>

<div class="border-b border-[#e5e5e5] transition-opacity duration-150 last:border-b-0" class:opacity-40={stale} class:pointer-events-none={stale}>
  <div class="flex items-center gap-3 py-[9px]">
    <span class="mono-label text-[9px] text-gray-400 shrink-0 min-w-[100px]">{label}</span>
    <div class="flex-1 overflow-hidden whitespace-nowrap text-ellipsis font-sans text-sm text-[#171717]">
      {@render summary()}
    </div>
    {#if stale}
      <span class="text-xs text-gray-400 shrink-0 select-none" aria-label="Will rerun">↻</span>
    {:else if editable && onEdit && !expanded}
      <button
        class="bg-transparent border-none p-0 mono-label text-[9px] text-[#4338ca] cursor-pointer no-underline shrink-0 transition-colors duration-100 hover:text-indigo-700"
        onclick={onEdit}
      >Edit</button>
    {/if}
  </div>

  {#if expanded && children}
    <div class="pb-5">
      {@render children()}
    </div>
  {/if}
</div>
