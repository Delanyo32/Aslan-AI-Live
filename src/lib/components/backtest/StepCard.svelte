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

<div class="step-card" class:stale>
  <div class="card-header">
    <span class="card-label">{label}</span>
    <div class="card-summary">
      {@render summary()}
    </div>
    {#if stale}
      <span class="lock-icon" aria-label="Will rerun">↻</span>
    {:else if editable && onEdit && !expanded}
      <button class="edit-btn" onclick={onEdit}>Edit</button>
    {/if}
  </div>

  {#if expanded && children}
    <div class="card-body">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .step-card {
    border-bottom: 1px solid var(--bg-border);
    transition: opacity 150ms;
  }

  .step-card.stale {
    opacity: 0.4;
    pointer-events: none;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
  }

  .card-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    flex-shrink: 0;
    min-width: 120px;
  }

  .card-summary {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .edit-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
    flex-shrink: 0;
    transition: color 100ms;
  }

  .edit-btn:hover {
    color: var(--text-secondary);
    text-decoration-color: var(--text-secondary);
  }

  .lock-icon {
    font-size: var(--text-sm);
    color: var(--text-muted);
    flex-shrink: 0;
    user-select: none;
  }

  .card-body {
    padding-bottom: 20px;
  }
</style>
