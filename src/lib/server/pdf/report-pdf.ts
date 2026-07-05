// Renders a completed terminal report to a branded PDF, section-for-section
// with the web report (src/lib/components/terminal/*). Pure data in → bytes out,
// so private reports need no auth-over-network (unlike browser rendering).
import { PDFDocument } from "pdf-lib"
import type { TerminalReportWithCompany } from "$lib/server/db/terminal-reports"
import type { Citation, DimensionGrade, ReconciliationVerdict } from "$lib/types/terminal"
import { DIMENSION_NAMES, CONFIDENCE_LABEL, TREND, citationDomain } from "$lib/components/terminal/grade"
import { embedFonts, type AssetLoader } from "./fonts"
import { Layout, C, MARGIN, CONTENT_W, gradeCol } from "./layout"

type Ledger = { ftr: number | null; onTime: number; late: number; unaccounted: number; total: number } | null

const fmtDate = (d: string | Date) =>
	new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })
const fmtLong = (d: string | Date) =>
	new Date(d).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" })
const pct = (n: number) => (n * 100).toFixed(1) + "%"
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }))

const DOT = "   ·   "

export async function buildReportPdf(
	report: TerminalReportWithCompany,
	opts: { isOwner: boolean; ledger?: Ledger; load: AssetLoader; generatedAt?: Date }
): Promise<Uint8Array> {
	const doc = await PDFDocument.create()
	const fonts = await embedFonts(doc, opts.load)
	doc.setTitle(`${report.company.name} — Value Reality Report`)
	doc.setAuthor("Aslan Terminal")
	doc.setCreator("Aslan Terminal")

	const L = new Layout(doc, fonts)

	brandHeader(L)
	headerSection(L, report)
	verdictSection(L, report.verdict)
	frameworksSection(L, report.dimensions ?? [], opts.isOwner)
	ledgerSection(L, report.created_at, opts.ledger ?? null)
	bearBullSection(L, report.bear_bull)
	narrativeSection(L, report.narrative)
	citationsSection(L, report.dimensions ?? [], report.citations ?? [])
	footer(L, opts.generatedAt ?? new Date())

	return doc.save()
}

// ── sections ─────────────────────────────────────────────────────────────────

function sectionGap(L: Layout) {
	L.gap(22)
}

function brandHeader(L: Layout) {
	const top = L.y
	L.line("Aslan Terminal", MARGIN.left, top - 13, L.f.display, 16, C.ink)
	L.right("EQUITY INTELLIGENCE", MARGIN.left + CONTENT_W, top - 12, L.f.mono, 7, C.faint)
	L.y = top - 20
	L.hairline(C.ink)
	L.gap(22)
}

function headerSection(L: Layout, report: TerminalReportWithCompany) {
	L.label("Value Reality Report", C.indigo)
	const badge = report.company.is_us ? "US LISTING" : "RESEARCH ONLY"
	L.textLine(`${badge}${DOT}${fmtDate(report.created_at)}${DOT}RUBRIC ${report.rubric_version}`, {
		font: L.f.mono,
		size: 7.5,
		color: C.faint,
		tracking: 0.5,
		gapAfter: 6
	})
	L.para(report.company.name, { font: L.f.display, size: 30, color: C.ink, lineHeight: 34, gapAfter: 2 })
	L.textLine(report.company.ticker, { font: L.f.mono, size: 12, color: C.gray, gapAfter: 14 })

	const cmp = report.composite
	if (cmp) {
		const col = gradeCol(cmp.grade)
		const boxW = 64,
			boxH = 64
		L.ensure(boxH + 8)
		const top = L.y
		L.page.drawRectangle({
			x: MARGIN.left,
			y: top - boxH,
			width: boxW,
			height: boxH,
			color: col.bg,
			borderColor: col.border,
			borderWidth: 1.5
		})
		const gs = 34
		const gw = L.f.serif.widthOfTextAtSize(cmp.grade, gs)
		L.line(cmp.grade, MARGIN.left + (boxW - gw) / 2, top - boxH + (boxH - gs) / 2 + 8, L.f.serif, gs, col.text)

		const rx = MARGIN.left + boxW + 22
		const score = String(cmp.score)
		L.line(score, rx, top - 30, L.f.mono, 30, C.ink)
		const sw = L.f.mono.widthOfTextAtSize(score, 30)
		L.line("/100", rx + sw + 4, top - 30, L.f.mono, 13, C.muted)
		L.line("VALUE REALITY SCORE", rx, top - 44, L.f.mono, 7, C.faint, 1.6)
		L.line(CONFIDENCE_LABEL[cmp.confidence].toUpperCase(), rx, top - 58, L.f.mono, 7, C.gray, 1.4)
		L.y = top - boxH
		L.gap(18)

		if (cmp.red_banner) {
			noticeBox(
				L,
				"Confirmed red-flag findings cap this score — see F9. One or more confirmed screen hits in Value Creation (F9) limit the composite grade regardless of the other dimensions."
			)
		}
	}
}

function verdictSection(L: Layout, v: ReconciliationVerdict | null) {
	sectionGap(L)
	L.label("Price Reconciliation", C.muted)
	if (!v) {
		L.para(
			"Price verdict is available for US listings only. This company is researched on all nine health frameworks, but the valuation reconciliation runs only where market prices are available — no price is scraped or estimated for non-US listings.",
			{ font: L.f.serifItalic, size: 12, color: C.gray, gapAfter: 2 }
		)
		return
	}
	const HEAD: Record<ReconciliationVerdict["bucket"], string> = {
		priced_for_more: "Priced for more than the evidence supports",
		roughly_priced: "Roughly priced to the evidence",
		priced_for_less: "Priced for less than the evidence supports"
	}
	L.para(HEAD[v.bucket], { font: L.f.display, size: 21, color: C.ink, lineHeight: 25, gapAfter: 6 })
	const tags = [v.beta ? "BETA" : null, v.confidence === "low" ? "LOW CONFIDENCE" : null].filter(Boolean)
	if (tags.length) L.textLine(tags.join(DOT), { font: L.f.mono, size: 7, color: C.faint, tracking: 1, gapAfter: 6 })
	L.para(v.sentence, { font: L.f.serif, size: 12.5, color: C.gray, gapAfter: 16 })

	L.label("Implied by today's price", C.muted)
	if (v.implied) {
		kvRow(L, "10y revenue growth", pct(v.implied.revenue_growth_10y))
		kvRow(L, "FCF margin scenario", pct(v.implied.fcf_margin_scenario))
		kvRow(L, "Discount rate", pct(v.implied.discount_rate))
	} else {
		L.para("Reverse-DCF did not resolve — implied assumptions unavailable (—).", {
			font: L.f.serifItalic,
			size: 11,
			color: C.muted
		})
	}
	L.gap(12)

	L.label("Multiples vs peer set", C.muted)
	if (v.multiples?.length) {
		tableRow(L, ["Metric", "Company", "Peer median"], true)
		for (const m of v.multiples) tableRow(L, [m.name, num(m.value), num(m.peer_median)], false)
	} else {
		L.para("No peer multiples cached yet (—).", { font: L.f.serifItalic, size: 11, color: C.muted })
	}
}

function frameworksSection(L: Layout, dims: DimensionGrade[], isOwner: boolean) {
	sectionGap(L)
	L.label("Nine Health Frameworks", C.indigo)
	if (!dims.length) {
		L.para("No dimension grades recorded.", { font: L.f.serifItalic, size: 12, color: C.muted })
		return
	}
	dims.forEach((d, i) => {
		L.ensure(72)
		if (i > 0) {
			L.gap(4)
			L.hairline(C.border)
			L.gap(16)
		}
		const top = L.y
		const bw = 34,
			bh = 34,
			col = gradeCol(d.grade)
		L.page.drawRectangle({
			x: MARGIN.left + CONTENT_W - bw,
			y: top - bh,
			width: bw,
			height: bh,
			color: col.bg,
			borderColor: col.border,
			borderWidth: 1.25
		})
		const gs = 18
		const gw = L.f.serif.widthOfTextAtSize(d.grade, gs)
		L.line(d.grade, MARGIN.left + CONTENT_W - bw + (bw - gw) / 2, top - bh + (bh - gs) / 2 + 4, L.f.serif, gs, col.text)

		L.textLine(d.dimension, { font: L.f.mono, size: 7.5, color: C.faint, tracking: 2, gapAfter: 2 })
		L.para(DIMENSION_NAMES[d.dimension] ?? d.dimension, {
			font: L.f.serif,
			size: 13,
			color: C.ink,
			lineHeight: 16,
			maxW: CONTENT_W - bw - 16,
			gapAfter: 6
		})
		const trend = TREND[d.trend]
		L.textLine(`${d.score}/100${DOT}${trend.label}${DOT}${CONFIDENCE_LABEL[d.confidence]}`, {
			font: L.f.mono,
			size: 8,
			color: C.gray,
			tracking: 0.3,
			gapAfter: 6
		})
		L.para(d.summary, { font: L.f.serif, size: 11.5, color: C.gray, gapAfter: 6 })
		for (const flag of d.flags ?? []) flagBlock(L, flag, isOwner)
		for (const c of (d.top_citations ?? []).slice(0, 3)) citeLine(L, c)
	})
}

function ledgerSection(L: Layout, startedAt: string | Date, stats: Ledger) {
	sectionGap(L)
	L.label("Announcement Ledger · Follow-Through", C.muted)
	const ftrPct = stats && stats.ftr != null ? Math.round(stats.ftr * 100) : null
	if (stats && ftrPct != null) {
		L.textLine(`${ftrPct}%`, { font: L.f.mono, size: 32, color: C.ink, lineHeight: 36, gapAfter: 2 })
		L.textLine("DELIVERED ON TIME", { font: L.f.mono, size: 7, color: C.faint, tracking: 1.6, gapAfter: 10 })
		L.textLine(`${stats.onTime} on time${DOT}${stats.late} late${DOT}${stats.unaccounted} unaccounted`, {
			font: L.f.mono,
			size: 9.5,
			color: C.gray,
			gapAfter: 10
		})
		L.para(
			`Announced ${stats.total} dated commitment${stats.total !== 1 ? "s" : ""} since tracking started ${fmtLong(startedAt)}.`,
			{ font: L.f.serif, size: 11, color: C.gray }
		)
	} else {
		L.para(
			`Tracking started ${fmtLong(startedAt)} — ${stats?.total ?? 0} commitment${(stats?.total ?? 0) !== 1 ? "s" : ""} logged. The ledger records dated commitments management makes from this point forward and checks whether each is delivered on time. It is forward-only — no historical backfill.`,
			{ font: L.f.serif, size: 12, color: C.gray }
		)
	}
}

function bearBullSection(L: Layout, bb: { bear: string; bull: string } | null) {
	if (!bb) return
	sectionGap(L)
	L.label("Bear case from the evidence", gradeCol("F").text)
	L.para(bb.bear, { font: L.f.serif, size: 12, color: C.gray, gapAfter: 14 })
	L.label("Bull case from the evidence", gradeCol("A").text)
	L.para(bb.bull, { font: L.f.serif, size: 12, color: C.gray })
}

function narrativeSection(L: Layout, narrative: string | null) {
	if (!narrative?.trim()) return
	sectionGap(L)
	L.label("Research Narrative", C.muted)
	const paras = narrative.split("\n\n").filter((p) => p.trim())
	paras.forEach((p, i) => {
		if (i === 0) L.para(p, { font: L.f.serifItalic, size: 15, color: C.ink, lineHeight: 22, gapAfter: 10 })
		else L.para(p, { font: L.f.serif, size: 11.5, color: C.gray, gapAfter: 8 })
	})
}

function citationsSection(L: Layout, dims: DimensionGrade[], citations: Citation[]) {
	const groups = citationGroups(dims, citations)
	if (!groups.length) return
	L.addPage()
	L.label("Appendix — Evidence", C.indigo)
	L.para("Citations", { font: L.f.display, size: 30, color: C.ink, lineHeight: 34, gapAfter: 4 })
	L.hairline(C.border)
	L.gap(18)
	for (const g of groups) {
		L.label(g.label, C.indigo)
		for (const c of g.items) {
			L.ensure(15)
			L.y -= 13
			const nStr = String(c.n).padStart(2, " ")
			L.line(nStr, MARGIN.left, L.y, L.f.mono, 8, C.faint)
			const x = MARGIN.left + 22
			const title = c.title ?? c.url
			L.line(ellipsize(L, title, L.f.sans, 9.5, CONTENT_W - 22), x, L.y, L.f.sans, 9.5, C.gray)
			L.gap(2)
			L.textLine(`${citationDomain(c.url)}${c.published_at ? DOT + c.published_at : ""}`, {
				font: L.f.mono,
				size: 7.5,
				color: C.indigo,
				x,
				gapAfter: 6
			})
		}
		L.gap(6)
	}
}

// Mirror CitationAppendix.svelte: dimension groups first (their top citations),
// then a pooled "Additional sources" group, numbered continuously, deduped by url.
function citationGroups(dims: DimensionGrade[], citations: Citation[]) {
	const seen = new Set<string>()
	let n = 0
	const out: { label: string; items: (Citation & { n: number })[] }[] = []
	const take = (list: Citation[]) => {
		const items: (Citation & { n: number })[] = []
		for (const c of list ?? []) {
			if (seen.has(c.url)) continue
			seen.add(c.url)
			items.push({ ...c, n: ++n })
		}
		return items
	}
	for (const d of dims) {
		const items = take(d.top_citations ?? [])
		if (items.length) out.push({ label: `${d.dimension} — ${DIMENSION_NAMES[d.dimension] ?? ""}`, items })
	}
	const extra = take(citations)
	if (extra.length) out.push({ label: "Additional sources", items: extra })
	return out
}

// ── primitives ───────────────────────────────────────────────────────────────

function kvRow(L: Layout, k: string, v: string) {
	L.ensure(20)
	L.y -= 16
	L.line(k, MARGIN.left, L.y, L.f.mono, 9.5, C.gray)
	L.right(v, MARGIN.left + CONTENT_W, L.y, L.f.mono, 9.5, C.ink)
	L.gap(5)
	L.hairline(C.hair)
}

function tableRow(L: Layout, cells: [string, string, string], head: boolean) {
	L.ensure(20)
	L.y -= 16
	const size = head ? 7.5 : 9.5
	const c0 = head ? C.faint : C.gray
	const cN = head ? C.faint : C.ink
	L.line(head ? cells[0].toUpperCase() : cells[0], MARGIN.left, L.y, L.f.mono, size, c0, head ? 0.5 : 0)
	L.right(head ? cells[1].toUpperCase() : cells[1], MARGIN.left + CONTENT_W * 0.8, L.y, L.f.mono, size, cN)
	L.right(head ? cells[2].toUpperCase() : cells[2], MARGIN.left + CONTENT_W, L.y, L.f.mono, size, c0)
	L.gap(5)
	L.hairline(C.hair)
}

function flagBlock(L: Layout, flag: { status: string; action: string; summary: string; detail?: string }, isOwner: boolean) {
	const rc = gradeCol("F")
	const innerX = MARGIN.left + 12
	const innerW = CONTENT_W - 24
	const body = L.wrap(flag.summary, L.f.sans, 9.5, innerW)
	const detail = isOwner && flag.detail ? L.wrap(flag.detail, L.f.sans, 9.5, innerW) : []
	const h = 8 + 11 + 4 + body.length * 12 + (detail.length ? 6 + detail.length * 12 : 0) + 8
	L.ensure(h + 6)
	const top = L.y
	L.page.drawRectangle({ x: MARGIN.left, y: top - h, width: CONTENT_W, height: h, color: rc.bg })
	L.page.drawRectangle({ x: MARGIN.left, y: top - h, width: 3, height: h, color: rc.text })
	let ly = top - 8 - 8
	L.line(`FLAG · ${flag.status}    ${flag.action}`.toUpperCase(), innerX, ly, L.f.mono, 7, rc.text, 0.8)
	ly -= 15
	for (const ln of body) {
		L.line(ln, innerX, ly, L.f.sans, 9.5, rc.text)
		ly -= 12
	}
	if (detail.length) {
		ly -= 6
		for (const ln of detail) {
			L.line(ln, innerX, ly, L.f.sans, 9.5, C.gray)
			ly -= 12
		}
	}
	L.y = top - h
	L.gap(8)
}

function citeLine(L: Layout, c: Citation) {
	L.ensure(13)
	L.y -= 12
	const domain = citationDomain(c.url)
	L.line(domain, MARGIN.left, L.y, L.f.mono, 7.5, C.faint)
	const dw = L.width(domain, L.f.mono, 7.5)
	const x = MARGIN.left + dw + 8
	L.line(ellipsize(L, c.title ?? c.url, L.f.sans, 9, MARGIN.left + CONTENT_W - x), x, L.y, L.f.sans, 9, C.gray)
	L.gap(2)
}

function noticeBox(L: Layout, text: string) {
	const rc = gradeCol("F")
	const pad = 12
	const lines = L.wrap(text, L.f.serif, 11, CONTENT_W - pad * 2)
	const h = pad * 2 + lines.length * 15
	L.ensure(h + 6)
	const top = L.y
	L.page.drawRectangle({
		x: MARGIN.left,
		y: top - h,
		width: CONTENT_W,
		height: h,
		color: rc.bg,
		borderColor: rc.border,
		borderWidth: 1.5
	})
	let ly = top - pad - 11
	for (const ln of lines) {
		L.line(ln, MARGIN.left + pad, ly, L.f.serif, 11, rc.text)
		ly -= 15
	}
	L.y = top - h
	L.gap(18)
}

// Truncate one line to fit maxW, appending "…".
function ellipsize(L: Layout, text: string, font = L.f.sans, size = 9, maxW: number): string {
	if (L.width(text, font, size) <= maxW) return text
	let s = text
	while (s.length > 1 && L.width(s + "…", font, size) > maxW) s = s.slice(0, -1)
	return s + "…"
}

// Draw a footer on every page after layout, once the total page count is known.
function footer(L: Layout, generatedAt: Date) {
	const pages = L.doc.getPages()
	const stamp = `Generated ${fmtDate(generatedAt)}  ·  aslanfinance.app`
	pages.forEach((p, i) => {
		p.drawLine({
			start: { x: MARGIN.left, y: 40 },
			end: { x: MARGIN.left + CONTENT_W, y: 40 },
			thickness: 0.5,
			color: C.border
		})
		p.drawText(stamp, { x: MARGIN.left, y: 28, size: 7, font: L.f.mono, color: C.faint })
		const label = `${i + 1} / ${pages.length}`
		p.drawText(label, {
			x: MARGIN.left + CONTENT_W - L.f.mono.widthOfTextAtSize(label, 7),
			y: 28,
			size: 7,
			font: L.f.mono,
			color: C.faint
		})
	})
}
