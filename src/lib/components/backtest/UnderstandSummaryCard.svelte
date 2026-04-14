<script lang="ts">
  import StepCard from './StepCard.svelte';
  import type { UnderstandResponse, RawExaEvent } from '$lib/types/pipeline';

  interface Props {
    understand: UnderstandResponse;
    articles: RawExaEvent[];
    stale?: boolean;
  }

  let { understand, articles, stale = false }: Props = $props();

  function formatDate(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'short',
    });
  }

  function extractSource(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, '').split('.')[0]; }
    catch { return url; }
  }

  const collapsedSummary = $derived(
    `${understand.event_spec.event_type} · ${formatDate(understand.event_spec.date_range.start)} → ${formatDate(understand.event_spec.date_range.end)}`
  );

  const previewArticles = $derived(
    articles.filter(a => a.sources.length > 0).slice(0, 3)
  );
</script>

<StepCard label="Understanding" {stale} editable={false}>
  {#snippet summary()}
    {collapsedSummary}
  {/snippet}

  {#snippet children()}
    <div class="detail">
      <p class="event-desc">{understand.event_spec.event_description}</p>
      <p class="event-meta">
        <span class="event-type">{understand.event_spec.event_type}</span>
        <span class="sep">·</span>
        <span class="date-range">
          {formatDate(understand.event_spec.date_range.start)} → {formatDate(understand.event_spec.date_range.end)}
        </span>
        {#if understand.event_spec.geography}
          <span class="sep">·</span>
          <span class="geo">{understand.event_spec.geography}</span>
        {/if}
      </p>

      {#if previewArticles.length > 0}
        <div class="articles">
          {#each previewArticles as article}
            {@const src = article.sources[0]}
            <div class="article-card">
              <a href={src.url} target="_blank" rel="noopener noreferrer" class="article-headline">
                {src.title}
              </a>
              <p class="article-meta">
                <span class="article-source">{extractSource(src.url)}</span>
                <span class="sep">·</span>
                <span class="article-date">{formatDate(article.event_date)}</span>
              </p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</StepCard>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 4px;
  }

  .event-desc {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
  }

  .event-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin: 0;
  }

  .event-type {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    text-transform: lowercase;
  }

  .sep {
    font-size: var(--text-xs);
    color: var(--text-muted);
    user-select: none;
  }

  .date-range {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .geo {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .articles {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-left: 2px solid var(--bg-border);
    padding-left: 10px;
    margin-top: 2px;
  }

  .article-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .article-headline {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    text-decoration: none;
    line-height: 1.4;
  }

  .article-headline:hover {
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .article-meta {
    display: flex;
    align-items: center;
    gap: 4px;
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
</style>
