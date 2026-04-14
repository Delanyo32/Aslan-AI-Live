<script lang="ts">
  import StepCard from './StepCard.svelte';
  import RuleSelector from './RuleSelector.svelte';

  type Preset = 'aggressive' | 'moderate' | 'conservative';

  interface SuggestionItem {
    label: string;
    entry_rule: string;
    exit_rule: string;
    description: string;
  }

  interface Props {
    suggestions: {
      aggressive: SuggestionItem;
      moderate: SuggestionItem;
      conservative: SuggestionItem;
    };
    positionSize: number;
    sessionId: string;
    selectedPreset: Preset;
    stale?: boolean;
    editable?: boolean;
    expanded: boolean;
    onEdit: () => void;
    onSave: (preset: Preset) => void;
    onCancel: () => void;
  }

  let {
    suggestions,
    positionSize,
    sessionId,
    selectedPreset,
    stale = false,
    editable = true,
    expanded,
    onEdit,
    onSave,
    onCancel,
  }: Props = $props();

  const label = $derived(suggestions[selectedPreset]?.label ?? selectedPreset);
</script>

<StepCard label="Trade Rule" {stale} {editable} {expanded} {onEdit}>
  {#snippet summary()}
    {label}
  {/snippet}

  {#snippet children()}
    <div class="edit-wrap">
      <RuleSelector
        {suggestions}
        position_size={positionSize}
        {sessionId}
        initialPreset={selectedPreset}
        onconfirmed={onSave}
      />
      <button class="cancel-btn" onclick={onCancel}>Cancel edit</button>
    </div>
  {/snippet}
</StepCard>

<style>
  .edit-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 4px;
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
    text-align: left;
  }

  .cancel-btn:hover {
    color: var(--text-secondary);
  }
</style>
