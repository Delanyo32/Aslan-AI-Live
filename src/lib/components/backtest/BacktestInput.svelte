<script lang="ts">
  import { Tooltip } from 'bits-ui';

  interface Props {
    onrun: (query: string) => void;
    hideButton?: boolean;
    readOnly?: boolean;
    initialValue?: string;
  }

  let { onrun, hideButton = false, readOnly = false, initialValue = '' }: Props = $props();

  let query = $state(initialValue);

  const COMING_SOON = [
    { label: 'Crypto',        tip: 'Crypto markets — coming soon'         },
    { label: 'Forex',         tip: 'Forex markets — coming soon'          },
    { label: 'Futures',       tip: 'Futures & Commodities — coming soon'  },
    { label: 'Options',       tip: 'Options — coming soon'                },
    { label: 'International', tip: 'International markets — coming soon'  },
  ];
</script>

<div class="flex flex-col gap-6">
  {#if readOnly}
    <div class="py-3 px-3 bg-bg-surface border border-bg-border text-text-secondary font-sans text-base leading-[1.6]">
      {initialValue}
    </div>
  {:else}
    <textarea
      rows={3}
      class="w-full py-3 px-3 bg-bg-surface border border-bg-border text-text-primary font-sans text-base leading-[1.6] rounded-[2px] resize-none outline-none focus:border-text-secondary placeholder:text-text-muted"
      placeholder="Buy Nvidia every time the US announces new AI chip restrictions on China"
      bind:value={query}
    ></textarea>

    <div class="flex flex-wrap items-center max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[-webkit-overflow-scrolling:touch] max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden">
      <span class="font-sans text-sm text-text-primary border-b border-b-text-primary pb-[2px] select-none cursor-default">
        US Stocks
      </span>

      {#each COMING_SOON as market}
        <span class="font-sans text-sm text-text-muted mx-2.5 select-none" aria-hidden="true">|</span>
        <Tooltip.Provider delayDuration={0}>
          <Tooltip.Root>
            <Tooltip.Trigger
              class="font-sans text-sm text-text-muted cursor-not-allowed select-none bg-transparent border-none p-0"
            >
              {market.label}
            </Tooltip.Trigger>
            <Tooltip.Content
              class="bg-bg-elevated border border-bg-border text-text-secondary text-xs leading-[1.4] py-1 px-2 rounded-[2px] whitespace-nowrap z-10"
              sideOffset={8}
            >
              {market.tip}
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {/each}
    </div>

    {#if !hideButton}
      <button
        type="button"
        class="block w-full py-[11px] px-4 border border-bg-border bg-transparent text-text-primary font-sans text-base text-center cursor-pointer transition-[background] duration-100 hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed"
        onclick={() => onrun(query)}
        disabled={!query.trim()}
      >
        Run Backtest  →
      </button>
    {/if}
  {/if}
</div>
