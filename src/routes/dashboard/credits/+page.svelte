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
  <div class="success-banner">
    ✓ Credits added to your account.
  </div>
{/if}

<!-- ── Balance ─────────────────────────────────────────────────────────────── -->
<section class="section">
  <span class="section-label">BALANCE</span>
  <p class="balance-display">⚡ {credits} {credits === 1 ? 'credit' : 'credits'} remaining</p>
</section>

<!-- ── Credit Packs ────────────────────────────────────────────────────────── -->
<section class="section">
  <span class="section-label">CREDIT PACKS</span>

  <div class="packs-table">
    {#each packs as pack (pack.key)}
      <div class="pack-row">
        <span class="pack-name">{pack.label}</span>
        <span class="pack-credits mono">{pack.credits} credits</span>
        <span class="pack-price mono">{pack.price}</span>
        <span class="pack-per mono">{pack.perCredit}</span>
        <div class="pack-action">
          {#if buyError === pack.key}
            <span class="buy-error">Error — try again</span>
          {/if}
          <button
            class="buy-btn"
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
<section class="section">
  <span class="section-label">USAGE HISTORY</span>

  {#if data.transactions.length === 0}
    <p class="empty-state">No transactions yet.</p>
  {:else}
    <div class="history-table">
      {#each data.transactions as tx (tx.id)}
        <div class="history-row">
          <span class="tx-date mono">{formatDate(tx.created_at)}</span>
          <span class="tx-reason">{formatReason(tx.reason)}</span>
          <span
            class="tx-amount mono"
            class:gain={tx.amount > 0}
            class:loss={tx.amount < 0}
          >{tx.amount > 0 ? `+${tx.amount}` : tx.amount}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* ── Success Banner ──────────────────────────────────────────────────────── */
  .success-banner {
    display: inline-block;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--accent-gain);
    margin-bottom: 32px;
  }

  /* ── Sections ────────────────────────────────────────────────────────────── */
  .section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 48px;
  }

  .section-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  /* ── Balance ─────────────────────────────────────────────────────────────── */
  .balance-display {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-2xl);
    color: var(--text-primary);
  }

  /* ── Credit Packs ────────────────────────────────────────────────────────── */
  .packs-table {
    border-top: 1px solid var(--bg-border);
  }

  .pack-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--bg-border);
    flex-wrap: wrap;
  }

  .pack-name {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-primary);
    min-width: 64px;
  }

  .mono {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .pack-credits {
    min-width: 80px;
  }

  .pack-price {
    min-width: 52px;
  }

  .pack-per {
    min-width: 96px;
  }

  .pack-action {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .buy-btn {
    background: transparent;
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    padding: 6px 14px;
    cursor: pointer;
    border-radius: 2px;
    transition: border-color 100ms, color 100ms;
  }

  .buy-btn:hover:not(:disabled) {
    border-color: var(--text-secondary);
  }

  .buy-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .buy-error {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    color: var(--accent-loss);
  }

  /* ── Usage History ───────────────────────────────────────────────────────── */
  .history-table {
    border-top: 1px solid var(--bg-border);
  }

  .history-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--bg-border);
    flex-wrap: wrap;
  }

  .tx-date {
    color: var(--text-muted);
    white-space: nowrap;
    min-width: 96px;
  }

  .tx-reason {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    flex: 1;
  }

  .tx-amount {
    white-space: nowrap;
    margin-left: auto;
  }

  .tx-amount.gain { color: var(--accent-gain); }
  .tx-amount.loss { color: var(--accent-loss); }

  /* ── Empty State ─────────────────────────────────────────────────────────── */
  .empty-state {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    padding: 24px 0;
  }
</style>
