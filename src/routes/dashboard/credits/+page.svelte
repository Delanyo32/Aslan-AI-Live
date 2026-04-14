<script lang="ts">
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  let liveCredits = $state<number | null>(null)
  const credits = $derived(liveCredits ?? data.user.credits ?? 0)
  const success  = $derived($page.url.searchParams.get('success') === '1')

  // Polar redirects back before the webhook fires — poll /api/user/credits until balance increases.
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

    const timers = [1000, 2500, 4500, 7500].map(d => setTimeout(check, d))
    return () => { stopped = true; timers.forEach(clearTimeout) }
  })

  const packs = [
    { key: 'starter', label: 'Starter',  credits: 10,  price: '$9.00',  perCredit: '$0.90/credit' },
    { key: 'pro',     label: 'Pro',       credits: 30,  price: '$19.00', perCredit: '$0.63/credit' },
    { key: 'power',   label: 'Power',     credits: 100, price: '$49.00', perCredit: '$0.49/credit' },
  ] as const

  let buying = $state<string | null>(null)
  let buyError = $state<string | null>(null)

  async function buy(pack: string) {
    buying = pack
    buyError = null
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      })
      if (!res.ok) throw new Error('checkout_failed')
      const { url } = await res.json()
      window.location.href = url
    } catch {
      buyError = pack
      buying = null
    }
  }

  function formatDate(iso: string | Date): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    })
  }

  function formatReason(reason: string): string {
    if (reason.startsWith('purchase_')) {
      const pack = reason.replace('purchase_', '')
      return `Purchased ${pack} pack`
    }
    if (reason === 'backtest') return 'Backtest run'
    if (reason === 'signup_bonus') return 'Signup bonus'
    return reason
  }
</script>

<!-- ── Success Banner ──────────────────────────────────────────────────────── -->
{#if success}
  <div class="inline-block font-sans text-sm text-accent-gain mb-8">
    ✓ Credits added to your account.
  </div>
{/if}

<!-- ── Balance ─────────────────────────────────────────────────────────────── -->
<section class="flex flex-col gap-4 mb-12">
  <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary">BALANCE</span>
  <p class="font-mono text-2xl text-text-primary">⚡ {credits} {credits === 1 ? 'credit' : 'credits'} remaining</p>
</section>

<!-- ── Credit Packs ────────────────────────────────────────────────────────── -->
<section class="flex flex-col gap-4 mb-12">
  <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary">CREDIT PACKS</span>

  <div class="border-t border-black">
    {#each packs as pack (pack.key)}
      <div class="flex items-center gap-4 py-3 border-b border-black flex-wrap">
        <span class="font-sans text-sm text-text-primary min-w-[64px]">{pack.label}</span>
        <span class="font-mono text-sm text-text-secondary min-w-[80px]">{pack.credits} credits</span>
        <span class="font-mono text-sm text-text-secondary min-w-[52px]">{pack.price}</span>
        <span class="font-mono text-sm text-text-secondary min-w-[96px]">{pack.perCredit}</span>
        <div class="ml-auto flex items-center gap-3">
          {#if buyError === pack.key}
            <span class="font-sans text-xs text-accent-loss">Error — try again</span>
          {/if}
          <button
            class="bg-transparent border border-black text-text-primary font-sans text-sm py-1.5 px-3.5 cursor-pointer rounded-none transition-colors duration-100 hover:border-[#525252] disabled:opacity-40 disabled:cursor-default"
            disabled={!!buying}
            onclick={() => buy(pack.key)}
          >
            {buying === pack.key ? '...' : 'Buy →'}
          </button>
        </div>
      </div>
    {/each}
  </div>
</section>

<!-- ── Usage History ───────────────────────────────────────────────────────── -->
<section class="flex flex-col gap-4 mb-12">
  <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary">USAGE HISTORY</span>

  {#if data.transactions.length === 0}
    <p class="font-sans text-sm text-text-secondary py-6">No transactions yet.</p>
  {:else}
    <div class="border-t border-black">
      {#each data.transactions as tx (tx.id)}
        <div class="flex items-center gap-4 py-2.5 border-b border-black flex-wrap">
          <span class="font-mono text-sm text-text-muted whitespace-nowrap min-w-[96px]">{formatDate(tx.created_at)}</span>
          <span class="font-sans text-sm text-text-secondary flex-1">{formatReason(tx.reason)}</span>
          <span
            class="font-mono text-sm whitespace-nowrap ml-auto {tx.amount > 0 ? 'text-accent-gain' : tx.amount < 0 ? 'text-accent-loss' : 'text-text-secondary'}"
          >{tx.amount > 0 ? `+${tx.amount}` : tx.amount}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>
