<script lang="ts">
  import { goto } from '$app/navigation'
  import { toast } from 'svelte-sonner'
  import TerminalProgress from '$lib/components/terminal/TerminalProgress.svelte'
  import CompanyPicker, { confirmCompany, type Candidate } from '$lib/components/terminal/CompanyPicker.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type ViewState = 'picking' | 'confirming' | 'running' | 'error'

  let view = $state<ViewState>('picking')
  let query = $state(data.q ?? '')
  let candidates = $state<Candidate[] | null>(null)
  let resolving = $state(false)
  let selected = $state<Candidate | null>(null)
  let starting = $state(false)
  let sessionId = $state<string | null>(null)
  let errorMsg = $state('')
  let creditError = $state<{ required: number; available: number } | null>(null)

  const companyLabel = $derived(selected ? `${selected.name} (${selected.ticker})` : '')

  function reset() {
    view = 'picking'
    candidates = null
    resolving = false
    selected = null
    sessionId = null
    errorMsg = ''
    creditError = null
    starting = false
  }

  function pick(c: Candidate) {
    selected = c
    creditError = null
    view = 'confirming'
  }

  async function handleRun() {
    if (!selected) return
    starting = true
    creditError = null
    try {
      const company_id = await confirmCompany(selected)

      const runRes = await fetch('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id })
      })
      if (runRes.status === 402) {
        const body = await runRes.json()
        creditError = { required: body.required ?? data.creditCost, available: body.available ?? 0 }
        starting = false
        return
      }
      if (!runRes.ok) throw new Error('run_failed')
      const body = await runRes.json()
      sessionId = body.session_id
      view = 'running'
    } catch {
      errorMsg = 'Could not start the report. Please try again.'
      view = 'error'
    } finally {
      starting = false
    }
  }

  function onComplete(slug: string) {
    goto(`/terminal/${slug}`)
  }

  function onProgressError(message: string) {
    errorMsg = message
    view = 'error'
    toast.error(message)
  }

  function onCancelled() {
    toast('Run cancelled — no credits charged.')
    reset()
  }
</script>

<svelte:head><title>New Report — Aslan Terminal</title></svelte:head>

<div class="pt-8 pb-20 max-w-3xl mx-auto w-full px-8 lg:px-12">
  <a href="/dashboard" class="mono-label text-[10px] text-gray-500 no-underline hover:text-black transition-colors">← Dashboard</a>

  <section class="mt-6 bg-white border border-[#e5e5e5] rounded-[2.5rem] p-10 lg:p-14 shadow-sm">

    {#if view === 'picking'}
      <span class="mono-label text-[#4338ca] block mb-2">Aslan Terminal</span>
      <h1 class="serif-italic text-4xl lg:text-5xl text-[#171717] mb-3">Grade any company.</h1>
      <p class="font-sans text-sm text-gray-500 mb-8">
        Enter a ticker or company name. We research nine health frameworks from public
        evidence and composite them into an Aslan Score.
      </p>

      <CompanyPicker
        bind:query
        bind:candidates
        bind:resolving
        onpick={pick}
        onerror={(msg) => { errorMsg = msg; view = 'error' }}
      >
        <p class="mono-label text-[9px] text-gray-400 mt-4">
          {data.creditCost} credits per report · you have {data.credits}
        </p>
      </CompanyPicker>

    {:else if view === 'confirming' && selected}
      <span class="mono-label text-[#4338ca] block mb-2">Confirm</span>
      <h1 class="serif-italic text-3xl lg:text-4xl text-[#171717] mb-6">{selected.name}</h1>

      <div class="flex items-center gap-3 mb-6 flex-wrap">
        <span class="font-mono text-sm text-gray-500">{selected.ticker}</span>
        {#if selected.is_us}
          <span class="mono-label text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">US listing</span>
        {:else}
          <span class="mono-label text-[9px] text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">Research only</span>
        {/if}
      </div>

      {#if !selected.is_us}
        <p class="font-sans text-sm text-gray-600 bg-[#fcfbf9] border border-[#e5e5e5] rounded-2xl p-4 mb-6">
          Research only — the price verdict is available for US listings. You’ll get the
          full nine-framework grade, without the valuation reconciliation.
        </p>
      {/if}

      {#if creditError}
        <div class="flex items-center gap-3 flex-wrap bg-[#171717] text-white rounded-2xl p-5 font-sans text-sm mb-6">
          This report costs {creditError.required} credits — you have {creditError.available}. Buy more to continue.
          <a href="/dashboard/credits" class="text-white underline underline-offset-2 hover:text-indigo-200 transition-colors">Buy credits →</a>
        </div>
      {/if}

      <div class="flex items-center gap-4 flex-wrap">
        <button
          onclick={handleRun}
          disabled={starting}
          class="bg-[#171717] text-white px-7 py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >{starting ? 'Starting…' : `Run report · ${data.creditCost} credits`}</button>
        <button
          onclick={() => (view = 'picking')}
          disabled={starting}
          class="mono-label text-[10px] text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-none cursor-pointer"
        >← Back</button>
      </div>
      <p class="mono-label text-[9px] text-gray-400 mt-4">You have {data.credits} credits</p>

    {:else if view === 'running' && sessionId}
      <TerminalProgress
        {sessionId}
        {companyLabel}
        oncomplete={onComplete}
        onerror={onProgressError}
        oncancelled={onCancelled}
      />

    {:else if view === 'error'}
      <span class="mono-label text-red-500 block mb-2">Something went wrong</span>
      <p class="font-sans text-sm text-gray-600 mb-6">{errorMsg}</p>
      <button
        onclick={reset}
        class="bg-[#171717] text-white px-7 py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors duration-300 cursor-pointer"
      >Start over →</button>
    {/if}

  </section>
</div>
