<script lang="ts">
  import type { DimensionGrade, Citation } from '$lib/types/terminal';
  import { DIMENSION_NAMES, citationDomain, faviconUrl } from './grade';

  interface Props {
    dimensions: DimensionGrade[] | null;
    citations: Citation[] | null;
  }

  let { dimensions, citations }: Props = $props();

  // Groups: one per dimension (its top citations), plus any pool citations not
  // already shown. Numbering runs continuously across the whole appendix.
  const groups = $derived.by(() => {
    const seen = new Set<string>();
    let n = 0;
    const out: { label: string; items: (Citation & { n: number })[] }[] = [];

    const take = (list: Citation[]): (Citation & { n: number })[] => {
      const items: (Citation & { n: number })[] = [];
      for (const c of list) {
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        items.push({ ...c, n: ++n });
      }
      return items;
    };

    for (const d of dimensions ?? []) {
      const items = take(d.top_citations);
      if (items.length) out.push({ label: `${d.dimension} — ${DIMENSION_NAMES[d.dimension]}`, items });
    }
    const extra = take(citations ?? []);
    if (extra.length) out.push({ label: 'Additional sources', items: extra });

    return out;
  });
</script>

<section class="py-24 px-8 lg:px-12 bg-[#171717] text-[#fcfbf9]">
  <div class="max-w-[1440px] mx-auto">
    <div class="border-b border-[#fcfbf9]/10 pb-8 mb-12">
      <span class="mono-label text-indigo-400 text-[10px]">Appendix — Evidence</span>
      <h2 class="serif-italic text-4xl md:text-5xl tracking-tight mt-3">Citations</h2>
    </div>

    {#if groups.length === 0}
      <p class="font-serif text-lg text-[#fcfbf9]/50 italic">No citations recorded.</p>
    {:else}
      <div class="flex flex-col gap-12">
        {#each groups as g}
          <div>
            <span class="mono-label text-[10px] text-indigo-400/70 block mb-5">{g.label}</span>
            <ul class="list-none flex flex-col gap-3 p-0 m-0">
              {#each g.items as c}
                <li class="flex items-start gap-4 font-sans text-[13px] text-[#fcfbf9]/60">
                  <span class="font-mono text-[11px] text-[#fcfbf9]/30 mt-0.5 w-6 shrink-0 text-right">{c.n}</span>
                  <img src={faviconUrl(c.url)} alt="" width="14" height="14" class="mt-0.5 rounded-sm shrink-0 opacity-70" loading="lazy" />
                  <span class="min-w-0">
                    {c.title ?? c.url}
                    {#if c.published_at}<span class="text-[#fcfbf9]/30">· {c.published_at}</span>{/if}
                    <a href={c.url} target="_blank" rel="noopener noreferrer"
                      class="block text-indigo-400/60 no-underline hover:text-indigo-400 transition-colors">↗ {citationDomain(c.url)}</a>
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
