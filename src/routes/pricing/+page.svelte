<script lang="ts">
	import type { PageData } from './$types'
	let { data }: { data: PageData } = $props()
</script>

<!-- ── Nav ───────────────────────────────────────────────────────────────── -->
<nav class="top-nav">
	<a href="/" class="wordmark">Aslan Finance</a>
	<div class="nav-right">
		<a href="/#how-it-works" class="nav-link">How it works</a>
		<a href="/pricing" class="nav-link active">Pricing</a>
		{#if data.user}
			<a href="/dashboard" class="nav-link nav-cta">Dashboard →</a>
		{:else}
			<a href="/auth/login" class="nav-link">Login</a>
			<a href="/auth/register" class="nav-link nav-cta">Register</a>
		{/if}
	</div>
</nav>

<main class="pricing-page">
	<div class="content-col">

		<div class="page-header">
			<h1 class="headline">Pricing</h1>
			<p class="sub">Free to start — 3 credits on signup, no card required.</p>
		</div>

		<!-- Credit packs -->
		<div class="section-block">
			<span class="section-label">CREDIT PACKS</span>

			<div class="pricing-table">
				<div class="pricing-row pricing-header">
					<span>PACK</span>
					<span>CREDITS</span>
					<span class="col-right">PRICE</span>
					<span class="col-right">PER CREDIT</span>
				</div>
				<div class="pricing-row">
					<span>Starter</span>
					<span>10</span>
					<span class="col-right">$9</span>
					<span class="col-right muted">$0.90</span>
				</div>
				<div class="pricing-row">
					<span>Pro</span>
					<span>30</span>
					<span class="col-right">$19</span>
					<span class="col-right muted">$0.63</span>
				</div>
				<div class="pricing-row">
					<span>Power</span>
					<span>100</span>
					<span class="col-right">$49</span>
					<span class="col-right muted">$0.49</span>
				</div>
			</div>

			<p class="note">Credits do not expire. No subscription required.</p>
		</div>

		<!-- Credit costs -->
		<div class="section-block">
			<span class="section-label">CREDIT COSTS</span>

			<div class="cost-table">
				<div class="cost-row">
					<span class="cost-desc">Basic backtest (1 ticker, ≤5 events)</span>
					<span class="cost-val">1 credit</span>
				</div>
				<div class="cost-row">
					<span class="cost-desc">Standard backtest (1 ticker, 6–20 events)</span>
					<span class="cost-val">2 credits</span>
				</div>
				<div class="cost-row">
					<span class="cost-desc">Multi-stock backtest (2–5 tickers)</span>
					<span class="cost-val">3 credits</span>
				</div>
				<div class="cost-row">
					<span class="cost-desc">Multi-stock backtest (6–10 tickers)</span>
					<span class="cost-val">5 credits</span>
				</div>
				<div class="cost-row">
					<span class="cost-desc">Re-run with adjusted parameters</span>
					<span class="cost-val">1 credit</span>
				</div>
			</div>

			<div class="rules">
				<p class="rule">Credits are deducted only on successful completion.</p>
				<p class="rule">Zero events found = 0 credits consumed.</p>
				<p class="rule">Shared reports are free to view — no credits required.</p>
			</div>
		</div>

		<!-- Free tier -->
		<div class="section-block">
			<span class="section-label">FREE TIER</span>
			<p class="free-desc">
				Every account starts with 3 free credits — no credit card required.
				Run your first backtest immediately after signing up.
			</p>
			<a href="/auth/register" class="outlined-btn">Get started free →</a>
		</div>

	</div>
</main>

<footer class="site-footer">
	<div class="footer-inner">
		<span>© 2025 Aslan Finance</span>
		<span class="footer-sep">·</span>
		<a href="/disclaimer" class="footer-link">Disclaimer</a>
		<span class="footer-sep">·</span>
		<a href="/terms" class="footer-link">Terms</a>
		<span class="footer-sep">·</span>
		<a href="/privacy" class="footer-link">Privacy</a>
	</div>
</footer>

<style>
	/* ── Nav ──────────────────────────────────────────────────────────────── */
	.top-nav {
		display: flex;
		align-items: center;
		padding: 16px 0;
		border-bottom: 1px solid var(--bg-border);
	}

	.wordmark {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text-primary);
		text-decoration: none;
	}

	.nav-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 24px;
	}

	.nav-link {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		text-decoration: none;
	}

	.nav-link:hover {
		color: var(--text-primary);
	}

	.nav-link.active {
		color: var(--text-primary);
		border-bottom: 1px solid var(--text-primary);
		padding-bottom: 1px;
	}

	.nav-cta {
		color: var(--text-primary);
	}

	/* ── Layout ───────────────────────────────────────────────────────────── */
	.pricing-page {
		padding-top: 48px;
		padding-bottom: 96px;
	}

	.content-col {
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
	}

	.page-header {
		margin-bottom: 0;
		padding-bottom: 40px;
	}

	.headline {
		font-family: 'Instrument Serif', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		font-size: var(--text-hero);
		line-height: 1.1;
		color: var(--text-primary);
		margin: 0 0 16px;
	}

	.sub {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		color: var(--text-secondary);
		margin: 0;
	}

	/* ── Section blocks ───────────────────────────────────────────────────── */
	.section-block {
		border-top: 1px solid var(--bg-border);
		padding: 40px 0;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.section-label {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		color: var(--text-secondary);
		text-transform: uppercase;
	}

	/* ── Pricing table ────────────────────────────────────────────────────── */
	.pricing-table {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--bg-border);
	}

	.pricing-row {
		display: grid;
		grid-template-columns: 1fr 80px 70px 90px;
		padding: 10px 12px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: var(--text-sm);
		color: var(--text-primary);
		border-bottom: 1px solid var(--bg-border);
	}

	.pricing-row:last-child {
		border-bottom: none;
	}

	.pricing-header {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		color: var(--text-secondary);
		background: var(--bg-surface);
		text-transform: uppercase;
	}

	.col-right {
		text-align: right;
	}

	.muted {
		color: var(--text-muted);
	}

	.note {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	/* ── Cost table ───────────────────────────────────────────────────────── */
	.cost-table {
		display: flex;
		flex-direction: column;
	}

	.cost-row {
		display: flex;
		justify-content: space-between;
		padding: 9px 0;
		border-bottom: 1px solid var(--bg-border);
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
	}

	.cost-row:last-child {
		border-bottom: none;
	}

	.cost-desc {
		color: var(--text-secondary);
	}

	.cost-val {
		font-family: 'IBM Plex Mono', monospace;
		color: var(--text-primary);
		white-space: nowrap;
		margin-left: 16px;
	}

	/* ── Rules ────────────────────────────────────────────────────────────── */
	.rules {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.rule {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--text-muted);
		margin: 0;
	}

	/* ── Free tier ────────────────────────────────────────────────────────── */
	.free-desc {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		color: var(--text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	.outlined-btn {
		display: inline-block;
		padding: 11px 20px;
		border: 1px solid var(--bg-border);
		background: transparent;
		color: var(--text-primary);
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		text-decoration: none;
		cursor: pointer;
		transition: background 100ms;
		align-self: flex-start;
	}

	.outlined-btn:hover {
		background: var(--bg-elevated);
	}

	/* ── Footer ───────────────────────────────────────────────────────────── */
	.site-footer {
		border-top: 1px solid var(--bg-border);
		padding: 24px 0;
	}

	.footer-inner {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0 24px;
		display: flex;
		align-items: center;
		gap: 12px;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-xs);
		color: var(--text-muted);
		flex-wrap: wrap;
	}

	.footer-sep {
		color: var(--text-muted);
	}

	.footer-link {
		color: var(--text-muted);
		text-decoration: none;
	}

	.footer-link:hover {
		color: var(--text-secondary);
	}

	/* ── Responsive ───────────────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.headline {
			font-size: 32px;
		}

		.pricing-row {
			grid-template-columns: 1fr 60px 55px 72px;
			font-size: 11px;
			padding: 8px;
		}

		.nav-right {
			gap: 16px;
		}
	}
</style>
