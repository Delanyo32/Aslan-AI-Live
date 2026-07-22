<script lang="ts">
  import type { CompositeScore } from '$lib/types/terminal';
  import { gradeStyle, CONFIDENCE_LABEL } from './grade';

  interface Props {
    company: { name: string; ticker: string; is_us: boolean };
    composite: CompositeScore | null;
    createdAt: string | Date;
    rubricVersion: string;
  }

  let { company, composite, createdAt, rubricVersion }: Props = $props();

  const style = $derived(composite ? gradeStyle(composite.grade) : null);

  function fmtDate(d: string | Date): string {
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<div class="mb-12">
  <div class="flex items-center gap-4 mb-6 flex-wrap">
    <span class="mono-label text-[#4338ca] text-[10px]">Aslan Report</span>
    {#if company.is_us}
      <span class="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-mono uppercase tracking-widest rounded">US Listing</span>
    {:else}
      <span class="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-mono uppercase tracking-widest rounded">Research Only</span>
    {/if}
    <span class="text-gray-400 font-mono text-xs">{fmtDate(createdAt)} · Rubric {rubricVersion}</span>
  </div>

  <div class="flex flex-col md:flex-row md:items-center gap-8 md:gap-12">
    <!-- Identity -->
    <div class="flex-1 min-w-0">
      <h1 class="serif-italic text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-gray-900">
        {company.name}
      </h1>
      <span class="font-mono text-lg text-gray-500 tracking-wide">{company.ticker}</span>
    </div>

    <!-- Composite grade block -->
    {#if composite && style}
      <div class="flex items-center gap-6 shrink-0">
        <div class="flex items-center justify-center w-28 h-28 rounded-2xl border-2 {style.border} {style.bg}">
          <span class="font-serif text-6xl leading-none {style.text}">{composite.grade}</span>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-baseline gap-1">
            <span class="font-mono text-4xl tracking-tighter text-gray-900">{composite.score}</span>
            <span class="font-mono text-lg text-gray-400">/100</span>
          </div>
          <span class="mono-label text-[10px] text-gray-400">Aslan Score</span>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 w-fit">
            <span class="w-1.5 h-1.5 rounded-full {style.dot}"></span>
            <span class="font-mono text-[10px] uppercase tracking-widest text-gray-600">{CONFIDENCE_LABEL[composite.confidence]}</span>
          </span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Red banner: confirmed red-flag findings cap the score -->
  {#if composite?.red_banner}
    <div class="mt-8 flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-6 py-5">
      <span class="text-red-600 text-xl leading-none mt-0.5">▲</span>
      <div>
        <p class="font-serif text-lg text-red-800 leading-snug">
          Confirmed red-flag findings cap this score — see F9.
        </p>
        <p class="font-sans text-sm text-red-700/80 mt-1">
          One or more confirmed screen hits in Value Creation (F9) limit the composite grade regardless of the other dimensions.
        </p>
      </div>
    </div>
  {/if}
</div>
