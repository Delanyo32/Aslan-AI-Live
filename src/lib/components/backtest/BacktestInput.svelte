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

{#if readOnly}
  <div class="px-5 py-4 bg-[#fcfbf9] border border-[#e5e5e5] rounded-2xl text-[#171717] font-sans text-base leading-relaxed">
    {initialValue}
  </div>
{:else}
  <!-- Input card with action bar -->
  <div class="relative bg-[#fcfbf9] border border-[#e5e5e5] rounded-2xl overflow-hidden focus-within:border-[#4338ca] transition-all duration-300">
    <textarea
      rows={4}
      class="w-full px-6 py-5 bg-transparent outline-none text-lg text-[#171717] font-sans leading-relaxed resize-none border-none placeholder:text-gray-300"
      placeholder="Buy Nvidia every time the US announces new AI chip restrictions on China"
      bind:value={query}
    ></textarea>

    <!-- Bottom action bar -->
    <div class="px-4 py-3 flex items-center justify-between gap-3 border-t border-[#e5e5e5] bg-white/60 flex-wrap">
      <!-- Market pills -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-[10px] tracking-wider px-3 py-1.5 bg-[#171717] text-white rounded-full select-none">
          US STOCKS
        </span>
        {#each COMING_SOON as market}
          <Tooltip.Provider delayDuration={0}>
            <Tooltip.Root>
              <Tooltip.Trigger
                class="font-mono text-[10px] tracking-wider px-3 py-1.5 bg-gray-50 text-gray-400 border border-[#e5e5e5] rounded-full cursor-not-allowed select-none"
              >
                {market.label.toUpperCase()}
              </Tooltip.Trigger>
              <Tooltip.Content
                class="bg-white border border-[#e5e5e5] text-gray-500 text-xs py-1 px-2 rounded-lg whitespace-nowrap z-10 shadow-sm"
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
          class="bg-[#171717] text-white px-7 py-2.5 rounded-full font-sans font-medium text-sm hover:bg-[#4338ca] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap cursor-pointer"
          onclick={() => onrun(query)}
          disabled={!query.trim()}
        >
          Analyze
          <iconify-icon icon="lucide:arrow-right" class="text-base"></iconify-icon>
        </button>
      {/if}
    </div>
  </div>
{/if}
