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

<main class="auth-page">
  <div class="auth-card">
    <a href="/" class="wordmark">Aslan Finance</a>
    <h1 class="title">Log in</h1>

    <form onsubmit={handleSubmit} class="form">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" bind:value={email} required autocomplete="email" />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" bind:value={password} required autocomplete="current-password" />
      </div>

      {#if error}
        <p class="error-msg">{error}</p>
      {/if}

      <button type="submit" class="btn" disabled={loading}>
        {loading ? "Logging in…" : "Log in"}
      </button>
    </form>

    {#if data.googleEnabled}
      <div class="divider">or</div>
      <button type="button" class="btn" onclick={handleGoogle}>
        Continue with Google
      </button>
    {/if}

    <p class="switch-link">
      No account? <a href="/auth/register">Create one →</a>
    </p>
  </div>
</main>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .auth-card {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .wordmark {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--text-primary);
    text-decoration: none;
  }

  .title {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xl);
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  input {
    width: 100%;
    padding: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    border-radius: 2px;
    outline: none;
  }

  input:focus {
    border-color: var(--text-secondary);
  }

  .error-msg {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--accent-loss);
  }

  .btn {
    width: 100%;
    padding: 12px 16px;
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

  .divider {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
  }

  .switch-link {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .switch-link a {
    color: var(--text-primary);
    text-decoration: none;
  }

  .switch-link a:hover {
    text-decoration: underline;
  }
</style>
