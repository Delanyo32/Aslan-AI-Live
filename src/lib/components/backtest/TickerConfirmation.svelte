<script lang="ts">
  import { Checkbox, ToggleGroup } from 'bits-ui';
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
        searchResults = await res.json();
        showDropdown  = searchResults.length > 0;
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
  <hr class="border-none border-t border-bg-border m-0" />
  <p class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary m-0">
    CONFIRM INSTRUMENTS
  </p>

  {#if allTickers.length === 0}
    <p class="font-sans text-sm text-text-muted m-0">No tickers detected automatically. Add one below.</p>
  {/if}

  <div class="flex flex-col">
    {#each allTickers as ticker}
      <div class="flex items-center gap-2.5 py-2 flex-wrap border-b border-bg-border first:border-t first:border-bg-border">

        <!-- Checkbox -->
        <Checkbox.Root
          checked={selected.has(ticker.symbol)}
          onCheckedChange={(v) => toggle(ticker.symbol, v === true)}
          class="flex items-center justify-center w-3.5 h-3.5 border border-bg-border flex-shrink-0 font-mono text-[10px] text-text-primary transition-colors duration-100 data-[state=checked]:border-text-secondary cursor-pointer"
          aria-label="Select {ticker.symbol}"
        >
          {#if selected.has(ticker.symbol)}✓{/if}
        </Checkbox.Root>

        <!-- Symbol + name -->
        <span class="font-mono text-sm text-text-primary min-w-[52px] flex-shrink-0">{ticker.symbol}</span>
        {#if ticker.name}
          <span class="font-sans text-sm text-text-secondary flex-1 min-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">{ticker.name}</span>
        {/if}

        <!-- Event count -->
        <span class="font-mono text-sm text-text-muted whitespace-nowrap flex items-center gap-1">
          {ticker.event_count} event{ticker.event_count !== 1 ? 's' : ''}
          {#if ticker.event_count <= 2}
            <span class="text-accent-amber text-xs cursor-help" title="Low event count — results may not be statistically meaningful">⚠</span>
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
              class="py-[3px] px-2.5 bg-transparent border border-bg-border font-sans text-xs text-text-muted cursor-pointer transition-[background,color] duration-[80ms] border-r-0 rounded-l-[2px] data-[state=on]:bg-bg-elevated data-[state=on]:text-text-primary data-[state=on]:border-text-secondary"
            >
              Long
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="short"
              class="py-[3px] px-2.5 bg-transparent border border-bg-border font-sans text-xs text-text-muted cursor-pointer transition-[background,color] duration-[80ms] rounded-r-[2px] data-[state=on]:bg-bg-elevated data-[state=on]:text-text-primary data-[state=on]:border-text-secondary"
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
        class="w-full py-1.5 px-2.5 bg-bg-surface border border-bg-border text-text-primary font-mono text-sm rounded-[2px] outline-none focus:border-text-secondary placeholder:text-text-muted placeholder:font-sans"
        placeholder="Search ticker or company name…"
        bind:value={searchInput}
        oninput={onSearchInput}
        onkeydown={handleSearchKeydown}
        onblur={() => setTimeout(() => (showDropdown = false), 150)}
        autocomplete="off"
      />
      {#if searchLoading}
        <span class="absolute right-2 text-text-muted text-xs pointer-events-none">…</span>
      {/if}
    </div>
    {#if showDropdown}
      <ul class="absolute top-full left-0 right-0 bg-bg-elevated border border-bg-border border-t-0 list-none m-0 p-0 z-50 max-h-[220px] overflow-y-auto">
        {#each searchResults as item}
          <li>
            <button
              class="flex items-baseline gap-2 w-full py-[7px] px-2.5 bg-transparent border-none cursor-pointer text-left hover:bg-bg-surface"
              onmousedown={() => selectResult(item)}
            >
              <span class="font-mono text-sm text-text-primary min-w-[52px] flex-shrink-0">{item.symbol}</span>
              <span class="font-sans text-sm text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- Portfolio value -->
  <div class="flex items-center gap-3 flex-wrap pt-1">
    <span class="font-sans text-sm text-text-secondary">Total portfolio value</span>
    <div class="flex items-center gap-1">
      <span class="font-mono text-sm text-text-secondary">$</span>
      <input
        type="number"
        class="w-[120px] py-1.5 px-2 bg-bg-surface border border-bg-border text-text-primary font-mono text-sm rounded-[2px] outline-none focus:border-text-secondary appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        bind:value={totalPortfolioValue}
        min="1000"
        step="5000"
      />
    </div>
    {#if activeTickers.length > 1}
      <span class="font-mono text-xs text-text-muted">≈ ${perTickerSize.toLocaleString()} per ticker</span>
    {/if}
  </div>

  <button
    class="block w-full py-[11px] px-4 border border-bg-border bg-transparent text-text-primary font-sans text-base text-center cursor-pointer transition-[background] duration-100 hover:not-disabled:bg-bg-elevated disabled:text-text-muted disabled:cursor-not-allowed"
    onclick={handleConfirm}
    disabled={activeTickers.length === 0}
  >
    Run Backtest →
  </button>
</div>
