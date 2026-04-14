<script lang="ts">
  import { scalePoint } from 'd3-scale';
  import { Chart, Svg, Spline, Area, Axis, Highlight } from 'layerchart';
  import type { OHLCVBar } from '$lib/types/pipeline';

  interface Props {
    ohlcv:             OHLCVBar[];
    spy_ohlcv?:        OHLCVBar[];
    entry_date:        string;
    entry_price:       number;
    exit_date:         string;
    exit_price:        number;
    impact_window_end: string;
    direction:         'long' | 'short';
  }

  let {
    ohlcv,
    spy_ohlcv = [],
    entry_date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    entry_price,
    exit_date,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    exit_price,
    impact_window_end,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    direction,
  }: Props = $props();

  // Normalize OHLCV closes to index 100 at the first bar for visual comparison.
  function toIndexSeries(bars: OHLCVBar[]): { date: string; value: number }[] {
    if (!bars || bars.length === 0) return [];
    const base = bars[0].close;
    if (base === 0) return [];
    return bars.map(b => ({ date: b.date, value: (b.close / base) * 100 }));
  }

  const tickerData = $derived(toIndexSeries(ohlcv));
  const spyData    = $derived(spy_ohlcv?.length ? toIndexSeries(spy_ohlcv) : []);
  const holdData   = $derived(
    tickerData.filter(d => d.date >= entry_date && d.date <= exit_date)
  );

  // Find the ticker's normalized value nearest to entry / exit for marker placement.
  const entryPoint = $derived(tickerData.find(d => d.date >= entry_date) ?? null);
  const exitPoint  = $derived(tickerData.find(d => d.date >= exit_date)  ?? null);

  // Build x domain from all series dates + impact_window_end so the impact line
  // renders even when impact_window_end falls after the last trading day.
  const xDomain = $derived(
    [
      ...tickerData.map(d => d.date),
      ...spyData.map(d => d.date),
      impact_window_end,
    ]
      .filter((d, i, a) => a.indexOf(d) === i)
      .sort()
  );

  const HALF   = 6;
  const OFFSET = 10;
</script>

<div class="h-[280px] w-full">
  <!--
    let:xScale / let:yScale / let:height — the computed D3 scale functions and inner
    chart height, exposed as slot props by Chart (from LayerCake). Used below to
    position custom SVG overlays without needing chartContext().
  -->
  <Chart
    data={tickerData}
    x="date"
    y="value"
    xScale={scalePoint().padding(0)}
    {xDomain}
    yNice
    padding={{ top: 16, right: 8, bottom: 28, left: 8 }}
    tooltip={{ mode: 'bisect-x' }}
    let:xScale
    let:yScale
    let:height
  >
    <Svg>
      <!-- Hold-period background shading -->
      {#if holdData.length}
        <Area
          data={holdData}
          x="date"
          y1="value"
          fill="var(--chart-hold)"
          stroke="none"
        />
      {/if}

      <!-- SPY benchmark line (dashed) -->
      {#if spyData.length}
        <Spline
          data={spyData}
          x="date"
          y="value"
          fill="none"
          stroke="var(--chart-bench)"
          strokeWidth={1}
          style="stroke-dasharray: 4 4"
        />
      {/if}

      <!-- Ticker price line -->
      <Spline fill="none" stroke="var(--chart-line)" strokeWidth={1.5} />

      <!-- Date axis -->
      <Axis placement="bottom" ticks={5} format={(d: string) => d.slice(5)} />

      <!-- Crosshair -->
      <Highlight lines axis="x" points={false} />

      <!-- Impact window end: dashed amber vertical line -->
      {@const wx = xScale(impact_window_end)}
      {#if wx != null}
        <line
          x1={wx} y1={0}
          x2={wx} y2={height}
          stroke="var(--accent-amber)"
          stroke-width="1"
          stroke-dasharray="4 4"
          pointer-events="none"
        />
      {/if}

      <!-- Entry arrow marker (green upward triangle) -->
      {#if entryPoint}
        {@const ex = xScale(entryPoint.date)}
        {@const ey = yScale(entryPoint.value)}
        {#if ex != null && ey != null}
          <polygon
            points="{ex},{ey + OFFSET} {ex - HALF},{ey + OFFSET + HALF * 1.6} {ex + HALF},{ey + OFFSET + HALF * 1.6}"
            fill="var(--chart-entry)"
            opacity="0.9"
          />
        {/if}
      {/if}

      <!-- Exit arrow marker (red downward triangle) -->
      {#if exitPoint}
        {@const xx = xScale(exitPoint.date)}
        {@const xy = yScale(exitPoint.value)}
        {#if xx != null && xy != null}
          <polygon
            points="{xx},{xy - OFFSET} {xx - HALF},{xy - OFFSET - HALF * 1.6} {xx + HALF},{xy - OFFSET - HALF * 1.6}"
            fill="var(--chart-exit)"
            opacity="0.9"
          />
        {/if}
      {/if}
    </Svg>
  </Chart>
</div>
