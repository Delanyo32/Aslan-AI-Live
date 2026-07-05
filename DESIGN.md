---
name: Aslan Terminal
description: Editorial-serif equity-intelligence terminal — analyst prose, terminal data, one indigo pen.
colors:
  indigo: "#4338ca"
  indigo-soft: "#818cf8"
  indigo-tint: "#eef2ff"
  ink: "#171717"
  black: "#000000"
  paper: "#fcfbf9"
  white: "#ffffff"
  surface: "#f5f5f5"
  border: "#e5e5e5"
  divider: "#eeeeee"
  text-strong: "#111827"
  text-body: "#4b5563"
  text-secondary: "#6b7280"
  text-muted: "#9ca3af"
  gain: "#059669"
  loss: "#dc2626"
  warning: "#b45309"
  warning-tint: "#fffbeb"
  grade-a: "#047857"
  grade-b: "#0f766e"
  grade-c: "#b45309"
  grade-d: "#c2410c"
  grade-f: "#b91c1c"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(2.25rem, 4vw + 1rem, 4.5rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  serif-body:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.625rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.35em"
rounded:
  sm: "0.25rem"
  md: "1rem"
  lg: "2rem"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    padding: "12px 28px"
    typography: "{typography.ui}"
  button-primary-hover:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.white}"
  button-mono:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    padding: "10px 24px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  input-focus:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text-strong}"
  badge-accent:
    backgroundColor: "{colors.indigo-tint}"
    textColor: "{colors.indigo}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
    typography: "{typography.label}"
  badge-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.lg}"
    padding: "40px"
---

# Design System: Aslan Terminal

## 1. Overview

**Creative North Star: "The Evidence Desk"**

Aslan Terminal reads like a senior analyst's desk rendered in software: a serif research note on one side, a data terminal on the other, and a single indigo pen used only to point. Playfair Display italic carries the headlines and company names the way a printed research note carries its title; Source Serif 4 carries the prose that argues the case; IBM Plex Mono carries every number, ticker, and date with tabular precision. The chrome is near-monochrome on warm paper — ink, gray, hairline borders — so the evidence is the only thing that ever raises its voice.

This is a **product** surface: design serves the data, never competes with it. Density is earned, not decorative — a report packs nine graded dimensions, reconciliation math, and a full citation appendix, and it stays legible because the type hierarchy and the mono/serif split do the sorting. Color is spent only where it means something: a letter grade, a verdict direction, a gain or loss, an interactive state. The one indigo accent is the interface pointing at itself — a focused input, a hovered action, a live signal — and its rarity is what makes it read as intent.

It explicitly rejects the AI-tool sheen: no mesh gradients, no glowing cards, no gradient text, no decorative glassmorphism, no `.hover-lift` theatrics. It also rejects consumer-fintech playfulness (confetti, candy color, friendly mascots) and the dense-but-illegible Bloomberg pastiche. Trust is earned by looking careful and checkable, not by looking exciting.

**Key Characteristics:**
- Editorial serif headlines + serif prose, mono for all data — a note-meets-terminal pairing
- Warm paper (`#fcfbf9`) chrome, white (`#ffffff`) surfaces, hairline `#e5e5e5` borders — flat, no shadows
- One indigo accent (`#4338ca`), reserved for interaction, links, and live signal
- A deliberate 5-step grade scale (A→F, emerald→red) as the only place multi-color appears
- Soft-rounded surfaces (pills, `2rem` report cards) — approachable precision, not hard terminal edges

## 2. Colors

A near-monochrome system on warm paper, with one indigo accent and two disciplined color scales (grades, gain/loss) that only ever encode data.

### Primary
- **Indigo Pen** (`#4338ca`, Tailwind indigo-700): the single brand accent. It is the *interaction* color — focused input borders, primary-button hover, active nav, links, unread/live dots, section eyebrows on a report. It is never a large fill and never decorative. `#818cf8` (indigo-soft) is its lighter voice for accent text on muted surfaces (citation appendix); `#eef2ff` (indigo-tint) backs small accent badges like "US Listing".

### Neutral
- **Ink** (`#171717`): near-black. The resting color of primary actions and the wordmark. Warmer and quieter than true black.
- **True Black** (`#000000`): reserved for the focus-visible outline and hard emphasis pills (e.g. the "Beta" tag). Not a body-text default.
- **Warm Paper** (`#fcfbf9`): the page and header background. The system's ground — a committed warm off-white, carried by type and restraint, not by tint elsewhere.
- **White** (`#ffffff`): panel and card surfaces that sit on the paper.
- **Surface** (`#f5f5f5`): inset/secondary fills.
- **Border** (`#e5e5e5`) / **Divider** (`#eeeeee`): all separation is a hairline. There are no shadows.
- **Text ramp**: Strong `#111827` (gray-900, headlines) → Body `#4b5563` (gray-600, prose) → Secondary `#6b7280` (gray-500, captions/values) → Muted `#9ca3af` (gray-400, labels, timestamps, metadata).

### Tertiary — Data scales (encode meaning only)
- **Grade scale** (A→F): **A** emerald (`#047857`), **B** teal (`#0f766e`), **C** amber (`#b45309`), **D** orange (`#c2410c`), **F** red (`#b91c1c`). Each renders as a text-700 / bg-50 / border-200 / dot-500 tonal trio. This is categorical health data-viz — the one sanctioned place a full color range appears.
- **Financial signal**: Gain `#059669` (emerald-600), Loss `#dc2626` (red-600). Strictly for gain/loss and improving/deteriorating trend. Never decorative.
- **Warning**: `#b45309` text on `#fffbeb` tint — low-confidence, beta caveats, data limitations only.

### Named Rules
**The One Pen Rule.** Indigo is the only accent, and it points, it doesn't fill. If indigo occupies more than a small fraction of a screen — or appears as a background wash, a gradient, or a glow — it has stopped being a pen and become decoration. Roll it back.

**The Color-Is-Data Rule.** Outside the indigo pen, every color on screen must encode a value: a grade, a direction, a confidence. If a color isn't reporting data, it is ink, gray, or paper.

## 3. Typography

**Display Font:** Playfair Display (with Georgia, serif) — used *italic* for headlines.
**Body Font:** Source Serif 4 (with Georgia, serif) — long-form prose and large grade glyphs.
**UI Font:** IBM Plex Sans (with system-ui) — buttons, form chrome, compact UI.
**Data / Label Font:** IBM Plex Mono — every number, ticker, date, table, and the uppercase section eyebrow.

**Character:** A high-contrast pairing on purpose — a dramatic italic serif (Playfair) for the title voice, a quiet readable serif (Source Serif) for the argument, and a precise monospace (Plex Mono) for the evidence. The serif/mono split is the whole idea: prose persuades, mono proves.

### Hierarchy
- **Display** (Playfair italic, `clamp(2.25rem → 4.5rem)`, line-height 1.05, tracking -0.02em): report titles, company names, verdict headlines. `text-wrap: balance`.
- **Headline** (Source Serif, `1.5–2rem`): sub-headlines and the oversized letter grade (`text-6xl` in the grade block).
- **Body** (Source Serif, `1.125rem`, line-height 1.6): narrative prose, verdict sentences. Cap measure at 65–75ch (`max-w-2xl`/`max-w-3xl`).
- **UI** (IBM Plex Sans, `0.875rem`, weight 400–500): buttons, controls, dense chrome.
- **Data** (IBM Plex Mono, `0.75–0.875rem`, tabular): prices, percentages, tickers, dates, table cells.
- **Label / Eyebrow** (`.mono-label`: IBM Plex Mono, `0.625rem`, uppercase, tracking 0.35em, muted or indigo): names a data block ("Price Reconciliation", "Implied by today's price").

### Named Rules
**The Mono-Proves Rule.** Every figure — price, percentage, grade value, date, ticker — is IBM Plex Mono with tabular figures. Numbers never render in the serif or sans. The monospace *is* the precision signal; never bold a figure to emphasize it.

**The Functional-Eyebrow Rule.** `.mono-label` is a *data label*, not marketing scaffolding — it names the block of numbers beneath it. It is legitimate here precisely because it labels data. It is prohibited as a generic "ABOUT / PROCESS" kicker above prose sections that don't contain data.

## 4. Elevation

Flat by default. Depth is conveyed with hairline borders (`#e5e5e5`) and tonal layering (paper → white → surface), never with shadows. A report card is `border border-[#e5e5e5]` on white — no `box-shadow`, no blur, no glass. This flatness is load-bearing: it keeps the eye on data instead of chrome, and it's what separates the terminal from the AI-tool sheen.

### Named Rules
**The No-Shadow Rule.** Surfaces are separated by a 1px border or a change in tone, not by elevation. The only sanctioned "lift" is a color/border state change on hover (near-black → indigo), never a `translateY` + shadow. The existing `.hover-lift` and `.animate-glow` utilities violate this and are drift to delete.

## 5. Components

### Buttons
- **Shape:** fully pill (`rounded-full`).
- **Primary:** near-black fill (`#171717`), white text, `12px 28px` padding, IBM Plex Sans medium. **Hover:** fill transitions to indigo (`#4338ca`) via `transition-colors` — the accent appears *on interaction*, not at rest.
- **Mono variant:** same near-black pill, but `.mono-label` text at `10px` (used for compact CTAs and chips).
- **Disabled:** `opacity: 0.5`, `cursor: default`.

### Badges / Pills
- **Shape:** small `rounded` (4px), `font-mono uppercase tracking-widest`, `~10px`.
- **Accent** (indigo-tint bg / indigo-700 text): classification tags like "US Listing".
- **Neutral** (gray-100 bg / gray-600 text): "Research Only".
- **Warning** (amber-50 bg / amber-700 text / amber-200 border): "Low confidence".
- **Emphasis** (black bg / white text): "Beta".

### Cards / Containers
- **Corner style:** large soft radius — `rounded-2xl` (16px) for mid blocks, `rounded-[2rem]` (32px) for the flagship report/verdict cards.
- **Background:** white (`#ffffff`) on the paper ground.
- **Shadow strategy:** none — see Elevation. Separation is a `1px #e5e5e5` border.
- **Internal padding:** generous — `32–40px` (`p-8`/`p-10`) on report cards. Never nest a card inside a card.

### Inputs / Fields
- **Style:** white or paper fill, `1px #e5e5e5` border, restrained radius.
- **Focus:** border shifts to indigo (`focus:border-[#4338ca]`) via `transition-colors`. No glow ring.
- **Placeholder:** must meet 4.5:1 — do not let it fall to gray-400 on white.

### Navigation
- **Style:** `.mono-label` links (mono, uppercase, tracked), `text-gray-600` resting → `text-black` hover, with the `.nav-underline` animated 1px underline (grows left-to-right on hover). Header is fixed, `h-20`, `bg-[#fcfbf9]` with a bottom hairline.

### Signature: The Grade Block & Report Header
The report opens with a Playfair-italic company name (`text-4xl → 6xl`) beside a square `rounded-2xl` grade block: a `border-2` tile tinted to the grade's scale (A emerald → F red) holding an oversized Source-Serif letter. This pairing — dramatic serif identity + one graded color tile — is the terminal's most recognizable unit. The nine-dimension board and verdict card inherit the same grade scale and mono/serif split.

## 6. Do's and Don'ts

### Do:
- **Do** keep indigo (`#4338ca`) as the single accent, used for interaction, links, live signal, and data-block eyebrows — the One Pen Rule.
- **Do** set every number (price, %, grade value, date, ticker) in IBM Plex Mono, tabular — the Mono-Proves Rule.
- **Do** headline in Playfair Display *italic* and argue in Source Serif 4; keep prose at 65–75ch.
- **Do** separate surfaces with a `1px #e5e5e5` border or a tone step (paper → white → surface). Stay flat.
- **Do** confine multi-color to the grade scale (A→F) and gain/loss — color only ever encodes data.
- **Do** meet WCAG AA: body ≥4.5:1, large text ≥3:1. Reserve gray-400 (`#9ca3af`) for labels/metadata, not body copy or placeholders.
- **Do** pair color-coded states with a label, sign, or icon (↑/↓, "Low confidence") so meaning survives color blindness.

### Don't:
- **Don't** use mesh gradients, glowing cards, `background-clip: text` gradient text, or decorative glassmorphism. Delete `.mesh-gradient`, `.animate-glow`, and `.hover-lift`.
- **Don't** use a `border-left` (or `border-right`) greater than 1px as a colored accent stripe. Remove the `border-l-2 border-l-[#4338ca]` pattern; use a full border, a tint, or a leading label instead.
- **Don't** let indigo fill large areas, wash backgrounds, or appear as a gradient/glow — a pen, not paint.
- **Don't** render numbers in the serif or sans, and never bold a figure for emphasis.
- **Don't** add shadows or `translateY` lifts for depth; state changes are color/border only.
- **Don't** use green/red (or the grade colors) decoratively — they are reserved for financial signal and grades.
- **Don't** nest cards, ship identical icon+heading+text card grids, or drop a tracked uppercase eyebrow above prose sections that carry no data.
