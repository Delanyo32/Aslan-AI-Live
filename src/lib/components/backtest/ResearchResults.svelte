<script lang="ts">
  import type { ResearchEvent, RankedTicker } from '$lib/types/pipeline';

  interface Props {
    events: ResearchEvent[];
    lowConfidence: ResearchEvent[];
    rankedTickers: RankedTicker[];
    oncontinue: () => void;
    onrefine: () => void;
  }

  let { events, lowConfidence, rankedTickers, oncontinue, onrefine }: Props = $props();

  let showLowConfidence = $state(false);

  const conditionMet    = $derived(events.filter(e => e.condition_met).length);
  const conditionFailed = $derived(events.filter(e => !e.condition_met).length);
  const tradeable       = $derived(events.filter(e => e.condition_met));

  function formatDate(iso: string): string {
    try {
      return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
      });
    } catch {
      return iso;
    }
  }

  function confidenceBadgeClass(c: string): string {
    if (c === 'HIGH')   return 'text-accent-gain';
    if (c === 'LOW')    return 'text-accent-loss';
    return 'text-text-secondary';
  }
</script>

<div class="flex flex-col gap-6">
  <hr class="border-none border-t border-black m-0" />

  <!-- Summary -->
  <div class="flex flex-col gap-1">
    <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-secondary m-0">RESEARCH COMPLETE</p>
    <p class="font-sans text-base text-text-primary m-0">
      Found {events.length} event{events.length !== 1 ? 's' : ''}
      {#if conditionFailed > 0}
        — <span class="text-accent-gain">{conditionMet} satisfied condition</span>,
        <span class="text-text-secondary">{conditionFailed} filtered out</span>
      {:else if conditionMet > 0}
        — all conditions satisfied
      {/if}
    </p>
    {#if rankedTickers.length > 0}
      <p class="font-mono text-sm text-text-secondary m-0">
        Top tickers: {rankedTickers.slice(0, 5).map(t => t.symbol).join(', ')}
      </p>
    {/if}
  </div>

  <!-- Event condition table -->
  {#if events.length > 0}
    <div class="flex flex-col gap-2">
      <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-secondary m-0">EVENTS FOUND</p>
      <div class="border-t border-black">
        {#each events as event}
          <div class="border-b border-[#E5E5E5] py-3 flex flex-col gap-1.5">
            <div class="flex items-start gap-3">
              <!-- Condition verdict -->
              <span
                class="font-mono text-sm mt-[1px] shrink-0 w-4 text-center {event.condition_met ? 'text-accent-gain' : 'text-[#AAAAAA]'}"
                title={event.condition_met ? 'Condition met' : 'Condition not met'}
              >
                {event.condition_met ? '✓' : '✗'}
              </span>

              <div class="flex flex-col gap-1 flex-1 min-w-0">
                <!-- Date + confidence -->
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-xs text-text-secondary">{formatDate(event.event_date)}</span>
                  <span
                    class="font-mono text-[10px] uppercase tracking-[0.06em] {confidenceBadgeClass(event.confidence)}"
                  >{event.confidence}</span>
                </div>

                <!-- Event description -->
                <p class="font-sans text-sm text-text-primary leading-[1.5] m-0">{event.description}</p>

                <!-- Condition evidence -->
                {#if event.condition_evidence}
                  <p class="font-sans text-xs text-text-secondary leading-[1.5] m-0 italic">
                    {event.condition_evidence}
                  </p>
                {/if}

                <!-- Sources -->
                {#if event.sources.length > 0}
                  {@const src = event.sources[0]}
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-sans text-xs text-text-muted no-underline hover:underline hover:text-text-secondary truncate max-w-full inline-block"
                  >{src.title}</a>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Low confidence events (collapsed) -->
  {#if lowConfidence.length > 0}
    <div class="flex flex-col gap-2">
      <button
        class="flex items-center gap-2 bg-transparent border-none p-0 text-left cursor-pointer"
        onclick={() => showLowConfidence = !showLowConfidence}
      >
        <span class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-muted">
          {lowConfidence.length} LOW CONFIDENCE EVENT{lowConfidence.length !== 1 ? 'S' : ''} (EXCLUDED)
        </span>
        <span class="font-mono text-xs text-text-muted">{showLowConfidence ? '▲' : '▼'}</span>
      </button>

      {#if showLowConfidence}
        <div class="border-t border-[#E5E5E5]">
          {#each lowConfidence as event}
            <div class="border-b border-[#E5E5E5] py-2 flex flex-col gap-0.5 opacity-60">
              <span class="font-mono text-xs text-text-muted">{formatDate(event.event_date)}</span>
              <p class="font-sans text-sm text-text-secondary m-0">{event.description}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- No tradeable events warning -->
  {#if tradeable.length === 0}
    <div class="flex flex-col gap-2 border-l-4 border-l-black pl-4">
      <p class="font-sans text-sm text-[#525252] m-0">No events satisfied the condition in your hypothesis.</p>
      <p class="font-sans text-sm text-[#525252] m-0">Try broadening your query or adjusting the condition.</p>
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex items-center gap-5">
    <button
      type="button"
      class="px-5 py-[11px] border border-black bg-transparent text-text-primary font-sans text-base cursor-pointer rounded-none transition-colors duration-100 hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed"
      onclick={oncontinue}
      disabled={tradeable.length === 0}
    >
      Continue to ticker selection →
    </button>
    <button
      type="button"
      class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer underline decoration-black hover:text-text-primary"
      onclick={onrefine}
    >
      Refine query →
    </button>
  </div>
</div>
