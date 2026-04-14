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

<div class="understand-preview">
  <hr class="divider" />

  <!-- ── Understanding card ─────────────────────────────────────────────── -->
  <div class="section">
    <p class="section-label">ASLAN UNDERSTOOD</p>
    <p class="event-description">{understand.event_spec.event_description}</p>
    <p class="event-meta">
      <span class="event-type">{understand.event_spec.event_type}</span>
      <span class="meta-sep">·</span>
      <span class="date-range">
        {formatDate(understand.event_spec.date_range.start)} → {formatDate(understand.event_spec.date_range.end)}
      </span>
    </p>
  </div>

  <!-- ── News evidence ──────────────────────────────────────────────────── -->
  {#if previewArticles.length > 0}
    <div class="section">
      <p class="section-label">NEWS EVIDENCE</p>
      <div class="articles">
        {#each previewArticles as article}
          {@const src = article.sources[0]}
          <div class="article-card">
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              class="article-headline"
            >{src.title}</a>
            <p class="article-meta">
              <span class="article-source">{extractSource(src.url)}</span>
              <span class="meta-sep">·</span>
              <span class="article-date">{formatDate(article.event_date)}</span>
            </p>
            <p class="article-summary">{article.description}</p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Clarifying questions (only if HIGH ambiguity) ─────────────────── -->
  {#if understand.ambiguity === 'HIGH' && understand.clarifying_questions.length > 0}
    <div class="section">
      <p class="section-label">A FEW QUESTIONS</p>
      <div class="questions">
        {#each understand.clarifying_questions as cq, i}
          <div class="question">
            <p class="question-text">{cq.question}</p>
            <div class="options">
              {#each cq.options as option}
                <button
                  class="radio-option"
                  class:selected={modes[i] === 'option' && answers[i] === option}
                  onclick={() => { answers[i] = option; modes[i] = 'option'; }}
                >
                  <span class="radio-mark">{modes[i] === 'option' && answers[i] === option ? '●' : '○'}</span>
                  {option}
                </button>
              {/each}
              <!-- Other / custom answer -->
              <button
                class="radio-option"
                class:selected={modes[i] === 'custom'}
                onclick={() => { modes[i] = 'custom'; }}
              >
                <span class="radio-mark">{modes[i] === 'custom' ? '●' : '○'}</span>
                Other
              </button>
            </div>
            {#if modes[i] === 'custom'}
              <input
                type="text"
                class="custom-input"
                placeholder="Type your answer…"
                bind:value={customInputs[i]}
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Actions ────────────────────────────────────────────────────────── -->
  <div class="actions">
    <button type="button" class="continue-btn" onclick={handleContinue}>
      Continue →
    </button>
    <button type="button" class="refine-btn" onclick={onrefine}>
      Refine query →
    </button>
  </div>
</div>

<style>
  .understand-preview {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .divider {
    border: none;
    border-top: 1px solid var(--bg-border);
    margin: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin: 0;
  }

  /* Understanding */
  .event-description {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
  }

  .event-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0;
  }

  .event-type {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-transform: lowercase;
  }

  .meta-sep {
    font-size: var(--text-sm);
    color: var(--text-muted);
    user-select: none;
  }

  .date-range {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  /* Articles */
  .articles {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .article-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--bg-border);
  }

  .article-headline {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-primary);
    text-decoration: none;
    line-height: 1.5;
  }

  .article-headline:hover {
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .article-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }

  .article-source {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-transform: capitalize;
  }

  .article-date {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .article-summary {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: 1.55;
    margin: 4px 0 0;
  }

  /* Clarifying questions */
  .questions {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .question {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .question-text {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    margin: 0;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 7px;
    background: none;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 100ms;
  }

  .radio-option.selected {
    color: var(--text-primary);
  }

  .radio-mark {
    font-size: 11px;
    line-height: 1;
  }

  .custom-input {
    width: 100%;
    padding: 7px 10px;
    background: var(--bg-surface);
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    border-radius: 2px;
    outline: none;
  }

  .custom-input:focus {
    border-color: var(--text-secondary);
  }

  .custom-input::placeholder {
    color: var(--text-muted);
  }

  /* Actions */
  .actions {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .continue-btn {
    padding: 11px 20px;
    border: 1px solid var(--bg-border);
    background: transparent;
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    cursor: pointer;
    transition: background 100ms;
  }

  .continue-btn:hover {
    background: var(--bg-elevated);
  }

  .refine-btn {
    background: transparent;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .refine-btn:hover {
    color: var(--text-primary);
    text-decoration-color: var(--text-primary);
  }
</style>
