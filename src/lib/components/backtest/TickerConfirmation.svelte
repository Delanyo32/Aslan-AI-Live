<script lang="ts">
  import { Checkbox, ToggleGroup } from 'bits-ui';
  import { toast } from 'svelte-sonner';
  import type { RankedTicker, ConfirmedTickerWithDirection } from '$lib/types/pipeline';

  interface ConfirmedPayload {
    tickers: ConfirmedTickerWithDirection[];
    totalPortfolioValue: number;
  }

  interface Props {
    ranked_tickers: RankedTicker[];
    defaultDirection?: 'long' | 'short';
    initialSelected?: string[];
    initialDirections?: Record<string, 'long' | 'short'>;
    initialPortfolioValue?: number;
    initialManualTickers?: Array<{ symbol: string; name?: string; event_count: number; total_events: number }>;
    onconfirmed: (payload: ConfirmedPayload) => void;
  }

  let { ranked_tickers, defaultDirection = 'long', initialSelected, initialDirections, initialPortfolioValue, initialManualTickers, onconfirmed }: Props = $props();

  let selected   = $state<Set<string>>(new Set(initialSelected ?? ranked_tickers.map(t => t.symbol)));
  let directions = $state<Record<string, 'long' | 'short'>>(
    initialDirections ?? Object.fromEntries(ranked_tickers.map(t => [t.symbol, defaultDirection]))
  );
  let totalPortfolioValue = $state(initialPortfolioValue ?? 50000);

  let manualTickers  = $state<Array<{ symbol: string; name?: string; event_count: number; total_events: number }>>(initialManualTickers ?? []);
  let searchInput    = $state('');
  let searchResults  = $state<{ symbol: string; name: string }[]>([]);
  let searchLoading  = $state(false);
  let showDropdown   = $state(false);
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;

  function onSearchInput() {
    clearTimeout(searchDebounce!);
    const q = searchInput.trim();
    if (q.length < 1) { searchResults = []; showDropdown = false; return; }
    searchDebounce = setTimeout(async () => {
      searchLoading = true;
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error('search_failed');
        searchResults = await res.json();
        showDropdown  = searchResults.length > 0;
      } catch {
        toast.error('Stock search unavailable. Try again.');
        searchResults = [];
        showDropdown  = false;
      } finally {
        searchLoading = false;
      }
    }, 180);
  }

  function selectResult(item: { symbol: string; name: string }) {
    const sym = item.symbol;
    if (ranked_tickers.some(t => t.symbol === sym)) {
      selected = new Set([...selected, sym]);
    } else if (!manualTickers.some(t => t.symbol === sym)) {
      manualTickers = [...manualTickers, { symbol: sym, name: item.name, event_count: 0, total_events: 0 }];
      selected      = new Set([...selected, sym]);
      directions    = { ...directions, [sym]: defaultDirection };
    }
    searchInput   = '';
    searchResults = [];
    showDropdown  = false;
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') showDropdown = false;
    if (e.key === 'Enter' && searchResults.length > 0) { e.preventDefault(); selectResult(searchResults[0]); }
  }

  const allTickers = $derived([...ranked_tickers, ...manualTickers]);

  function toggle(symbol: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(symbol);
    else next.delete(symbol);
    selected = next;
  }

  const activeTickers = $derived(allTickers.filter(t => selected.has(t.symbol)));

  const perTickerSize = $derived(
    activeTickers.length > 0 ? Math.floor(totalPortfolioValue / activeTickers.length) : 0
  );

  function handleConfirm() {
    if (activeTickers.length === 0) return;
    const tickers: ConfirmedTickerWithDirection[] = activeTickers.map(t => ({
      symbol:    t.symbol,
      name:      t.name ?? t.symbol,
      direction: directions[t.symbol] ?? 'long',
    }));
    onconfirmed({ tickers, totalPortfolioValue });
  }
</script>

<div class="flex flex-col gap-4">
  <hr class="border-none border-t border-[#e5e5e5] m-0" />
  <p class="mono-label text-[9px] text-gray-400 m-0">Confirm instruments</p>

  {#if allTickers.length === 0}
    <p class="font-sans text-sm text-gray-400 m-0">No tickers detected automatically. Add one below.</p>
  {/if}

  <div class="flex flex-col">
    {#each allTickers as ticker}
      <div class="flex items-center gap-2.5 py-2 flex-wrap border-b border-[#e5e5e5] first:border-t first:border-[#e5e5e5]">

        <!-- Checkbox -->
        <Checkbox.Root
          checked={selected.has(ticker.symbol)}
          onCheckedChange={(v) => toggle(ticker.symbol, v === true)}
          class="flex items-center justify-center w-3.5 h-3.5 border border-[#e5e5e5] flex-shrink-0 font-mono text-[10px] text-[#4338ca] transition-colors duration-100 data-[state=checked]:border-[#4338ca] cursor-pointer"
          aria-label="Select {ticker.symbol}"
        >
          {#if selected.has(ticker.symbol)}✓{/if}
        </Checkbox.Root>

        <!-- Symbol + name -->
        <span class="font-mono text-sm text-[#171717] min-w-[52px] flex-shrink-0">{ticker.symbol}</span>
        {#if ticker.name}
          <span class="font-sans text-sm text-gray-500 flex-1 min-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">{ticker.name}</span>
        {/if}

        <!-- Event count -->
        <span class="font-mono text-sm text-gray-400 whitespace-nowrap flex items-center gap-1">
          {ticker.event_count} event{ticker.event_count !== 1 ? 's' : ''}
          {#if ticker.event_count <= 2}
            <span class="text-amber-400 text-xs cursor-help" title="Low event count — results may not be statistically meaningful">⚠</span>
          {/if}
        </span>

        <!-- Long / Short toggle -->
        {#if selected.has(ticker.symbol)}
          <ToggleGroup.Root
            type="single"
            value={directions[ticker.symbol]}
            onValueChange={(v) => { if (v) directions = { ...directions, [ticker.symbol]: v as 'long' | 'short' }; }}
            class="flex ml-auto flex-shrink-0"
          >
            <ToggleGroup.Item
              value="long"
              class="py-[3px] px-2.5 bg-transparent border border-[#e5e5e5] font-sans text-xs text-gray-400 cursor-pointer transition-all duration-100 border-r-0 rounded-l-md data-[state=on]:bg-[#4338ca] data-[state=on]:text-white data-[state=on]:border-[#4338ca]"
            >
              Long
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="short"
              class="py-[3px] px-2.5 bg-transparent border border-[#e5e5e5] font-sans text-xs text-gray-400 cursor-pointer transition-all duration-100 rounded-r-md data-[state=on]:bg-[#4338ca] data-[state=on]:text-white data-[state=on]:border-[#4338ca]"
            >
              Short
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Ticker search -->
  <div class="relative">
    <div class="relative flex items-center">
      <input
        type="text"
        class="w-full py-2 px-3 bg-white border border-[#e5e5e5] text-[#171717] font-mono text-sm rounded-xl outline-none focus:border-[#4338ca] transition-colors placeholder:text-gray-300 placeholder:font-sans"
        placeholder="Search ticker or company name…"
        bind:value={searchInput}
        oninput={onSearchInput}
        onkeydown={handleSearchKeydown}
        onblur={() => setTimeout(() => (showDropdown = false), 150)}
        autocomplete="off"
      />
      {#if searchLoading}
        <span class="absolute right-3 text-gray-400 text-xs pointer-events-none">…</span>
      {/if}
    </div>
    {#if showDropdown}
      <ul class="absolute top-full left-0 right-0 bg-white border border-[#e5e5e5] rounded-b-xl shadow-md list-none m-0 p-0 z-50 max-h-[220px] overflow-y-auto">
        {#each searchResults as item}
          <li>
            <button
              class="flex items-baseline gap-2 w-full py-2 px-3 bg-transparent border-none cursor-pointer text-left hover:bg-[#fcfbf9] transition-colors"
              onmousedown={() => selectResult(item)}
            >
              <span class="font-mono text-sm text-[#171717] min-w-[52px] flex-shrink-0">{item.symbol}</span>
              <span class="font-sans text-sm text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- Portfolio value -->
  <div class="flex items-center gap-3 flex-wrap pt-1">
    <span class="font-sans text-sm text-gray-500">Total portfolio value</span>
    <div class="flex items-center gap-1">
      <span class="font-mono text-sm text-gray-500">$</span>
      <input
        type="number"
        class="w-[120px] py-1.5 px-2 bg-white border border-[#e5e5e5] text-[#171717] font-mono text-sm rounded-lg outline-none focus:border-[#4338ca] transition-colors appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        bind:value={totalPortfolioValue}
        min="1000"
        step="5000"
      />
    </div>
    {#if activeTickers.length > 1}
      <span class="font-mono text-xs text-gray-400">≈ ${perTickerSize.toLocaleString()} per ticker</span>
    {/if}
  </div>

  <button
    class="bg-[#171717] text-white px-8 py-3 rounded-full font-sans font-medium hover:bg-[#4338ca] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    onclick={handleConfirm}
    disabled={activeTickers.length === 0}
  >
    Run Backtest →
  </button>
</div>
