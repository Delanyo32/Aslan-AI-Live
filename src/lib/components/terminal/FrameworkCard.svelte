<script lang="ts">
  import type { DimensionGrade } from '$lib/types/terminal';
  import { DIMENSION_NAMES, gradeStyle, TREND, CONFIDENCE_LABEL, citationDomain, faviconUrl } from './grade';

  interface Props {
    grade: DimensionGrade;
    isOwner: boolean;
  }

  let { grade, isOwner }: Props = $props();

  const style = $derived(gradeStyle(grade.grade));
  const trend = $derived(TREND[grade.trend]);
  const cites = $derived(grade.top_citations.slice(0, 3));
</script>

<div class="bg-white border border-[#e5e5e5] rounded-2xl p-6 flex flex-col gap-5 h-full">
  <!-- Header: id/name + grade -->
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <span class="mono-label text-[10px] text-gray-400 block mb-1">{grade.dimension}</span>
      <h4 class="font-serif text-lg text-gray-900 leading-snug">{DIMENSION_NAMES[grade.dimension]}</h4>
    </div>
    <div class="flex items-center justify-center w-14 h-14 rounded-xl border-2 {style.border} {style.bg} shrink-0">
      <span class="font-serif text-3xl leading-none {style.text}">{grade.grade}</span>
    </div>
  </div>

  <!-- Meta row: score, trend, confidence -->
  <div class="flex items-center gap-3 flex-wrap font-mono text-[11px]">
    <span class="text-gray-900">{grade.score}<span class="text-gray-400">/100</span></span>
    <span class="text-[#ccc]">·</span>
    <span class="{trend.class} inline-flex items-center gap-1" title={trend.label}>{trend.arrow} {trend.label}</span>
    <span class="text-[#ccc]">·</span>
    <span class="text-gray-500 uppercase tracking-widest text-[10px]">{CONFIDENCE_LABEL[grade.confidence]}</span>
  </div>

  <!-- One-line summary -->
  <p class="font-serif text-base text-gray-700 leading-relaxed">{grade.summary}</p>

  <!-- Flags (evidence-language observations) -->
  {#if grade.flags.length > 0}
    <div class="flex flex-col gap-2">
      {#each grade.flags as flag}
        <div class="border-l-[3px] border-red-400 bg-red-50/60 rounded-r-lg px-3 py-2">
          <div class="flex items-center gap-2 mb-1">
            <span class="mono-label text-[9px] text-red-700">Flag · {flag.status}</span>
            <span class="font-mono text-[9px] text-red-500/70 uppercase tracking-widest">{flag.action}</span>
          </div>
          <p class="font-sans text-[13px] text-red-800 leading-snug">{flag.summary}</p>
          {#if isOwner && flag.detail}
            <p class="font-sans text-[13px] text-red-700/70 leading-snug mt-1.5 pt-1.5 border-t border-red-200">{flag.detail}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Top-3 citations -->
  {#if cites.length > 0}
    <ul class="list-none flex flex-col gap-2 mt-auto pt-3 border-t border-[#f0f0f0] p-0 m-0">
      {#each cites as c}
        <li>
          <a href={c.url} target="_blank" rel="noopener noreferrer"
            class="flex items-start gap-2 text-[12px] text-gray-500 hover:text-black transition-colors no-underline group">
            <img src={faviconUrl(c.url)} alt="" width="14" height="14" class="mt-0.5 rounded-sm shrink-0 opacity-70" loading="lazy" />
            <span class="min-w-0">
              <span class="text-gray-400 font-mono text-[10px]">{citationDomain(c.url)}</span>
              <span class="block truncate group-hover:underline">{c.title ?? c.url}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
