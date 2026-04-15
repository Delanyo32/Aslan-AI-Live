<script lang="ts">
  import { authClient } from "$lib/auth-client"
  import type { PageData } from "./$types"

  let { data }: { data: PageData } = $props()

  let name     = $state("")
  let email    = $state("")
  let password = $state("")
  let error    = $state("")
  let loading  = $state(false)

  let registered      = $state(false)
  let registeredEmail = $state("")
  let resendLoading   = $state(false)
  let resendSent      = $state(false)

  async function handleGoogle() {
    await authClient.signIn.social({ provider: "google", callbackURL: data.redirect })
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error   = ""
    loading = true
    const result = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: data.redirect
    })
    loading = false
    if (result.error) {
      error = result.error.message ?? "Registration failed"
    } else {
      registeredEmail = email
      registered      = true
    }
  }

  async function handleResend() {
    resendLoading = true
    await authClient.sendVerificationEmail({ email: registeredEmail })
    resendSent    = true
    resendLoading = false
  }
</script>

<main class="min-h-screen flex flex-col lg:flex-row">

  <!-- Left: dark editorial panel (desktop only) -->
  <div class="hidden lg:flex w-[45%] bg-bg-dark p-16 flex-col justify-between relative overflow-hidden">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#4338ca] blur-[120px] rounded-full animate-glow pointer-events-none"></div>

    <div class="z-10">
      <a href="/" class="serif-italic text-2xl text-white no-underline tracking-[-0.01em]">Aslan Finance</a>
    </div>

    <div class="z-10">
      <h2 class="serif-italic text-5xl xl:text-6xl text-white leading-[1.1] tracking-tight">
        Your thesis.<br />Historical proof.
      </h2>
      <p class="font-sans text-white/50 mt-10 text-base max-w-sm leading-relaxed font-light">
        Harness the power of news-driven backtesting to validate your conviction with institutional-grade data.
      </p>
    </div>

    <div class="z-10 flex items-center gap-4">
      <span class="w-1.5 h-1.5 bg-[#4338ca] rounded-full"></span>
      <span class="mono-label text-white/30 tracking-[0.4em]">Terminal V1.0 // Auth Node</span>
    </div>
  </div>

  <!-- Right: register form -->
  <div class="flex-1 flex items-center justify-center p-8 bg-bg-primary">
    <div class="w-full max-w-[360px] flex flex-col gap-8">

      <a href="/" class="lg:hidden serif-italic text-2xl text-bg-dark no-underline">Aslan Finance</a>

      {#if registered}
        <div class="flex flex-col gap-6">
          <div class="flex flex-col gap-3">
            <span class="mono-label text-[#4338ca] block">Check Your Inbox</span>
            <h1 class="serif-italic text-4xl text-bg-dark leading-tight">Verify your email</h1>
            <p class="font-sans text-sm text-text-secondary">We've sent a verification link to {registeredEmail}.</p>
          </div>

          <button
            onclick={handleResend}
            disabled={resendLoading || resendSent}
            class="w-full py-3 px-8 bg-[#4338ca] text-white font-sans text-sm font-medium rounded-full cursor-pointer transition-all duration-300 hover:bg-[#3730a3] shadow-lg shadow-black/5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendSent ? 'Sent ✓' : resendLoading ? 'Sending…' : 'Resend verification →'}
          </button>

          <a href="/auth/login" class="mono-label text-gray-400 hover:text-[#4338ca] transition-colors no-underline self-start border-b border-transparent hover:border-[#4338ca] pb-0.5">
            ← Back to login
          </a>
        </div>

      {:else}
        <div class="flex flex-col gap-3">
          <span class="mono-label text-[#4338ca] block">Create Account</span>
          <h1 class="serif-italic text-4xl text-bg-dark leading-tight">Get started</h1>
          <p class="font-sans text-sm text-text-secondary">20 free credits on signup. No card required.</p>
        </div>

        <form onsubmit={handleSubmit} class="flex flex-col gap-5">
          <div class="flex flex-col gap-2">
            <label for="name" class="mono-label text-gray-400">Full Name</label>
            <input
              id="name"
              type="text"
              bind:value={name}
              required
              autocomplete="name"
              placeholder="Your name"
              class="w-full py-3 px-4 bg-white border border-[#e5e5e5] rounded-xl font-sans text-sm text-[#171717] outline-none focus:border-[#4338ca] placeholder:text-text-muted placeholder:italic transition-all duration-300"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="email" class="mono-label text-gray-400">Email Address</label>
            <input
              id="email"
              type="email"
              bind:value={email}
              required
              autocomplete="email"
              placeholder="name@domain.com"
              class="w-full py-3 px-4 bg-white border border-[#e5e5e5] rounded-xl font-sans text-sm text-[#171717] outline-none focus:border-[#4338ca] placeholder:text-text-muted placeholder:italic transition-all duration-300"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label for="password" class="mono-label text-gray-400">Security Key</label>
            <input
              id="password"
              type="password"
              bind:value={password}
              required
              autocomplete="new-password"
              minlength={8}
              placeholder="Min. 8 characters"
              class="w-full py-3 px-4 bg-white border border-[#e5e5e5] rounded-xl font-sans text-sm text-[#171717] outline-none focus:border-[#4338ca] placeholder:text-text-muted placeholder:italic transition-all duration-300"
            />
          </div>

          {#if error}
            <p class="font-sans text-sm text-accent-loss">{error}</p>
          {/if}

          <button
            type="submit"
            disabled={loading}
            class="w-full py-3 px-8 bg-[#4338ca] text-white font-sans text-sm font-medium rounded-full cursor-pointer transition-all duration-300 hover:bg-[#3730a3] shadow-lg shadow-black/5 mt-2 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account…' : 'Create account'}
            {#if !loading}
              <iconify-icon icon="lucide:arrow-right" class="text-lg group-hover:translate-x-1 transition-transform"></iconify-icon>
            {/if}
          </button>
        </form>

        {#if data.googleEnabled}
          <div class="relative flex items-center">
            <div class="flex-grow border-t border-[#e5e5e5]"></div>
            <span class="flex-shrink mx-4 mono-label text-text-muted">or</span>
            <div class="flex-grow border-t border-[#e5e5e5]"></div>
          </div>

          <button
            type="button"
            onclick={handleGoogle}
            class="w-full py-3 px-8 bg-white text-[#171717] font-sans text-sm font-medium rounded-full cursor-pointer transition-all duration-500 border border-[#e5e5e5] hover:border-[#4338ca] flex items-center justify-center gap-3"
          >
            <iconify-icon icon="logos:google-icon" class="text-base"></iconify-icon>
            Continue with Google
          </button>
        {/if}

        <div class="flex flex-col items-center gap-2 mt-2">
          <p class="font-sans text-sm text-text-secondary">Already have an account?</p>
          <a href="/auth/login" class="mono-label text-gray-400 hover:text-[#4338ca] transition-colors no-underline border-b border-transparent hover:border-[#4338ca] pb-0.5">
            Log in →
          </a>
        </div>
      {/if}

    </div>
  </div>
</main>
