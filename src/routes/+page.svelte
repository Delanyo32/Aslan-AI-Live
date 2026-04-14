<script lang="ts">
	import { goto } from '$app/navigation'
	import type { PageData } from './$types'
	import BacktestInput from '$lib/components/backtest/BacktestInput.svelte'
	import WaitlistModal from '$lib/components/WaitlistModal.svelte'

	let { data }: { data: PageData } = $props()

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
<nav class="top-nav">
	<a href="/" class="wordmark">Aslan Finance</a>
	<div class="nav-right">
		<a href="#how-it-works" class="nav-link">How it works</a>
		<a href="/pricing" class="nav-link">Pricing</a>
		<a href="/backtests" class="nav-link">Backtests</a>
		{#if data.user}
			<a href="/dashboard" class="nav-link nav-cta">Dashboard →</a>
		{:else}
			<a href="/auth/login" class="nav-link">Login</a>
			<a href="/auth/register" class="nav-link nav-cta">Register</a>
		{/if}
	</div>
</nav>

<!-- ── Main ──────────────────────────────────────────────────────────────── -->
<main class="homepage" id="top">
	<div class="content-col">

		<h1 class="headline">What would you have made?</h1>
		<p class="sub">
			Describe a news-driven trade. We'll find every historical instance and run the backtest.
		</p>

		<BacktestInput onrun={handleRun} />

		<!-- ── Below-fold content ────────────────────────────────────────────── -->

			<!-- Waitlist capture — only for anonymous visitors -->
			{#if !data.user}
			<div class="section-block" id="waitlist">
				<span class="section-label">STAY AHEAD</span>
				{#if waitlistStatus === 'success'}
					<p class="waitlist-confirm">You're on the list.</p>
				{:else}
					<form class="waitlist-form" onsubmit={handleWaitlistSubmit}>
						<p class="waitlist-desc">Get notified when live alerts launch.</p>
						<div class="waitlist-row">
							<input
								type="email"
								class="waitlist-input"
								placeholder="you@example.com"
								bind:value={waitlistEmail}
								required
							/>
							<button type="submit" class="waitlist-btn" disabled={waitlistStatus === 'submitting'}>
								{waitlistStatus === 'submitting' ? 'Joining…' : 'Join waitlist →'}
							</button>
						</div>
						{#if waitlistStatus === 'error'}
							<p class="waitlist-error">Something went wrong — try again.</p>
						{/if}
					</form>
				{/if}
			</div>
			{/if}

			<!-- How it works -->
			<div class="section-block" id="how-it-works">
				<span class="section-label">HOW IT WORKS</span>
				<div class="steps">
					<div class="step">
						<span class="step-num">01</span>
						<div class="step-body">
							<p class="step-title">Describe your hypothesis</p>
							<p class="step-desc">Type a plain-English trade idea. The more specific, the better.</p>
						</div>
					</div>
					<div class="step">
						<span class="step-num">02</span>
						<div class="step-body">
							<p class="step-title">AI finds every historical instance</p>
							<p class="step-desc">We scan 10+ years of financial news to identify every time this event happened — with sources.</p>
						</div>
					</div>
					<div class="step">
						<span class="step-num">03</span>
						<div class="step-body">
							<p class="step-title">Get a full backtest report</p>
							<p class="step-desc">Trade simulations, P&L charts, and a sourced event log — in minutes.</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Example report teaser -->
			<div class="section-block" id="example">
				<span class="section-label">EXAMPLE REPORT</span>
				<p class="example-query">"Buy semiconductor stocks every time the US restricts chip exports to China"</p>
				<div class="example-stats">
					<span class="stat-gain">+184% total return</span>
					<span class="stat-sep">·</span>
					<span class="stat">6 events found</span>
					<span class="stat-sep">·</span>
					<span class="stat">75% win rate</span>
					<span class="stat-sep">·</span>
					<span class="stat">24 trades</span>
				</div>
				<div class="trade-table">
					<div class="trade-row trade-header">
						<span>DATE</span>
						<span>TICKER</span>
						<span>DIR</span>
						<span class="col-right">P&L ($)</span>
						<span class="col-right">P&L (%)</span>
					</div>
					<div class="trade-row">
						<span>2022-10-07</span>
						<span>NVDA</span>
						<span>Long</span>
						<span class="col-right gain">+$2,240</span>
						<span class="col-right gain">+22.4%</span>
					</div>
					<div class="trade-row">
						<span>2023-08-01</span>
						<span>AMD</span>
						<span>Long</span>
						<span class="col-right gain">+$1,180</span>
						<span class="col-right gain">+11.8%</span>
					</div>
					<div class="trade-row">
						<span>2020-03-15</span>
						<span>INTC</span>
						<span>Long</span>
						<span class="col-right loss">−$490</span>
						<span class="col-right loss">−4.9%</span>
					</div>
				</div>
				<a href="#top" class="text-link">Try your own hypothesis →</a>
			</div>

			<!-- Coming soon -->
			<div class="section-block" id="coming-soon">
				<div class="cs-header">
					<span class="section-label">COMING SOON</span>
					<p class="cs-headline">More markets. Smarter alerts. Full automation.</p>
				</div>

				<div class="cs-group">
					<p class="cs-group-label">Markets</p>
					<div class="cs-grid">
						<button class="cs-card" onclick={() => openComingSoon('Crypto markets — coming soon', 'crypto')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Crypto</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">BTC, ETH, and 100+ altcoins — test news-driven moves across crypto markets.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('Forex markets — coming soon', 'forex')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Forex</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">Major currency pairs — backtest central bank decisions, economic data, and geopolitical events.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('Futures & Commodities — coming soon', 'futures')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Futures &amp; Commodities</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">Oil, gold, grains, and index futures — test supply shocks and macro events.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('International equities — coming soon', 'international')}>
							<div class="cs-card-top">
								<span class="cs-card-name">International Equities</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">European, Asian, and emerging market stocks — test global news on global stocks.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('Options — coming soon', 'options')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Options</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">Options strategies around catalyst events — earnings, FDA decisions, and more.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
					</div>
				</div>

				<div class="cs-group">
					<p class="cs-group-label">Features</p>
					<div class="cs-grid">
						<button class="cs-card" onclick={() => openComingSoon('Live news alerts — coming soon', 'live_alerts')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Live news alerts</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">Get notified the moment your event pattern fires — before the market moves.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('Alert → trade execution — coming soon', 'trade_execution')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Alert → trade execution</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">From signal to trade in seconds — fully automated execution when your event fires.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('Broker integration — coming soon', 'broker')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Broker integration</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">Direct connectivity with Interactive Brokers, Alpaca, and major platforms.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('SMS & email alert notifications — coming soon', 'notifications')}>
							<div class="cs-card-top">
								<span class="cs-card-name">SMS &amp; email notifications</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">Never miss a signal — push, SMS, and email alerts across all devices.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
						<button class="cs-card" onclick={() => openComingSoon('Per-ticker entry/exit rules — coming soon', 'per_ticker_rules')}>
							<div class="cs-card-top">
								<span class="cs-card-name">Per-ticker entry/exit rules</span>
								<span class="cs-badge">SOON</span>
							</div>
							<p class="cs-card-desc">Customize entry, exit, and position sizing per ticker within a single backtest.</p>
							<span class="cs-notify">Notify me →</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Pricing -->
			<div class="section-block" id="pricing">
				<span class="section-label">PRICING</span>
				<p class="pricing-lead">Free to start — 3 credits on signup, no card required.</p>

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

				<div class="credit-costs">
					<span class="section-label" style="margin-bottom: 8px; display: block;">CREDIT COSTS</span>
					<div class="cost-row">
						<span class="cost-desc">Basic backtest (1 ticker, ≤5 events)</span>
						<span class="cost-val">1 credit</span>
					</div>
					<div class="cost-row">
						<span class="cost-desc">Standard backtest (6–20 events)</span>
						<span class="cost-val">2 credits</span>
					</div>
					<div class="cost-row">
						<span class="cost-desc">Multi-stock (2–5 tickers)</span>
						<span class="cost-val">3 credits</span>
					</div>
					<div class="cost-row">
						<span class="cost-desc">Multi-stock (6–10 tickers)</span>
						<span class="cost-val">5 credits</span>
					</div>
				</div>

				<a href="/auth/register" class="outlined-btn">Get started free →</a>
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

	.nav-cta {
		color: var(--text-primary);
	}

	/* ── Homepage layout ──────────────────────────────────────────────────── */
	.homepage {
		padding-top: 48px;
		padding-bottom: 96px;
	}

	.content-col {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* ── Hero ─────────────────────────────────────────────────────────────── */
	.headline {
		font-family: 'Instrument Serif', Georgia, serif;
		font-style: italic;
		font-weight: 400;
		font-size: var(--text-hero);
		line-height: 1.1;
		text-wrap: balance;
		color: var(--text-primary);
		margin: 0 0 24px;
	}

	.sub {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 0 0 24px;
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

	/* ── Waitlist ─────────────────────────────────────────────────────────── */
	.waitlist-desc {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		color: var(--text-secondary);
		margin: 0;
	}

	.waitlist-row {
		display: flex;
		gap: 8px;
	}

	.waitlist-input {
		flex: 1;
		padding: 10px 12px;
		background: var(--bg-surface);
		border: 1px solid var(--bg-border);
		color: var(--text-primary);
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		border-radius: 2px;
		outline: none;
	}

	.waitlist-input:focus {
		border-color: var(--text-secondary);
	}

	.waitlist-input::placeholder {
		color: var(--text-muted);
	}

	.waitlist-btn {
		padding: 10px 16px;
		border: 1px solid var(--bg-border);
		background: transparent;
		color: var(--text-primary);
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		cursor: pointer;
		border-radius: 2px;
		white-space: nowrap;
		transition: background 100ms;
	}

	.waitlist-btn:hover:not(:disabled) {
		background: var(--bg-elevated);
	}

	.waitlist-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.waitlist-confirm {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
	}

	.waitlist-error {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--accent-loss);
		margin: 0;
	}

	/* ── How it works ─────────────────────────────────────────────────────── */
	.steps {
		display: flex;
		flex-direction: column;
	}

	.step {
		display: flex;
		gap: 20px;
		padding: 16px 0;
		border-top: 1px solid var(--bg-border);
	}

	.step:first-child {
		border-top: none;
		padding-top: 0;
	}

	.step-num {
		font-family: 'IBM Plex Mono', monospace;
		font-size: var(--text-xs);
		color: var(--text-muted);
		min-width: 24px;
		padding-top: 2px;
	}

	.step-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.step-title {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text-primary);
		margin: 0;
	}

	.step-desc {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	/* ── Example report ───────────────────────────────────────────────────── */
	.example-query {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
		font-style: italic;
	}

	.example-stats {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: var(--text-sm);
	}

	.stat-gain {
		color: var(--accent-gain);
	}

	.stat {
		color: var(--text-secondary);
	}

	.stat-sep {
		color: var(--text-muted);
	}

	.trade-table {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--bg-border);
	}

	.trade-row {
		display: grid;
		grid-template-columns: 1fr 60px 50px 80px 70px;
		padding: 8px 12px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: var(--text-sm);
		color: var(--text-primary);
		border-bottom: 1px solid var(--bg-border);
	}

	.trade-row:last-child {
		border-bottom: none;
	}

	.trade-row:nth-child(even) {
		background: var(--bg-surface);
	}

	.trade-header {
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

	.gain {
		color: var(--accent-gain);
	}

	.loss {
		color: var(--accent-loss);
	}

	.text-link {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		text-decoration: underline;
		text-decoration-color: var(--bg-border);
	}

	.text-link:hover {
		color: var(--text-primary);
		text-decoration-color: var(--text-primary);
	}

	/* ── Pricing ──────────────────────────────────────────────────────────── */
	.pricing-lead {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		color: var(--text-secondary);
		margin: 0;
	}

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

	.muted {
		color: var(--text-muted);
	}

	.credit-costs {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.cost-row {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
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

	/* ── Coming soon ─────────────────────────────────────────────────────── */
	.cs-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.cs-headline {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--text-primary);
		margin: 0;
	}

	.cs-group {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.cs-group-label {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-secondary);
		margin: 0;
	}

	.cs-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1px;
		background: var(--bg-border);
		border: 1px solid var(--bg-border);
	}

	.cs-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		background: var(--bg-surface);
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 100ms;
	}

	.cs-card:hover {
		background: var(--bg-elevated);
	}

	.cs-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.cs-card-name {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-primary);
	}

	.cs-card-desc {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-xs);
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0;
		flex: 1;
	}

	.cs-notify {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin-top: 4px;
	}

	.cs-badge {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent-amber);
		border: 1px solid var(--accent-amber);
		padding: 1px 5px;
		line-height: 1.6;
		white-space: nowrap;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.cs-grid {
			grid-template-columns: 1fr;
		}
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

		.trade-row {
			grid-template-columns: 1fr 50px 40px 68px 62px;
			font-size: 11px;
			padding: 7px 8px;
		}

		.pricing-row {
			grid-template-columns: 1fr 60px 55px 72px;
			font-size: 11px;
			padding: 8px;
		}

		.nav-right {
			gap: 16px;
		}

		.waitlist-row {
			flex-direction: column;
		}

		.waitlist-btn {
			align-self: flex-start;
		}
	}
</style>
