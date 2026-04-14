<script lang="ts">
  import StepCard from './StepCard.svelte';
  import TickerConfirmation from './TickerConfirmation.svelte';
  import type { RankedTicker, ConfirmedTickerWithDirection } from '$lib/types/pipeline';

  interface ConfirmedPayload {
    tickers: ConfirmedTickerWithDirection[];
    totalPortfolioValue: number;
  }

  interface Props {
    tickers: ConfirmedTickerWithDirection[];
    portfolioValue: number;
    rankedTickers: RankedTicker[];
    defaultDirection?: 'long' | 'short';
    stale?: boolean;
    editable?: boolean;
    expanded: boolean;
    onEdit: () => void;
    onSave: (payload: ConfirmedPayload) => void;
    onCancel: () => void;
  }

  let {
    tickers,
    portfolioValue,
    rankedTickers,
    defaultDirection = 'long',
    stale = false,
    editable = true,
    expanded,
    onEdit,
    onSave,
    onCancel,
  }: Props = $props();

  // Tickers not in rankedTickers (manually added previously)
  const extraTickers = $derived(
    tickers
      .filter(t => !rankedTickers.some(r => r.symbol === t.symbol))
      .map(t => ({ symbol: t.symbol, name: t.name, event_count: 0, total_events: 0 }))
  );

  const collapsedSummary = $derived(() => {
    const symbols = tickers
      .map(t => `${t.symbol} ${t.direction === 'long' ? '↑' : '↓'}`)
      .join('  ');
    const value = portfolioValue >= 1000
      ? `$${(portfolioValue / 1000).toFixed(0)}k`
      : `$${portfolioValue}`;
    return `${symbols} · ${value}`;
  });
</script>

<StepCard label="Instruments" {stale} {editable} {expanded} {onEdit}>
  {#snippet summary()}
    {collapsedSummary()}
  {/snippet}

  {#snippet children()}
    <div class="flex flex-col gap-3 pt-1">
      <TickerConfirmation
        ranked_tickers={rankedTickers}
        {defaultDirection}
        initialSelected={tickers.map(t => t.symbol)}
        initialDirections={Object.fromEntries(tickers.map(t => [t.symbol, t.direction]))}
        initialPortfolioValue={portfolioValue}
        initialManualTickers={extraTickers}
        onconfirmed={(payload) => onSave(payload)}
      />
      <button
        class="bg-transparent border-none p-0 font-sans text-sm text-text-muted cursor-pointer underline decoration-black hover:text-text-secondary text-left"
        onclick={onCancel}
      >Cancel edit</button>
    </div>
  {/snippet}
</StepCard>
