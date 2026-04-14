<script lang="ts">
  import type { LayoutData } from "./$types"
  import { authClient } from '$lib/auth-client'
  import { page } from '$app/stores'

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()
  let menuOpen = $state(false)
  let liveCredits = $state<number | null>(null)

  const credits = $derived(liveCredits ?? data.user.credits ?? 0)
  const creditsLabel = $derived(credits === 1 ? 'credit' : 'credits')

  // When Polar redirects back with ?success=1, the webhook may not have fired yet.
  // Poll /api/user/credits until the balance increases, then latch the fresh value.
  const isSuccessPage = $derived($page.url.searchParams.get('success') === '1')

  $effect(() => {
    if (!isSuccessPage) return
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
      } catch { /* network error — retry on next tick */ }
    }

    const timers = [1000, 2500, 4500, 7500].map(d => setTimeout(check, d))
    return () => { stopped = true; timers.forEach(clearTimeout) }
  })

  async function handleSignOut() {
    await authClient.signOut()
    window.location.href = '/'
  }
</script>

<nav class="top-nav">
  <a href="/dashboard" class="wordmark">Aslan Finance</a>

  <div class="nav-right">
    <a href="/backtests" class="account-link desktop-only">Explore</a>
    <a href="/dashboard/credits" class="credits-badge">⚡ {credits} {creditsLabel}</a>
    <a href="/dashboard/account" class="account-link desktop-only">Account</a>

    <button
      class="menu-toggle mobile-only"
      onclick={() => menuOpen = !menuOpen}
      aria-label="Toggle menu"
    >☰</button>
  </div>

  {#if menuOpen}
    <div class="mobile-dropdown">
      <a href="/dashboard/account" onclick={() => menuOpen = false}>Account</a>
      <button class="dropdown-signout" onclick={handleSignOut}>Log out</button>
    </div>
  {/if}
</nav>

<div class="dashboard-content">
  {@render children()}
</div>

<style>
  .top-nav {
    display: flex;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid var(--bg-border);
    position: relative;
  }

  .wordmark {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-primary);
    text-decoration: none;
  }

  .nav-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .credits-badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
    color: var(--text-primary);
    text-decoration: none;
  }

  .credits-badge:hover {
    text-decoration: underline;
    text-decoration-color: var(--bg-border);
  }

  .account-link {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-decoration: none;
  }

  .account-link:hover {
    color: var(--text-primary);
  }

  .menu-toggle {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: var(--text-base);
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }

  .menu-toggle:hover {
    color: var(--text-primary);
  }

  /* Mobile dropdown — no animation per spec */
  .mobile-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--bg-border);
    min-width: 120px;
    z-index: 50;
  }

  .mobile-dropdown a,
  .dropdown-signout {
    display: block;
    padding: 12px 16px;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-primary);
    text-decoration: none;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .mobile-dropdown a:hover,
  .dropdown-signout:hover {
    background: var(--bg-base);
  }

  .dashboard-content {
    padding: 40px 0 64px;
  }

  /* Responsive — desktop: show Account link, hide toggle */
  .desktop-only { display: inline; }
  .mobile-only  { display: none; }

  @media (max-width: 640px) {
    .desktop-only { display: none; }
    .mobile-only  { display: block; }
  }
</style>
