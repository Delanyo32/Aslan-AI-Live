<script lang="ts">
	import type { PageData } from './$types'
	let { data }: { data: PageData } = $props()
</script>

<!-- ── Nav ───────────────────────────────────────────────────────────────── -->
<nav class="flex items-center py-5 border-b-2 border-black">
	<a href="/" class="font-display italic font-normal text-[22px] text-text-primary no-underline tracking-[-0.01em]">Aslan Terminal</a>
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
			<p class="font-sans text-base text-text-secondary m-0">Free to start — 20 credits on signup, no card required.</p>
		</div>

		<!-- Monthly plans -->
		<div class="border-t border-black py-10 flex flex-col gap-5">
			<span class="font-sans text-xs tracking-[0.08em] text-text-secondary uppercase">MONTHLY PLANS</span>

			<div class="flex flex-col border border-black">
				<div class="grid grid-cols-[1fr_110px_90px] py-2.5 px-3 font-sans text-xs tracking-[0.06em] text-text-secondary bg-bg-surface uppercase border-b border-black">
					<span>PLAN</span>
					<span class="text-right">CREDITS / MO</span>
					<span class="text-right">PRICE / MO</span>
				</div>
				<div class="grid grid-cols-[1fr_110px_90px] py-2.5 px-3 font-mono text-sm text-text-primary border-b border-black">
					<span>Starter</span>
					<span class="text-right">50</span>
					<span class="text-right">$49</span>
				</div>
				<div class="grid grid-cols-[1fr_110px_90px] py-2.5 px-3 font-mono text-sm bg-black text-white border-b border-black">
					<span>Professional</span>
					<span class="text-right">200</span>
					<span class="text-right">$179</span>
				</div>
				<div class="grid grid-cols-[1fr_110px_90px] py-2.5 px-3 font-mono text-sm text-text-primary border-b border-black">
					<span>Power</span>
					<span class="text-right">600</span>
					<span class="text-right">$499</span>
				</div>
				<div class="grid grid-cols-[1fr_110px_90px] py-2.5 px-3 font-mono text-sm text-text-primary">
					<span>Fund / Enterprise</span>
					<span class="text-right text-text-muted">Custom</span>
					<span class="text-right"><a href="mailto:hello@aslan.ai?subject=Fund%20plan" class="text-text-primary no-underline border-b border-black">Contact →</a></span>
				</div>
			</div>

			<p class="font-sans text-sm text-text-muted m-0">Credits refill each billing cycle. Unused credits don't roll over. Cancel anytime.</p>
		</div>

		<!-- Credit costs -->
		<div class="border-t border-black py-10 flex flex-col gap-5">
			<span class="font-sans text-xs tracking-[0.08em] text-text-secondary uppercase">CREDIT COSTS</span>

			<div class="flex flex-col">
				<div class="flex justify-between py-[9px] border-b border-black font-sans text-sm">
					<span class="text-text-secondary">Deep report (9-framework grade)</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">5 credits</span>
				</div>
				<div class="flex justify-between py-[9px] border-b border-black font-sans text-sm">
					<span class="text-text-secondary">Re-run with adjusted parameters</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">2 credits</span>
				</div>
				<div class="flex justify-between py-[9px] border-b border-black font-sans text-sm">
					<span class="text-text-secondary">Watchlist monitoring — per company</span>
					<span class="font-mono text-text-primary whitespace-nowrap ml-4">10 credits / mo</span>
				</div>
				<div class="flex justify-between py-[9px] font-sans text-sm">
					<span class="text-text-secondary">Backtest — per Exa search (usage-based)</span>
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
				Every account starts with 20 free credits — no credit card required.
				Run your first report immediately after signing up.
			</p>
			<a
				href="/auth/register"
				class="inline-block self-start py-[11px] px-5 border border-black bg-transparent text-text-primary font-sans text-sm no-underline cursor-pointer transition-colors duration-100 hover:bg-bg-elevated"
			>Get started free →</a>
		</div>

	</div>
</main>

<footer class="border-t-4 border-black py-6">
	<div class="max-w-[1100px] mx-auto px-6 flex items-center gap-3 font-sans text-xs text-text-muted flex-wrap">
		<span>© 2026 Aslan Terminal</span>
		<span>·</span>
		<a href="/disclaimer" class="text-text-muted no-underline hover:text-text-secondary transition-colors duration-100">Disclaimer</a>
		<span>·</span>
		<a href="/terms" class="text-text-muted no-underline hover:text-text-secondary transition-colors duration-100">Terms</a>
		<span>·</span>
		<a href="/privacy" class="text-text-muted no-underline hover:text-text-secondary transition-colors duration-100">Privacy</a>
	</div>
</footer>
