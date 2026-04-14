<!--
  Approach B — Plain SVG with manual linear scaling (no React dependency).
  Recharts is React-only; mounting a React root into Svelte adds ~150 kB of
  framework overhead and two reconcilers. Plain SVG + Svelte 5 $derived scales
  give full styling control with zero extra runtime.
-->
<script lang="ts">
  interface Props {
    portfolio_series:   { date: string; value: number }[];
    trade_close_points: { date: string; value: number }[];
  }

  let { portfolio_series, trade_close_points }: Props = $props();

  // ── Layout ─────────────────────────────────────────────────────────────────
  const H  = 320;
  const MT = 16;   // top
  const MR = 72;   // right — y-axis labels
  const MB = 32;   // bottom — x-axis labels
  const ML = 4;    // left

  let cw = $state(600);   // container width (bound below)
  const IW = $derived(cw - ML - MR);
  const IH = $derived(H - MT - MB);

  // ── Data extents ───────────────────────────────────────────────────────────
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
  // 5% vertical padding; +100 guards against a flat series
  const yPad  = $derived((yMax - yMin) * 0.05 + 100);
  const yLo   = $derived(yMin - yPad);
  const yHi   = $derived(yMax + yPad);
  const xSpan = $derived(xMax - xMin || 1);
  const ySpan = $derived(yHi - yLo || 1);

  // ── Scale helpers ──────────────────────────────────────────────────────────
  function xs(date: string): number {
    return ML + ((new Date(date).getTime() - xMin) / xSpan) * IW;
  }

  function ys(value: number): number {
    return MT + IH - ((value - yLo) / ySpan) * IH;
  }

  // ── SVG path ──────────────────────────────────────────────────────────────
  const linePath = $derived.by(() => {
    if (portfolio_series.length < 2) return '';
    return portfolio_series
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(d.date).toFixed(1)},${ys(d.value).toFixed(1)}`)
      .join(' ');
  });

  // ── Axis ticks ─────────────────────────────────────────────────────────────
  const xTicks = $derived.by(() => {
    const n = portfolio_series.length;
    if (n < 2) return portfolio_series.slice();
    const count = 5;
    return Array.from({ length: count }, (_, i) =>
      portfolio_series[Math.round((i / (count - 1)) * (n - 1))]
    );
  });

  const yTicks = $derived.by(() => {
    if (!portfolio_series.length) return [] as number[];
    const count = 4;
    return Array.from({ length: count }, (_, i) =>
      yLo + (i / (count - 1)) * (yHi - yLo)
    );
  });

  // ── Formatters ─────────────────────────────────────────────────────────────
  function fmtDate(iso: string): string {
    return new Date(iso + 'T00:00:00Z').toLocaleString('en-US', {
      month: 'short', year: '2-digit', timeZone: 'UTC',
    });
  }

  function fmtMoney(v: number): string {
    return '$' + Math.round(v).toLocaleString('en-US');
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────
  let tooltip = $state<{ x: number; y: number; date: string; value: number } | null>(null);

  function onMouseMove(e: MouseEvent) {
    if (!portfolio_series.length) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = portfolio_series[0];
    let bestDist = Infinity;
    for (const d of portfolio_series) {
      const dist = Math.abs(xs(d.date) - mx);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    tooltip = { x: xs(best.date), y: ys(best.value), date: best.date, value: best.value };
  }

  function onMouseLeave() {
    tooltip = null;
  }
</script>

<div class="pchart-wrap" bind:clientWidth={cw}>
  <svg
    width={cw}
    height={H}
    role="img"
    aria-label="Aggregate portfolio value over time"
    onmousemove={onMouseMove}
    onmouseleave={onMouseLeave}
  >
    <!-- Line -->
    {#if linePath}
    <path d={linePath} fill="none" stroke="var(--chart-line)" stroke-width="1.5" />
    {/if}

    <!-- Trade close dots -->
    {#each trade_close_points as pt (`${pt.date}:${pt.value}`)}
    <circle
      cx={xs(pt.date)}
      cy={ys(pt.value)}
      r="4"
      fill="var(--chart-line)"
      stroke="none"
    />
    {/each}

    <!-- X-axis labels -->
    {#each xTicks as tick (tick.date)}
    <text
      x={xs(tick.date)}
      y={H - 8}
      fill="var(--text-muted)"
      font-size="11"
      text-anchor="middle"
    >{fmtDate(tick.date)}</text>
    {/each}

    <!-- Y-axis labels — right side -->
    {#each yTicks as val, i (i)}
    <text
      x={cw - 2}
      y={ys(val) + 4}
      fill="var(--text-muted)"
      font-size="11"
      font-family="'IBM Plex Mono', monospace"
      text-anchor="end"
    >{fmtMoney(val)}</text>
    {/each}

    <!-- Tooltip guide line + highlight dot -->
    {#if tooltip}
    <line
      x1={tooltip.x}
      y1={MT}
      x2={tooltip.x}
      y2={H - MB}
      stroke="var(--text-muted)"
      stroke-width="1"
      stroke-dasharray="3,3"
    />
    <circle cx={tooltip.x} cy={tooltip.y} r="5" fill="var(--chart-line)" />
    {/if}
  </svg>

  <!-- Tooltip box -->
  {#if tooltip}
  <div
    class="tt"
    style:left="{Math.min(tooltip.x + 10, cw - 130)}px"
    style:top="{Math.max(tooltip.y - 44, 0)}px"
  >
    <span class="tt-date">{fmtDate(tooltip.date)}</span>
    <span class="tt-val">{fmtMoney(tooltip.value)}</span>
  </div>
  {/if}
</div>

<style>
  .pchart-wrap {
    position: relative;
    width: 100%;
  }

  svg {
    display: block;
    cursor: crosshair;
  }

  .tt {
    position: absolute;
    background: var(--bg-elevated);
    padding: 6px 10px;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tt-date {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
  }

  .tt-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    color: var(--text-primary);
  }
</style>
