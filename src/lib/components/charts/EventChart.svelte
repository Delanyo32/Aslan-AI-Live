<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
    entry_price,
    exit_date,
    exit_price,
    impact_window_end,
    direction,
  }: Props = $props();

  let container: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chart: any;
  let resizeObserver: ResizeObserver | undefined;
  let windowLineX = $state<number | null>(null);

  function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Normalize OHLCV closes to index 100 at the first bar for visual comparison.
  function toIndexSeries(bars: OHLCVBar[]): { time: string; value: number }[] {
    if (!bars || bars.length === 0) return [];
    const base = bars[0].close;
    if (base === 0) return [];
    return bars.map(b => ({ time: b.date, value: (b.close / base) * 100 }));
  }

  // Find the nearest available time at-or-after a target date in a data series.
  function nearestAtOrAfter(data: { time: string }[], target: string): string | null {
    return data.find(d => d.time >= target)?.time ?? null;
  }

  function syncWindowLine() {
    if (!chart) return;
    try {
      const x = chart.timeScale().timeToCoordinate(impact_window_end);
      windowLineX = x !== null && x > 0 ? x : null;
    } catch {
      windowLineX = null;
    }
  }

  onMount(async () => {
    const {
      createChart,
      ColorType,
      LineStyle,
      LineSeries,
      AreaSeries,
      createSeriesMarkers,
    } = await import('lightweight-charts');

    const bgSurface  = cssVar('--bg-surface')  || '#111111';
    const textMuted  = cssVar('--text-muted')  || '#3d3b38';
    const chartLine  = cssVar('--chart-line')  || '#f0ede8';
    const chartBench = cssVar('--chart-bench') || '#3d3b38';
    const chartEntry = cssVar('--chart-entry') || '#4ade80';
    const chartExit  = cssVar('--chart-exit')  || '#f87171';
    const chartHold  = cssVar('--chart-hold')  || 'rgba(240,237,232,0.06)';

    chart = createChart(container, {
      width:  container.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: bgSurface },
        textColor:  textMuted,
        fontSize:   11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair:       { mode: 1 },   // CrosshairMode.Normal
      rightPriceScale: { visible: false },
      leftPriceScale:  { visible: false },
      timeScale: {
        borderColor:  textMuted,
        fixLeftEdge:  true,
        fixRightEdge: true,
      },
      handleScroll: false,
      handleScale:  false,
    });

    const tickerData = toIndexSeries(ohlcv);

    // ── Hold-period background shading ────────────────────────────────────
    // An AreaSeries on the same price scale gives a subtle shaded region
    // beneath the ticker line during the hold window.
    if (tickerData.length > 0 && entry_date && exit_date) {
      const holdSeries = chart.addSeries(AreaSeries, {
        lineColor:              'transparent',
        topColor:               chartHold,
        bottomColor:            chartHold,
        crosshairMarkerVisible: false,
        priceLineVisible:       false,
        lastValueVisible:       false,
      });
      const holdData = tickerData.filter(d => d.time >= entry_date && d.time <= exit_date);
      if (holdData.length > 0) holdSeries.setData(holdData);
    }

    // ── Ticker price line ─────────────────────────────────────────────────
    const tickerSeries = chart.addSeries(LineSeries, {
      color:            chartLine,
      lineWidth:        1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    if (tickerData.length > 0) tickerSeries.setData(tickerData);

    // ── SPY benchmark line (dashed) ───────────────────────────────────────
    if (spy_ohlcv && spy_ohlcv.length > 0) {
      const spySeries = chart.addSeries(LineSeries, {
        color:            chartBench,
        lineWidth:        1,
        lineStyle:        LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      spySeries.setData(toIndexSeries(spy_ohlcv));
    }

    // ── Entry / exit markers ──────────────────────────────────────────────
    type Marker = Parameters<typeof createSeriesMarkers>[1] extends (infer M)[] | undefined
      ? M
      : never;
    const markers: Marker[] = [];

    const entryTime = nearestAtOrAfter(tickerData, entry_date);
    if (entryTime) {
      markers.push({
        time:     entryTime,
        position: 'belowBar',
        shape:    'arrowUp',
        color:    chartEntry,
        size:     1,
      });
    }

    const exitTime = nearestAtOrAfter(tickerData, exit_date);
    if (exitTime && exitTime !== entryTime) {
      markers.push({
        time:     exitTime,
        position: 'aboveBar',
        shape:    'arrowDown',
        color:    chartExit,
        size:     1,
      });
    }

    if (markers.length > 0) {
      createSeriesMarkers(
        tickerSeries,
        markers.sort((a, b) => String(a.time).localeCompare(String(b.time))),
      );
    }

    chart.timeScale().fitContent();

    // Keep the amber window-end line in sync with chart panning / zooming.
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      requestAnimationFrame(syncWindowLine);
    });
    requestAnimationFrame(syncWindowLine);

    resizeObserver = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      chart?.applyOptions({ width });
      requestAnimationFrame(syncWindowLine);
    });
    resizeObserver.observe(container);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    chart?.remove();
    chart = undefined;
  });
</script>

<div class="chart-wrap">
  <div bind:this={container} class="chart-container"></div>

  <!-- Impact window end: dashed amber vertical overlay -->
  {#if windowLineX !== null}
  <div
    class="window-line"
    style:left="{windowLineX}px"
    aria-hidden="true"
  ></div>
  {/if}
</div>

<style>
  .chart-wrap {
    position: relative;
    width: 100%;
    height: 280px;
    overflow: hidden;
  }

  .chart-container {
    width: 100%;
    height: 280px;
  }

  .window-line {
    position: absolute;
    top: 0;
    width: 1px;
    height: 100%;
    pointer-events: none;
    background: repeating-linear-gradient(
      to bottom,
      var(--accent-amber)  0px,
      var(--accent-amber)  4px,
      transparent          4px,
      transparent          8px
    );
  }
</style>
