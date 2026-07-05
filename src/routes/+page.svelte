<script lang="ts">
	import { goto } from '$app/navigation'
	import type { PageData } from './$types'
	import WaitlistModal from '$lib/components/WaitlistModal.svelte'

	let { data }: { data: PageData } = $props()

	let heroQuery = $state('')

	function handleRun(query: string) {
		if (data.user) {
			goto('/dashboard?query=' + encodeURIComponent(query))
		} else {
			const next = '/dashboard?query=' + encodeURIComponent(query)
			goto('/auth/register?redirect=' + encodeURIComponent(next))
		}
	}

	let comingSoonOpen     = $state(false)
	let comingSoonTitle    = $state('')
	let comingSoonInterest = $state('')

	function openComingSoon(title: string, interest: string) {
		comingSoonTitle    = title
		comingSoonInterest = interest
		comingSoonOpen     = true
	}
</script>

<!-- ── Header (fixed) ────────────────────────────────────────────────────── -->
<header class="fixed top-0 left-0 w-full z-[100] h-20 bg-[#fcfbf9] border-b border-[#e5e5e5] px-8 lg:px-12 flex items-center justify-between">
	<a href="/" class="serif-italic text-2xl font-bold tracking-tight text-gray-900 no-underline">Aslan Finance</a>

	<nav class="hidden md:flex items-center gap-12">
		<a href="#how-it-works" class="mono-label text-gray-600 hover:text-black nav-underline no-underline">Methodology</a>
		<a href="/backtests"    class="mono-label text-gray-600 hover:text-black nav-underline no-underline">Backtests</a>
		<a href="#pricing"      class="mono-label text-gray-600 hover:text-black nav-underline no-underline">Pricing</a>
	</nav>

	<div class="flex items-center gap-4">
		<div class="hidden lg:flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e5e5] rounded-full">
			<span class="w-2 h-2 bg-green-500 rounded-full pulse-status"></span>
			<span class="mono-label text-[10px] tracking-widest text-gray-500">System Online</span>
		</div>
		{#if data.user}
			<a href="/dashboard" class="bg-[#171717] text-white px-6 py-2.5 rounded-full mono-label hover:bg-[#4338ca] transition-colors duration-500 no-underline">
				Dashboard →
			</a>
		{:else}
			<a href="/auth/login"    class="mono-label text-gray-600 hover:text-black no-underline hidden md:block">Login</a>
			<a href="/auth/register" class="bg-[#171717] text-white px-6 py-2.5 rounded-full mono-label hover:bg-[#4338ca] transition-colors duration-500 no-underline">
				Initialize
			</a>
		{/if}
	</div>
</header>

<!-- ── Hero ──────────────────────────────────────────────────────────────── -->
<section class="relative min-h-screen flex flex-col items-center justify-center pt-20 overflow-hidden bg-white">
	<!-- Mesh gradient background -->
	<div class="absolute inset-0 mesh-gradient pointer-events-none" aria-hidden="true"></div>

	<div class="relative z-10 text-center max-w-6xl px-6">
		<span class="mono-label text-[#4338ca] mb-8 block opacity-0" style="animation: fadeIn 1s var(--ease-premium) forwards;">
			Institutional Grade Analysis
		</span>
		<h1
			class="serif-italic text-[7vw] lg:text-[10vw] leading-[0.85] tracking-tighter mb-12 text-[#171717] opacity-0"
			style="animation: slideUp 1.2s var(--ease-premium) 0.2s forwards;"
		>
			Discover Trends. Trade Smarter.
		</h1>

		<div class="max-w-4xl mx-auto opacity-0" style="animation: slideUp 1.2s var(--ease-premium) 0.4s forwards;">
			<div class="relative bg-white border border-[#e5e5e5] rounded-full overflow-hidden shadow-xl shadow-gray-200/40 focus-within:border-[#4338ca] transition-all duration-500">
				<div class="flex items-center p-2">
					<input
						type="text"
						placeholder="Buy Nvidia every time the US announces new AI chip restrictions on China"
						class="w-full px-8 py-4 bg-transparent outline-none text-lg text-gray-900 font-[Inter,system-ui,sans-serif] placeholder:text-gray-300"
						bind:value={heroQuery}
						onkeydown={(e) => e.key === 'Enter' && heroQuery.trim() && handleRun(heroQuery)}
					/>
					<button
						class="bg-[#171717] text-white px-8 md:px-12 py-4 rounded-full font-[Inter,system-ui,sans-serif] font-medium hover:bg-[#4338ca] transition-all duration-300 whitespace-nowrap flex items-center gap-3 shadow-lg shadow-black/5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
						onclick={() => handleRun(heroQuery)}
						disabled={!heroQuery.trim()}
					>
						Analyze
						<iconify-icon icon="lucide:arrow-right" class="text-xl"></iconify-icon>
					</button>
				</div>
			</div>
			<p class="mt-8 text-gray-400 text-sm italic text-center leading-relaxed max-w-2xl mx-auto" style="font-family: 'Source Serif 4', Georgia, serif;">
				Type a market thesis in plain English. Aslan finds every historical occurrence in 10+ years of financial news and shows you the P&amp;L. No Bloomberg required.
			</p>
		</div>
	</div>

	<!-- Scroll indicator -->
	<div class="relative z-10 mt-16">
		<a href="#how-it-works" class="group flex flex-col items-center gap-4 no-underline">
			<div class="w-14 h-14 bg-[#4338ca] rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-200 group-hover:scale-110 transition-transform duration-500">
				<iconify-icon icon="lucide:arrow-down" class="text-2xl"></iconify-icon>
			</div>
			<span class="mono-label text-[10px] text-gray-400">Scroll to Explore</span>
		</a>
	</div>

	<!-- Wave transition -->
	<div class="wave-container" aria-hidden="true">
		<div class="wave-curve"></div>
	</div>
</section>

<!-- ── Methodology ────────────────────────────────────────────────────────── -->
<section id="how-it-works" class="py-32 px-8 lg:px-24 bg-[#fcfbf9]">
	<div class="flex flex-col lg:flex-row gap-20 items-start">
		<!-- Sticky left -->
		<div class="lg:w-1/3 lg:sticky lg:top-32">
			<span class="mono-label text-[#4338ca] mb-6 block">How It Works</span>
			<h2 class="serif-italic text-5xl md:text-6xl mb-8 leading-tight text-[#171717]">
				Synthesizing intuition<br>into rigid<br>performance data.
			</h2>
			<p class="text-gray-500 leading-relaxed mb-8 max-w-sm" style="font-family: 'Inter', sans-serif;">
				Our engine translates abstract trading concepts into verifiable datasets, allowing you to backtest what others say is 'untestable'.
			</p>
			<a href="/backtests" class="inline-flex items-center gap-4 group no-underline">
				<span class="mono-label border-b border-black pb-1 text-[#171717]">Explore Backtests</span>
				<iconify-icon icon="lucide:arrow-right" class="group-hover:translate-x-2 transition-transform text-[#171717]"></iconify-icon>
			</a>
		</div>

		<!-- Cards -->
		<div class="lg:w-2/3 flex flex-col gap-8">
			<div class="p-12 bg-white border border-[#e5e5e5] rounded-3xl premium-transition hover-lift cursor-default">
				<div class="flex items-start gap-8">
					<span class="serif-italic text-5xl text-gray-200 shrink-0">01</span>
					<div>
						<h3 class="serif-italic text-3xl mb-4 text-[#171717]">Describe your hypothesis</h3>
						<p class="text-gray-500 leading-relaxed" style="font-family: 'Inter', sans-serif;">Type a plain-English trade idea. The more specific, the better.</p>
					</div>
				</div>
			</div>

			<div class="p-12 bg-white border border-[#e5e5e5] rounded-3xl premium-transition hover-lift cursor-default">
				<div class="flex items-start gap-8">
					<span class="serif-italic text-5xl text-gray-200 shrink-0">02</span>
					<div>
						<h3 class="serif-italic text-3xl mb-4 text-[#171717]">AI scans historical news</h3>
						<p class="text-gray-500 leading-relaxed" style="font-family: 'Inter', sans-serif;">We scan 10+ years of financial news to identify every time this event happened — with sources.</p>
					</div>
				</div>
			</div>

			<div class="p-12 bg-white border border-[#e5e5e5] rounded-3xl premium-transition hover-lift cursor-default">
				<div class="flex items-start gap-8">
					<span class="serif-italic text-5xl text-gray-200 shrink-0">03</span>
					<div>
						<h3 class="serif-italic text-3xl mb-4 text-[#171717]">Get a full backtest report</h3>
						<p class="text-gray-500 leading-relaxed" style="font-family: 'Inter', sans-serif;">Trade simulations, P&amp;L charts, and a sourced event log — in minutes. All trades entered at next market open after news publication.</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- ── Intelligence Output ────────────────────────────────────────────────── -->
<section id="backtests" class="py-32 px-8 lg:px-24 bg-[#171717] text-[#fcfbf9] border-t border-white/5">
	<div class="max-w-7xl mx-auto flex flex-col gap-12">
		<!-- Header -->
		<div class="flex flex-col md:flex-row justify-between items-end border-b border-[#fcfbf9]/10 pb-10 gap-8">
			<div class="flex flex-col gap-3">
				<span class="mono-label text-[#4338ca] text-[10px] tracking-[0.4em]">Intelligence Output</span>
				<h2 class="serif-italic text-4xl md:text-5xl tracking-tight">
					Strategic Semi-Conductor <span class="opacity-40">Restriction Thesis</span>
				</h2>
			</div>
			<div class="flex gap-12 font-mono text-[10px] uppercase tracking-[0.4em] opacity-60">
				<div class="flex flex-col">
					<span class="opacity-30 mb-2">Confidence</span>
					<span class="text-indigo-400 font-bold">0.94 / 1.0</span>
				</div>
				<div class="flex flex-col">
					<span class="opacity-30 mb-2">Volatility</span>
					<span>Medium</span>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-4 gap-12">
			<!-- Stats -->
			<div class="lg:col-span-1 flex flex-col gap-8">
				<div class="p-8 border border-[#fcfbf9]/10 bg-white/5 rounded-2xl">
					<span class="mono-label text-[9px] opacity-40 block mb-3">Total Return</span>
					<div class="font-mono text-4xl font-bold tracking-tighter">+184.2%</div>
					<div class="mt-10 grid grid-cols-2 gap-6">
						<div>
							<span class="mono-label text-[9px] opacity-30 block mb-1">Win Rate</span>
							<span class="font-mono text-sm text-indigo-400 font-bold">75.0%</span>
						</div>
						<div>
							<span class="mono-label text-[9px] opacity-30 block mb-1">Events</span>
							<span class="font-mono text-sm font-bold">6 FOUND</span>
						</div>
					</div>
				</div>
				<div class="p-8 border border-[#fcfbf9]/10 rounded-2xl bg-white/[0.02]">
					<p class="text-[13px] italic opacity-60 leading-relaxed" style="font-family: 'Source Serif 4', Georgia, serif;">
						"The correlation between trade restriction news and NVDA/AMD performance remains robust across cycle transitions."
					</p>
				</div>
			</div>

			<!-- Table -->
			<div class="lg:col-span-3 overflow-x-auto">
				<table class="w-full font-mono text-sm border-collapse">
					<thead>
						<tr class="border-b border-[#fcfbf9]/10 text-left opacity-30">
							<th class="pb-6 mono-label text-[10px] font-normal tracking-widest uppercase">Timestamp</th>
							<th class="pb-6 mono-label text-[10px] font-normal tracking-widest uppercase">Asset</th>
							<th class="pb-6 mono-label text-[10px] font-normal tracking-widest uppercase">Position</th>
							<th class="pb-6 mono-label text-[10px] font-normal tracking-widest uppercase text-right">P&amp;L ($)</th>
							<th class="pb-6 mono-label text-[10px] font-normal tracking-widest uppercase text-right">P&amp;L (%)</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[#fcfbf9]/5">
						<tr class="hover:bg-white/[0.03] transition-colors duration-300">
							<td class="py-6 text-gray-500">2022.10.07</td>
							<td class="py-6 text-indigo-400 font-bold">NVDA</td>
							<td class="py-6 text-gray-400 text-[11px] tracking-widest uppercase">Long</td>
							<td class="py-6 text-right font-bold text-indigo-400">+2,240.00</td>
							<td class="py-6 text-right font-bold text-indigo-400">+22.40%</td>
						</tr>
						<tr class="hover:bg-white/[0.03] transition-colors duration-300">
							<td class="py-6 text-gray-500">2023.08.01</td>
							<td class="py-6 text-indigo-400 font-bold">AMD</td>
							<td class="py-6 text-gray-400 text-[11px] tracking-widest uppercase">Long</td>
							<td class="py-6 text-right font-bold text-indigo-400">+1,180.50</td>
							<td class="py-6 text-right font-bold text-indigo-400">+11.81%</td>
						</tr>
						<tr class="hover:bg-white/[0.03] transition-colors duration-300 opacity-40">
							<td class="py-6 text-gray-600">2020.03.15</td>
							<td class="py-6 text-indigo-900 font-bold">INTC</td>
							<td class="py-6 text-gray-600 text-[11px] tracking-widest uppercase">Long</td>
							<td class="py-6 text-right text-gray-600">-490.12</td>
							<td class="py-6 text-right text-gray-600">-4.90%</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<div class="mt-12 text-center pt-10 border-t border-[#fcfbf9]/5">
			<a href="/auth/register" class="inline-flex items-center gap-4 group text-[#fcfbf9]/40 hover:text-[#fcfbf9] transition-all duration-500 no-underline">
				<span class="mono-label text-[11px] border-b border-transparent group-hover:border-[#fcfbf9] pb-1 tracking-[0.2em]">Initialize Terminal Analysis</span>
				<iconify-icon icon="lucide:arrow-right" class="group-hover:translate-x-2 transition-transform duration-500 text-[#4338ca]"></iconify-icon>
			</a>
		</div>
	</div>
</section>

<!-- ── Pricing ────────────────────────────────────────────────────────────── -->
<section id="pricing" class="py-32 px-8 lg:px-24 bg-[#fcfbf9]">
	<div class="max-w-4xl mx-auto text-center mb-20">
		<span class="mono-label text-[#4338ca] mb-4 block">Membership</span>
		<h2 class="serif-italic text-5xl md:text-6xl mb-8 text-[#171717]">Scale your conviction.</h2>
		<p class="text-gray-500 text-xl" style="font-family: 'Inter', sans-serif;">Free to start — 20 credits on signup, no card required.</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
		<!-- Starter -->
		<div class="bg-white border border-[#e5e5e5] p-12 rounded-3xl flex flex-col">
			<span class="mono-label text-gray-400 block mb-8">Starter</span>
			<div class="flex items-baseline gap-2 mb-8">
				<span class="text-5xl font-bold tracking-tight text-[#171717]">$9</span>
				<span class="text-gray-400" style="font-family: 'Inter', sans-serif;">/pack</span>
			</div>
			<ul class="space-y-4 mb-12 flex-1" style="font-family: 'Inter', sans-serif;">
				<li class="flex items-center gap-3 text-gray-600">
					<iconify-icon icon="lucide:check" class="text-green-500 shrink-0"></iconify-icon>
					<span>50 backtest credits</span>
				</li>
				<li class="flex items-center gap-3 text-gray-600">
					<iconify-icon icon="lucide:check" class="text-green-500 shrink-0"></iconify-icon>
					<span>Natural language processing</span>
				</li>
				<li class="flex items-center gap-3 text-gray-600">
					<iconify-icon icon="lucide:check" class="text-green-500 shrink-0"></iconify-icon>
					<span>US equity datasets</span>
				</li>
			</ul>
			<a href="/auth/register" class="block w-full text-center py-4 border border-[#171717] rounded-xl mono-label hover:bg-[#171717] hover:text-white transition-all duration-300 no-underline text-[#171717]">
				Select Pack
			</a>
		</div>

		<!-- Pro -->
		<div class="bg-white border border-[#e5e5e5] p-10 rounded-3xl flex flex-col">
			<span class="mono-label text-gray-400 block mb-8">Pro</span>
			<div class="flex items-baseline gap-2 mb-8">
				<span class="text-5xl font-bold tracking-tight text-[#171717]">$19</span>
				<span class="text-gray-400" style="font-family: 'Inter', sans-serif;">/pack</span>
			</div>
			<ul class="space-y-4 mb-12 flex-1" style="font-family: 'Inter', sans-serif;">
				<li class="flex items-center gap-3 text-gray-600">
					<iconify-icon icon="lucide:check" class="text-green-500 shrink-0"></iconify-icon>
					<span>200 backtest credits</span>
				</li>
				<li class="flex items-center gap-3 text-gray-600">
					<iconify-icon icon="lucide:check" class="text-green-500 shrink-0"></iconify-icon>
					<span>Full API search access</span>
				</li>
				<li class="flex items-center gap-3 text-gray-600">
					<iconify-icon icon="lucide:check" class="text-green-500 shrink-0"></iconify-icon>
					<span>Multi-ticker analysis</span>
				</li>
			</ul>
			<a href="/auth/register" class="block w-full text-center py-4 border border-[#171717] rounded-xl mono-label hover:bg-[#171717] hover:text-white transition-all duration-300 no-underline text-[#171717]">
				Select Pack
			</a>
		</div>

		<!-- Power -->
		<div class="bg-[#171717] text-white p-10 rounded-3xl relative overflow-hidden flex flex-col">
			<div class="absolute top-0 right-0 p-8">
				<span class="bg-[#4338ca] text-white text-[10px] mono-label px-3 py-1 rounded-full">Best Value</span>
			</div>
			<span class="mono-label text-gray-400 block mb-8">Power</span>
			<div class="flex items-baseline gap-2 mb-8">
				<span class="text-5xl font-bold tracking-tight">$49</span>
				<span class="text-gray-400" style="font-family: 'Inter', sans-serif;">/pack</span>
			</div>
			<ul class="space-y-4 mb-12 flex-1" style="font-family: 'Inter', sans-serif;">
				<li class="flex items-center gap-3 text-gray-300">
					<iconify-icon icon="lucide:check" class="text-[#4338ca] shrink-0"></iconify-icon>
					<span>600 backtest credits</span>
				</li>
				<li class="flex items-center gap-3 text-gray-300">
					<iconify-icon icon="lucide:check" class="text-[#4338ca] shrink-0"></iconify-icon>
					<span>Bulk processing mode</span>
				</li>
				<li class="flex items-center gap-3 text-gray-300">
					<iconify-icon icon="lucide:check" class="text-[#4338ca] shrink-0"></iconify-icon>
					<span>Priority support</span>
				</li>
			</ul>
			<a href="/auth/register" class="block w-full text-center py-4 bg-[#4338ca] rounded-xl mono-label hover:bg-white hover:text-[#4338ca] transition-all duration-300 no-underline text-white">
				Select Pack
			</a>
		</div>
	</div>
</section>

<!-- ── Footer ─────────────────────────────────────────────────────────────── -->
<footer class="bg-[#171717] text-white pt-32 pb-12 px-8 lg:px-24 relative mt-32 rounded-t-[5rem]">
	<!-- Radial glow -->
	<div class="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-indigo-500/20 blur-[100px] pointer-events-none" aria-hidden="true"></div>

	<div class="max-w-6xl mx-auto">
		<!-- Quote -->
		<div class="mb-24 text-center">
			<p class="serif-italic text-4xl md:text-5xl leading-tight mb-8">
				"In the intersection of logic and intuition<br class="hidden md:block"> lies the truth of the market."
			</p>
			<p class="mono-label text-gray-500">— The Aslan Core</p>
		</div>

		<!-- 2-col grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-16 border-t border-white/10 pt-20 mb-16" style="font-family: 'Inter', sans-serif;">
			<div>
				<h5 class="mono-label text-xs mb-8 text-gray-500">Platform</h5>
				<div class="flex flex-col gap-3 text-gray-400">
					<a href="/#how-it-works" class="hover:text-white transition-colors no-underline">Methodology</a>
					<a href="/backtests"     class="hover:text-white transition-colors no-underline">Backtests</a>
					<a href="#pricing"       class="hover:text-white transition-colors no-underline">Pricing</a>
				</div>
			</div>
			<div>
				<h5 class="mono-label text-xs mb-8 text-gray-500">Account</h5>
				<div class="flex flex-col gap-3 text-gray-400">
					<a href="/auth/login"    class="hover:text-white transition-colors no-underline">Log in</a>
					<a href="/auth/register" class="hover:text-white transition-colors no-underline">Create account</a>
				</div>
			</div>
		</div>

		<!-- Bottom bar -->
		<div class="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
			<span class="serif-italic text-2xl">Aslan Finance</span>
			<span class="mono-label text-[10px] text-gray-500">© 2025 Aslan Finance. All rights reserved.</span>
		</div>
	</div>
</footer>

{#if comingSoonOpen}
	<WaitlistModal
		title={comingSoonTitle}
		interest={comingSoonInterest}
		onclose={() => comingSoonOpen = false}
	/>
{/if}
