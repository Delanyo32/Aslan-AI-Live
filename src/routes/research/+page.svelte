<script lang="ts">
	import BarList from '$lib/components/research/BarList.svelte'
	import Dumbbell from '$lib/components/research/Dumbbell.svelte'
	import LineChart from '$lib/components/research/LineChart.svelte'
	import ShareBars from '$lib/components/research/ShareBars.svelte'
	import StackedColumns from '$lib/components/research/StackedColumns.svelte'
	import SectionRule from '$lib/components/research/SectionRule.svelte'
	import StatTiles from '$lib/components/research/StatTiles.svelte'
	import { BLUE_DARK, BLUE_LIGHT, SERIES, fmtMoney, fmtPct } from '$lib/components/research/viz'

	let { data } = $props()
	const ind = data.industry
	const prose: Record<string, string> = ind.prose ?? {}

	const h = ind.headline
	const tiles = [
		{ label: 'Companies read', value: String(ind.stamp.companies), sub: `${ind.stamp.filings.toLocaleString()} filings since 2020` },
		{ label: 'Revenue, last 12 mo', value: fmtMoney(h.ttm_revenue), sub: `${h.n} US-dollar companies` },
		{ label: 'Debt they report', value: fmtMoney(h.reported_debt), sub: 'balance-sheet borrowings' },
		{ label: 'Money promised', value: fmtMoney(h.committed), sub: 'debt + leases + purchases' },
		{ label: 'Unrealized revenue', value: fmtMoney(h.deferred), sub: `+ ${fmtMoney(h.rpo)} signed backlog` },
		{ label: 'Due in next 5 years', value: fmtMoney(h.wall_next5), sub: 'the obligation wall' }
	]

	// Section 2 — debt
	const TOP_N = 14
	const dumbbell = ind.debt.per_company.slice(0, TOP_N).map((d) => ({ label: d.ticker, a: d.reported, b: d.committed }))
	const debtRest = ind.debt.per_company.length - TOP_N
	const debtSeries = {
		labels: ind.debt.series.map((p) => p.q),
		series: [
			{ label: 'promised', color: BLUE_DARK, values: ind.debt.series.map((p) => p.committed) },
			{ label: 'reported debt', color: BLUE_LIGHT, values: ind.debt.series.map((p) => p.reported) }
		]
	}

	// Section 3 — revenue reality
	const rr = ind.revenue_reality
	const rrSeries = {
		labels: rr.series.map((p) => p.q),
		series: [
			{ label: 'revenue (12 mo)', color: SERIES[0], values: rr.series.map((p) => p.ttm_revenue) },
			{ label: 'signed backlog', color: SERIES[2], dashed: true, values: rr.series.map((p) => p.rpo) },
			{ label: 'deferred', color: SERIES[1], values: rr.series.map((p) => p.deferred) }
		]
	}
	const ratioSeries = {
		labels: rr.ratio_series.map((p) => p.q),
		series: [{ label: 'median company', color: SERIES[1], values: rr.ratio_series.map((p) => p.median_ratio) }]
	}

	// Section 4 — components
	const COMP = [
		{ key: 'cost_of_revenue', label: 'Cost of revenue', color: SERIES[0] },
		{ key: 'rnd', label: 'R&D', color: SERIES[1] },
		{ key: 'sga', label: 'Selling & admin', color: SERIES[2] },
		{ key: 'tax', label: 'Tax', color: SERIES[3] }
	] as const
	const compRows = ind.expense_components.map((r) => ({
		label: String(r.year),
		parts: COMP.map((c) => ({ label: c.label, value: (r[c.key] as number) ?? 0, color: c.color }))
	}))
	const latestComp = ind.expense_components.at(-1)
	const capexSeries = {
		labels: ind.expense_components.map((r) => String(r.year)),
		series: [
			{ label: 'capex (cash)', color: SERIES[0], values: ind.expense_components.map((r) => r.capex) },
			{ label: 'R&D', color: SERIES[1], values: ind.expense_components.map((r) => r.rnd) },
			{ label: 'stock pay', color: SERIES[2], dashed: true, values: ind.expense_components.map((r) => r.sbc) }
		]
	}
	// Cast: this array is empty in a --no-ai bake, which TS narrows to never[].
	const notable = ind.flags.notable as { ticker: string; type: string; summary: string }[]

	// Section 5 — the wall
	const BAND_LABELS = ['next 5 years', 'years 5–10', 'beyond 10']
	const wallCols = [
		...ind.wall.obligations.map((b, i) => ({
			label: BAND_LABELS[i],
			parts: [
				{ label: 'dated by filings', value: b.disclosed, color: BLUE_DARK },
				{ label: 'timing estimated', value: b.estimated, color: BLUE_LIGHT }
			]
		})),
		{ label: 'after yr 5, undated', parts: [{ label: 'no date given', value: ind.wall.undated_after5, color: '#c3c2b7' }] }
	]
	const futRevCols = ind.wall.future_revenue.map((v, i) => ({
		label: BAND_LABELS[i],
		parts: [{ label: 'revenue already promised to them', value: v, color: SERIES[2] }]
	}))

	// Section 6 — growth
	const idx = ind.growth.indexed
	const idxSeries = {
		labels: idx.map((p) => p.q),
		series: [
			{ label: 'promised money', color: BLUE_DARK, values: idx.map((p) => p.committed) },
			{ label: 'revenue', color: SERIES[0], values: idx.map((p) => p.ttm_revenue) },
			{ label: 'deferred', color: SERIES[1], values: idx.map((p) => p.deferred) },
			{ label: 'reported debt', color: SERIES[3], values: idx.map((p) => p.reported_debt) }
		]
	}
	const cagrTiles = [
		{ label: 'Revenue growth /yr', value: fmtPct(ind.growth.cagr.revenue), sub: `${ind.growth.cagr.window?.[0]} → ${ind.growth.cagr.window?.[1]}` },
		{ label: 'Expense growth /yr', value: fmtPct(ind.growth.cagr.expenses), sub: 'median company' },
		{ label: 'Promised money /yr', value: fmtPct(ind.growth.cagr.committed), sub: 'debt + leases + purchases' },
		{ label: 'Reported debt /yr', value: fmtPct(ind.growth.cagr.reported_debt), sub: 'balance-sheet only' },
		{ label: 'Deferred revenue /yr', value: fmtPct(ind.growth.cagr.deferred), sub: 'cash for undelivered work' },
		{ label: 'Quarters re-stated', value: `${Math.round((ind.declared_vs_actual.adjusted_quarters.n / ind.declared_vs_actual.adjusted_quarters.of) * 100)}%`, sub: 'by cited reconciliation' }
	]

	// Section 7 — declared vs actual (expenses)
	const dvaCols = ind.declared_vs_actual.yearly.flatMap((r) => [
		{ label: 'filed', sub: String(r.year), parts: [{ label: 'expenses as filed', value: r.draft_expenses, color: BLUE_LIGHT }] },
		{ label: 'reality', sub: String(r.year), parts: [{ label: 'expenses after reconciliation', value: r.adjusted_expenses, color: BLUE_DARK }] }
	])

	// Section 8 — flags
	const flagItems = ind.flags.by_type.map((f) => ({ label: f.type.replaceAll('_', ' '), value: f.count }))

	const catItems = ind.categories.map((c) => ({ label: c.label, value: c.ttm_revenue, hint: c.tickers.join(', ') }))
	const byCategory = [...new Set(ind.companies.map((c) => c.category))].map((cat) => ({
		cat,
		members: ind.companies.filter((c) => c.category === cat)
	}))
</script>

<svelte:head>
	<title>The AI build-out, read from the filings — Aslan Research</title>
	<meta name="description" content="What {ind.stamp.filings.toLocaleString()} SEC filings from {ind.stamp.companies} AI-infrastructure companies actually say about debt, revenue, and the promises ahead." />
</svelte:head>

<header class="fixed top-0 left-0 w-full z-50 h-20 bg-[#fcfbf9] border-b border-[#e5e5e5] px-6 lg:px-12 flex items-center justify-between">
	<a href="/" class="serif-italic text-xl md:text-2xl text-gray-900 no-underline tracking-tight whitespace-nowrap">Aslan Terminal</a>
	<nav class="hidden md:flex items-center gap-10">
		<a href="#debt" class="mono-label text-[11px] text-gray-500 hover:text-black no-underline">Debt</a>
		<a href="#revenue" class="mono-label text-[11px] text-gray-500 hover:text-black no-underline">Revenue</a>
		<a href="#wall" class="mono-label text-[11px] text-gray-500 hover:text-black no-underline">The wall</a>
		<a href="#companies" class="mono-label text-[11px] text-gray-500 hover:text-black no-underline">Companies</a>
	</nav>
	<a href="/dashboard" class="bg-[#171717] text-white px-6 py-2.5 rounded-full font-sans text-sm font-medium hover:bg-[#4338ca] transition-colors no-underline">Dashboard →</a>
</header>

<main class="bg-[#fcfbf9] min-h-screen pt-28 pb-24">
	<article class="max-w-3xl mx-auto px-6">
		<!-- Masthead -->
		<p class="mono-label text-[11px] text-[#4338ca] mb-5">Aslan Research · Paper 01</p>
		<h1 class="serif-italic text-gray-900 leading-[1.05] tracking-[-0.02em] mb-6" style="font-size: clamp(2.2rem, 4vw + 1rem, 3.6rem); text-wrap: balance;">
			The AI build-out, read from the filings
		</h1>
		<p class="font-serif text-xl text-gray-700 leading-relaxed mb-6">
			We read {ind.stamp.filings.toLocaleString()} SEC filings from {ind.stamp.companies} companies that design the chips,
			build the machines, and run the data centers behind AI. Code extracted every number exactly as filed.
			This is what the filings say, not what the press releases say.
		</p>
		<p class="mono-label text-[10px] text-gray-500 mb-10 border-y border-[#e5e5e5] py-3">
			Data as of {ind.as_of} · filings back to {ind.stamp.since} · industry stats cover the {ind.stamp.industry_companies} US-dollar filers
			· ASML, TSMC and SpaceX get <a href="#companies" class="underline text-gray-500">their own pages</a> but sit outside the averages
		</p>

		{#if prose.intro}<p class="font-serif text-lg text-gray-800 leading-relaxed mb-10">{prose.intro}</p>{/if}

		<StatTiles {tiles} />

		<!-- 2. Debt -->
		<section id="debt" class="mt-20">
			<SectionRule marker="§1" label="Promised money" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">They report {fmtMoney(h.reported_debt)} of debt. They have promised {fmtMoney(h.committed)}.</h2>
			<p class="font-serif text-lg text-gray-700 leading-relaxed mb-8">
				"Reported debt" is what sits on the balance sheet as borrowings. But filings also commit money through
				leases and signed purchase deals. Add those and the promised total is
				{fmtPct(h.committed / h.reported_debt - 1)} larger than the debt line alone.
				{#if prose.debt}{prose.debt}{/if}
			</p>
			<p class="mono-label text-[10px] text-gray-500 mb-3">Largest {TOP_N} by total promised, latest quarter ({debtRest} smaller companies not shown)</p>
			<Dumbbell items={dumbbell} aLabel="reported debt" bLabel="all promised money" />
			<p class="mono-label text-[10px] text-gray-500 mt-10 mb-3">Industry total over time</p>
			<LineChart labels={debtSeries.labels} series={debtSeries.series} yFmt={(v) => fmtMoney(v)} ariaLabel="Industry totals over time: all promised money vs reported debt" />
		</section>

		<!-- 3. Revenue reality -->
		<section id="revenue" class="mt-20">
			<SectionRule marker="§2" label="Realized vs unrealized" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">Money earned, money collected early, money merely signed</h2>
			<p class="font-serif text-lg text-gray-700 leading-relaxed mb-8">
				Deferred revenue is cash collected for work not yet delivered — it is not earned yet.
				Signed backlog is orders promised but not yet delivered or paid; it overlaps deferred, so we never add the two.
				Backlog now stands at {fmtMoney(h.rpo)} against {fmtMoney(h.ttm_revenue)} of trailing-year revenue.
				{#if prose.revenue_reality}{prose.revenue_reality}{/if}
			</p>
			<LineChart labels={rrSeries.labels} series={rrSeries.series} yFmt={(v) => fmtMoney(v)} height={260} ariaLabel="Trailing-year revenue, signed backlog, and deferred revenue over time" />
			<p class="mono-label text-[10px] text-gray-500 mt-10 mb-3">Deferred revenue as a share of yearly revenue — the median company</p>
			<LineChart labels={ratioSeries.labels} series={ratioSeries.series} yFmt={(v) => fmtPct(v)} height={160} ariaLabel="Median company deferred revenue as a share of yearly revenue" />
		</section>

		<!-- 4. Components -->
		<section id="components" class="mt-20">
			<SectionRule marker="§3" label="Where the money goes" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">What they spend on, what they earn from</h2>
			{#if latestComp}
				<p class="font-serif text-lg text-gray-700 leading-relaxed mb-8">
					Four lines carry almost all reported spending: making the product, inventing the next one (R&D),
					selling and running the company, and tax. Stock-based pay — {fmtMoney(latestComp.sbc)} in {latestComp.year} —
					hides inside those lines, so we show it beside them, never as a fifth slice.
					{#if prose.components}{prose.components}{/if}
				</p>
			{/if}
			<p class="mono-label text-[10px] text-gray-500 mb-3">Share of reported operating spend, by year</p>
			<ShareBars rows={compRows} fmt={(v) => fmtMoney(v)} />
			<p class="mono-label text-[10px] text-gray-500 mt-10 mb-3">The cash story the expense lines miss: building vs inventing</p>
			<LineChart labels={capexSeries.labels} series={capexSeries.series} yFmt={(v) => fmtMoney(v)} height={200} ariaLabel="Capital spending vs research spending vs stock pay by year" />
			<p class="mono-label text-[9px] text-gray-500 mt-2">Not every company tags every line; each sum covers only the companies that tag it (always more than half the industry).</p>
			<p class="mono-label text-[10px] text-gray-500 mt-10 mb-3">Trailing-year revenue by group</p>
			<BarList items={catItems} fmt={(v) => fmtMoney(v)} />
			<p class="font-serif text-base text-gray-600 leading-relaxed mt-6">
				One honest gap: filings publish per-segment revenue in a tagged data layer this pipeline does not parse
				yet, so this paper groups revenue by what each company builds, not by each company's own segment names.
			</p>
		</section>

		<!-- 5. The wall -->
		<section id="wall" class="mt-20">
			<SectionRule marker="§4" label="The wall ahead" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">{fmtMoney(h.wall_next5)} comes due in five years</h2>
			<p class="font-serif text-lg text-gray-700 leading-relaxed mb-8">
				Every dated obligation in the filings, stacked by when it falls due. Dark blue money has a filed payment
				schedule. Light blue money has a due date but no schedule, so its timing is a labeled straight-line estimate.
				Gray money is promised for "after year five" with no date at all — we refuse to invent one.
				{#if prose.wall}{prose.wall}{/if}
			</p>
			<StackedColumns cols={wallCols} fmt={(v) => fmtMoney(v)} height={240} />
			<p class="mono-label text-[10px] text-gray-500 mt-10 mb-3">Against it: revenue already promised to them (backlog with dates)</p>
			<StackedColumns cols={futRevCols} fmt={(v) => fmtMoney(v)} height={180} />
			<p class="font-serif text-base text-gray-600 leading-relaxed mt-6">
				The contrast is the finding: companies schedule spending decades out, but dated revenue promises barely
				reach past five years. Filings also show {fmtMoney(ind.wall.financing)} of financing flowing back — money
				lent out that should return. We keep it out of the wall; a promise to receive is not a promise to pay.
			</p>
		</section>

		<!-- 6. Growth -->
		<section id="growth" class="mt-20">
			<SectionRule marker="§5" label="The growth race" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">Promises are growing faster than revenue</h2>
			<p class="font-serif text-lg text-gray-700 leading-relaxed mb-8">
				Each line starts at 100 in {ind.growth.cagr.window?.[0]} so the slopes compare fairly.
				{#if prose.growth}{prose.growth}{/if}
			</p>
			<LineChart labels={idxSeries.labels} series={idxSeries.series} yFmt={(v) => v.toFixed(0)} yBase="auto" height={260} ariaLabel="Growth of promised money, revenue, deferred revenue, and reported debt, indexed to 100" />
			<div class="mt-8"><StatTiles tiles={cagrTiles} /></div>
		</section>

		<!-- 7. Declared vs actual -->
		<section id="declared" class="mt-20">
			<SectionRule marker="§6" label="Filed vs reconciled" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">How often the filed numbers moved</h2>
			<p class="font-serif text-lg text-gray-700 leading-relaxed mb-8">
				Our reconciler re-states each quarter using only evidence cited from the company's own filings: revenue that
				is really conditional moves out, spending that is really committed moves over. It changed
				{ind.declared_vs_actual.adjusted_quarters.n} of {ind.declared_vs_actual.adjusted_quarters.of} company-quarters.
				{#if prose.declared}{prose.declared}{/if}
			</p>
			<p class="mono-label text-[10px] text-gray-500 mb-3">Industry expenses: as filed vs after cited reconciliation, by year</p>
			<StackedColumns cols={dvaCols} fmt={(v) => fmtMoney(v)} height={220} />
		</section>

		<!-- 8. Flags -->
		<section id="flags" class="mt-20">
			<SectionRule marker="§7" label="What the fine print raised" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">{h.flags_total} flags across {ind.stamp.companies} companies</h2>
			<p class="font-serif text-lg text-gray-700 leading-relaxed mb-8">
				A flag is a pattern worth a second look, not an accusation: a claim that appears once and vanishes, a metric
				that quietly changes definition, financing that circles back as revenue. Every flag cites the exact filing text.
			</p>
			<BarList items={flagItems} />
			{#if notable.length}
				<div class="mt-8 flex flex-col gap-3">
					{#each notable as f (f.ticker + f.type + f.summary)}
						<div class="bg-white border border-[#e5e5e5] rounded-2xl px-5 py-4">
							<p class="mono-label text-[9px] text-gray-500 mb-1"><a href="/research/{f.ticker}" class="text-[#4338ca] no-underline">{f.ticker}</a> · {f.type.replaceAll('_', ' ')}</p>
							<p class="font-serif text-base text-gray-800 leading-relaxed">{f.summary}</p>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- 9. Method -->
		<section id="method" class="mt-20">
			<SectionRule marker="§8" label="Method & limits" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-5" style="text-wrap: balance;">How this was made</h2>
			<p class="font-serif text-lg text-gray-700 leading-relaxed">
				{#if prose.method}{prose.method}{:else}
					Code owns every number: exact figures come from SEC's machine-readable XBRL data, and all sums, growth
					rates, and date math are computed, never estimated by a model. AI reads the narrative text — commitments
					buried in notes, related-party deals, guarantees — and every claim it catalogs cites its source filing.
				{/if}
			</p>
			<p class="font-serif text-base text-gray-600 leading-relaxed mt-4">
				Limits worth knowing: industry stats cover the {ind.stamp.industry_companies} US-dollar filers only; ASML (euros),
				TSMC (Taiwan dollars) and Nebius's earlier ruble filings stay out of the averages. Money moved through third
				parties without disclosure is invisible to filings, so the ratio flags are the proxy. Dollar charts sum the
				industry; ratio charts use the median company so no giant can hide the typical story.
			</p>
		</section>

		<!-- Company index -->
		<section id="companies" class="mt-20">
			<SectionRule marker="Appendix" label="Company pages" />
			<h2 class="serif-italic text-3xl text-gray-900 mb-6">The same questions, one company at a time</h2>
			{#each byCategory as g (g.cat)}
				<p class="mono-label text-[10px] text-gray-500 mt-6 mb-2">{g.cat}</p>
				<div class="flex flex-wrap gap-2">
					{#each g.members as c (c.ticker)}
						<a href="/research/{c.ticker}" class="bg-white border border-[#e5e5e5] hover:border-[#4338ca] rounded-full px-4 py-2 no-underline transition-colors">
							<span class="font-mono text-xs text-gray-900">{c.ticker}</span>
							<span class="font-serif text-sm text-gray-500 ml-1.5">{c.name.split(' ').slice(0, 2).join(' ')}</span>
							{#if !c.in_industry}<span class="mono-label text-[9px] text-gray-500 ml-1">{c.currency !== 'USD' ? c.currency : 'thin data'}</span>{/if}
						</a>
					{/each}
				</div>
			{/each}
		</section>
	</article>
</main>
