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

  // suppress unused warning — sessionId is part of the public interface
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
      // Custom server-sent error events have a MessageEvent.data field.
      // Connection-level errors do not — handled by es.onerror below.
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

<div class="log-wrap">
  {#if oncancelled}
    <div class="log-header">
      <button class="cancel-stream-btn" onclick={handleCancel}>Cancel & Edit</button>
    </div>
  {/if}
  <div class="log-rail">
    {#each visibleLines as line}
      <div class="log-line">
        <span class="timestamp">{line.time}</span>
        <span class="log-text">{line.text}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .log-wrap {
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .log-header {
    display: flex;
    justify-content: flex-end;
  }

  .cancel-stream-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
    transition: color 100ms;
  }

  .cancel-stream-btn:hover {
    color: var(--text-secondary);
  }

  .log-rail {
    border-left: 3px solid var(--bg-border);
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .log-line {
    display: flex;
    gap: 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .timestamp {
    color: var(--text-muted);
    flex-shrink: 0;
    user-select: none;
  }

  .log-text {
    color: var(--text-secondary);
  }
</style>
