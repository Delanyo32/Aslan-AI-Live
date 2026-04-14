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

<main class="min-h-screen flex items-center justify-center p-6">
  <div class="w-full max-w-[360px] flex flex-col gap-8">
    <div class="font-sans text-base font-medium text-black">Aslan Finance</div>

    <div class="flex flex-col gap-4">
      <p class="font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#525252] m-0">VERIFY YOUR EMAIL</p>

      <p class="font-sans text-base text-[#525252] m-0">
        Before accessing your dashboard, please verify your email address.
      </p>

      {#if userEmail}
        <p class="font-sans text-sm text-[#525252] m-0">We sent a link to {userEmail}.</p>
      {/if}

      <button
        onclick={handleResend}
        disabled={resendLoading || resendSent}
        class="w-full py-4 px-8 bg-black text-white font-sans text-xs uppercase tracking-[0.1em] rounded-none cursor-pointer transition-colors duration-100 hover:bg-[#222222] disabled:opacity-50 disabled:cursor-not-allowed border-0"
      >
        {resendSent ? "Email sent ✓" : resendLoading ? "Sending…" : "Resend verification email →"}
      </button>

      {#if resendError}
        <p class="font-sans text-sm text-accent-loss m-0">{resendError}</p>
      {/if}

      <button
        onclick={handleSignOut}
        class="bg-transparent border-0 p-0 font-sans text-sm text-[#525252] cursor-pointer text-left mt-2 hover:text-black"
      >
        Sign out →
      </button>
    </div>
  </div>
</main>
