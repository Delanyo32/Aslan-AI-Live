<script lang="ts">
  import type { LayoutData } from "./$types"
  import { authClient } from '$lib/auth-client'
  import { page } from '$app/stores'

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()
  let menuOpen = $state(false)
  let liveCredits = $state<number | null>(null)

  const credits = $derived(liveCredits ?? data.user.credits ?? 0)
  const creditsLabel = $derived(credits === 1 ? 'credit' : 'credits')

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

<nav class="flex items-center py-4 border-b-2 border-black relative">
  <a href="/dashboard" class="font-display italic text-lg font-normal text-black no-underline tracking-[-0.01em]">Aslan Finance</a>

  <div class="ml-auto flex items-center gap-6">
    <a href="/backtests" class="max-sm:hidden font-sans text-xs tracking-[0.08em] uppercase text-[#525252] no-underline hover:text-black transition-colors duration-100">Explore</a>
    <a href="/dashboard/credits" class="font-mono text-xs tracking-[0.05em] uppercase tracking-[0.08em] text-black no-underline hover:underline">{credits} {creditsLabel}</a>
    <a href="/dashboard/account" class="max-sm:hidden font-sans text-xs tracking-[0.08em] uppercase text-[#525252] no-underline hover:text-black transition-colors duration-100">Account</a>

    <button
      class="hidden max-sm:block bg-transparent border border-black text-black text-base cursor-pointer py-1 px-2 leading-none hover:bg-black hover:text-white transition-colors duration-100"
      onclick={() => menuOpen = !menuOpen}
      aria-label="Toggle menu"
    >☰</button>
  </div>

  {#if menuOpen}
    <div class="absolute top-full right-0 bg-white border border-black min-w-[140px] z-50">
      <a
        href="/dashboard/account"
        onclick={() => menuOpen = false}
        class="block px-4 py-3 font-sans text-xs tracking-[0.08em] uppercase text-black no-underline w-full text-left hover:bg-black hover:text-white transition-colors duration-100"
      >Account</a>
      <button
        class="block px-4 py-3 font-sans text-xs tracking-[0.08em] uppercase text-black w-full text-left bg-transparent border-none cursor-pointer hover:bg-black hover:text-white transition-colors duration-100"
        onclick={handleSignOut}
      >Log out</button>
    </div>
  {/if}
</nav>

<div class="pt-10 pb-16">
  {@render children()}
</div>
