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
  let fatalReported = false;
  let fatalTimer: ReturnType<typeof setTimeout> | null = null;
  // Max time we tolerate a gap between receiving events before declaring the
  // connection dead. The browser auto-reconnects EventSource with Last-Event-ID,
  // so this only trips if retries aren't making progress.
  const CONNECTION_GRACE_MS = 45_000;

  function handleCancel() {
    if (esInstance && !isClosed) {
      isClosed = true;
      esInstance.close();
      esInstance = null;
    }
    if (fatalTimer) { clearTimeout(fatalTimer); fatalTimer = null; }
    oncancelled?.();
  }

  function currentTimestamp(): string {
    return new Date().toTimeString().slice(0, 8);
  }

  function armFatalTimer() {
    if (fatalTimer) clearTimeout(fatalTimer);
    fatalTimer = setTimeout(() => {
      if (isClosed || fatalReported) return;
      fatalReported = true;
      isClosed = true;
      esInstance?.close();
      esInstance = null;
      onerror({ message: 'connection_lost', stage: 'unknown' });
    }, CONNECTION_GRACE_MS);
  }

  function cancelFatalTimer() {
    if (fatalTimer) { clearTimeout(fatalTimer); fatalTimer = null; }
  }

  onMount(() => {
    isClosed = false;
    fatalReported = false;
    const es = new EventSource(streamUrl);
    esInstance = es;

    const bumpLiveness = () => cancelFatalTimer();

    es.addEventListener('log', (e) => {
      bumpLiveness();
      const data = JSON.parse((e as MessageEvent).data);
      visibleLines = [...visibleLines, { time: currentTimestamp(), text: data.message }];
    });

    es.addEventListener('low_confidence', (e) => {
      bumpLiveness();
      const data = JSON.parse((e as MessageEvent).data);
      onlowconfidence?.({ event_count: data.event_count });
    });

    es.addEventListener('ticker_candidates', (e) => {
      bumpLiveness();
      const data = JSON.parse((e as MessageEvent).data) as TickerCandidatesPayload;
      ontickercandidates(data);
    });

    es.addEventListener('entry_exit_suggestions', (e) => {
      bumpLiveness();
      const data = JSON.parse((e as MessageEvent).data) as EntryExitSuggestionsPayload;
      onentryexitsuggestions(data);
    });

    es.addEventListener('stage_started', bumpLiveness);
    es.addEventListener('stage_done', bumpLiveness);

    es.addEventListener('result', (e) => {
      cancelFatalTimer();
      const data = JSON.parse((e as MessageEvent).data);
      isClosed = true;
      es.close();
      esInstance = null;
      oncomplete(data.slug);
    });

    es.addEventListener('error', (e) => {
      // Named server-sent "error" event (carries JSON payload) — terminal.
      if (e instanceof MessageEvent && e.data) {
        try {
          const data = JSON.parse(e.data);
          cancelFatalTimer();
          isClosed = true;
          fatalReported = true;
          es.close();
          esInstance = null;
          onerror(data);
        } catch {
          // Transport-level error event without payload — fall through to onerror handler below.
        }
      }
    });

    es.onerror = () => {
      // Transport-level error. Browser auto-reconnects using Last-Event-ID;
      // only surface a fatal error if no event arrives within the grace window.
      if (isClosed || fatalReported) return;
      if (es.readyState === EventSource.CLOSED) {
        // Server explicitly closed the stream (e.g. complete state) — not fatal on its own.
        return;
      }
      armFatalTimer();
    };

    return () => {
      isClosed = true;
      cancelFatalTimer();
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
