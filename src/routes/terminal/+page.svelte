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

<div class="min-h-screen bg-[#fcfbf9]">
  <!-- Slim header — the page sits outside the dashboard shell, so it carries its
       own wordmark + credits for continuity with the rest of the terminal. -->
  <header class="max-w-4xl mx-auto w-full px-6 sm:px-8 lg:px-12 h-20 flex items-center justify-between">
    <a href="/dashboard" class="serif-italic text-xl text-[#171717] no-underline hover:text-[#4338ca] transition-colors">Aslan Terminal</a>
    <a
      href="/dashboard/credits"
      class="flex items-center gap-2 px-4 py-1.5 bg-white border border-[#e5e5e5] rounded-full no-underline hover:border-[#4338ca] transition-colors group"
    >
      <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>
      <span class="font-mono text-xs tracking-wide font-medium text-[#171717] group-hover:text-[#4338ca] transition-colors whitespace-nowrap">{data.credits} CREDITS</span>
    </a>
  </header>

  <div class="max-w-4xl mx-auto w-full px-6 sm:px-8 lg:px-12 pt-8 pb-24 lg:py-16 lg:min-h-[calc(100vh-5rem)] lg:flex lg:flex-col lg:justify-center">
    {#if view === 'picking'}
      <div class="mt-6 lg:mt-0 mb-8 max-w-2xl">
        <h1 class="serif-italic text-[#171717] leading-[1.05] text-3xl lg:text-[2.75rem]">Grade any company.</h1>
        <p class="font-serif text-base lg:text-lg text-gray-500 mt-2">
          Search a ticker or company name, or browse a category. Nine frameworks, graded from public evidence.
        </p>
      </div>
      <CompanyPicker
        bind:query
        bind:candidates
        bind:resolving
        onpick={pick}
        onerror={(msg) => { errorMsg = msg; view = 'error' }}
      />
      <p class="mono-label text-[9px] text-gray-400 mt-8">
        {data.creditCost} credits per report · you have {data.credits}
      </p>

    {:else if view === 'confirming' && selected}
      <div class="max-w-xl mt-6 lg:mt-0">
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
          <p class="font-serif text-base text-gray-600 leading-relaxed bg-white border border-[#e5e5e5] rounded-2xl p-5 mb-6">
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
      </div>

    {:else if view === 'running' && sessionId}
      <div class="max-w-2xl mt-6 lg:mt-0">
        <TerminalProgress
          {sessionId}
          {companyLabel}
          oncomplete={onComplete}
          onerror={onProgressError}
          oncancelled={onCancelled}
        />
      </div>

    {:else if view === 'error'}
      <div class="max-w-xl mt-6 lg:mt-0">
        <span class="mono-label text-red-500 block mb-2">Something went wrong</span>
        <p class="font-serif text-base text-gray-600 mb-6">{errorMsg}</p>
        <button
          onclick={reset}
          class="bg-[#171717] text-white px-7 py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors duration-300 cursor-pointer"
        >Start over →</button>
      </div>
    {/if}
  </div>
</div>
