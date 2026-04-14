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
    <div class="flex flex-col gap-[10px] pt-1">
      <textarea
        class="w-full px-3 py-[9px] bg-bg-surface border border-black text-text-primary font-sans text-sm leading-[1.5] resize-y outline-none rounded-none box-border focus:border-[#525252]"
        bind:value={draft}
        rows={3}
      ></textarea>
      <div class="flex items-center gap-[14px]">
        <button
          class="px-4 py-[7px] border border-black bg-transparent text-text-primary font-sans text-sm cursor-pointer rounded-none transition-colors duration-100 hover:bg-bg-elevated disabled:text-text-muted disabled:cursor-not-allowed"
          onclick={handleSave}
          disabled={!changed}
        >
          Save
        </button>
        <button
          class="bg-transparent border-none p-0 font-sans text-sm text-text-muted cursor-pointer underline decoration-black hover:text-text-secondary"
          onclick={onCancel}
        >Cancel</button>
      </div>
    </div>
  {/snippet}
</StepCard>
