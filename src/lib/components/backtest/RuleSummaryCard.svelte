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
    <div class="flex flex-col gap-3 pt-1">
      <RuleSelector
        {suggestions}
        position_size={positionSize}
        {sessionId}
        initialPreset={selectedPreset}
        onconfirmed={onSave}
      />
      <button
        class="bg-transparent border-none p-0 font-sans text-sm text-text-muted cursor-pointer underline decoration-black hover:text-text-secondary text-left"
        onclick={onCancel}
      >Cancel edit</button>
    </div>
  {/snippet}
</StepCard>
