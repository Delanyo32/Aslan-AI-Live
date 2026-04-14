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

<main class="min-h-screen flex items-center justify-center p-6">
  <div class="w-full max-w-[360px] flex flex-col gap-5">
    <a href="/" class="font-display italic font-normal text-[22px] text-black no-underline tracking-[-0.01em]">Aslan Finance</a>

    {#if registered}
      <div class="flex flex-col gap-4">
        <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#525252] m-0">CHECK YOUR INBOX</p>
        <p class="font-sans text-base text-[#525252] m-0">We've sent a verification link to {registeredEmail}.</p>

        <button
          onclick={handleResend}
          disabled={resendLoading || resendSent}
          class="w-full py-4 px-8 bg-black text-white font-sans text-xs uppercase tracking-[0.1em] rounded-none cursor-pointer transition-colors duration-100 hover:bg-[#222222] disabled:opacity-50 disabled:cursor-not-allowed border-0"
        >
          {resendSent ? "Sent ✓" : resendLoading ? "Sending…" : "Resend verification →"}
        </button>

        <a href="/auth/login" class="font-sans text-sm text-[#525252] no-underline self-start hover:text-black">← Back to login</a>
      </div>
    {:else}
      <h1 class="font-sans text-xl font-medium text-black leading-tight">Create account</h1>

      <form onsubmit={handleSubmit} class="flex flex-col gap-[14px]">
        <div class="flex flex-col gap-1.5">
          <label for="name" class="font-sans text-sm text-[#525252]">Name</label>
          <input
            id="name"
            type="text"
            bind:value={name}
            required
            autocomplete="name"
            class="w-full py-3 px-3 bg-[#F5F5F5] border-2 border-black font-sans text-base text-black rounded-none outline-none focus:border-[3px] focus:border-black placeholder:text-[#AAAAAA]"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="email" class="font-sans text-sm text-[#525252]">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            required
            autocomplete="email"
            class="w-full py-3 px-3 bg-[#F5F5F5] border-2 border-black font-sans text-base text-black rounded-none outline-none focus:border-[3px] focus:border-black placeholder:text-[#AAAAAA]"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="password" class="font-sans text-sm text-[#525252]">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            required
            autocomplete="new-password"
            minlength={8}
            class="w-full py-3 px-3 bg-[#F5F5F5] border-2 border-black font-sans text-base text-black rounded-none outline-none focus:border-[3px] focus:border-black placeholder:text-[#AAAAAA]"
          />
        </div>

        {#if error}
          <p class="font-sans text-sm text-accent-loss">{error}</p>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full py-4 px-8 bg-black text-white font-sans text-xs uppercase tracking-[0.1em] rounded-none cursor-pointer transition-colors duration-100 hover:bg-[#222222] disabled:opacity-50 disabled:cursor-not-allowed border-0"
        >
          {loading ? "Creating account…" : "Create account →"}
        </button>
      </form>

      {#if data.googleEnabled}
        <div class="font-sans text-sm text-[#AAAAAA] text-center">or</div>
        <button
          type="button"
          onclick={handleGoogle}
          class="w-full py-4 px-8 bg-black text-white font-sans text-xs uppercase tracking-[0.1em] rounded-none cursor-pointer transition-colors duration-100 hover:bg-[#222222] border-0"
        >
          Continue with Google
        </button>
      {/if}

      <p class="font-sans text-sm text-[#525252]">
        Already have an account? <a href="/auth/login" class="text-black no-underline hover:underline">Log in →</a>
      </p>
    {/if}
  </div>
</main>
