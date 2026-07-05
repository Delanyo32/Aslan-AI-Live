// Embeds the brand woff fonts (served from static/fonts via the ASSETS binding)
// into a pdf-lib document. Custom embeds MUST be subsetted — a full woff embed
// throws in @pdf-lib/fontkit. Any font that fails to load falls back to a
// StandardFont so the endpoint degrades to a plain PDF instead of a 500.
//
// The mono role uses the built-in Courier: IBM Plex Mono can't embed cleanly
// via @pdf-lib/fontkit (its subsetter throws, and a full embed produces a font
// stream real viewers reject), and Courier renders monospace in every viewer.
import fontkit from "@pdf-lib/fontkit"
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib"

export type Fonts = {
	mono: PDFFont // Courier — labels, numbers, tables
	sans: PDFFont // IBM Plex Sans — small body / flags
	serif: PDFFont // Source Serif 4 — prose, summaries, grade letters
	serifItalic: PDFFont // Source Serif 4 italic — emphasis
	display: PDFFont // Playfair Display italic — headings
}

type WoffKey = "sans" | "serif" | "serifItalic" | "display"
const FILES: Record<WoffKey, string> = {
	sans: "plex-sans-400.woff",
	serif: "source-serif-400.woff",
	serifItalic: "source-serif-italic.woff",
	display: "playfair-italic.woff"
}

export type AssetLoader = (path: string) => Promise<Uint8Array | null>

export async function embedFonts(doc: PDFDocument, load: AssetLoader): Promise<Fonts> {
	doc.registerFontkit(fontkit)
	const out: Partial<Fonts> = { mono: await doc.embedFont(StandardFonts.Courier) }

	for (const key of Object.keys(FILES) as WoffKey[]) {
		try {
			const bytes = await load(`/fonts/${FILES[key]}`)
			if (!bytes) throw new Error("no bytes")
			out[key] = await doc.embedFont(bytes, { subset: true })
		} catch {
			// leave undefined; filled by the fallback below
		}
	}

	if ((Object.keys(FILES) as WoffKey[]).some((k) => !out[k])) {
		const helv = await doc.embedFont(StandardFonts.Helvetica)
		const times = await doc.embedFont(StandardFonts.TimesRoman)
		const timesI = await doc.embedFont(StandardFonts.TimesRomanItalic)
		out.sans ??= helv
		out.serif ??= times
		out.serifItalic ??= timesI
		out.display ??= timesI
	}

	return out as Fonts
}
