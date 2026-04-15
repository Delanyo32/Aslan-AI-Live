<script lang="ts">
  import { onMount } from 'svelte';
  import type { RankedTicker, RawExaEvent } from '$lib/types/pipeline';

  interface TickerCandidatesPayload {
    ranked_tickers: RankedTicker[];
    raw_events: RawExaEvent[];
  }

  interface SuggestionItem {
    label: string;
    entry_rule: string;
    exit_rule: string;
    description: string;
  }

  interface EntryExitSuggestionsPayload {
    suggestions: {
      aggressive: SuggestionItem;
      moderate: SuggestionItem;
      conservative: SuggestionItem;
    };
  }

  interface Props {
    streamUrl: string;
    sessionId: string;
    ontickercandidates: (data: TickerCandidatesPayload) => void;
    onentryexitsuggestions: (data: EntryExitSuggestionsPayload) => void;
    oncomplete: (backtestId: string) => void;
    onerror: (data: { message: string; stage: string }) => void;
    onlowconfidence?: (data: { event_count: number }) => void;
    oncancelled?: () => void;
  }

  let {
    streamUrl,
    sessionId,
    ontickercandidates,
    onentryexitsuggestions,
    oncomplete,
    onerror,
    onlowconfidence,
    oncancelled,
  }: Props = $props();

  void sessionId;

  interface LogLine {
    time: string;
    text: string;
  }

  let visibleLines = $state<LogLine[]>([]);

  let esInstance: EventSource | null = null;
  let isClosed = false;

  function handleCancel() {
    if (esInstance && !isClosed) {
      isClosed = true;
      esInstance.close();
      esInstance = null;
    }
    oncancelled?.();
  }

  function currentTimestamp(): string {
    return new Date().toTimeString().slice(0, 8);
  }

  onMount(() => {
    isClosed = false;
    const es = new EventSource(streamUrl);
    esInstance = es;

    es.addEventListener('log', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      visibleLines = [...visibleLines, { time: currentTimestamp(), text: data.message }];
    });

    es.addEventListener('low_confidence', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onlowconfidence?.({ event_count: data.event_count });
    });

    es.addEventListener('ticker_candidates', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as TickerCandidatesPayload;
      ontickercandidates(data);
    });

    es.addEventListener('entry_exit_suggestions', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as EntryExitSuggestionsPayload;
      onentryexitsuggestions(data);
    });

    es.addEventListener('result', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      isClosed = true;
      es.close();
      esInstance = null;
      oncomplete(data.slug);
    });

    es.addEventListener('error', (e) => {
      if (e instanceof MessageEvent && e.data) {
        try {
          const data = JSON.parse(e.data);
          isClosed = true;
          es.close();
          esInstance = null;
          onerror(data);
        } catch {
          // ignore JSON parse errors from connection noise
        }
      }
    });

    es.onerror = () => {
      if (!isClosed) {
        isClosed = true;
        es.close();
        esInstance = null;
        onerror({ message: 'connection_lost', stage: 'unknown' });
      }
    };

    return () => {
      isClosed = true;
      es.close();
      esInstance = null;
    };
  });
</script>

<div class="pl-4 flex flex-col gap-[10px]">
  {#if oncancelled}
    <div class="flex justify-end">
      <button
        class="bg-transparent border-none p-0 mono-label text-[10px] text-gray-400 cursor-pointer hover:text-[#4338ca] transition-colors duration-100"
        onclick={handleCancel}
      >Cancel &amp; Edit</button>
    </div>
  {/if}
  <div class="border-l-2 border-indigo-100 pl-4 flex flex-col gap-1">
    {#each visibleLines as line}
      <div class="flex gap-3 font-mono text-sm leading-[1.5]">
        <span class="text-gray-400 shrink-0 select-none">{line.time}</span>
        <span class="text-[#171717]">{line.text}</span>
      </div>
    {/each}
  </div>
</div>
