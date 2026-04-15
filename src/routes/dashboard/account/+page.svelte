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

<div class="max-w-[720px] px-6">
  <a
    href="/dashboard"
    class="font-sans text-sm text-text-secondary no-underline inline-block mb-8 hover:text-text-primary transition-colors duration-100"
  >← Back to dashboard</a>

  <h1 class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary m-0">
    ACCOUNT SETTINGS
  </h1>

  <!-- ─── SECTION 1: PROFILE ───────────────────────────────────────────────── -->
  <section class="border-t border-black mt-6 pt-6 pb-2 flex flex-col gap-4">
    <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary">PROFILE</span>

    <div class="flex items-start gap-4">
      <span class="font-sans text-sm text-text-secondary min-w-[140px] shrink-0 pt-0.5">Display name</span>
      <div class="flex items-center gap-3 flex-wrap flex-1">
        {#if !editing}
          <span class="font-sans text-base text-text-primary">{nameValue}</span>
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer whitespace-nowrap hover:text-text-primary transition-colors duration-100"
            onclick={() => { editing = true }}
          >Edit</button>
        {:else}
          <div class="flex items-center gap-2 flex-wrap">
            <input
              class="font-sans text-base text-text-primary bg-bg-surface border border-black rounded-none py-1.5 px-2.5 outline-none focus:border-text-secondary placeholder:text-text-muted placeholder:text-sm"
              type="text"
              bind:value={nameValue}
              style="width: 240px"
              onkeydown={(e) => {
                if (e.key === "Enter") saveName()
                if (e.key === "Escape") cancelNameEdit()
              }}
            />
            <button
              class="bg-transparent border border-black text-text-primary font-sans text-sm py-1.5 px-3.5 cursor-pointer rounded-none transition-colors duration-100 whitespace-nowrap hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-default"
              disabled={nameSaving}
              onclick={saveName}
            >{nameSaving ? "Saving…" : "Save"}</button>
            <button
              class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer whitespace-nowrap hover:text-text-primary transition-colors duration-100"
              onclick={cancelNameEdit}
            >Cancel</button>
          </div>
          {#if nameError}
            <span class="font-sans text-sm text-accent-loss block">{nameError}</span>
          {/if}
        {/if}
      </div>
    </div>

    <div class="flex items-start gap-4">
      <span class="font-sans text-sm text-text-secondary min-w-[140px] shrink-0 pt-0.5">Email address</span>
      <span class="font-mono text-sm text-text-primary">{data.user.email}</span>
    </div>
  </section>

  <!-- ─── SECTION 2: PASSWORD ───────────────────────────────────────────────── -->
  {#if data.has_password}
    <section class="border-t border-black mt-6 pt-6 pb-2 flex flex-col gap-4">
      <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary">PASSWORD</span>

      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <label class="font-sans text-sm text-text-secondary" for="pw-current">Current password</label>
          <input
            id="pw-current"
            class="font-sans text-base text-text-primary bg-bg-surface border border-black rounded-none py-1.5 px-2.5 outline-none focus:border-text-secondary max-w-xs w-full"
            type="password"
            bind:value={pwCurrent}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="font-sans text-sm text-text-secondary" for="pw-new">New password</label>
          <input
            id="pw-new"
            class="font-sans text-base text-text-primary bg-bg-surface border border-black rounded-none py-1.5 px-2.5 outline-none focus:border-text-secondary max-w-xs w-full placeholder:text-text-muted placeholder:text-sm"
            type="password"
            placeholder="8 characters minimum"
            bind:value={pwNew}
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="font-sans text-sm text-text-secondary" for="pw-confirm">Confirm password</label>
          <input
            id="pw-confirm"
            class="font-sans text-base text-text-primary bg-bg-surface border border-black rounded-none py-1.5 px-2.5 outline-none focus:border-text-secondary max-w-xs w-full"
            type="password"
            bind:value={pwConfirm}
          />
        </div>
      </div>

      <button
        class="bg-transparent border border-black text-text-primary font-sans text-sm py-1.5 px-3.5 cursor-pointer rounded-none transition-colors duration-100 whitespace-nowrap hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-default"
        disabled={pwSaving}
        onclick={changePassword}
      >{pwSaving ? "Updating…" : "Change password →"}</button>

      {#if pwError}
        <span class="font-sans text-sm text-accent-loss block">{pwError}</span>
      {/if}
      {#if pwSuccess}
        <span class="font-sans text-sm text-text-secondary block">Password updated.</span>
      {/if}
    </section>
  {/if}

  <!-- ─── SECTION 3: SESSIONS ──────────────────────────────────────────────── -->
  <section class="border-t border-black mt-6 pt-6 pb-2 flex flex-col gap-4">
    <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-text-secondary">SESSIONS</span>

    <p class="font-sans text-sm text-text-secondary m-0">
      You have {data.active_sessions} active session{data.active_sessions === 1 ? "" : "s"} across all devices.
    </p>

    {#if !revokeConfirming}
      <div>
        <button
          class="bg-transparent border border-black text-text-primary font-sans text-sm py-1.5 px-3.5 cursor-pointer rounded-none transition-colors duration-100 whitespace-nowrap hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-default"
          onclick={() => { revokeConfirming = true }}
        >Sign out of all other devices →</button>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        <p class="font-sans text-sm text-text-secondary m-0 max-w-[480px]">This will sign you out everywhere except this browser. Confirm?</p>
        <div class="flex items-center gap-4">
          <button
            class="bg-transparent border border-accent-loss text-accent-loss font-sans text-sm py-1.5 px-3.5 cursor-pointer rounded-none transition-colors duration-100 whitespace-nowrap hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-default"
            disabled={revokeLoading}
            onclick={revokeSessions}
          >{revokeLoading ? "Signing out…" : "Yes, sign out"}</button>
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer whitespace-nowrap hover:text-text-primary transition-colors duration-100"
            onclick={() => { revokeConfirming = false; revokeError = "" }}
          >Cancel</button>
        </div>
        {#if revokeError}
          <span class="font-sans text-sm text-accent-loss block">{revokeError}</span>
        {/if}
      </div>
    {/if}
  </section>

  <!-- ─── SECTION 4: DANGER ZONE ───────────────────────────────────────────── -->
  <section class="border-t border-black mt-6 pt-6 pb-2 flex flex-col gap-4">
    <span class="font-sans text-xs font-medium tracking-[0.08em] uppercase text-accent-loss border-b border-accent-loss pb-2">DANGER ZONE</span>

    {#if !deleteConfirming}
      <div>
        <button
          class="bg-transparent border border-accent-loss text-accent-loss font-sans text-sm py-1.5 px-3.5 cursor-pointer rounded-none transition-colors duration-100 whitespace-nowrap hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-default"
          onclick={() => { deleteConfirming = true }}
        >Delete account →</button>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        <p class="font-sans text-sm text-text-secondary m-0 max-w-[480px]">
          This permanently deletes your account, all saved backtests, and all report access.
          This cannot be undone.
        </p>
        <div class="flex items-center gap-4">
          <button
            class="bg-transparent border border-accent-loss text-accent-loss font-sans text-sm py-1.5 px-3.5 cursor-pointer rounded-none transition-colors duration-100 whitespace-nowrap hover:bg-[#F5F5F5] disabled:opacity-40 disabled:cursor-default"
            disabled={deleteLoading}
            onclick={deleteAccount}
          >{deleteLoading ? "Deleting…" : "Delete my account"}</button>
          <button
            class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer whitespace-nowrap hover:text-text-primary transition-colors duration-100"
            onclick={() => { deleteConfirming = false; deleteError = "" }}
          >Cancel</button>
        </div>
        {#if deleteError}
          <span class="font-sans text-sm text-accent-loss block">{deleteError}</span>
        {/if}
      </div>
    {/if}
  </section>
</div>
