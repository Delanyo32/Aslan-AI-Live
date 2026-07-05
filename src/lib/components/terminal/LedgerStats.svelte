<script lang="ts">
  interface Props {
    startedAt: string | Date;
    // ftr null (empty ledger or all-pending) ⇒ empty state; never a hollow 0% (§5.5).
    // `total` is commitments logged; the percentage uses the ledger's resolved FTR.
    stats: { ftr: number | null; onTime: number; late: number; unaccounted: number; total: number } | null;
  }

  let { startedAt, stats }: Props = $props();

  function fmtDate(d: string | Date): string {
    return new Date(d).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  const followThroughPct = $derived(
    stats && stats.ftr != null ? Math.round(stats.ftr * 100) : null
  );
</script>

<section class="bg-white border border-[#e5e5e5] rounded-[2rem] p-8 md:p-10">
  <span class="mono-label text-[10px] text-gray-400 block mb-6">Announcement Ledger · Follow-Through</span>

  {#if stats && followThroughPct != null}
    <div class="flex flex-col md:flex-row md:items-end gap-8 md:gap-16">
      <div>
        <span class="font-mono text-5xl tracking-tighter text-gray-900">{followThroughPct}%</span>
        <span class="mono-label text-[10px] text-gray-400 block mt-2">Delivered on time</span>
      </div>
      <div class="grid grid-cols-3 gap-8 font-mono">
        <div>
          <span class="text-2xl text-emerald-600">{stats.onTime}</span>
          <span class="mono-label text-[9px] text-gray-400 block mt-1">On time</span>
        </div>
        <div>
          <span class="text-2xl text-amber-600">{stats.late}</span>
          <span class="mono-label text-[9px] text-gray-400 block mt-1">Late</span>
        </div>
        <div>
          <span class="text-2xl text-gray-400">{stats.unaccounted}</span>
          <span class="mono-label text-[9px] text-gray-400 block mt-1">Unaccounted</span>
        </div>
      </div>
    </div>
    <p class="font-serif text-base text-gray-500 mt-6">
      Announced {stats.total} dated commitment{stats.total !== 1 ? 's' : ''} since tracking started {fmtDate(startedAt)}.
    </p>
  {:else}
    <!-- Forward-only ledger: no backfill, no hollow stat -->
    <p class="font-serif text-xl text-gray-700 leading-relaxed">
      Tracking started {fmtDate(startedAt)} — {stats?.total ?? 0} commitment{(stats?.total ?? 0) !== 1 ? 's' : ''} logged.
    </p>
    <p class="font-sans text-sm text-gray-500 mt-3 max-w-2xl">
      The ledger records dated commitments management makes from this point forward and
      checks whether each is delivered on time. It is forward-only — no historical backfill.
    </p>
  {/if}
</section>
