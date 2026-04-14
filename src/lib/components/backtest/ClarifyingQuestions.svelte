<script lang="ts">
  import { RadioGroup } from 'bits-ui';

  export interface ClarifyValues {
    tradeOpen: string;
    direction: string;
    positionSize: number;
  }

  interface Props {
    oncontinue: (values: ClarifyValues) => void;
    query?: string;
  }

  let { oncontinue, query = '' }: Props = $props();

  function inferDirection(q: string): string {
    const first = q.trim().toLowerCase().split(/\s+/)[0];
    if (first === 'short' || first === 'sell') return 'short';
    return 'long';
  }

  const initialDirection = inferDirection(query);

  const tradeOpenOptions = [
    { label: 'Market open next day', value: 'market-open-next-day' },
    { label: 'Immediately on news',  value: 'immediately-on-news'  },
    { label: 'Custom',               value: 'custom'               },
  ];

  const directionOptions = [
    { label: 'Long',        value: 'long'      },
    { label: 'Short',       value: 'short'     },
    { label: 'Let AI decide', value: 'ai-decide' },
  ];

  let tradeOpen    = $state('market-open-next-day');
  let direction    = $state(initialDirection);
  let positionSize = $state(10000);

  function handleContinue() {
    oncontinue({ tradeOpen, direction, positionSize });
  }
</script>

<div class="flex flex-col gap-6">
  <hr class="border-none border-t border-bg-border m-0" />

  <p class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary">
    A FEW QUESTIONS BEFORE WE RUN
  </p>

  <div class="flex flex-col gap-5">
    <!-- When should the trade open? -->
    <div class="flex flex-col gap-2.5">
      <p class="font-sans text-base text-text-primary">When should the trade open?</p>
      <RadioGroup.Root bind:value={tradeOpen} class="flex flex-wrap gap-x-5 gap-y-1">
        {#each tradeOpenOptions as opt}
          <RadioGroup.Item
            value={opt.value}
            class="group flex items-center gap-[7px] bg-transparent border-0 p-0 font-sans text-base text-text-secondary cursor-pointer transition-colors duration-100 data-[state=checked]:text-text-primary"
          >
            <span class="text-[11px] leading-none text-text-muted transition-colors duration-100 group-data-[state=checked]:text-text-primary">
              <span class="group-data-[state=checked]:hidden">○</span>
              <span class="hidden group-data-[state=checked]:inline">●</span>
            </span>
            {opt.label}
          </RadioGroup.Item>
        {/each}
      </RadioGroup.Root>
    </div>

    <!-- Direction? -->
    <div class="flex flex-col gap-2.5">
      <p class="font-sans text-base text-text-primary">Direction?</p>
      <RadioGroup.Root bind:value={direction} class="flex flex-wrap gap-x-5 gap-y-1">
        {#each directionOptions as opt}
          <RadioGroup.Item
            value={opt.value}
            class="group flex items-center gap-[7px] bg-transparent border-0 p-0 font-sans text-base text-text-secondary cursor-pointer transition-colors duration-100 data-[state=checked]:text-text-primary"
          >
            <span class="text-[11px] leading-none text-text-muted transition-colors duration-100 group-data-[state=checked]:text-text-primary">
              <span class="group-data-[state=checked]:hidden">○</span>
              <span class="hidden group-data-[state=checked]:inline">●</span>
            </span>
            {opt.label}
          </RadioGroup.Item>
        {/each}
      </RadioGroup.Root>
    </div>

    <!-- Position size -->
    <div class="flex flex-col gap-2.5">
      <p class="font-sans text-base text-text-primary">Position size per trade?</p>
      <div class="flex items-center gap-1">
        <span class="font-mono text-base text-text-secondary">$</span>
        <input
          type="number"
          class="w-[120px] max-sm:w-full py-1.5 px-2 bg-bg-surface border border-bg-border text-text-primary font-mono text-base rounded-none outline-none focus:border-text-secondary appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          bind:value={positionSize}
          min="100"
          step="1000"
        />
      </div>
    </div>
  </div>

  <button
    class="block w-full py-[11px] px-4 border border-bg-border bg-transparent text-text-primary font-sans text-base text-center cursor-pointer transition-[background] duration-100 hover:bg-bg-elevated"
    onclick={handleContinue}
  >
    Continue →
  </button>
</div>
