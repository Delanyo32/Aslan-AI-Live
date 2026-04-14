<script lang="ts">
  import type { PageData } from "./$types"
  import { goto } from "$app/navigation"

  let { data }: { data: PageData } = $props()

  // ── Profile ────────────────────────────────────────────────────────────────
  let editing    = $state(false)
  let nameValue  = $state(data.user.name)
  let nameSaving = $state(false)
  let nameError  = $state("")

  async function saveName() {
    const trimmed = nameValue.trim()
    if (!trimmed) return
    nameSaving = true
    nameError  = ""
    try {
      const res = await fetch("/api/account/update-name", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: trimmed })
      })
      if (!res.ok) throw new Error("failed")
      editing = false
    } catch {
      nameError = "Failed to save. Try again."
    } finally {
      nameSaving = false
    }
  }

  function cancelNameEdit() {
    editing   = false
    nameValue = data.user.name
    nameError = ""
  }

  // ── Password ───────────────────────────────────────────────────────────────
  let pwCurrent = $state("")
  let pwNew     = $state("")
  let pwConfirm = $state("")
  let pwSaving  = $state(false)
  let pwError   = $state("")
  let pwSuccess = $state(false)

  $effect(() => {
    if (pwSuccess) {
      const timer = setTimeout(() => { pwSuccess = false }, 4000)
      return () => clearTimeout(timer)
    }
  })

  async function changePassword() {
    pwError   = ""
    pwSuccess = false

    if (pwNew.length < 8) {
      pwError = "New password must be at least 8 characters."
      return
    }
    if (pwNew !== pwConfirm) {
      pwError = "Passwords do not match."
      return
    }

    pwSaving = true
    try {
      const res = await fetch("/api/account/change-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew })
      })
      if (res.status === 401) {
        pwError = "Current password is incorrect."
      } else if (!res.ok) {
        pwError = "Something went wrong. Try again."
      } else {
        pwSuccess = true
        pwCurrent = ""
        pwNew     = ""
        pwConfirm = ""
      }
    } catch {
      pwError = "Something went wrong. Try again."
    } finally {
      pwSaving = false
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────
  let revokeConfirming = $state(false)
  let revokeLoading    = $state(false)
  let revokeError      = $state("")

  async function revokeSessions() {
    revokeLoading = true
    revokeError   = ""
    try {
      const res = await fetch("/api/account/revoke-sessions", { method: "POST" })
      if (!res.ok) throw new Error("failed")
      goto("/auth/login")
    } catch {
      revokeError   = "Failed to sign out. Try again."
      revokeLoading = false
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  let deleteConfirming = $state(false)
  let deleteLoading    = $state(false)
  let deleteError      = $state("")

  async function deleteAccount() {
    deleteLoading = true
    deleteError   = ""
    try {
      const res = await fetch("/api/account/delete", { method: "POST" })
      if (!res.ok) throw new Error("failed")
      goto("/")
    } catch {
      deleteError   = "Account deletion failed. Contact support if this persists."
      deleteLoading = false
    }
  }
</script>

<div class="page-wrap">
  <a href="/dashboard" class="back-link">← Back to dashboard</a>

  <h1 class="page-heading">ACCOUNT SETTINGS</h1>

  <!-- ─── SECTION 1: PROFILE ───────────────────────────────────────────────── -->
  <section class="section">
    <span class="section-label">PROFILE</span>

    <div class="field-row">
      <span class="field-label">Display name</span>
      <div class="field-right">
        {#if !editing}
          <span class="field-value">{nameValue}</span>
          <button class="text-link" onclick={() => { editing = true }}>Edit</button>
        {:else}
          <div class="edit-group">
            <input
              class="text-input"
              type="text"
              bind:value={nameValue}
              style="width: 240px"
              onkeydown={(e) => {
                if (e.key === "Enter") saveName()
                if (e.key === "Escape") cancelNameEdit()
              }}
            />
            <button
              class="outlined-btn"
              disabled={nameSaving}
              onclick={saveName}
            >{nameSaving ? "Saving…" : "Save"}</button>
            <button class="text-link" onclick={cancelNameEdit}>Cancel</button>
          </div>
          {#if nameError}
            <span class="field-error">{nameError}</span>
          {/if}
        {/if}
      </div>
    </div>

    <div class="field-row">
      <span class="field-label">Email address</span>
      <span class="field-value mono">{data.user.email}</span>
    </div>
  </section>

  <!-- ─── SECTION 2: PASSWORD ───────────────────────────────────────────────── -->
  {#if data.has_password}
    <section class="section">
      <span class="section-label">PASSWORD</span>

      <div class="pw-fields">
        <div class="pw-field-group">
          <label class="field-label" for="pw-current">Current password</label>
          <input
            id="pw-current"
            class="text-input pw-input"
            type="password"
            bind:value={pwCurrent}
          />
        </div>
        <div class="pw-field-group">
          <label class="field-label" for="pw-new">New password</label>
          <input
            id="pw-new"
            class="text-input pw-input"
            type="password"
            placeholder="8 characters minimum"
            bind:value={pwNew}
          />
        </div>
        <div class="pw-field-group">
          <label class="field-label" for="pw-confirm">Confirm password</label>
          <input
            id="pw-confirm"
            class="text-input pw-input"
            type="password"
            bind:value={pwConfirm}
          />
        </div>
      </div>

      <button
        class="outlined-btn"
        disabled={pwSaving}
        onclick={changePassword}
      >{pwSaving ? "Updating…" : "Change password →"}</button>

      {#if pwError}
        <span class="field-error">{pwError}</span>
      {/if}
      {#if pwSuccess}
        <span class="pw-success">Password updated.</span>
      {/if}
    </section>
  {/if}

  <!-- ─── SECTION 3: SESSIONS ──────────────────────────────────────────────── -->
  <section class="section">
    <span class="section-label">SESSIONS</span>

    <p class="body-text">
      You have {data.active_sessions} active session{data.active_sessions === 1 ? "" : "s"} across all devices.
    </p>

    {#if !revokeConfirming}
      <div>
        <button
          class="outlined-btn"
          onclick={() => { revokeConfirming = true }}
        >Sign out of all other devices →</button>
      </div>
    {:else}
      <div class="confirm-block">
        <p class="confirm-text">This will sign you out everywhere except this browser. Confirm?</p>
        <div class="confirm-actions">
          <button
            class="outlined-btn danger"
            disabled={revokeLoading}
            onclick={revokeSessions}
          >{revokeLoading ? "Signing out…" : "Yes, sign out"}</button>
          <button
            class="text-link"
            onclick={() => { revokeConfirming = false; revokeError = "" }}
          >Cancel</button>
        </div>
        {#if revokeError}
          <span class="field-error">{revokeError}</span>
        {/if}
      </div>
    {/if}
  </section>

  <!-- ─── SECTION 4: DANGER ZONE ───────────────────────────────────────────── -->
  <section class="section">
    <span class="section-label danger-label">DANGER ZONE</span>

    {#if !deleteConfirming}
      <div>
        <button
          class="outlined-btn danger"
          onclick={() => { deleteConfirming = true }}
        >Delete account →</button>
      </div>
    {:else}
      <div class="confirm-block">
        <p class="confirm-text">
          This permanently deletes your account, all saved backtests, and all report access.
          This cannot be undone.
        </p>
        <div class="confirm-actions">
          <button
            class="outlined-btn danger"
            disabled={deleteLoading}
            onclick={deleteAccount}
          >{deleteLoading ? "Deleting…" : "Delete my account"}</button>
          <button
            class="text-link"
            onclick={() => { deleteConfirming = false; deleteError = "" }}
          >Cancel</button>
        </div>
        {#if deleteError}
          <span class="field-error">{deleteError}</span>
        {/if}
      </div>
    {/if}
  </section>
</div>

<style>
  .page-wrap {
    max-width: 720px;
    padding: 0 24px;
  }

  /* ── Back link ──────────────────────────────────────────────────────────── */
  .back-link {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-decoration: none;
    display: inline-block;
    margin-bottom: 32px;
  }

  .back-link:hover { color: var(--text-primary); }

  /* ── Page heading ───────────────────────────────────────────────────────── */
  .page-heading {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin: 0 0 0 0;
  }

  /* ── Sections ───────────────────────────────────────────────────────────── */
  .section {
    border-top: 1px solid var(--bg-border);
    margin-top: 24px;
    padding-top: 24px;
    padding-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  /* ── Field rows ─────────────────────────────────────────────────────────── */
  .field-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .field-label {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    min-width: 140px;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .field-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    flex: 1;
  }

  .field-value {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
  }

  .mono {
    font-family: 'IBM Plex Mono', monospace;
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  .edit-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* ── Inputs ─────────────────────────────────────────────────────────────── */
  .text-input {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-base);
    color: var(--text-primary);
    background: var(--bg-surface);
    border: 1px solid var(--bg-border);
    border-radius: 2px;
    padding: 6px 10px;
    outline: none;
  }

  .text-input:focus { border-color: var(--text-secondary); }

  .text-input::placeholder {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* ── Buttons ────────────────────────────────────────────────────────────── */
  .outlined-btn {
    background: transparent;
    border: 1px solid var(--bg-border);
    color: var(--text-primary);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    padding: 6px 14px;
    cursor: pointer;
    border-radius: 2px;
    transition: background 100ms, border-color 100ms;
    white-space: nowrap;
  }

  .outlined-btn:hover:not(:disabled) { background: var(--bg-elevated); }

  .outlined-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .outlined-btn.danger {
    border-color: var(--accent-loss);
    color: var(--accent-loss);
  }

  .outlined-btn.danger:hover:not(:disabled) {
    background: rgba(248, 113, 113, 0.06);
  }

  .text-link {
    background: none;
    border: none;
    padding: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .text-link:hover { color: var(--text-primary); }

  /* ── Error / Success ────────────────────────────────────────────────────── */
  .field-error {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--accent-loss);
    display: block;
  }

  .pw-success {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    display: block;
  }

  /* ── Password section ───────────────────────────────────────────────────── */
  .pw-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pw-field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pw-input {
    max-width: 320px;
    width: 100%;
  }

  /* ── Body text ──────────────────────────────────────────────────────────── */
  .body-text {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  /* ── Confirm block ──────────────────────────────────────────────────────── */
  .confirm-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .confirm-text {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
    max-width: 480px;
  }

  .confirm-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  /* ── Danger Zone ────────────────────────────────────────────────────────── */
  .danger-label {
    color: var(--accent-loss);
    border-bottom: 1px solid var(--accent-loss);
    padding-bottom: 8px;
  }
</style>
