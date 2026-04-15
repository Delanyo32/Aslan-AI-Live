<script lang="ts">
  import { authClient } from "$lib/auth-client"
  import { goto } from "$app/navigation"

  let userEmail     = $state("")
  let resendLoading = $state(false)
  let resendSent    = $state(false)
  let resendError   = $state("")

  $effect(() => {
    authClient.getSession().then((result) => {
      userEmail = result?.data?.user?.email ?? ""
    })
  })

  async function handleResend() {
    resendLoading = true
    resendError   = ""
    const result = await authClient.sendVerificationEmail({ email: userEmail })
    if (result?.error) {
      resendError = "Failed to send. Try again."
    } else {
      resendSent = true
    }
    resendLoading = false
  }

  async function handleSignOut() {
    await authClient.signOut()
    goto("/auth/login")
  }
</script>

<main class="min-h-screen flex items-center justify-center p-8 bg-bg-primary">
  <div class="w-full max-w-[360px] flex flex-col gap-8">

    <a href="/" class="serif-italic text-2xl text-bg-dark no-underline tracking-[-0.01em]">Aslan Finance</a>

    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <span class="mono-label text-[#4338ca] block">Verify Your Email</span>
        <h1 class="serif-italic text-4xl text-bg-dark leading-tight">Check your inbox</h1>
        <p class="font-sans text-sm text-text-secondary">
          Before accessing your dashboard, please verify your email address.
        </p>
        {#if userEmail}
          <p class="font-sans text-sm text-text-secondary">We sent a link to {userEmail}.</p>
        {/if}
      </div>

      <button
        onclick={handleResend}
        disabled={resendLoading || resendSent}
        class="w-full py-3 px-8 bg-[#4338ca] text-white font-sans text-sm font-medium rounded-full cursor-pointer transition-all duration-300 hover:bg-[#3730a3] shadow-lg shadow-black/5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {resendSent ? 'Email sent ✓' : resendLoading ? 'Sending…' : 'Resend verification email →'}
      </button>

      {#if resendError}
        <p class="font-sans text-sm text-accent-loss">{resendError}</p>
      {/if}

      <button
        onclick={handleSignOut}
        class="bg-transparent border-0 p-0 mono-label text-gray-400 hover:text-[#4338ca] transition-colors cursor-pointer text-left"
      >
        Sign out →
      </button>
    </div>

  </div>
</main>
