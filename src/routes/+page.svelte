<script lang="ts">
	import { goto } from '$app/navigation'
	import type { PageData } from './$types'
	import { gradeStyle, TREND } from '$lib/components/terminal/grade'

	let { data }: { data: PageData } = $props()

	let ticker = $state('')

	function startAnalysis(e: SubmitEvent) {
		e.preventDefault()
		const t = ticker.trim()
		const dest = t ? `/terminal?q=${encodeURIComponent(t)}` : '/terminal'
		if (data.user) goto(dest)
		else goto(`/auth/register?redirect=${encodeURIComponent(dest)}`)
	}

	// The nine health frameworks (PRODUCT.md §Product Purpose). `id` mirrors the
	// rubric dimensions used across the terminal; `short`/`blurb` are display copy.
	const FRAMEWORKS = [
		{ id: 'F1', short: 'Investor sentiment', blurb: 'Who holds it, who is stepping back, and whether the shareholder relationship is healthy or strained.' },
		{ id: 'F2', short: 'Policy', blurb: 'Regulation, subsidy, sanction and litigation exposure across the jurisdictions that actually matter to it.' },
		{ id: 'F3', short: 'Competition', blurb: 'Where rivals are gaining or ceding ground, and how defensible the position really is.' },
		{ id: 'F4', short: 'Supply', blurb: 'Input availability, supplier concentration, and the fragility of the chain behind the product.' },
		{ id: 'F5', short: 'Demand', blurb: 'Real end-demand — orders, usage, backlog — weighed against the demand the narrative claims.' },
		{ id: 'F6', short: 'Staffing', blurb: 'Hiring, attrition and key-talent movement read as a leading indicator of execution.' },
		{ id: 'F7', short: 'Operations', blurb: 'Delivery against commitments: are the things the company said it would ship actually shipping.' },
		{ id: 'F8', short: 'Partnerships', blurb: 'The deals and alliances that add or remove leverage — weighed for substance over announcement.' },
		{ id: 'F9', short: 'Value creation', blurb: 'How capital is turned into durable value and distributed — and where the red-flag screens focus.' }
	] as const

	// Illustrative sample — clearly labelled in the UI, not a live grade. The
	// ticker is fictional on purpose: no unsupported claim about a real security.
	const SAMPLE = {
		company: { name: 'Halcyon Semiconductor', ticker: 'HLCN' },
		composite: { grade: 'B', score: 74, confidence: 'Medium confidence' },
		grades: {
			F1: { grade: 'A', score: 88, trend: 'up' },
			F2: { grade: 'C', score: 61, trend: 'down' },
			F3: { grade: 'B', score: 76, trend: 'flat' },
			F4: { grade: 'B', score: 79, trend: 'up' },
			F5: { grade: 'A', score: 85, trend: 'up' },
			F6: { grade: 'B', score: 72, trend: 'flat' },
			F7: { grade: 'C', score: 64, trend: 'down' },
			F8: { grade: 'A', score: 83, trend: 'up' },
			F9: { grade: 'C', score: 66, trend: 'down' }
		} as Record<string, { grade: string; score: number; trend: 'up' | 'down' | 'flat' | 'new' }>,
		verdict: {
			headline: 'Priced for more than the evidence supports',
			sentence:
				'At today’s price the market implies demand and margin the current evidence does not yet corroborate — the reverse-DCF requires growth above what supply and competition make likely.',
			implied: [
				['10y revenue growth', '19.0%'],
				['FCF margin scenario', '31.0%'],
				['Discount rate', '9.0%']
			] as const
		}
	}

	const cStyle = gradeStyle(SAMPLE.composite.grade)

	const PRINCIPLES = [
		{
			tag: 'Evidence, not consensus',
			title: 'We never cite a Wall Street price target.',
			body: 'No analyst price targets. No street estimates. Where price matters, we show what today’s price is already betting on — so you judge it against the facts, not the crowd.'
		},
		{
			tag: 'Hype screening',
			title: 'We catch the pump.',
			body: 'When sentiment is being juiced — coordinated posts, unsupported claims, staged announcements — we flag it instead of feeding it into the grade.'
		},
		{
			tag: 'Honest confidence',
			title: 'We show our work — and when we’re guessing.',
			body: 'Every grade opens to the filing behind it. When the evidence is thin, we say so. The price verdict runs only where there’s a real market price — US listings today.'
		}
	]

	const PACKS = [
		{ name: 'Starter', credits: '50', price: '$9', per: '$0.18' },
		{ name: 'Pro', credits: '200', price: '$19', per: '$0.095' },
		{ name: 'Power', credits: '600', price: '$49', per: '$0.082' }
	]
</script>

<svelte:head>
	<title>Aslan Terminal — Evidence, not consensus</title>
	<meta
		name="description"
		content="Type a ticker. We read the 10-Ks, earnings calls and filings behind any public company and grade it A to F — with the receipts. No analyst price targets, no hype."
	/>
</svelte:head>

<!-- ── Header ─────────────────────────────────────────────────────────────── -->
<header class="fixed top-0 left-0 w-full z-50 h-20 bg-[#fcfbf9] border-b border-[#e5e5e5] px-6 lg:px-12 flex items-center justify-between">
	<a href="/" class="serif-italic text-2xl text-gray-900 no-underline tracking-tight">Aslan Terminal</a>

	<nav class="hidden md:flex items-center gap-10">
		<a href="#report" class="mono-label text-[11px] text-gray-500 hover:text-black nav-underline no-underline">Report</a>
		<a href="#methodology" class="mono-label text-[11px] text-gray-500 hover:text-black nav-underline no-underline">Methodology</a>
		<a href="#pricing" class="mono-label text-[11px] text-gray-500 hover:text-black nav-underline no-underline">Pricing</a>
	</nav>

	<div class="flex items-center gap-4">
		<span class="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e5e5e5]">
			<span class="w-1.5 h-1.5 rounded-full bg-[#4338ca] pulse-status"></span>
			<span class="mono-label text-[9px] text-gray-500">Evidence engine live</span>
		</span>
		{#if data.user}
			<a href="/dashboard" class="bg-[#171717] text-white px-6 py-2.5 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors no-underline">Dashboard →</a>
		{:else}
			<a href="/auth/login" class="hidden sm:inline mono-label text-[11px] text-gray-500 hover:text-black no-underline">Log in</a>
			<a href="/auth/register" class="bg-[#171717] text-white px-6 py-2.5 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors no-underline">Start free</a>
		{/if}
	</div>
</header>

<main>
	<!-- ── Hero ───────────────────────────────────────────────────────────────── -->
	<section class="pt-32 lg:pt-40 pb-20 lg:pb-28 px-6 lg:px-12 bg-[#fcfbf9]">
		<div class="max-w-4xl mx-auto text-center">
			<span class="mono-label text-[11px] text-[#4338ca] mb-6 inline-block">Equity intelligence · Evidence, not consensus</span>
			<h1
				class="serif-italic text-gray-900 leading-[1.02] tracking-[-0.02em] mb-8"
				style="font-size: clamp(2.5rem, 5vw + 1rem, 4.5rem); text-wrap: balance;"
			>
				Grade any stock like a report card.
			</h1>
			<p class="font-serif text-xl md:text-2xl text-gray-700 leading-relaxed max-w-2xl mx-auto mb-10">
				Type a ticker. We read every 10-K, earnings call and filing behind it, then grade the
				company A to F — and show you the receipts. No analyst price targets. No Reddit hype.
			</p>

			<form onsubmit={startAnalysis} class="max-w-xl mx-auto flex flex-col sm:flex-row gap-3">
				<input
					bind:value={ticker}
					placeholder="AAPL, or Apple Inc."
					aria-label="Company ticker or name"
					class="flex-1 px-6 py-4 bg-white border border-[#e5e5e5] rounded-full font-sans text-base text-[#171717] placeholder:text-gray-500 focus:outline-none focus:border-[#4338ca] transition-colors"
				/>
				<button
					type="submit"
					class="bg-[#171717] text-white px-8 py-4 rounded-full font-sans text-base font-medium hover:bg-[#4338ca] transition-colors cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-2"
				>
					Grade it
					<iconify-icon icon="lucide:arrow-right" class="text-lg"></iconify-icon>
				</button>
			</form>
			<p class="mono-label text-[9px] text-gray-500 mt-5">20 free credits on signup · no card required</p>
		</div>
	</section>

	<!-- ── The report, shown ──────────────────────────────────────────────────── -->
	<section id="report" class="py-20 lg:py-28 px-6 lg:px-12 bg-[#fcfbf9] border-t border-[#e5e5e5]">
		<div class="max-w-5xl mx-auto">
			<div class="max-w-2xl mb-12">
				<h2 class="serif-italic text-4xl md:text-5xl text-gray-900 leading-[1.1] mb-5" style="text-wrap: balance;">
					One company, graded and traced.
				</h2>
				<p class="font-serif text-xl text-gray-700 leading-relaxed">
					Nine grades — demand, competition, hiring and six more — boiled down to one score. Where a
					real market price exists, we add a verdict on it. Here’s what a report looks like.
				</p>
			</div>

			<div class="bg-white border border-[#e5e5e5] rounded-[2rem] p-6 md:p-10">
				<!-- Grade block -->
				<div class="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-3 flex-wrap mb-3">
							<span class="mono-label text-[10px] text-[#4338ca]">Aslan Report</span>
							<span class="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-mono uppercase tracking-widest rounded">US Listing</span>
							<span class="px-2 py-1 bg-gray-100 text-gray-500 text-[10px] font-mono uppercase tracking-widest rounded">Illustrative sample</span>
						</div>
						<h3 class="serif-italic text-3xl md:text-4xl text-gray-900 leading-[1.05]">{SAMPLE.company.name}</h3>
						<span class="font-mono text-base text-gray-500 tracking-wide">{SAMPLE.company.ticker}</span>
					</div>

					<div class="flex items-center gap-5 shrink-0">
						<div class="flex items-center justify-center w-24 h-24 rounded-2xl border-2 {cStyle.border} {cStyle.bg}">
							<span class="font-serif text-6xl leading-none {cStyle.text}">{SAMPLE.composite.grade}</span>
						</div>
						<div class="flex flex-col gap-1.5">
							<div class="flex items-baseline gap-1">
								<span class="font-mono text-4xl tracking-tighter text-gray-900">{SAMPLE.composite.score}</span>
								<span class="font-mono text-lg text-gray-400">/100</span>
							</div>
							<span class="mono-label text-[10px] text-gray-400">Aslan Score</span>
							<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 w-fit">
								<span class="w-1.5 h-1.5 rounded-full {cStyle.dot}"></span>
								<span class="font-mono text-[10px] uppercase tracking-widest text-gray-600">{SAMPLE.composite.confidence}</span>
							</span>
						</div>
					</div>
				</div>

				<!-- Nine-framework board -->
				<div class="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each FRAMEWORKS as f}
						{@const g = SAMPLE.grades[f.id]}
						{@const style = gradeStyle(g.grade)}
						{@const t = TREND[g.trend]}
						<div class="bg-white border border-[#e5e5e5] rounded-xl p-4 flex items-center gap-3">
							<span class="flex items-center justify-center w-11 h-11 rounded-lg border-2 shrink-0 {style.border} {style.bg} {style.text} font-serif text-2xl leading-none">{g.grade}</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<span class="mono-label text-[9px] text-gray-400">{f.id}</span>
									<span class="font-mono text-[11px] {t.class}" title={t.label}>{t.arrow} {g.score}</span>
								</div>
								<span class="font-sans text-sm text-gray-900 leading-tight block mt-1">{f.short}</span>
							</div>
						</div>
					{/each}
				</div>

				<!-- Price reconciliation verdict -->
				<div class="mt-10 pt-8 border-t border-[#eee]">
					<div class="flex items-center gap-3 mb-4 flex-wrap">
						<span class="mono-label text-[10px] text-gray-400">Price Reconciliation</span>
						<span class="px-2 py-0.5 bg-black text-white text-[9px] font-mono uppercase tracking-widest rounded">Beta</span>
					</div>
					<h4 class="serif-italic text-2xl md:text-3xl text-gray-900 leading-tight mb-3">{SAMPLE.verdict.headline}</h4>
					<p class="font-serif text-lg text-gray-700 leading-relaxed max-w-3xl mb-7">{SAMPLE.verdict.sentence}</p>
					<span class="mono-label text-[10px] text-gray-400 block mb-3">Implied by today’s price</span>
					<dl class="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-2 font-mono text-sm max-w-2xl">
						{#each SAMPLE.verdict.implied as [k, v]}
							<div class="flex justify-between border-b border-[#eee] pb-2">
								<dt class="text-gray-500">{k}</dt>
								<dd class="text-gray-900">{v}</dd>
							</div>
						{/each}
					</dl>
				</div>
			</div>

			<p class="mt-6 font-serif text-base text-gray-500 leading-relaxed max-w-2xl">
				Every grade opens to the filings, transcripts and reporting behind it — and nothing cites a
				street estimate. This is an illustrative sample; live reports grade real companies from public
				evidence.
			</p>
		</div>
	</section>

	<!-- ── Methodology ────────────────────────────────────────────────────────── -->
	<section id="methodology" class="py-20 lg:py-28 px-6 lg:px-12 bg-[#fcfbf9] border-t border-[#e5e5e5]">
		<div class="max-w-5xl mx-auto">
			<div class="max-w-3xl mb-14">
				<h2 class="serif-italic text-4xl md:text-5xl text-gray-900 leading-[1.1] mb-6" style="text-wrap: balance;">
					How the grade is built.
				</h2>
				<p class="font-serif text-xl text-gray-700 leading-relaxed">
					We research the nine things that actually move a stock — demand, competition, hiring and six
					more — from public evidence only. Every claim traces back to the filing behind it. When a
					stock is being pumped, we flag it instead of scoring it — and when we’re not sure, we say so.
				</p>
			</div>

			<!-- The nine frameworks — an ordered rubric, so the numbers carry meaning -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-x-14 border-t border-[#e5e5e5]">
				{#each FRAMEWORKS as f}
					<div class="flex gap-5 py-6 border-b border-[#e5e5e5]">
						<span class="font-mono text-sm text-[#4338ca] pt-1 shrink-0 w-7">{f.id}</span>
						<div>
							<h3 class="font-serif text-xl text-gray-900 mb-1.5">{f.short}</h3>
							<p class="font-serif text-base text-gray-600 leading-relaxed">{f.blurb}</p>
						</div>
					</div>
				{/each}
			</div>

			<!-- Principles -->
			<div class="mt-20 grid grid-cols-1 lg:grid-cols-3 gap-px bg-[#e5e5e5] border border-[#e5e5e5] rounded-2xl overflow-hidden">
				{#each PRINCIPLES as p}
					<div class="bg-white p-8">
						<span class="mono-label text-[10px] text-[#4338ca] block mb-4">{p.tag}</span>
						<h3 class="serif-italic text-2xl text-gray-900 mb-3 leading-snug">{p.title}</h3>
						<p class="font-serif text-base text-gray-600 leading-relaxed">{p.body}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── Pricing ────────────────────────────────────────────────────────────── -->
	<section id="pricing" class="py-20 lg:py-28 px-6 lg:px-12 bg-[#fcfbf9] border-t border-[#e5e5e5]">
		<div class="max-w-5xl mx-auto">
			<div class="max-w-3xl mb-12">
				<h2 class="serif-italic text-4xl md:text-5xl text-gray-900 mb-5" style="text-wrap: balance;">
					Pay by the report.
				</h2>
				<p class="font-serif text-xl text-gray-700 leading-relaxed">
					Free to start — 20 credits on signup, no card required. Credits don’t expire, and there’s no
					subscription.
				</p>
			</div>

			<div class="bg-white border border-[#e5e5e5] rounded-2xl overflow-hidden max-w-3xl">
				<div class="overflow-x-auto">
					<table class="w-full border-collapse font-mono text-sm min-w-[440px]">
						<thead>
							<tr class="border-b border-[#e5e5e5] bg-[#fcfbf9]">
								<th class="text-left mono-label text-[9px] text-gray-400 font-normal px-6 py-3">Pack</th>
								<th class="text-right mono-label text-[9px] text-gray-400 font-normal px-6 py-3">Credits</th>
								<th class="text-right mono-label text-[9px] text-gray-400 font-normal px-6 py-3">Price</th>
								<th class="text-right mono-label text-[9px] text-gray-400 font-normal px-6 py-3">Per credit</th>
							</tr>
						</thead>
						<tbody>
							{#each PACKS as p}
								<tr class="border-b border-[#f0f0f0] last:border-b-0">
									<td class="px-6 py-3.5 font-sans text-gray-900">{p.name}</td>
									<td class="px-6 py-3.5 text-right text-gray-900">{p.credits}</td>
									<td class="px-6 py-3.5 text-right text-gray-900">{p.price}</td>
									<td class="px-6 py-3.5 text-right text-gray-500">{p.per}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<div class="mt-6 flex flex-col gap-1.5 max-w-2xl font-serif text-base text-gray-600 leading-relaxed">
				<p>
					A report’s cost scales with how many tickers it covers. Credits are deducted only on
					successful completion — zero evidence found, zero credits.
				</p>
				<p>Shared reports are free to view — no credits, no account.</p>
			</div>

			<div class="mt-8 flex items-center gap-6 flex-wrap">
				<a
					href="/auth/register"
					class="bg-[#171717] text-white px-7 py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors no-underline inline-flex items-center gap-2"
				>
					Start free
					<iconify-icon icon="lucide:arrow-right" class="text-base"></iconify-icon>
				</a>
				<a href="/pricing" class="mono-label text-[11px] text-gray-500 hover:text-black nav-underline no-underline">See full pricing →</a>
			</div>
		</div>
	</section>

	<!-- ── Footer ─────────────────────────────────────────────────────────────── -->
	<footer class="bg-[#171717] text-[#fcfbf9] px-6 lg:px-12 pt-20 pb-10">
		<div class="max-w-6xl mx-auto">
			<div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-12 border-b border-white/10 pb-16 mb-12">
				<div class="max-w-xl">
					<h2 class="serif-italic text-3xl md:text-4xl leading-tight mb-7">Grade your next position on the evidence.</h2>
					<a
						href="/auth/register"
						class="bg-white text-[#171717] px-7 py-3 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] hover:text-white transition-colors no-underline inline-flex items-center gap-2"
					>
						Start free — 20 credits
						<iconify-icon icon="lucide:arrow-right" class="text-base"></iconify-icon>
					</a>
				</div>

				<div class="flex gap-16">
					<div>
						<span class="mono-label text-[10px] text-white/40 block mb-5">Product</span>
						<nav class="flex flex-col gap-3 font-sans text-sm text-white/70">
							<a href="#report" class="hover:text-white transition-colors no-underline">The report</a>
							<a href="#methodology" class="hover:text-white transition-colors no-underline">Methodology</a>
							<a href="/pricing" class="hover:text-white transition-colors no-underline">Pricing</a>
						</nav>
					</div>
					<div>
						<span class="mono-label text-[10px] text-white/40 block mb-5">Account</span>
						<nav class="flex flex-col gap-3 font-sans text-sm text-white/70">
							{#if data.user}
								<a href="/dashboard" class="hover:text-white transition-colors no-underline">Dashboard</a>
							{:else}
								<a href="/auth/login" class="hover:text-white transition-colors no-underline">Log in</a>
								<a href="/auth/register" class="hover:text-white transition-colors no-underline">Create account</a>
							{/if}
						</nav>
					</div>
				</div>
			</div>

			<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
				<div class="flex items-center gap-4 flex-wrap">
					<span class="serif-italic text-xl">Aslan Terminal</span>
					<span class="mono-label text-[10px] text-white/40">© 2026</span>
				</div>
				<div class="flex items-center gap-5 font-sans text-xs text-white/60 flex-wrap">
					<span>For research only — not investment advice.</span>
					<a href="/disclaimer" class="text-white/60 hover:text-white transition-colors no-underline">Disclaimer</a>
					<a href="/terms" class="text-white/60 hover:text-white transition-colors no-underline">Terms</a>
					<a href="/privacy" class="text-white/60 hover:text-white transition-colors no-underline">Privacy</a>
				</div>
			</div>
		</div>
	</footer>
</main>
