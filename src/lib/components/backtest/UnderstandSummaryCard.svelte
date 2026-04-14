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
    <div class="flex flex-col gap-[10px] pt-1">
      <p class="font-sans text-sm text-text-primary leading-[1.6] m-0">{understand.event_spec.event_description}</p>
      <p class="flex items-center gap-[6px] flex-wrap m-0">
        <span class="font-sans text-xs text-text-secondary lowercase">{understand.event_spec.event_type}</span>
        <span class="text-xs text-text-muted select-none">·</span>
        <span class="font-mono text-xs text-text-secondary">
          {formatDate(understand.event_spec.date_range.start)} → {formatDate(understand.event_spec.date_range.end)}
        </span>
        {#if understand.event_spec.geography}
          <span class="text-xs text-text-muted select-none">·</span>
          <span class="font-sans text-xs text-text-muted">{understand.event_spec.geography}</span>
        {/if}
      </p>

      {#if previewArticles.length > 0}
        <div class="flex flex-col gap-[6px] border-l-2 border-black pl-[10px] mt-[2px]">
          {#each previewArticles as article}
            {@const src = article.sources[0]}
            <div class="flex flex-col gap-[2px]">
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                class="font-sans text-xs text-text-secondary no-underline leading-[1.4] hover:underline hover:decoration-black"
              >
                {src.title}
              </a>
              <p class="flex items-center gap-1 m-0">
                <span class="font-sans text-xs text-text-muted capitalize">{extractSource(src.url)}</span>
                <span class="text-xs text-text-muted select-none">·</span>
                <span class="font-mono text-xs text-text-muted">{formatDate(article.event_date)}</span>
              </p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</StepCard>
