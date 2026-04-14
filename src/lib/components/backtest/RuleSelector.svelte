<script lang="ts">
  import { RadioGroup } from 'bits-ui';
  import type { EntryExitRule } from '$lib/types/pipeline';

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
    position_size: number;
    sessionId: string;
    initialPreset?: Preset;
    onconfirmed: (preset: Preset) => void;
  }

  let { suggestions, position_size, sessionId, initialPreset, onconfirmed }: Props = $props();

  const PRESETS: Preset[] = ['aggressive', 'moderate', 'conservative'];

  const PRESET_RULES: Record<Preset, Pick<EntryExitRule, 'entry' | 'exit'>> = {
    aggressive:   { entry: 'event_day',      exit: 'peak_car_date' },
    moderate:     { entry: 'next_day',        exit: 'impact_end'    },
    conservative: { entry: 'two_days_after',  exit: 'fixed_5_days'  },
  };

  let selected = $state<Preset>(initialPreset ?? 'moderate');
  let loading  = $state(false);
  let error    = $state<string | null>(null);

  async function handleConfirm() {
    loading = true;
    error   = null;

    const rule: EntryExitRule = {
      ...PRESET_RULES[selected],
      direction: 'long',
      position_size,
    };

    try {
      const res = await fetch('/api/pipeline/confirm-rule', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sessionId, rule }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Confirm failed');
      }

      onconfirmed(selected);
    } catch (e) {
      error   = e instanceof Error ? e.message : 'Request failed';
      loading = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <hr class="border-none border-t border-bg-border m-0" />
  <p class="text-xs font-medium tracking-[0.08em] uppercase text-text-secondary m-0">
    SELECT TRADE PARAMETERS
  </p>

  <RadioGroup.Root bind:value={selected} class="flex flex-col">
    {#each PRESETS as preset}
      <RadioGroup.Item
        value={preset}
        class="group flex items-start gap-2.5 py-2.5 bg-transparent border-0 border-b border-b-bg-border text-left cursor-pointer w-full first:border-t first:border-t-bg-border"
      >
        <span class="text-[11px] leading-[1.7] text-text-muted flex-shrink-0 transition-colors duration-100 group-data-[state=checked]:text-text-primary">
          <span class="group-data-[state=checked]:hidden">○</span>
          <span class="hidden group-data-[state=checked]:inline">●</span>
        </span>
        <div class="flex flex-col gap-[3px]">
          <span class="font-sans text-base text-text-secondary transition-colors duration-100 group-data-[state=checked]:text-text-primary">
            {suggestions[preset].label}
          </span>
          <span class="font-mono text-xs text-text-muted leading-[1.5]">
            Entry: {suggestions[preset].entry_rule}.&nbsp; Exit: {suggestions[preset].exit_rule}.
          </span>
        </div>
      </RadioGroup.Item>
    {/each}
  </RadioGroup.Root>

  <div class="flex items-center gap-2.5 py-1">
    <span class="flex items-baseline gap-1.5">
      <span class="font-sans text-xs text-text-muted uppercase tracking-[0.06em]">Per ticker</span>
      <span class="font-mono text-sm text-text-secondary">${position_size.toLocaleString()}</span>
    </span>
  </div>

  {#if error}
    <p class="font-sans text-sm text-accent-loss m-0">{error}</p>
  {/if}

  <button
    class="block w-full py-[11px] px-4 border border-bg-border bg-transparent text-text-primary font-sans text-base text-center cursor-pointer transition-[background] duration-100 hover:not-disabled:bg-bg-elevated disabled:text-text-muted disabled:cursor-not-allowed"
    onclick={handleConfirm}
    disabled={loading}
  >
    {loading ? 'Starting simulation...' : 'Run simulation →'}
  </button>
</div>
