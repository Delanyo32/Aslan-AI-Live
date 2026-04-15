# Theme — Aslan Finance

## Framework
SvelteKit 5 (runes mode), Tailwind CSS v4, Cloudflare Pages adapter

## CSS Entry Point
`src/app.css`

## Design System: Minimalist Monochrome (MM)

### Color Tokens (app.css :root)
```css
--bg-base:          #FFFFFF;
--bg-surface:       #F5F5F5;
--bg-elevated:      #FFFFFF;
--bg-border:        #000000;
--bg-border-light:  #E5E5E5;

--text-primary:     #000000;
--text-secondary:   #525252;
--text-muted:       #AAAAAA;

--accent-gain:      #000000;
--accent-loss:      #525252;
--accent-neutral:   #000000;

--chart-line:       #000000;
--chart-bench:      #888888;
--chart-hold:       rgba(0, 0, 0, 0.04);
--chart-entry:      #000000;
--chart-exit:       #525252;
--chart-window:     rgba(0, 0, 0, 0.06);
```

### Tailwind v4 Theme (@theme block in app.css)
```css
@theme {
  --color-bg-base:          #FFFFFF;
  --color-bg-surface:       #F5F5F5;
  --color-bg-elevated:      #FFFFFF;
  --color-bg-border:        #000000;

  --color-text-primary:     #000000;
  --color-text-secondary:   #525252;
  --color-text-muted:       #AAAAAA;

  --color-accent-gain:      #000000;
  --color-accent-loss:      #525252;
  --color-accent-neutral:   #000000;

  --font-sans:    'IBM Plex Sans', system-ui, sans-serif;
  --font-mono:    'IBM Plex Mono', monospace;
  --font-serif:   'Source Serif 4', Georgia, serif;
  --font-display: 'Playfair Display', Georgia, serif;

  --text-xs:   11px;
  --text-sm:   13px;
  --text-base: 16px;
  --text-lg:   18px;
  --text-xl:   24px;
  --text-2xl:  36px;
  --text-3xl:  2rem;
  --text-4xl:  2.5rem;
  --text-5xl:  3.5rem;
  --text-6xl:  4.5rem;
  --text-7xl:  6rem;
  --text-8xl:  8rem;
}
```

### Fonts (imported in app.css)
- **IBM Plex Sans** 400/500 — body sans-serif (`font-sans`)
- **IBM Plex Mono** 400 — monospaced data/labels (`font-mono`)
- **Source Serif 4** 400/400-italic — body serif prose (`font-serif`)
- **Playfair Display** 400/400-italic/700 — display headlines (`font-display`)

### Body defaults (html element)
- `font-family: 'Source Serif 4', Georgia, serif`
- `font-size: 16px; line-height: 1.6`
- `color: #000000; background: #FFFFFF`

### Global Reset
All elements: `box-sizing: border-box; margin: 0; padding: 0`

### Utility Classes
- `.texture-lines` — subtle horizontal line texture, opacity 0.015
- `.texture-grid` — 40px grid overlay
- `bg-bg-base`, `bg-bg-surface`, `bg-bg-elevated` — background utilities
- `text-text-primary`, `text-text-secondary`, `text-text-muted` — text utilities
- `text-accent-gain`, `text-accent-loss` — P&L coloring (both monochrome)

### Border Conventions
- Thick section borders: `border-t-4 border-black` (4px)
- Nav: `border-b-2 border-black` (2px)
- Cards/tables: `border border-black` (1px)
- Light dividers: `border-[#E5E5E5]`

### Button Pattern (primary)
```html
<button class="font-sans text-xs tracking-[0.15em] uppercase bg-black text-white border-2 border-black px-6 py-4 transition-colors duration-100 hover:bg-white hover:text-black">
  Action →
</button>
```

### Button Pattern (ghost/outline)
```html
<button class="font-sans text-xs tracking-[0.1em] uppercase bg-transparent border border-black text-black py-2.5 px-4 transition-[background] duration-100 hover:bg-bg-elevated">
  Action
</button>
```
