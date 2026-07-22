<script lang="ts">
  import type { PageData } from "./$types"
  import { goto } from "$app/navigation"
  import { toast } from 'svelte-sonner'

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
      toast.success('Name updated.')
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

<div class="min-h-screen bg-bg-primary relative">
  <div class="absolute inset-0 mesh-gradient pointer-events-none" aria-hidden="true"></div>

  <main class="pt-32 pb-24 relative z-10">
    <div class="max-w-4xl mx-auto px-8">

      <!-- ─── Back link ────────────────────────────────────────────────────── -->
      <div class="mb-12">
        <a
          href="/dashboard"
          class="inline-flex items-center gap-2 px-6 py-2.5 border border-[#e5e5e5] rounded-full mono-label text-text-secondary hover:text-text-primary hover:border-black transition-all no-underline"
        >← Back to Dashboard</a>
      </div>

      <!-- ─── Page header ──────────────────────────────────────────────────── -->
      <header class="mb-16">
        <span class="mono-label text-accent-indigo mb-4 block">Account Control</span>
        <h1 class="serif-italic text-[4rem] lg:text-[5.5rem] leading-[0.9] tracking-tighter text-text-primary">
          Account Settings
        </h1>
      </header>

      <div class="flex flex-col gap-8">

        <!-- ─── SECTION 1: PROFILE ─────────────────────────────────────────── -->
        <section class="bg-white border border-[#e5e5e5] rounded-[2.5rem] p-8 md:p-12 premium-transition hover-lift">
          <span class="mono-label text-text-secondary mb-10 block">Profile</span>

          {#if !editing}
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span class="mono-label text-[10px] text-text-muted mb-1 block">Display Name</span>
                <p class="font-sans text-xl text-text-primary">{nameValue}</p>
              </div>
              <button
                class="inline-flex items-center px-6 py-2 border border-[#e5e5e5] rounded-full mono-label text-[10px] text-text-secondary hover:text-text-primary hover:border-black transition-all cursor-pointer bg-transparent whitespace-nowrap self-start md:self-auto"
                onclick={() => { editing = true }}
              >Edit Name</button>
            </div>
          {:else}
            <div class="flex flex-col gap-4">
              <div>
                <span class="mono-label text-[10px] text-text-muted mb-1 block">Display Name</span>
                <input
                  class="bg-bg-primary border border-[#e5e5e5] rounded-2xl py-4 px-5 outline-none focus:border-accent-indigo transition-colors w-full max-w-sm font-sans text-base text-text-primary"
                  type="text"
                  bind:value={nameValue}
                  onkeydown={(e) => {
                    if (e.key === "Enter") saveName()
                    if (e.key === "Escape") cancelNameEdit()
                  }}
                />
              </div>
              {#if nameError}
                <span class="font-sans text-sm text-accent-loss">{nameError}</span>
              {/if}
              <div class="flex items-center gap-4">
                <button
                  class="bg-accent-indigo text-white px-8 py-3 rounded-full mono-label hover:bg-[#171717] transition-all duration-500 disabled:opacity-40 cursor-pointer"
                  disabled={nameSaving}
                  onclick={saveName}
                >{nameSaving ? "Saving…" : "Save →"}</button>
                <button
                  class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors duration-100"
                  onclick={cancelNameEdit}
                >Cancel</button>
              </div>
            </div>
          {/if}

          <div class="border-t border-[#f5f5f5] pt-8 mt-8">
            <span class="mono-label text-[10px] text-text-muted mb-1 block">Email Address</span>
            <p class="font-mono text-lg text-text-primary">{data.user.email}</p>
          </div>
        </section>

        <!-- ─── SECTION 2: PASSWORD ────────────────────────────────────────── -->
        {#if data.has_password}
          <section class="bg-white border border-[#e5e5e5] rounded-[2.5rem] p-8 md:p-12 premium-transition hover-lift">
            <span class="mono-label text-text-secondary mb-10 block">Security</span>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <div class="flex flex-col gap-2">
                <label class="mono-label text-[10px] text-text-muted" for="pw-current">Current Password</label>
                <input
                  id="pw-current"
                  class="bg-bg-primary border border-[#e5e5e5] rounded-2xl py-4 px-5 outline-none focus:border-accent-indigo transition-colors w-full font-sans text-base text-text-primary"
                  type="password"
                  bind:value={pwCurrent}
                />
              </div>
              <div class="flex flex-col gap-2">
                <label class="mono-label text-[10px] text-text-muted" for="pw-new">New Password</label>
                <input
                  id="pw-new"
                  class="bg-bg-primary border border-[#e5e5e5] rounded-2xl py-4 px-5 outline-none focus:border-accent-indigo transition-colors w-full font-sans text-base text-text-primary placeholder:text-text-muted placeholder:text-sm"
                  type="password"
                  placeholder="8+ characters"
                  bind:value={pwNew}
                />
              </div>
              <div class="flex flex-col gap-2 md:col-span-2">
                <label class="mono-label text-[10px] text-text-muted" for="pw-confirm">Confirm New Password</label>
                <input
                  id="pw-confirm"
                  class="bg-bg-primary border border-[#e5e5e5] rounded-2xl py-4 px-5 outline-none focus:border-accent-indigo transition-colors w-full font-sans text-base text-text-primary"
                  type="password"
                  bind:value={pwConfirm}
                />
              </div>
            </div>

            {#if pwError}
              <span class="font-sans text-sm text-accent-loss block mb-4">{pwError}</span>
            {/if}
            {#if pwSuccess}
              <span class="font-sans text-sm text-text-secondary block mb-4">Password updated.</span>
            {/if}

            <button
              class="bg-accent-indigo text-white px-10 py-4 rounded-full mono-label hover:bg-[#171717] transition-all duration-500 disabled:opacity-40 cursor-pointer"
              disabled={pwSaving}
              onclick={changePassword}
            >{pwSaving ? "Updating…" : "Change password →"}</button>
          </section>
        {/if}

        <!-- ─── SECTION 3: SESSIONS ────────────────────────────────────────── -->
        <section class="bg-white border border-[#e5e5e5] rounded-[2.5rem] p-8 md:p-12 premium-transition hover-lift">
          <span class="mono-label text-text-secondary mb-10 block">Active Sessions</span>

          {#if !revokeConfirming}
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-accent-indigo font-mono text-lg shrink-0">●</div>
                <div>
                  <p class="font-sans text-lg text-text-primary">
                    {data.active_sessions} active session{data.active_sessions === 1 ? "" : "s"}
                  </p>
                  <p class="font-sans text-sm text-text-muted">Across all your devices</p>
                </div>
              </div>
              <button
                class="bg-accent-indigo text-white px-10 py-4 rounded-full mono-label hover:bg-[#171717] transition-all duration-500 whitespace-nowrap cursor-pointer self-start md:self-auto"
                onclick={() => { revokeConfirming = true }}
              >Sign out of others →</button>
            </div>
          {:else}
            <div class="flex flex-col gap-6">
              <p class="font-serif italic text-text-secondary leading-relaxed max-w-md">
                This will sign you out everywhere except this browser. Confirm?
              </p>
              <div class="flex items-center gap-4">
                <button
                  class="bg-accent-indigo text-white px-10 py-4 rounded-full mono-label hover:bg-[#171717] transition-all duration-500 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  disabled={revokeLoading}
                  onclick={revokeSessions}
                >{revokeLoading ? "Signing out…" : "Yes, sign out →"}</button>
                <button
                  class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors duration-100"
                  onclick={() => { revokeConfirming = false; revokeError = "" }}
                >Cancel</button>
              </div>
              {#if revokeError}
                <span class="font-sans text-sm text-accent-loss">{revokeError}</span>
              {/if}
            </div>
          {/if}
        </section>

        <!-- ─── SECTION 4: DANGER ZONE ─────────────────────────────────────── -->
        <section class="bg-white border border-[#e5e5e5] rounded-[2.5rem] p-8 md:p-12 premium-transition hover-lift">
          <div class="flex items-center gap-3 mb-10">
            <span class="mono-label text-red-500">Danger Zone</span>
            <div class="h-[1px] flex-1 bg-red-100"></div>
          </div>

          {#if !deleteConfirming}
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div class="max-w-md">
                <p class="font-sans text-lg text-text-primary mb-2">Permanently delete account</p>
                <p class="font-serif italic text-text-secondary leading-relaxed">
                  All your reports and credit balance will be erased forever. This cannot be undone.
                </p>
              </div>
              <button
                class="bg-[#171717] text-white px-10 py-4 rounded-full mono-label hover:bg-red-600 transition-all duration-500 whitespace-nowrap cursor-pointer self-start md:self-auto"
                onclick={() => { deleteConfirming = true }}
              >Delete account →</button>
            </div>
          {:else}
            <div class="flex flex-col gap-6">
              <p class="font-serif italic text-text-secondary leading-relaxed max-w-md">
                This permanently deletes your account, all saved reports, and all report access. This cannot be undone.
              </p>
              <div class="flex items-center gap-4">
                <button
                  class="bg-[#171717] text-white px-10 py-4 rounded-full mono-label hover:bg-red-600 transition-all duration-500 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  disabled={deleteLoading}
                  onclick={deleteAccount}
                >{deleteLoading ? "Deleting…" : "Delete my account →"}</button>
                <button
                  class="bg-transparent border-none p-0 font-sans text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors duration-100"
                  onclick={() => { deleteConfirming = false; deleteError = "" }}
                >Cancel</button>
              </div>
              {#if deleteError}
                <span class="font-sans text-sm text-accent-loss">{deleteError}</span>
              {/if}
            </div>
          {/if}
        </section>

      </div>
    </div>
  </main>
</div>
