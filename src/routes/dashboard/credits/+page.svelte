<script lang="ts">
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { fmtDate } from '$lib/utils'
  import { PricingTable } from 'svelte-clerk'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let liveCredits = $state<number | null>(null)
  const credits = $derived(liveCredits ?? data.user.credits ?? 0)
  const success  = $derived($page.url.searchParams.get('success') === '1')

  // After subscribing, Clerk redirects here with ?success=1; the credit grant lands
  // via the billing webhook a moment later — poll /api/user/credits until it does.
  onMount(() => {
    if (!success) return
    const initial = data.user.credits ?? 0
    let stopped = false

    async function check() {
      if (stopped) return
      try {
        const res = await fetch('/api/user/credits')
        if (!res.ok) return
        const { credits: fresh } = await res.json()
        liveCredits = fresh
        if (fresh !== initial) stopped = true
      } catch { /* retry on next tick */ }
    }

    const timers = [1000, 2500, 4500, 7500, 11000].map(d => setTimeout(check, d))
    return () => { stopped = true; timers.forEach(clearTimeout) }
  })

  // created_at is a Date (drizzle timestamp mode) — fmtDate takes an ISO string.
  const formatDate = (d: string | Date) => fmtDate(new Date(d).toISOString())

  function formatReason(reason: string): string {
    if (reason.startsWith('subscription_')) {
      const plan = reason.replace('subscription_', '')
      return `${plan.charAt(0).toUpperCase()}${plan.slice(1)} subscription`
    }
    if (reason.startsWith('purchase_')) return `Purchased ${reason.replace('purchase_', '')} pack` // legacy
    if (reason === 'terminal_report') return 'Report run'
    if (reason === 'terminal_rerun')  return 'Report rerun'
    if (reason === 'watchlist_monthly') return 'Watchlist (monthly)'
    if (reason === 'backtest') return 'Report run'
    if (reason === 'signup_bonus') return 'Signup bonus'
    return reason
  }
</script>

<div class="bg-[#fcfbf9] min-h-screen -mx-6 max-sm:-mx-4">
  <div class="max-w-[1100px] mx-auto px-8 sm:px-12 py-10 pb-24">

  <!-- ── Back Link ─────────────────────────────────────────────────────────── -->
  <a
    href="/dashboard"
    class="font-sans text-sm text-text-secondary no-underline inline-block mb-8 w-fit nav-underline hover:text-text-primary transition-colors duration-100"
  >← Back to dashboard</a>

  <!-- ── Success Banner ────────────────────────────────────────────────────── -->
  {#if success}
    <div class="border-l-4 border-[#4338ca] bg-white px-6 py-4 rounded-r-xl shadow-sm font-sans text-sm text-text-primary flex items-center gap-3 mb-8">
      <iconify-icon icon="lucide:check-circle" class="text-[#4338ca] text-lg shrink-0"></iconify-icon>
      <span>Subscription active — credits are being added to your account.</span>
    </div>
  {/if}

  <!-- ── Dark Header Band ───────────────────────────────────────────────────── -->
  <div class="bg-[#171717] rounded-[2rem] p-8 md:p-12 mb-12 flex flex-col md:flex-row items-center justify-between gap-8 text-white">
    <div class="flex flex-col gap-2">
      <span class="mono-label text-[#aaaaaa] text-[10px]">Account Overview</span>
      <h1 class="serif-italic text-5xl md:text-6xl tracking-tight text-white m-0">Credits</h1>
    </div>
    <div class="text-right flex flex-col items-end">
      <span class="mono-label text-[#aaaaaa] text-[10px] mb-2">Available Balance</span>
      <div class="flex items-baseline gap-4">
        <span class="font-mono text-6xl md:text-7xl font-medium tracking-tighter">{credits}</span>
        <span class="mono-label text-xs text-[#aaaaaa]">{credits === 1 ? 'Credit' : 'Credits'}</span>
      </div>
    </div>
  </div>

  <!-- ── Two-Column Grid ───────────────────────────────────────────────────── -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">

    <!-- Left: Subscription plans (5/12) -->
    <div class="lg:col-span-5 flex flex-col gap-6">
      <span class="mono-label text-[#525252] text-[10px]">Subscription / Plans</span>
      <div class="bg-white border border-[#e5e5e5] rounded-2xl p-6">
        <PricingTable newSubscriptionRedirectUrl="/dashboard/credits?success=1" />
      </div>
    </div>

    <!-- Right: Usage History (7/12) -->
    <div class="lg:col-span-7 flex flex-col gap-6">
      <span class="mono-label text-[#525252] text-[10px]">Activity / History</span>

      <div class="bg-white border border-[#e5e5e5] rounded-3xl p-8 flex flex-col h-full">
        {#if data.transactions.length === 0}
          <p class="font-sans text-sm text-text-secondary py-6">No transactions yet.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="border-b border-[#e5e5e5]">
                  <th class="pb-4 font-mono text-[10px] tracking-widest text-text-muted uppercase font-normal">Date</th>
                  <th class="pb-4 font-mono text-[10px] tracking-widest text-text-muted uppercase font-normal">Activity</th>
                  <th class="pb-4 font-mono text-[10px] tracking-widest text-text-muted uppercase font-normal text-right">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#e5e5e5]">
                {#each data.transactions as tx (tx.id)}
                  <tr class="hover:bg-[#fcfbf9] transition-colors duration-150">
                    <td class="py-5 font-mono text-xs text-text-muted whitespace-nowrap">{formatDate(tx.created_at)}</td>
                    <td class="py-5 font-sans text-sm text-text-primary">{formatReason(tx.reason)}</td>
                    <td class="py-5 font-mono text-sm text-right whitespace-nowrap {tx.amount > 0 ? 'text-text-primary font-bold' : 'text-text-secondary'}">{tx.amount > 0 ? `+${tx.amount}` : tx.amount}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>

  </div>

  </div>
</div>
