<script lang="ts">
	import type { PageData } from './$types'
	let { data }: { data: PageData } = $props()
</script>

<!-- ── Nav ───────────────────────────────────────────────────────────────── -->
<nav class="flex items-center py-5 border-b-2 border-black">
	<a href="/" class="font-display italic font-normal text-[22px] text-text-primary no-underline tracking-[-0.01em]">Aslan Finance</a>
	<div class="ml-auto flex items-center gap-7 max-sm:gap-4">
		<a href="/#how-it-works" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">How it works</a>
		<a href="/pricing" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline border-b-2 border-black pb-px">Pricing</a>
		{#if data.user}
			<a href="/dashboard" class="font-sans text-xs tracking-[0.1em] uppercase bg-black text-white px-[18px] py-2 border-2 border-black no-underline transition-colors duration-100 hover:bg-white hover:text-black">Dashboard →</a>
		{:else}
			<a href="/auth/login" class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Login</a>
			<a href="/auth/register" class="font-sans text-xs tracking-[0.1em] uppercase bg-black text-white px-[18px] py-2 border-2 border-black no-underline transition-colors duration-100 hover:bg-white hover:text-black">Register →</a>
		{/if}
	</div>
</nav>

<main class="pt-12 pb-24">
	<div class="max-w-[560px] mx-auto flex flex-col">

		<div class="pb-10">
			<h1 class="font-display italic font-normal text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.1] text-text-primary m-0 mb-4">Pricing</h1>
			<p class="font-sans text-base text-text-secondary m-0">Free to start — 3 credits on signup, no card required.</p>
		</div>

		<!-- Credit packs -->
		<div class="border-t border-black py-10 flex flex-col gap-5">
			<span class="font-sans text-xs tracking-[0.08em] text-text-secondary uppercase">CREDIT PACKS</span>

			<div class="flex flex-col border border-black">
				<div class="grid grid-cols-[1fr_80px_70px_90px] py-2.5 px-3 font-sans text-xs tracking-[0.06em] text-text-secondary bg-bg-surface uppercase border-b border-black">
					<span>PACK</span>
					<span>CREDITS</span>
					<span class="text-right">PRICE</span>
					<span class="text-right">PER CREDIT</span>
				</div>
				<div class="grid grid-cols-[1fr_80px_70px_90px] py-2.5 px-3 font-mono text-sm text-text-primary border-b border-black">
					<span>Starter</span>
					<span>10</span>
					<span class="text-right">$9</span>
					<span class="text-right text-text-muted">$0.90</span>
				</div>
				<div class="grid grid-cols-[1fr_80px_70px_90px] py-2.5 px-3 font-mono text-sm text-text-primary border-b border-black">
					<span>Pro</span>
					<span>30</span>
					<span class="text-right">$19</span>
					<span class="text-right text-text-muted">$0.63</span>
				</div>
				<div class="grid grid-cols-[1fr_80px_70px_90px] py-2.5 px-3 font-mono text-sm text-text-primary">
					<span>Power</span>
					<span>100</span>
					<span class="text-right">$49</span>
					<span class="text-right text-text-muted">$0.49</span>
				</div>
			</div>

			<p class="font-sans text-sm text-text-muted m-0">Credits do not expire. No subscription required.</p>
		</div>

		<!-- Credit costs -->
		<div class="border-t border-black py-10 flex flex-col gap-5">
			<span class="font-sans text-xs tracking-[0.08em] text-text-secondary uppercase">CREDIT COSTS</span>

			<div class="flex flex-col">
				<div class="flex justify-between py-[9px] border-b border-black font-sans text-sm">
					<span class="text-text-secondary">Basic backtest (1 ticker, ≤5 events)</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">1 credit</span>
				</div>
				<div class="flex justify-between py-[9px] border-b border-black font-sans text-sm">
					<span class="text-text-secondary">Standard backtest (1 ticker, 6–20 events)</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">2 credits</span>
				</div>
				<div class="flex justify-between py-[9px] border-b border-black font-sans text-sm">
					<span class="text-text-secondary">Multi-stock backtest (2–5 tickers)</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">3 credits</span>
				</div>
				<div class="flex justify-between py-[9px] border-b border-black font-sans text-sm">
					<span class="text-text-secondary">Multi-stock backtest (6–10 tickers)</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">5 credits</span>
				</div>
				<div class="flex justify-between py-[9px] font-sans text-sm">
					<span class="text-text-secondary">Re-run with adjusted parameters</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">1 credit</span>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<p class="font-sans text-sm text-text-muted m-0">Credits are deducted only on successful completion.</p>
				<p class="font-sans text-sm text-text-muted m-0">Zero events found = 0 credits consumed.</p>
				<p class="font-sans text-sm text-text-muted m-0">Shared reports are free to view — no credits required.</p>
			</div>
		</div>

		<!-- Free tier -->
		<div class="border-t border-black py-10 flex flex-col gap-5">
			<span class="font-sans text-xs tracking-[0.08em] text-text-secondary uppercase">FREE TIER</span>
			<p class="font-sans text-base text-text-secondary leading-relaxed m-0">
				Every account starts with 3 free credits — no credit card required.
				Run your first backtest immediately after signing up.
			</p>
			<a
				href="/auth/register"
				class="inline-block self-start py-[11px] px-5 border border-black bg-transparent text-text-primary font-sans text-sm no-underline cursor-pointer transition-colors duration-100 hover:bg-bg-elevated"
			>Get started free →</a>
		</div>

	</div>
</main>

<footer class="border-t border-black py-6">
	<div class="max-w-[1100px] mx-auto px-6 flex items-center gap-3 font-sans text-xs text-text-muted flex-wrap">
		<span>© 2025 Aslan Finance</span>
		<span>·</span>
		<a href="/disclaimer" class="text-text-muted no-underline hover:text-text-secondary transition-colors duration-100">Disclaimer</a>
		<span>·</span>
		<a href="/terms" class="text-text-muted no-underline hover:text-text-secondary transition-colors duration-100">Terms</a>
		<span>·</span>
		<a href="/privacy" class="text-text-muted no-underline hover:text-text-secondary transition-colors duration-100">Privacy</a>
	</div>
</footer>
