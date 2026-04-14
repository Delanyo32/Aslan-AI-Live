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

<div class="border-b border-black transition-opacity duration-150" class:opacity-40={stale} class:pointer-events-none={stale}>
  <div class="flex items-center gap-3 py-[9px]">
    <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-muted shrink-0 min-w-[120px]">{label}</span>
    <div class="flex-1 overflow-hidden whitespace-nowrap text-ellipsis font-sans text-sm text-text-secondary">
      {@render summary()}
    </div>
    {#if stale}
      <span class="text-sm text-text-muted shrink-0 select-none" aria-label="Will rerun">↻</span>
    {:else if editable && onEdit && !expanded}
      <button
        class="bg-transparent border-none p-0 font-sans text-sm text-text-muted cursor-pointer underline decoration-[#E5E5E5] shrink-0 transition-colors duration-100 hover:text-text-secondary hover:decoration-text-secondary"
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
