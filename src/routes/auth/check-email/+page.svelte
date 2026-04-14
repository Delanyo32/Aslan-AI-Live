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

<main class="page">
  <div class="card">
    <div class="wordmark">Aslan Finance</div>

    <div class="content">
      <p class="label">VERIFY YOUR EMAIL</p>

      <p class="body">
        Before accessing your dashboard, please verify your email address.
      </p>

      {#if userEmail}
        <p class="email-hint">We sent a link to {userEmail}.</p>
      {/if}

      <button class="btn" onclick={handleResend} disabled={resendLoading || resendSent}>
        {resendSent ? "Email sent ✓" : resendLoading ? "Sending…" : "Resend verification email →"}
      </button>

      {#if resendError}
        <p class="resend-error">{resendError}</p>
      {/if}

      <button class="sign-out-link" onclick={handleSignOut}>
        Sign out →
      </button>
    </div>
  </div>
</main>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .card {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .wordmark {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-primary);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
    margin: 0;
  }

  .body {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 15px;
    color: var(--text-secondary);
    margin: 0;
  }

  .email-hint {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
  }

  .btn {
    width: 100%;
    padding: 11px 16px;
    border: 1px solid var(--bg-border);
    background: transparent;
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    text-align: center;
    border-radius: 0;
    cursor: pointer;
    transition: background 100ms;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-elevated);
  }

  .btn:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .resend-error {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 13px;
    color: var(--accent-loss);
    margin: 0;
  }

  .sign-out-link {
    background: none;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    margin-top: 8px;
  }

  .sign-out-link:hover {
    color: var(--text-primary);
  }
</style>
