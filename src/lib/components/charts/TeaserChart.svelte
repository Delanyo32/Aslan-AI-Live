<!--
  Approach B — Plain SVG with manual linear scaling (no React dependency).
  Simplified PortfolioChart: no dots, no tooltip, no axis labels.
  Gradient overlay obscures the lower 60% to tease the full chart.
-->
<script lang="ts">
  interface Props {
    portfolio_series: { date: string; value: number }[];
  }

  let { portfolio_series }: Props = $props();

  const H  = 200;
  const MT = 4;
  const MR = 4;
  const MB = 4;
  const ML = 4;

  let cw = $state(600);
  const IW = $derived(cw - ML - MR);
  const IH = $derived(H - MT - MB);

  const xMin = $derived(
    portfolio_series.length ? new Date(portfolio_series[0].date).getTime() : 0
  );
  const xMax = $derived(
    portfolio_series.length
      ? new Date(portfolio_series[portfolio_series.length - 1].date).getTime()
      : 1
  );
  const yMin = $derived(
    portfolio_series.length ? Math.min(...portfolio_series.map(d => d.value)) : 0
  );
  const yMax = $derived(
    portfolio_series.length ? Math.max(...portfolio_series.map(d => d.value)) : 1
  );
  const yPad  = $derived((yMax - yMin) * 0.05 + 100);
  const yLo   = $derived(yMin - yPad);
  const yHi   = $derived(yMax + yPad);
  const xSpan = $derived(xMax - xMin || 1);
  const ySpan = $derived(yHi - yLo || 1);

  function xs(date: string): number {
    return ML + ((new Date(date).getTime() - xMin) / xSpan) * IW;
  }

  function ys(value: number): number {
    return MT + IH - ((value - yLo) / ySpan) * IH;
  }

  const linePath = $derived.by(() => {
    if (portfolio_series.length < 2) return '';
    return portfolio_series
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(d.date).toFixed(1)},${ys(d.value).toFixed(1)}`)
      .join(' ');
  });
</script>

<div class="relative w-full overflow-hidden" bind:clientWidth={cw}>
  <svg width={cw} height={H} aria-hidden="true">
    {#if linePath}
    <path d={linePath} fill="none" stroke="var(--chart-line)" stroke-width="1.5" />
    {/if}
  </svg>
  <!-- Gradient overlay: lower 60% fades to background -->
  <div
    class="absolute w-full bottom-0 h-[60%] pointer-events-none"
    style="background: linear-gradient(to bottom, transparent, var(--bg-base))"
    aria-hidden="true"
  ></div>
</div>

<style>
  /* SVG element selector — cannot be targeted with Tailwind utilities */
  svg { display: block; }
</style>
