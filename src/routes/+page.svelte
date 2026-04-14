<script lang="ts">
	import { goto } from '$app/navigation'
	import type { PageData } from './$types'
	import WaitlistModal from '$lib/components/WaitlistModal.svelte'

	let { data }: { data: PageData } = $props()

	let heroQuery = $state('')

	// ── Run: redirect logged-in users to dashboard, anon to register ──────────
	function handleRun(query: string) {
		if (data.user) {
			goto('/dashboard?query=' + encodeURIComponent(query))
		} else {
			const next = '/dashboard?query=' + encodeURIComponent(query)
			goto('/auth/register?redirect=' + encodeURIComponent(next))
		}
	}

	// ── Coming soon waitlist modal ────────────────────────────────────────────
	let comingSoonOpen     = $state(false)
	let comingSoonTitle    = $state('')
	let comingSoonInterest = $state('')

	function openComingSoon(title: string, interest: string) {
		comingSoonTitle    = title
		comingSoonInterest = interest
		comingSoonOpen     = true
	}

	// ── Waitlist form ─────────────────────────────────────────────────────────
	let waitlistEmail  = $state('')
	let waitlistStatus = $state<'idle' | 'submitting' | 'success' | 'error'>('idle')

	async function handleWaitlistSubmit(e: SubmitEvent) {
		e.preventDefault()
		if (!waitlistEmail || waitlistStatus === 'submitting') return
		waitlistStatus = 'submitting'
		try {
			const res = await fetch('/api/waitlist', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ email: waitlistEmail, interest: 'alerts' }),
			})
			waitlistStatus = res.ok ? 'success' : 'error'
		} catch {
			waitlistStatus = 'error'
		}
	}
</script>

<!-- ── Nav ───────────────────────────────────────────────────────────────── -->
<nav class="flex items-center py-5 border-b-2 border-black bg-white">
	<a href="/" class="font-display italic font-normal text-[22px] text-black no-underline tracking-[-0.01em]">Aslan Finance</a>
	<div class="ml-auto flex items-center gap-7 max-sm:gap-4">
		<a href="#how-it-works" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">How it works</a>
		<a href="/pricing" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Pricing</a>
		<a href="/backtests" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Backtests</a>
		{#if data.user}
			<a href="/dashboard" class="font-sans text-xs tracking-[0.1em] uppercase bg-black text-white px-[18px] py-2 border-2 border-black no-underline transition-colors duration-100 hover:bg-white hover:text-black">Dashboard →</a>
		{:else}
			<a href="/auth/login" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Login</a>
			<a href="/auth/register" class="font-sans text-xs tracking-[0.1em] uppercase bg-black text-white px-[18px] py-2 border-2 border-black no-underline transition-colors duration-100 hover:bg-white hover:text-black">Register →</a>
		{/if}
	</div>
</nav>

<!-- ── Main ──────────────────────────────────────────────────────────────── -->
<main class="bg-white text-black pb-20" id="top">
	<div class="flex flex-col">

		<!-- ── Hero ──────────────────────────────────────────────────────────── -->
		<div class="pt-20 pb-16">
			<h1 class="font-display italic font-normal text-[clamp(3.5rem,8vw,8rem)] leading-none tracking-[-0.025em] text-black mb-10 max-sm:text-[3rem]">What would you have made?</h1>
			<div class="flex items-center gap-3 mb-10">
				<div class="flex-1 h-1 bg-black"></div>
				<div class="w-4 h-4 border-2 border-black shrink-0"></div>
			</div>
			<p class="text-[18px] leading-[1.6] text-[#525252] mb-8 max-w-[540px]" style="font-family: 'Source Serif 4', Georgia, serif;">
				Describe a news-driven trade. We'll find every historical instance and run the backtest.
			</p>

			<div class="flex flex-col border-2 border-black">
				<textarea
					class="w-full min-h-[120px] px-6 py-5 bg-transparent border-none border-b border-[#E5E5E5] text-black text-[17px] leading-[1.65] resize-none outline-none rounded-none focus:border-b-black"
					style="font-family: 'Source Serif 4', Georgia, serif;"
					rows={4}
					placeholder="Buy Nvidia every time the US announces new AI chip restrictions on China"
					bind:value={heroQuery}
				></textarea>
				<div class="flex items-center flex-wrap gap-x-[10px] gap-y-[6px] px-6 py-3 border-b border-[#E5E5E5]">
					<span class="font-mono text-[10px] tracking-[0.1em] uppercase bg-black text-white px-2 py-[3px]">US Stocks</span>
					<span class="text-[#DDDDDD] text-xs select-none">·</span>
					<button class="font-mono text-[10px] tracking-[0.1em] uppercase text-[#BBBBBB] bg-transparent border-none p-0 cursor-pointer transition-colors duration-100 hover:text-[#525252]" onclick={() => openComingSoon('Crypto markets — coming soon', 'crypto')}>Crypto</button>
					<span class="text-[#DDDDDD] text-xs select-none">·</span>
					<button class="font-mono text-[10px] tracking-[0.1em] uppercase text-[#BBBBBB] bg-transparent border-none p-0 cursor-pointer transition-colors duration-100 hover:text-[#525252]" onclick={() => openComingSoon('Forex markets — coming soon', 'forex')}>Forex</button>
					<span class="text-[#DDDDDD] text-xs select-none">·</span>
					<button class="font-mono text-[10px] tracking-[0.1em] uppercase text-[#BBBBBB] bg-transparent border-none p-0 cursor-pointer transition-colors duration-100 hover:text-[#525252]" onclick={() => openComingSoon('Futures & Commodities — coming soon', 'futures')}>Futures</button>
					<span class="text-[#DDDDDD] text-xs select-none">·</span>
					<button class="font-mono text-[10px] tracking-[0.1em] uppercase text-[#BBBBBB] bg-transparent border-none p-0 cursor-pointer transition-colors duration-100 hover:text-[#525252]" onclick={() => openComingSoon('Options — coming soon', 'options')}>Options</button>
					<span class="text-[#DDDDDD] text-xs select-none">·</span>
					<button class="font-mono text-[10px] tracking-[0.1em] uppercase text-[#BBBBBB] bg-transparent border-none p-0 cursor-pointer transition-colors duration-100 hover:text-[#525252]" onclick={() => openComingSoon('International equities — coming soon', 'international')}>International</button>
				</div>
				<button
					class="w-full px-6 py-4 bg-black text-white border-none font-sans text-xs tracking-[0.15em] uppercase cursor-pointer transition-colors duration-100 rounded-none hover:enabled:bg-[#222222] disabled:opacity-35 disabled:cursor-not-allowed"
					onclick={() => handleRun(heroQuery)}
					disabled={!heroQuery.trim()}
				>
					Run Backtest →
				</button>
			</div>
		</div>

		<!-- ── Below-fold content ─────────────────────────────────────────────── -->

		<!-- Waitlist capture — only for anonymous visitors -->
		{#if !data.user}
		<div class="border-t-4 border-black py-16 flex flex-col gap-6" id="waitlist">
			<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase">Stay Ahead</span>
			{#if waitlistStatus === 'success'}
				<p class="text-[16px] italic text-[#525252] m-0" style="font-family: 'Source Serif 4', Georgia, serif;">You're on the list.</p>
			{:else}
				<form class="flex flex-col gap-4" onsubmit={handleWaitlistSubmit}>
					<p class="text-[16px] text-[#525252] m-0" style="font-family: 'Source Serif 4', Georgia, serif;">Get notified when live alerts launch.</p>
					<div class="flex border border-black max-sm:flex-col">
						<input
							type="email"
							class="flex-1 px-[14px] py-3 bg-transparent border-none border-r border-black text-black font-sans text-sm outline-none rounded-none focus:bg-bg-surface max-sm:border-r-0 max-sm:border-b max-sm:border-black"
							placeholder="you@example.com"
							bind:value={waitlistEmail}
							required
						/>
						<button type="submit" class="px-5 py-3 border-none bg-black text-white font-sans text-xs tracking-[0.1em] uppercase cursor-pointer whitespace-nowrap transition-colors duration-100 rounded-none hover:enabled:bg-[#333333] disabled:opacity-50 disabled:cursor-default" disabled={waitlistStatus === 'submitting'}>
							{waitlistStatus === 'submitting' ? 'Joining…' : 'Join waitlist →'}
						</button>
					</div>
					{#if waitlistStatus === 'error'}
						<p class="font-mono text-xs text-black m-0">Something went wrong — try again.</p>
					{/if}
				</form>
			{/if}
		</div>
		{/if}

		<!-- How it works -->
		<div class="border-t-4 border-black py-16 flex flex-col gap-6" id="how-it-works">
			<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase">How It Works</span>
			<div class="flex flex-col">
				<div class="grid [grid-template-columns:72px_1fr] gap-6 py-7 border-t border-black first:border-t-0 first:pt-0 max-sm:[grid-template-columns:48px_1fr] max-sm:gap-4">
					<span class="font-mono text-[40px] font-normal text-[#E5E5E5] leading-none pt-1 max-sm:text-[28px]">01</span>
					<div class="flex flex-col gap-2">
						<p class="font-display text-[20px] font-normal text-black m-0">Describe your hypothesis</p>
						<p class="text-[15px] text-[#525252] leading-[1.6] m-0" style="font-family: 'Source Serif 4', Georgia, serif;">Type a plain-English trade idea. The more specific, the better.</p>
					</div>
				</div>
				<div class="grid [grid-template-columns:72px_1fr] gap-6 py-7 border-t border-black max-sm:[grid-template-columns:48px_1fr] max-sm:gap-4">
					<span class="font-mono text-[40px] font-normal text-[#E5E5E5] leading-none pt-1 max-sm:text-[28px]">02</span>
					<div class="flex flex-col gap-2">
						<p class="font-display text-[20px] font-normal text-black m-0">AI finds every historical instance</p>
						<p class="text-[15px] text-[#525252] leading-[1.6] m-0" style="font-family: 'Source Serif 4', Georgia, serif;">We scan 10+ years of financial news to identify every time this event happened — with sources.</p>
					</div>
				</div>
				<div class="grid [grid-template-columns:72px_1fr] gap-6 py-7 border-t border-black max-sm:[grid-template-columns:48px_1fr] max-sm:gap-4">
					<span class="font-mono text-[40px] font-normal text-[#E5E5E5] leading-none pt-1 max-sm:text-[28px]">03</span>
					<div class="flex flex-col gap-2">
						<p class="font-display text-[20px] font-normal text-black m-0">Get a full backtest report</p>
						<p class="text-[15px] text-[#525252] leading-[1.6] m-0" style="font-family: 'Source Serif 4', Georgia, serif;">Trade simulations, P&L charts, and a sourced event log — in minutes.</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Example report teaser -->
		<div class="border-t-4 border-black py-16 flex flex-col gap-6" id="example">
			<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase">Example Report</span>
			<div class="pl-5 border-l-4 border-black">
				<p class="font-display italic text-[22px] leading-[1.4] text-black m-0">"Buy semiconductor stocks every time the US restricts chip exports to China"</p>
			</div>
			<div class="flex flex-wrap items-center gap-2 font-mono text-sm">
				<span class="text-accent-gain font-bold">+184% total return</span>
				<span class="text-[#CCCCCC]">·</span>
				<span class="text-[#525252]">6 events found</span>
				<span class="text-[#CCCCCC]">·</span>
				<span class="text-[#525252]">75% win rate</span>
				<span class="text-[#CCCCCC]">·</span>
				<span class="text-[#525252]">24 trades</span>
			</div>
			<div class="flex flex-col border border-black">
				<div class="grid [grid-template-columns:1fr_60px_50px_80px_70px] px-[14px] py-[10px] font-sans text-[10px] tracking-[0.08em] text-[#525252] bg-bg-surface uppercase border-b border-black max-sm:[grid-template-columns:1fr_50px_40px_68px_62px] max-sm:text-xs max-sm:px-[10px] max-sm:py-2">
					<span>DATE</span>
					<span>TICKER</span>
					<span>DIR</span>
					<span class="text-right">P&L ($)</span>
					<span class="text-right">P&L (%)</span>
				</div>
				<div class="grid [grid-template-columns:1fr_60px_50px_80px_70px] px-[14px] py-[10px] font-mono text-sm text-black border-b border-black max-sm:[grid-template-columns:1fr_50px_40px_68px_62px] max-sm:text-xs max-sm:px-[10px] max-sm:py-2">
					<span>2022-10-07</span>
					<span>NVDA</span>
					<span>Long</span>
					<span class="text-right text-accent-gain font-bold">+$2,240</span>
					<span class="text-right text-accent-gain font-bold">+22.4%</span>
				</div>
				<div class="grid [grid-template-columns:1fr_60px_50px_80px_70px] px-[14px] py-[10px] font-mono text-sm text-black border-b border-black max-sm:[grid-template-columns:1fr_50px_40px_68px_62px] max-sm:text-xs max-sm:px-[10px] max-sm:py-2">
					<span>2023-08-01</span>
					<span>AMD</span>
					<span>Long</span>
					<span class="text-right text-accent-gain font-bold">+$1,180</span>
					<span class="text-right text-accent-gain font-bold">+11.8%</span>
				</div>
				<div class="grid [grid-template-columns:1fr_60px_50px_80px_70px] px-[14px] py-[10px] font-mono text-sm text-black max-sm:[grid-template-columns:1fr_50px_40px_68px_62px] max-sm:text-xs max-sm:px-[10px] max-sm:py-2">
					<span>2020-03-15</span>
					<span>INTC</span>
					<span>Long</span>
					<span class="text-right text-accent-loss">−$490</span>
					<span class="text-right text-accent-loss">−4.9%</span>
				</div>
			</div>
			<a href="#top" class="font-sans text-sm text-[#525252] underline decoration-[#CCCCCC] hover:text-black hover:decoration-black">Try your own hypothesis →</a>
		</div>

		<!-- Coming soon -->
		<div class="border-t-4 border-black py-16 flex flex-col gap-6" id="coming-soon">
			<div class="flex flex-col gap-3">
				<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase">Coming Soon</span>
				<p class="font-display text-[28px] font-normal text-black m-0">More markets. Smarter alerts. Full automation.</p>
			</div>

			<div class="flex flex-col gap-4">
				<p class="font-mono text-[10px] tracking-[0.1em] uppercase text-[#525252] m-0">Markets</p>
				<div class="cs-grid grid grid-cols-2 gap-px bg-black border border-black max-sm:grid-cols-1">
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Crypto markets — coming soon', 'crypto')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Crypto</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">BTC, ETH, and 100+ altcoins — test news-driven moves across crypto markets.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Forex markets — coming soon', 'forex')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Forex</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">Major currency pairs — backtest central bank decisions, economic data, and geopolitical events.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Futures & Commodities — coming soon', 'futures')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Futures &amp; Commodities</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">Oil, gold, grains, and index futures — test supply shocks and macro events.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('International equities — coming soon', 'international')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">International Equities</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">European, Asian, and emerging market stocks — test global news on global stocks.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Options — coming soon', 'options')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Options</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">Options strategies around catalyst events — earnings, FDA decisions, and more.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-4">
				<p class="font-mono text-[10px] tracking-[0.1em] uppercase text-[#525252] m-0">Features</p>
				<div class="cs-grid grid grid-cols-2 gap-px bg-black border border-black max-sm:grid-cols-1">
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Live news alerts — coming soon', 'live_alerts')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Live news alerts</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">Get notified the moment your event pattern fires — before the market moves.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Alert → trade execution — coming soon', 'trade_execution')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Alert → trade execution</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">From signal to trade in seconds — fully automated execution when your event fires.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Broker integration — coming soon', 'broker')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Broker integration</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">Direct connectivity with Interactive Brokers, Alpaca, and major platforms.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('SMS & email alert notifications — coming soon', 'notifications')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">SMS &amp; email notifications</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">Never miss a signal — push, SMS, and email alerts across all devices.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
					<button class="group flex flex-col gap-[10px] p-5 bg-white border-none cursor-pointer text-left transition-colors duration-100 hover:bg-black" onclick={() => openComingSoon('Per-ticker entry/exit rules — coming soon', 'per_ticker_rules')}>
						<div class="flex items-center justify-between gap-2">
							<span class="font-sans text-sm font-medium text-black group-hover:text-white">Per-ticker entry/exit rules</span>
							<span class="font-mono text-[9px] tracking-[0.1em] uppercase text-black border border-black px-[6px] py-[2px] leading-[1.6] whitespace-nowrap shrink-0 group-hover:border-white group-hover:text-white">Soon</span>
						</div>
						<p class="text-[13px] text-[#525252] leading-[1.5] m-0 flex-1 group-hover:text-white" style="font-family: 'Source Serif 4', Georgia, serif;">Customize entry, exit, and position sizing per ticker within a single backtest.</p>
						<span class="font-sans text-xs tracking-[0.05em] text-[#525252] mt-1 group-hover:text-white">Notify me →</span>
					</button>
				</div>
			</div>
		</div>

		<!-- Pricing -->
		<div class="border-t-4 border-black py-16 flex flex-col gap-6" id="pricing">
			<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase">Pricing</span>
			<p class="text-[18px] text-[#525252] m-0" style="font-family: 'Source Serif 4', Georgia, serif;">Free to start — 3 credits on signup, no card required.</p>

			<div class="flex flex-col border border-black">
				<div class="grid [grid-template-columns:1fr_80px_70px_90px] px-[14px] py-3 font-sans text-[10px] tracking-[0.08em] text-[#525252] bg-bg-surface uppercase border-b border-black max-sm:[grid-template-columns:1fr_60px_55px_72px] max-sm:text-xs max-sm:p-[10px]">
					<span>Pack</span>
					<span>Credits</span>
					<span class="text-right">Price</span>
					<span class="text-right">Per Credit</span>
				</div>
				<div class="grid [grid-template-columns:1fr_80px_70px_90px] px-[14px] py-3 font-mono text-sm text-black border-b border-black max-sm:[grid-template-columns:1fr_60px_55px_72px] max-sm:text-xs max-sm:p-[10px]">
					<span>Starter</span>
					<span>10</span>
					<span class="text-right">$9</span>
					<span class="text-right text-[#AAAAAA]">$0.90</span>
				</div>
				<div class="grid [grid-template-columns:1fr_80px_70px_90px] px-[14px] py-3 font-mono text-sm text-black border-b border-black max-sm:[grid-template-columns:1fr_60px_55px_72px] max-sm:text-xs max-sm:p-[10px]">
					<span>Pro</span>
					<span>30</span>
					<span class="text-right">$19</span>
					<span class="text-right text-[#AAAAAA]">$0.63</span>
				</div>
				<div class="grid [grid-template-columns:1fr_80px_70px_90px] px-[14px] py-3 font-mono text-sm bg-black text-white border-b border-[#333333] max-sm:[grid-template-columns:1fr_60px_55px_72px] max-sm:text-xs max-sm:p-[10px]">
					<span>Power</span>
					<span>100</span>
					<span class="text-right">$49</span>
					<span class="text-right">$0.49</span>
				</div>
			</div>

			<div class="flex flex-col border border-black">
				<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase px-[14px] py-3 border-b border-black bg-bg-surface">Credit Costs</span>
				<div class="flex justify-between px-[14px] py-[10px] border-b border-[#E5E5E5] font-sans text-sm">
					<span class="text-[#525252]">Basic backtest (1 ticker, ≤5 events)</span>
					<span class="font-mono text-black whitespace-nowrap ml-4">1 credit</span>
				</div>
				<div class="flex justify-between px-[14px] py-[10px] border-b border-[#E5E5E5] font-sans text-sm">
					<span class="text-[#525252]">Standard backtest (6–20 events)</span>
					<span class="font-mono text-black whitespace-nowrap ml-4">2 credits</span>
				</div>
				<div class="flex justify-between px-[14px] py-[10px] border-b border-[#E5E5E5] font-sans text-sm">
					<span class="text-[#525252]">Multi-stock (2–5 tickers)</span>
					<span class="font-mono text-black whitespace-nowrap ml-4">3 credits</span>
				</div>
				<div class="flex justify-between px-[14px] py-[10px] font-sans text-sm">
					<span class="text-[#525252]">Multi-stock (6–10 tickers)</span>
					<span class="font-mono text-black whitespace-nowrap ml-4">5 credits</span>
				</div>
			</div>

			<a href="/auth/register" class="inline-block self-start px-6 py-[13px] bg-black text-white font-sans text-xs tracking-[0.1em] uppercase no-underline cursor-pointer transition-colors duration-100 border-2 border-black hover:bg-white hover:text-black">Get started free →</a>
		</div>

	</div>
</main>

{#if comingSoonOpen}
	<WaitlistModal
		title={comingSoonTitle}
		interest={comingSoonInterest}
		onclose={() => comingSoonOpen = false}
	/>
{/if}

<!-- ── Footer ────────────────────────────────────────────────────────────── -->
<footer class="border-t border-black py-7 bg-white">
	<div class="max-w-[1100px] mx-auto px-6 flex items-center gap-3 font-sans text-xs text-[#525252] flex-wrap">
		<span>© 2025 Aslan Finance</span>
		<span class="text-[#CCCCCC]">·</span>
		<a href="/disclaimer" class="text-[#525252] no-underline hover:text-black hover:underline">Disclaimer</a>
		<span class="text-[#CCCCCC]">·</span>
		<a href="/terms" class="text-[#525252] no-underline hover:text-black hover:underline">Terms</a>
		<span class="text-[#CCCCCC]">·</span>
		<a href="/privacy" class="text-[#525252] no-underline hover:text-black hover:underline">Privacy</a>
	</div>
</footer>

<style>
	/* ── Textarea placeholder ─────────────────────────────────────────────── */
	textarea::placeholder {
		color: #BBBBBB;
		font-style: italic;
	}

	/* ── Waitlist input placeholder ───────────────────────────────────────── */
	input[type="email"]::placeholder {
		color: #AAAAAA;
		font-style: italic;
	}

	/* ── cs-grid trailing empty cell fill (odd card count) ───────────────── */
	.cs-grid::after {
		content: '';
		background: #FFFFFF;
	}
</style>
