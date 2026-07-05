// Minimal flowing-layout engine over pdf-lib. pdf-lib draws primitives only —
// no wrapping, no pagination — so this holds a top-down cursor, wraps text, and
// starts a fresh (cream) page when content runs past the bottom margin.
import { rgb, type PDFDocument, type PDFPage, type PDFFont, type RGB } from "pdf-lib"
import type { Fonts } from "./fonts"

// A4 portrait, points.
export const PAGE = { w: 595.28, h: 841.89 }
export const MARGIN = { top: 64, bottom: 56, left: 56, right: 56 }
export const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right

export function hex(h: string): RGB {
	const n = h.replace("#", "")
	return rgb(parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255)
}

// Brand palette — from src/app.css @theme tokens.
export const C = {
	cream: hex("#fcfbf9"),
	ink: hex("#171717"),
	indigo: hex("#4338ca"),
	border: hex("#e5e5e5"),
	hair: hex("#eeeeee"),
	gray: hex("#525252"),
	muted: hex("#9ca3af"),
	faint: hex("#aaaaaa"),
	white: hex("#ffffff")
}

// Grade badge colors mirror grade.ts GRADE_STYLES (Tailwind -700/-50/-200 shades).
type GradeCol = { text: RGB; bg: RGB; border: RGB }
const GRADE: Record<string, GradeCol> = {
	A: { text: hex("#047857"), bg: hex("#ecfdf5"), border: hex("#a7f3d0") },
	B: { text: hex("#0f766e"), bg: hex("#f0fdfa"), border: hex("#99f6e4") },
	C: { text: hex("#b45309"), bg: hex("#fffbeb"), border: hex("#fde68a") },
	D: { text: hex("#c2410c"), bg: hex("#fff7ed"), border: hex("#fed7aa") },
	F: { text: hex("#b91c1c"), bg: hex("#fef2f2"), border: hex("#fecaca") }
}
export function gradeCol(grade: string): GradeCol {
	const c = grade.charAt(0).toUpperCase()
	return GRADE[c] ?? GRADE.F
}

// Strip codepoints outside what the @fontsource latin-subset woffs embed, so a
// subsetted custom font never throws "cannot encode" on AI-generated prose.
const REPL: Record<string, string> = { "↑": "", "↓": "", "→": "", "＋": "+", "▲": "!", "•": "-" }
export function clean(s: string): string {
	return [...(s ?? "").normalize("NFC")]
		.map((ch) => REPL[ch] ?? ch)
		.filter((ch) => {
			const cp = ch.codePointAt(0)!
			return (
				cp === 9 || cp === 10 || // tab, newline
				(cp >= 32 && cp <= 0x24f) || // ASCII + Latin-1 + Latin Extended-A/B
				(cp >= 0x2018 && cp <= 0x2022) || // curly quotes, dashes, bullet
				cp === 0x2013 || cp === 0x2014 || cp === 0x2026 // en/em dash, ellipsis
			)
		})
		.join("")
}

export class Layout {
	page!: PDFPage
	y = 0
	constructor(
		public doc: PDFDocument,
		public f: Fonts
	) {
		this.addPage()
	}

	addPage() {
		this.page = this.doc.addPage([PAGE.w, PAGE.h])
		this.page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: C.cream })
		this.y = PAGE.h - MARGIN.top
	}

	// New page if `h` more points won't fit above the bottom margin.
	ensure(h: number) {
		if (this.y - h < MARGIN.bottom) this.addPage()
	}

	gap(dy: number) {
		this.y -= dy
	}

	width(text: string, font: PDFFont, size: number): number {
		return font.widthOfTextAtSize(clean(text), size)
	}

	// Greedy word-wrap; honors existing newlines and hard-breaks over-long words.
	wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
		const out: string[] = []
		for (const rawLine of clean(text).split("\n")) {
			if (rawLine.trim() === "") {
				out.push("")
				continue
			}
			let line = ""
			for (const word of rawLine.split(/\s+/)) {
				const test = line ? line + " " + word : word
				if (!line || font.widthOfTextAtSize(test, size) <= maxW) {
					line = test
				} else {
					out.push(line)
					line = word
				}
				// A single word wider than the column: break it char by char.
				while (font.widthOfTextAtSize(line, size) > maxW && line.length > 1) {
					let i = line.length
					while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > maxW) i--
					out.push(line.slice(0, i))
					line = line.slice(i)
				}
			}
			if (line) out.push(line)
		}
		return out
	}

	// Draw one line at a baseline. Optional per-char tracking (for mono labels).
	// Falls back to ASCII if a glyph still can't be encoded — never throws.
	line(text: string, x: number, baseline: number, font: PDFFont, size: number, color: RGB, tracking = 0) {
		const s = clean(text)
		try {
			if (tracking) {
				let cx = x
				for (const ch of s) {
					this.page.drawText(ch, { x: cx, y: baseline, size, font, color })
					cx += font.widthOfTextAtSize(ch, size) + tracking
				}
			} else {
				this.page.drawText(s, { x, y: baseline, size, font, color })
			}
		} catch {
			this.page.drawText(s.replace(/[^\x20-\x7E]/g, ""), { x, y: baseline, size, font, color })
		}
	}

	// Flow a paragraph downward, page-breaking per line. Returns final y.
	para(
		text: string,
		opts: { font: PDFFont; size: number; color: RGB; lineHeight?: number; x?: number; maxW?: number; gapAfter?: number }
	) {
		const x = opts.x ?? MARGIN.left
		const maxW = opts.maxW ?? MARGIN.left + CONTENT_W - x
		const lh = opts.lineHeight ?? opts.size * 1.42
		for (const ln of this.wrap(text, opts.font, opts.size, maxW)) {
			this.ensure(lh)
			this.y -= lh
			if (ln) this.line(ln, x, this.y + lh * 0.24, opts.font, opts.size, opts.color)
		}
		if (opts.gapAfter) this.gap(opts.gapAfter)
	}

	// One line that advances the cursor (no wrapping — caller keeps it short).
	textLine(
		text: string,
		opts: { font: PDFFont; size: number; color: RGB; x?: number; tracking?: number; lineHeight?: number; gapAfter?: number }
	) {
		const lh = opts.lineHeight ?? opts.size * 1.4
		this.ensure(lh)
		this.y -= lh
		this.line(text, opts.x ?? MARGIN.left, this.y + lh * 0.24, opts.font, opts.size, opts.color, opts.tracking ?? 0)
		if (opts.gapAfter) this.gap(opts.gapAfter)
	}

	// Draw right-aligned to `xRight` at the current baseline (does not advance).
	right(text: string, xRight: number, baseline: number, font: PDFFont, size: number, color: RGB) {
		this.line(text, xRight - this.width(text, font, size), baseline, font, size, color)
	}

	// Uppercase mono label with letter-spacing — the app's `.mono-label`.
	label(text: string, color: RGB = C.muted, x: number = MARGIN.left, size = 7.5) {
		this.ensure(size + 8)
		this.y -= size + 2
		this.line(text.toUpperCase(), x, this.y, this.f.mono, size, color, size * 0.28)
		this.gap(8)
	}

	hairline(color: RGB = C.border, x = MARGIN.left, w = CONTENT_W) {
		this.ensure(1)
		this.page.drawLine({ start: { x, y: this.y }, end: { x: x + w, y: this.y }, thickness: 0.75, color })
	}
}
