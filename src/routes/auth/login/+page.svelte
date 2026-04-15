<script lang="ts">
  import { authClient } from "$lib/auth-client"
  import type { PageData } from "./$types"

  let { data }: { data: PageData } = $props()

  let email    = $state("")
  let password = $state("")
  let error    = $state("")
  let loading  = $state(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error   = ""
    loading = true
    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: data.redirect
    })
    loading = false
    if (result.error) {
      error = result.error.message ?? "Login failed"
    }
  }

  async function handleGoogle() {
    await authClient.signIn.social({ provider: "google", callbackURL: data.redirect })
  }
</script>

<main class="min-h-screen flex items-center justify-center p-6">
  <div class="w-full max-w-[360px] flex flex-col gap-5">
    <a href="/" class="font-display italic font-normal text-[22px] text-black no-underline tracking-[-0.01em]">Aslan Finance</a>
    <h1 class="font-sans text-xl font-medium text-black leading-tight">Log in</h1>

    <form onsubmit={handleSubmit} class="flex flex-col gap-[14px]">
      <div class="flex flex-col gap-1.5">
        <label for="email" class="font-sans text-sm text-[#525252]">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          required
          autocomplete="email"
          class="w-full py-3 px-3 bg-white border-2 border-black font-sans text-base text-black rounded-none outline-none focus:border-[3px] focus:border-black placeholder:text-[#AAAAAA] placeholder:italic"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="password" class="font-sans text-sm text-[#525252]">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          required
          autocomplete="current-password"
          class="w-full py-3 px-3 bg-white border-2 border-black font-sans text-base text-black rounded-none outline-none focus:border-[3px] focus:border-black placeholder:text-[#AAAAAA] placeholder:italic"
        />
      </div>

      {#if error}
        <p class="font-sans text-sm text-accent-loss">{error}</p>
      {/if}

      <button
        type="submit"
        disabled={loading}
        class="w-full py-4 px-8 bg-black text-white font-sans text-xs uppercase tracking-[0.1em] rounded-none cursor-pointer transition-colors duration-100 border-2 border-black hover:bg-white hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Logging in…" : "Log in"}
      </button>
    </form>

    {#if data.googleEnabled}
      <div class="font-sans text-sm text-[#AAAAAA] text-center">or</div>
      <button
        type="button"
        onclick={handleGoogle}
        class="w-full py-4 px-8 bg-black text-white font-sans text-xs uppercase tracking-[0.1em] rounded-none cursor-pointer transition-colors duration-100 border-2 border-black hover:bg-white hover:text-black"
      >
        Continue with Google
      </button>
    {/if}

    <p class="font-sans text-sm text-[#525252]">
      No account? <a href="/auth/register" class="text-black no-underline hover:underline">Create one →</a>
    </p>
  </div>
</main>
