<script lang="ts">
  import { onMount } from 'svelte';
  import { subscribeSSE } from '$lib/sse';

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
    onentryexitsuggestions: (data: EntryExitSuggestionsPayload) => void;
    oncomplete: (backtestId: string) => void;
    onerror: (data: { message: string; stage: string }) => void;
    oncancelled?: () => void;
  }

  let { streamUrl, onentryexitsuggestions, oncomplete, onerror, oncancelled }: Props = $props();

  interface LogLine {
    time: string;
    text: string;
  }

  let visibleLines = $state<LogLine[]>([]);

  let teardown: () => void = () => {};

  function handleCancel() {
    teardown();
    oncancelled?.();
  }

  function currentTimestamp(): string {
    return new Date().toTimeString().slice(0, 8);
  }

  onMount(() => {
    teardown = subscribeSSE(streamUrl, {
      // Max time we tolerate an unresolved transport error before declaring the
      // connection dead. The browser auto-reconnects EventSource with
      // Last-Event-ID, so this only trips if retries aren't making progress.
      graceMs: 45_000,
      onfatal: () => onerror({ message: 'connection_lost', stage: 'unknown' }),
      on: {
        log: (e) => {
          const data = JSON.parse(e.data);
          visibleLines = [...visibleLines, { time: currentTimestamp(), text: data.message }];
        },
        entry_exit_suggestions: (e) => {
          onentryexitsuggestions(JSON.parse(e.data) as EntryExitSuggestionsPayload);
        },
        // Liveness only — receiving these resets the watchdog.
        stage_started: () => {},
        stage_done: () => {},
        result: (e) => {
          const data = JSON.parse(e.data);
          teardown();
          oncomplete(data.slug);
        },
        error: (e) => {
          // Named server-sent "error" event (carries JSON payload) — terminal.
          // Transport-level error events have no payload and go to the watchdog.
          if (!(e instanceof MessageEvent) || !e.data) return;
          try {
            const data = JSON.parse(e.data);
            teardown();
            onerror(data);
          } catch {
            /* transport-level error without payload */
          }
        },
      },
    });
    return teardown;
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
