<script lang="ts">
  import StepCard from './StepCard.svelte';

  interface Props {
    query: string;
    stale?: boolean;
    editable?: boolean;
    expanded: boolean;
    onEdit: () => void;
    onSave: (newQuery: string) => void;
    onCancel: () => void;
  }

  let { query, stale = false, editable = true, expanded, onEdit, onSave, onCancel }: Props = $props();

  let draft = $state(query);

  $effect(() => {
    if (expanded) draft = query;
  });

  const changed = $derived(draft.trim() !== '' && draft.trim() !== query.trim());

  function handleSave() {
    if (draft.trim()) onSave(draft.trim());
  }
</script>

<StepCard label="Query" {stale} {editable} {expanded} {onEdit}>
  {#snippet summary()}
    {query}
  {/snippet}

  {#snippet children()}
    <div class="edit-form">
      <textarea
        class="query-textarea"
        bind:value={draft}
        rows={3}
      ></textarea>
      <div class="form-actions">
        <button class="save-btn" onclick={handleSave} disabled={!changed}>
          Save
        </button>
        <button class="cancel-btn" onclick={onCancel}>Cancel</button>
      </div>
    </div>
  {/snippet}
</StepCard>

<style>
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 4px;
  }

  .query-textarea {
    width: 100%;
    padding: 9px 12px;
    background: var(--bg-surface);
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    line-height: 1.5;
    resize: vertical;
    outline: none;
    border-radius: 2px;
    box-sizing: border-box;
  }

  .query-textarea:focus {
    border-color: var(--text-secondary);
  }

  .form-actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .save-btn {
    padding: 7px 16px;
    border: 1px solid var(--bg-border);
    background: transparent;
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    cursor: pointer;
    border-radius: 2px;
    transition: background 100ms;
  }

  .save-btn:hover:not(:disabled) {
    background: var(--bg-elevated);
  }

  .save-btn:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .cancel-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .cancel-btn:hover {
    color: var(--text-secondary);
  }
</style>
