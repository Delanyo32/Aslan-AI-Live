<script lang="ts">
  import type { ReconciliationVerdict } from '$lib/types/terminal';
  import PriceChart from '$lib/components/charts/PriceChart.svelte';

  interface Props {
    verdict: ReconciliationVerdict | null;
  }

  let { verdict }: Props = $props();

  // Price line only when we have a US price series with ≥2 points.
  const priceSeries = $derived(verdict?.price_series ?? []);
  const showPriceChart = $derived(priceSeries.length >= 2);

  const BUCKET_HEADLINE: Record<ReconciliationVerdict['bucket'], string> = {
    priced_for_more: 'Priced for more than the evidence supports',
    roughly_priced:  'Roughly priced to the evidence',
    priced_for_less: 'Priced for less than the evidence supports',
  };

  function pct(n: number): string {
    return (n * 100).toFixed(1) + '%';
  }

  function num(n: number | null): string {
    return n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
</script>

<section class="bg-white border border-[#e5e5e5] rounded-[2rem] p-8 md:p-10">
  <div class="flex items-center gap-3 mb-6 flex-wrap">
    <span class="mono-label text-[10px] text-gray-400">Price Reconciliation</span>
    {#if verdict?.beta}
      <span class="px-2 py-0.5 bg-black text-white text-[9px] font-mono uppercase tracking-widest rounded">Beta</span>
    {/if}
    {#if verdict && verdict.confidence === 'low'}
      <span class="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono uppercase tracking-widest rounded">Low confidence</span>
    {/if}
  </div>

  {#if !verdict}
    <!-- Empty state: non-US listings carry no price verdict -->
    <h3 class="serif-italic text-2xl text-gray-900 mb-3">Price verdict is available for US listings</h3>
    <p class="font-serif text-lg text-gray-500 leading-relaxed max-w-2xl">
      This company is researched on all nine health frameworks, but the valuation
      reconciliation runs only where market prices are available. No price is scraped
      or estimated for non-US listings.
    </p>
  {:else}
    <h3 class="serif-italic text-3xl md:text-4xl text-gray-900 leading-tight mb-4">
      {BUCKET_HEADLINE[verdict.bucket]}
    </h3>
    <p class="font-serif text-xl text-gray-700 leading-relaxed max-w-3xl mb-8">
      {verdict.sentence}
    </p>

    {#if showPriceChart}
      <div class="mb-8 border border-[#eee] rounded-2xl p-5">
        <div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <span class="mono-label text-[10px] text-gray-400">Share price · past year</span>
          {#if verdict.graded_price}
            <span class="font-mono text-sm text-gray-900">
              ${verdict.graded_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              <span class="text-gray-400 text-[10px]">at grading</span>
            </span>
          {/if}
        </div>
        <PriceChart data={priceSeries} gradedPrice={verdict.graded_price} />
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Implied assumptions -->
      <div>
        <span class="mono-label text-[10px] text-gray-400 block mb-4">Implied by today's price</span>
        {#if verdict.implied}
          <dl class="flex flex-col gap-3 font-mono text-sm">
            <div class="flex justify-between border-b border-[#eee] pb-2">
              <dt class="text-gray-500">10y revenue growth</dt>
              <dd class="text-gray-900">{pct(verdict.implied.revenue_growth_10y)}</dd>
            </div>
            <div class="flex justify-between border-b border-[#eee] pb-2">
              <dt class="text-gray-500">FCF margin scenario</dt>
              <dd class="text-gray-900">{pct(verdict.implied.fcf_margin_scenario)}</dd>
            </div>
            <div class="flex justify-between border-b border-[#eee] pb-2">
              <dt class="text-gray-500">Discount rate</dt>
              <dd class="text-gray-900">{pct(verdict.implied.discount_rate)}</dd>
            </div>
          </dl>
        {:else}
          <p class="font-serif text-base text-gray-500 italic">
            Reverse-DCF did not resolve — implied assumptions unavailable for these inputs (—).
          </p>
        {/if}
      </div>

      <!-- Multiples cross-check -->
      <div>
        <span class="mono-label text-[10px] text-gray-400 block mb-4">Multiples vs peer set</span>
        {#if verdict.multiples.length > 0}
          <table class="w-full font-mono text-sm">
            <thead>
              <tr class="text-left border-b border-[#eee]">
                <th class="pb-2 font-normal text-[10px] uppercase tracking-widest text-gray-400">Metric</th>
                <th class="pb-2 font-normal text-[10px] uppercase tracking-widest text-gray-400 text-right">Company</th>
                <th class="pb-2 font-normal text-[10px] uppercase tracking-widest text-gray-400 text-right">Peer median</th>
              </tr>
            </thead>
            <tbody>
              {#each verdict.multiples as m}
                <tr class="border-b border-[#eee]">
                  <td class="py-2 text-gray-500">{m.name}</td>
                  <td class="py-2 text-gray-900 text-right">{num(m.value)}</td>
                  <td class="py-2 text-gray-500 text-right">{num(m.peer_median)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="font-serif text-base text-gray-500 italic">No peer multiples cached yet (—).</p>
        {/if}
      </div>
    </div>
  {/if}
</section>
