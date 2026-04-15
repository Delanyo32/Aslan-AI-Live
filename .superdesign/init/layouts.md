# Layouts — Aslan Finance

## Root Layout: `src/routes/+layout.svelte`
Wraps ALL routes. Imports global CSS and wraps content in `Container`.

```svelte
<script lang="ts">
  import '../app.css';
  import Container from '$lib/components/layout/Container.svelte';
  import favicon from '$lib/assets/favicon.svg';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<Container>
  {@render children()}
</Container>
```

## Container: `src/lib/components/layout/Container.svelte`
Max-width wrapper used for all pages.

```svelte
<script lang="ts">
  let { children } = $props();
</script>

<div class="max-w-[1100px] mx-auto px-6 max-sm:px-4">
  {@render children()}
</div>
```

## Dashboard Layout: `src/routes/dashboard/+layout.svelte`
Nav with auth controls, credits display, mobile hamburger menu.

```svelte
<script lang="ts">
  import type { LayoutData } from "./$types"
  import { authClient } from '$lib/auth-client'
  import { page } from '$app/stores'

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()
  let menuOpen = $state(false)
  let liveCredits = $state<number | null>(null)

  const credits = $derived(liveCredits ?? data.user.credits ?? 0)
  const creditsLabel = $derived(credits === 1 ? 'credit' : 'credits')

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
```

## Landing Page Nav (inline in `src/routes/+page.svelte`)
The landing page has its own inline nav (not a shared component):

```svelte
<nav class="flex items-center py-5 border-b-2 border-black bg-white">
  <a href="/" class="font-display italic font-normal text-[22px] text-black no-underline tracking-[-0.01em]">Aslan Finance</a>
  <div class="ml-auto flex items-center gap-7 max-sm:gap-4">
    <a href="#how-it-works" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">How it works</a>
    <a href="/pricing" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Pricing</a>
    <a href="/backtests" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Backtests</a>
    <!-- if logged in: Dashboard → button -->
    <!-- if anonymous: Login link + Register → button -->
  </div>
</nav>
```

## Landing Page Footer (inline in `src/routes/+page.svelte`)
```svelte
<footer class="border-t-4 border-black py-7 bg-white">
  <div class="max-w-[1100px] mx-auto px-6 flex items-center gap-3 font-sans text-xs text-[#525252] flex-wrap">
    <span>© 2025 Aslan Finance</span>
    <span class="text-[#CCCCCC]">·</span>
    <a href="/disclaimer" class="text-[#525252] no-underline hover:text-black hover:underline">Disclaimer</a>
    <span class="text-[#CCCCCC]">·</span>
    <a href="/terms" class="text-[#525252] no-underline hover:text-black hover:underline">Terms</a>
    <span class="text-[#CCCCCC]">·</span>
    <a href="/privacy" class="text-[#525252] no-underline hover:text-black hover:underline">Privacy</a>
  </div>
</footer>
```
