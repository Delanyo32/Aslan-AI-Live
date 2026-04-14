<script lang="ts">
  import type { UnderstandResponse, RawExaEvent } from '$lib/types/pipeline';

  export interface ClarifyAnswers {
    answers: Array<{ question: string; answer: string }>;
  }

  interface Props {
    understand: UnderstandResponse;
    articles: RawExaEvent[];          // top 3 from detect-events
    oncontinue: (answers: ClarifyAnswers) => void;
    onrefine: () => void;
  }

  let { understand, articles, oncontinue, onrefine }: Props = $props();

  function formatDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function extractSource(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return url;
    }
  }

  // Build answer state: one entry per clarifying question
  // Each entry starts with the first option pre-selected
  let answers = $state<string[]>(
    understand.clarifying_questions.map(q => q.options[0] ?? '')
  );
  let customInputs = $state<string[]>(
    understand.clarifying_questions.map(() => '')
  );
  // 'option' | 'custom' per question
  let modes = $state<('option' | 'custom')[]>(
    understand.clarifying_questions.map(() => 'option')
  );

  function handleContinue() {
    const result: Array<{ question: string; answer: string }> = [];
    for (let i = 0; i < understand.clarifying_questions.length; i++) {
      const answer = modes[i] === 'custom'
        ? customInputs[i].trim()
        : answers[i];
      if (answer) {
        result.push({ question: understand.clarifying_questions[i].question, answer });
      }
    }
    oncontinue({ answers: result });
  }

  // Displayed articles: top 3 with a source
  const previewArticles = $derived(
    articles
      .filter(a => a.sources.length > 0)
      .slice(0, 3)
  );
</script>

<div class="flex flex-col gap-6">
  <hr class="border-none border-t border-black m-0" />

  <!-- Understanding card -->
  <div class="flex flex-col gap-3">
    <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-secondary m-0">ASLAN UNDERSTOOD</p>
    <p class="font-sans text-base text-text-primary leading-[1.6] m-0">{understand.event_spec.event_description}</p>
    <p class="flex items-center gap-2 flex-wrap m-0">
      <span class="font-sans text-sm text-text-secondary lowercase">{understand.event_spec.event_type}</span>
      <span class="text-sm text-text-muted select-none">·</span>
      <span class="font-mono text-sm text-text-secondary">
        {formatDate(understand.event_spec.date_range.start)} → {formatDate(understand.event_spec.date_range.end)}
      </span>
    </p>
  </div>

  <!-- News evidence -->
  {#if previewArticles.length > 0}
    <div class="flex flex-col gap-3">
      <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-secondary m-0">NEWS EVIDENCE</p>
      <div class="flex flex-col gap-4">
        {#each previewArticles as article}
          {@const src = article.sources[0]}
          <div class="flex flex-col gap-1 p-3 bg-bg-surface border border-black">
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              class="font-sans text-sm text-text-primary no-underline leading-[1.5] hover:underline hover:decoration-black"
            >{src.title}</a>
            <p class="flex items-center gap-[6px] m-0">
              <span class="font-sans text-xs text-text-muted capitalize">{extractSource(src.url)}</span>
              <span class="text-xs text-text-muted select-none">·</span>
              <span class="font-mono text-xs text-text-muted">{formatDate(article.event_date)}</span>
            </p>
            <p class="font-sans text-sm text-text-secondary leading-[1.55] mt-1 mb-0">{article.description}</p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Clarifying questions (only if HIGH ambiguity) -->
  {#if understand.ambiguity === 'HIGH' && understand.clarifying_questions.length > 0}
    <div class="flex flex-col gap-3">
      <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-text-secondary m-0">A FEW QUESTIONS</p>
      <div class="flex flex-col gap-5">
        {#each understand.clarifying_questions as cq, i}
          <div class="flex flex-col gap-[10px]">
            <p class="font-sans text-base text-text-primary m-0">{cq.question}</p>
            <div class="flex flex-wrap gap-y-1 gap-x-5">
              {#each cq.options as option}
                <button
                  class="flex items-center gap-[7px] bg-transparent border-none p-0 font-sans text-sm cursor-pointer transition-colors duration-100 {modes[i] === 'option' && answers[i] === option ? 'text-text-primary' : 'text-text-secondary'}"
                  onclick={() => { answers[i] = option; modes[i] = 'option'; }}
                >
                  <span class="text-[11px] leading-none">{modes[i] === 'option' && answers[i] === option ? '●' : '○'}</span>
                  {option}
                </button>
              {/each}
              <!-- Other / custom answer -->
              <button
                class="flex items-center gap-[7px] bg-transparent border-none p-0 font-sans text-sm cursor-pointer transition-colors duration-100 {modes[i] === 'custom' ? 'text-text-primary' : 'text-text-secondary'}"
                onclick={() => { modes[i] = 'custom'; }}
              >
                <span class="text-[11px] leading-none">{modes[i] === 'custom' ? '●' : '○'}</span>
                Other
              </button>
            </div>
            {#if modes[i] === 'custom'}
              <input
                type="text"
                class="w-full px-[10px] py-[7px] bg-bg-surface border border-black text-text-primary font-sans text-sm rounded-none outline-none focus:border-[#525252] placeholder:text-text-muted"
                placeholder="Type your answer…"
                bind:value={customInputs[i]}
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex items-center gap-5">
    <button
      type="button"
      class="px-5 py-[11px] border border-black bg-transparent text-text-primary font-sans text-base cursor-pointer rounded-none transition-colors duration-100 hover:bg-bg-elevated"
      onclick={handleContinue}
    >
      Continue →
    </button>
    <button
      type="button"
      class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer underline decoration-black hover:text-text-primary hover:decoration-black"
      onclick={onrefine}
    >
      Refine query →
    </button>
  </div>
</div>
