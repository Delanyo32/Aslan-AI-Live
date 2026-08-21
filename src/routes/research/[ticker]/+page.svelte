<script lang="ts">
	import LineChart from '$lib/components/research/LineChart.svelte'
	import ShareBars from '$lib/components/research/ShareBars.svelte'
	import StackedColumns from '$lib/components/research/StackedColumns.svelte'
	import SectionRule from '$lib/components/research/SectionRule.svelte'
	import StatTiles from '$lib/components/research/StatTiles.svelte'
	import { BLUE_DARK, BLUE_LIGHT, SERIES, fmtMoney, fmtPct } from '$lib/components/research/viz'

	let { data } = $props()
	// biome-ignore lint/suspicious/noExplicitAny: baked JSON, shape owned by the bake script
	const c = data.company as any
	const cur = c.currency
	const prose: Record<string, string> = c.prose ?? {}
	const m = (v: number | null) => fmtMoney(v, cur)

	const tiles = [
		{ label: 'Revenue, last 12 mo', value: m(c.latest.ttm_revenue), sub: `to ${c.latest.period_end}` },
		{ label: 'Spend, last 12 mo', value: m(c.latest.ttm_expenses), sub: 'cost + R&D + admin + tax' },
		{ label: 'Debt they report', value: m(c.latest.reported_debt), sub: 'balance-sheet borrowings' },
		{ label: 'Money promised', value: m(c.latest.committed), sub: 'debt + leases + purchases' },
		{ label: 'Unrealized revenue', value: m(c.latest.deferred), sub: `+ ${m(c.latest.rpo)} signed backlog` },
		{ label: 'Due in next 5 years', value: m(c.wall.obligations[0].disclosed + c.wall.obligations[0].estimated), sub: 'the obligation wall' }
	]

	const labels = c.series.map((p: { q: string }) => p.q)
	const revSeries = [
		{ label: 'revenue (qtr)', color: SERIES[0], values: c.series.map((p: { revenue: number | null }) => p.revenue) },
		{ label: 'deferred', color: SERIES[1], values: c.series.map((p: { deferred: number | null }) => p.deferred) },
		{ label: 'signed backlog', color: SERIES[2], dashed: true, values: c.series.map((p: { rpo: number | null }) => p.rpo) }
	]
	const debtSeries = [
		{ label: 'promised', color: BLUE_DARK, values: c.series.map((p: { committed: number | null }) => p.committed) },
		{ label: 'reported debt', color: BLUE_LIGHT, values: c.series.map((p: { reported_debt: number | null }) => p.reported_debt) }
	]
	const split = c.latest.committed_split
	const splitRow = [{
		label: 'today',
		parts: [
			{ label: 'debt', value: split.debt, color: BLUE_DARK },
			{ label: 'leases', value: split.lease, color: SERIES[0] },
			{ label: 'purchase deals', value: split.purchase, color: BLUE_LIGHT }
		]
	}]

	const COMP = [
		{ key: 'cost_of_revenue', label: 'Cost of revenue', color: SERIES[0] },
		{ key: 'rnd', label: 'R&D', color: SERIES[1] },
		{ key: 'sga', label: 'Selling & admin', color: SERIES[2] },
		{ key: 'tax', label: 'Tax', color: SERIES[3] }
	] as const
	const compRows = c.expense_components
		.filter((r: Record<string, number | null>) => COMP.some((k) => r[k.key]))
		.map((r: Record<string, number | null>) => ({
			label: String(r.year),
			parts: COMP.map((k) => ({ label: k.label, value: r[k.key] ?? 0, color: k.color }))
		}))

	const BAND_LABELS = ['next 5 years', 'years 5–10', 'beyond 10']
	const wallCols = [
		...c.wall.obligations.map((b: { disclosed: number; estimated: number }, i: number) => ({
			label: BAND_LABELS[i],
			parts: [
				{ label: 'dated by filings', value: b.disclosed, color: BLUE_DARK },
				{ label: 'timing estimated', value: b.estimated, color: BLUE_LIGHT }
			]
		})),
		{ label: 'after yr 5, undated', parts: [{ label: 'no date given', value: c.wall.undated_after5, color: '#c3c2b7' }] },
		...(c.wall.future_revenue.some((v: number) => v > 0)
			? [{ label: 'revenue promised to them', parts: [{ label: 'dated backlog (all bands)', value: c.wall.future_revenue.reduce((a: number, b: number) => a + b, 0), color: SERIES[2] }] }]
			: [])
	]

	const growthTiles = [
		{ label: 'Revenue growth /yr', value: fmtPct(c.growth.revenue_cagr), sub: c.growth.window ? `${c.growth.window[0]} → ${c.growth.window[1]}` : undefined },
		{ label: 'Expense growth /yr', value: fmtPct(c.growth.expenses_cagr) },
		{ label: 'Promised money /yr', value: fmtPct(c.growth.committed_cagr) },
		{ label: 'Reported debt /yr', value: fmtPct(c.growth.reported_debt_cagr) },
		{ label: 'Deferred revenue /yr', value: fmtPct(c.growth.deferred_cagr) },
		{ label: 'Quarters re-stated', value: `${c.adjusted_quarters.n} of ${c.adjusted_quarters.of}`, sub: 'by cited reconciliation' }
	]

	const dvaCols = c.declared_vs_actual.flatMap((r: { year: number; draft_expenses: number; adjusted_expenses: number }) => [
		{ label: 'filed', sub: String(r.year), parts: [{ label: 'expenses as filed', value: r.draft_expenses, color: BLUE_LIGHT }] },
		{ label: 'reality', sub: String(r.year), parts: [{ label: 'after reconciliation', value: r.adjusted_expenses, color: BLUE_DARK }] }
	])

	const flagGroups = [...new Set(c.flags.map((f: { type: string }) => f.type))].map((t) => ({
		type: t as string,
		flags: c.flags.filter((f: { type: string }) => f.type === t)
	}))
</script>

<svelte:head>
	<title>{c.name} ({c.ticker}) — Aslan Research</title>
	<meta name="description" content="{c.name}'s SEC filings, rebuilt: real debt vs reported, realized vs unrealized revenue, and the obligations ahead." />
</svelte:head>

<header class="fixed top-0 left-0 w-full z-50 h-20 bg-[#fcfbf9] border-b border-[#e5e5e5] px-6 lg:px-12 flex items-center justify-between">
	<a href="/" class="serif-italic text-xl md:text-2xl text-gray-900 no-underline tracking-tight whitespace-nowrap">Aslan Terminal</a>
	<a href="/research" class="mono-label text-[11px] text-gray-500 hover:text-black no-underline">← The industry paper</a>
</header>

<main class="bg-[#fcfbf9] min-h-screen pt-28 pb-24">
	<article class="max-w-3xl mx-auto px-6">
		<p class="mono-label text-[11px] text-[#4338ca] mb-5">Aslan Research · {c.category}</p>
		<h1 class="serif-italic text-gray-900 leading-[1.05] tracking-[-0.02em] mb-4" style="font-size: clamp(2rem, 3vw + 1rem, 3rem); text-wrap: balance;">
			{c.name} <span class="text-gray-500">({c.ticker})</span>
		</h1>
		<p class="mono-label text-[10px] text-gray-500 mb-8 border-y border-[#e5e5e5] py-3">
			Data as of {c.as_of} · {c.quarters} quarters · filed in {cur}
			{#if !c.in_industry}· outside the industry averages{/if}
			{#if c.thin}· thin history — read trends with care{/if}
			{#if c.dropped_currencies.length}· {c.dropped_currencies.join('/')}-era filings not charted{/if}
		</p>

		{#if prose.overview}<p class="font-serif text-lg text-gray-800 leading-relaxed mb-10">{prose.overview}</p>{/if}

		<StatTiles {tiles} />

		<section class="mt-16">
			<SectionRule marker="§1" label="Revenue reality" />
			<h2 class="serif-italic text-2xl text-gray-900 mb-5" style="text-wrap: balance;">Earned, collected early, and merely signed</h2>
			<LineChart {labels} series={revSeries} yFmt={(v) => m(v)} height={240} ariaLabel="Quarterly revenue, deferred revenue, and signed backlog over time" />
		</section>

		<section class="mt-16">
			<SectionRule marker="§2" label="Promised money" />
			<h2 class="serif-italic text-2xl text-gray-900 mb-5" style="text-wrap: balance;">Reports {m(c.latest.reported_debt)} of debt; has promised {m(c.latest.committed)}</h2>
			{#if prose.debt}<p class="font-serif text-lg text-gray-700 leading-relaxed mb-6">{prose.debt}</p>{/if}
			<LineChart {labels} series={debtSeries} yFmt={(v) => m(v)} height={220} ariaLabel="All promised money vs reported debt over time" />
			{#if split.debt + split.lease + split.purchase > 0}
				<p class="mono-label text-[10px] text-gray-500 mt-8 mb-3">What the promised total is made of, latest quarter</p>
				<ShareBars rows={splitRow} fmt={(v) => m(v)} />
			{/if}
		</section>

		{#if compRows.length}
			<section class="mt-16">
				<SectionRule marker="§3" label="Where the money goes" />
				<h2 class="serif-italic text-2xl text-gray-900 mb-5" style="text-wrap: balance;">Spending, by reported line</h2>
				<ShareBars rows={compRows} fmt={(v) => m(v)} />
			</section>
		{/if}

		<section class="mt-16">
			<SectionRule marker="§4" label="The wall ahead" />
			<h2 class="serif-italic text-2xl text-gray-900 mb-5" style="text-wrap: balance;">When the promises come due</h2>
			{#if prose.wall}<p class="font-serif text-lg text-gray-700 leading-relaxed mb-6">{prose.wall}</p>{/if}
			<StackedColumns cols={wallCols} fmt={(v) => m(v)} height={230} />
		</section>

		<section class="mt-16">
			<SectionRule marker="§5" label="Growth" />
			<h2 class="serif-italic text-2xl text-gray-900 mb-5" style="text-wrap: balance;">The rates that matter</h2>
			<StatTiles tiles={growthTiles} />
		</section>

		{#if dvaCols.length}
			<section class="mt-16">
				<SectionRule marker="§6" label="Filed vs reconciled" />
				<h2 class="serif-italic text-2xl text-gray-900 mb-5" style="text-wrap: balance;">Expenses as filed vs after cited reconciliation</h2>
				<StackedColumns cols={dvaCols} fmt={(v) => m(v)} height={210} />
			</section>
		{/if}

		{#if c.flags.length}
			<section class="mt-16">
				<SectionRule marker="§7" label="Flags" />
				<h2 class="serif-italic text-2xl text-gray-900 mb-5" style="text-wrap: balance;">{c.flags.length} patterns worth a second look</h2>
				{#if prose.flags_note}<p class="font-serif text-lg text-gray-700 leading-relaxed mb-6">{prose.flags_note}</p>{/if}
				<div class="flex flex-col gap-3">
					{#each flagGroups as g (g.type)}
						<div class="bg-white border border-[#e5e5e5] rounded-2xl px-5 py-4">
							<p class="mono-label text-[9px] text-gray-500 mb-2">{g.type.replaceAll('_', ' ')} · {g.flags.length}</p>
							{#each g.flags.slice(0, 3) as f, i (i)}
								<p class="font-serif text-base text-gray-800 leading-relaxed {i > 0 ? 'mt-2 pt-2 border-t border-[#f0efec]' : ''}">{f.summary}</p>
							{/each}
							{#if g.flags.length > 3}<p class="mono-label text-[9px] text-gray-500 mt-2">+ {g.flags.length - 3} more</p>{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<p class="mt-16 pt-6 border-t border-[#e5e5e5]">
			<a href="/research" class="mono-label text-[11px] text-[#4338ca] no-underline">← Back to the industry paper</a>
		</p>
	</article>
</main>
