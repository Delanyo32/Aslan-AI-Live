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

<!-- Fixed header -->
<header class="fixed top-0 left-0 w-full z-[100] h-20 bg-[#fcfbf9] border-b border-[#e5e5e5] px-8 lg:px-24 flex items-center justify-between">
  <a href="/dashboard" class="serif-italic text-2xl tracking-tight text-[#171717] no-underline">Aslan Finance</a>

  <!-- Desktop nav -->
  <nav class="hidden md:flex items-center gap-10">
    <a href="/backtests" class="mono-label text-gray-600 hover:text-black nav-underline no-underline">Explore</a>

    <div class="flex items-center gap-2 px-4 py-1.5 bg-white border border-[#e5e5e5] rounded-full">
      <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>
      <a href="/dashboard/credits" class="font-mono text-xs tracking-wide font-medium text-[#171717] no-underline hover:text-[#4338ca] transition-colors whitespace-nowrap">
        {credits} {creditsLabel.toUpperCase()}
      </a>
    </div>

    <a href="/dashboard/account" class="mono-label text-gray-600 hover:text-black nav-underline no-underline">Account</a>

    <button
      onclick={handleSignOut}
      class="flex items-center gap-1.5 mono-label text-gray-400 hover:text-red-500 transition-colors cursor-pointer bg-transparent border-none p-0"
      aria-label="Sign out"
    >
      <iconify-icon icon="lucide:log-out" class="text-base"></iconify-icon>
    </button>
  </nav>

  <!-- Mobile hamburger -->
  <button
    class="hidden max-sm:flex items-center justify-center w-9 h-9 bg-transparent border border-[#e5e5e5] rounded-xl text-gray-600 hover:bg-white hover:text-black transition-colors cursor-pointer"
    onclick={() => menuOpen = !menuOpen}
    aria-label="Toggle menu"
  >☰</button>

  {#if menuOpen}
    <div class="absolute top-full right-4 mt-2 bg-white border border-[#e5e5e5] rounded-2xl min-w-[160px] z-50 shadow-lg overflow-hidden">
      <a
        href="/dashboard/account"
        onclick={() => menuOpen = false}
        class="block px-5 py-3 mono-label text-gray-600 hover:bg-[#fcfbf9] no-underline transition-colors"
      >Account</a>
      <div class="border-t border-[#e5e5e5]"></div>
      <button
        class="block w-full text-left px-5 py-3 mono-label text-gray-400 hover:bg-[#fcfbf9] hover:text-red-500 bg-transparent border-none cursor-pointer transition-colors"
        onclick={handleSignOut}
      >Log out</button>
    </div>
  {/if}
</header>

<!-- Page content offset by fixed header height -->
<div class="bg-[#fcfbf9] min-h-screen pt-20">
  {@render children()}
</div>
