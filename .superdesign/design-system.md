# Design System — Aslan Finance (Updated: Organic Intelligence Hybrid)

## Product Context
Aslan Finance is a news-driven quantitative backtesting platform. Users type a plain-English market thesis; AI finds historical occurrences in 10+ years of financial news and simulates P&L. Target users: retail traders, quant hobbyists, and finance professionals who want Bloomberg-style analysis without the Bloomberg price.

## Key Pages
1. **Landing** — Hero with thesis input, how it works, example report, pricing
2. **Backtests gallery** — Public list of community backtests
3. **Backtest report** — Full report: charts, event log, P&L stats
4. **Dashboard** — Authenticated home with backtest creation pipeline
5. **Auth** — Login, Register, Check-email
6. **Account / Credits** — User settings and credit purchase

## Aesthetic: Minimalist Monochrome + Indigo Accent Edition (MM+I)
Editorial-tech hybrid: austere monochrome (black/white/gray) with indigo (#4338ca) accent highlights. Combines financial terminal restraint with fluid, organic micro-interactions. Inspired by broadsheets, academic journals, and premium product UX. Motion-driven without decoration — premium easing (cubic-bezier(0.22, 1, 0.36, 1)) on all transitions.

## Color Palette (Evolved)
| Token             | Value     | Use                                      |
|-------------------|-----------|------------------------------------------|
| bg-primary        | #FCFBF9   | Main background (warm cream)             |
| bg-dark           | #171717   | Dark sections (footer, dark mode)        |
| bg-surface        | #FFFFFF   | Cards, elevated surfaces                 |
| bg-muted          | #F5F5F5   | Muted backgrounds, table headers         |
| bg-accent-light   | #F0F4FF   | Indigo tinted surfaces (cards)           |
| border            | #E5E5E5   | Primary borders, dividers                |
| text-primary      | #171717   | Main text                                |
| text-secondary    | #525252   | Subtitles, captions                      |
| text-muted        | #AAAAAA   | Disabled, hints, timestamps              |
| accent-primary    | #4338CA   | Indigo — CTAs, hover states, highlights |
| accent-gain       | #000000   | Positive P&L (monochrome intentional)    |
| accent-loss       | #525252   | Negative P&L (muted gray)                |

**Monochrome base with strategic indigo accents for interactivity. No gratuitous color — only functional highlights.**

## Typography

### Font Families
| Role      | Font                              | Tailwind Class  |
|-----------|-----------------------------------|-----------------|
| Display   | Playfair Display (400, 400-italic, 700) | `font-display` |
| Sans UI   | IBM Plex Sans (400, 500)          | `font-sans`     |
| Mono      | IBM Plex Mono (400)               | `font-mono`     |
| Serif body| Source Serif 4 (400, 400-italic)  | `font-serif`    |

### Usage
- **font-display**: Big headlines, brand wordmark, blockquotes. Italic style preferred for headings.
- **font-sans**: UI labels, nav links, buttons, form labels, table headers.
- **font-mono**: Numbers, data values, tags/badges, ticker symbols, credits display.
- **font-serif**: Body copy, descriptions, prose, placeholder text in textarea.

### Type Scale
| Class     | Size   | Use                              |
|-----------|--------|----------------------------------|
| text-xs   | 11px   | Labels, table headers, meta      |
| text-sm   | 13px   | Secondary text, links            |
| text-base | 16px   | Body copy                        |
| text-lg   | 18px   | Larger body, feature descriptions|
| text-xl   | 24px   | Subheadings                      |
| text-2xl  | 36px   | Section headings                 |
| Hero      | clamp(3.5rem, 8vw, 8rem) | Hero display headline |

## Spacing & Layout
- **Container**: `max-w-[1100px] mx-auto px-6` (px-4 on mobile)
- **Section padding**: `py-16` (64px top/bottom)
- **Component gap**: `gap-6` default for flex columns within a section

## Border Conventions
| Usage              | Class                    |
|--------------------|--------------------------|
| Section separators | `border-t-4 border-black` |
| Navigation         | `border-b-2 border-black` |
| Cards, tables      | `border border-black`    |
| Row dividers       | `border-b border-[#E5E5E5]` |
| Left accent        | `border-l-4 border-black` |

## Motion & Easing
- **Premium Easing**: `cubic-bezier(0.22, 1, 0.36, 1)` — applied to all transitions
- **Transitions**: 
  - Fast interactions: 300-500ms (button, hover states)
  - Medium reveals: 1000ms (section animations, reveals)
  - Smooth scrolling: Enable via `scroll-smooth` on `<html>`
- **No animations**: Terminal aesthetic — only purposeful transitions
- **Hover Effects**: 
  - Cards: `scale(1.02) translateY(-16px)` + `shadow-xl shadow-indigo-500/10`
  - Links: Underline grows from left via `::after` pseudo-element
  - Status dots: Pulse via `@keyframes pulse-dot` with 2s cycle

## Components

### Header Navigation
```html
<header class=\"fixed top-0 left-0 w-full z-[100] h-20 bg-[#fcfbf9] border-b border-[#e5e5e5] px-8 lg:px-12 flex items-center justify-between\">
    <a href=\"#\" class=\"serif-italic text-2xl font-bold tracking-tight text-gray-900\">Aslan Finance</a>
    
    <nav class=\"hidden md:flex items-center gap-12\">
        <a href=\"#how-it-works\" class=\"mono-label text-gray-600 hover:text-black nav-underline\">Methodology</a>
        <a href=\"#backtests\" class=\"mono-label text-gray-600 hover:text-black nav-underline\">Backtests</a>
        <a href=\"#pricing\" class=\"mono-label text-gray-600 hover:text-black nav-underline\">Pricing</a>
    </nav>

    <div class=\"flex items-center gap-6\">
        <div class=\"hidden lg:flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e5e5] rounded-full\">
            <span class=\"w-2 h-2 bg-green-500 rounded-full pulse-status\"></span>
            <span class=\"mono-label text-[10px] tracking-widest text-gray-500\">System Online</span>
        </div>
        <a href=\"#\" class=\"bg-[#171717] text-white px-8 py-3 rounded-full mono-label hover:bg-[#4338ca] transition-colors duration-500\">
            Initialize
        </a>
    </div>
</header>
```

### Hero Section with Wave Transition
```html
<section class=\"relative min-h-screen flex flex-col items-center justify-center pt-20 overflow-hidden mesh-gradient\">
    <div class=\"z-10 text-center max-w-6xl px-6\">
        <span class=\"mono-label text-[#4338ca] mb-8 block opacity-0 animate-[fadeIn_1s_var(--ease-premium)_forwards]\">Quantitative Refinement</span>
        <h1 class=\"serif-italic text-[7vw] lg:text-[10vw] leading-[0.85] tracking-tighter mb-12\">Organic Intelligence Backtesting</h1>
        
        <div class=\"max-w-2xl mx-auto\">
            <div class=\"relative flex items-center bg-white border border-[#e5e5e5] p-2 rounded-2xl shadow-sm\">
                <input type=\"text\" placeholder=\"Paste your trade thesis here...\" class=\"w-full px-6 py-4 bg-transparent outline-none text-lg text-gray-600\">
                <button class=\"bg-[#171717] text-white px-10 py-4 rounded-xl mono-label hover:bg-[#4338ca] transition-all duration-500\">Analyze</button>
            </div>
        </div>
    </div>

    <!-- Wave Container -->
    <div class=\"wave-container\">
        <div class=\"wave-curve\"></div>
        <div class=\"absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[80%] z-20\">
            <button class=\"w-14 h-14 bg-[#4338ca] rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-200 group-hover:scale-110 transition-transform duration-500\">
                ↓
            </button>
        </div>
    </div>
</section>
```

### Methodology Step Card
```html
<div class=\"p-12 bg-white border border-[#e5e5e5] rounded-3xl premium-transition hover-lift\">
    <div class=\"w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-10\">
        <svg><!-- Icon --></svg>
    </div>
    <span class=\"mono-label text-xs text-gray-400 mb-2 block\">Phase 01</span>
    <h3 class=\"serif-italic text-3xl mb-4\">Linguistic Parsing</h3>
    <p class=\"text-gray-500 leading-relaxed\">Description...</p>
</div>
```

### Backtest Card (with hover reveal)
```html
<a href=\"#\" class=\"group relative block aspect-[4/3] rounded-3xl overflow-hidden bg-[#f0f4ff] premium-transition hover-lift\">
    <div class=\"absolute inset-0 flex items-center justify-center\">
        <div class=\"w-64 h-64 bg-indigo-400/20 rounded-full blur-[80px]\"></div>
    </div>
    <div class=\"absolute inset-0 p-12 flex flex-col justify-between\">
        <div>
            <span class=\"mono-label text-xs bg-white/80 backdrop-blur px-3 py-1 rounded-full\">BTC/USD / H4</span>
            <h4 class=\"serif-italic text-4xl mt-6\">Mean Reversion Flux</h4>
        </div>
        <div class=\"flex justify-between items-end\">
            <div class=\"flex gap-8\">
                <div>
                    <span class=\"mono-label text-[10px] text-gray-400 block mb-1\">Win Rate</span>
                    <span class=\"text-2xl font-semibold tracking-tight\">64.2%</span>
                </div>
            </div>
            <div class=\"bg-white text-black px-6 py-2 rounded-full mono-label text-[10px] opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500\">
                View Analysis
            </div>
        </div>
    </div>
</a>
```

### Primary Button
```html
<button class="font-sans text-xs tracking-[0.15em] uppercase bg-black text-white border-2 border-black px-6 py-4 transition-colors duration-100 hover:bg-white hover:text-black rounded-none cursor-pointer">
  Action →
</button>
```

### Ghost/Outline Button
```html
<button class="font-sans text-xs tracking-[0.1em] uppercase bg-transparent border border-black text-black py-2.5 px-4 transition-[background] duration-100 hover:bg-bg-elevated rounded-none cursor-pointer">
  Action
</button>
```

### Text Link
```html
<a class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">Link text</a>
```

### Badge/Tag
```html
<span class="font-mono text-[10px] tracking-[0.1em] uppercase bg-black text-white px-2 py-[3px]">Label</span>
```

### Section Label
```html
<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase">Section Name</span>
```

### Data Table
Header row: `bg-bg-surface`, `font-sans text-[10px] tracking-[0.08em] uppercase text-[#525252]`
Data rows: `font-mono text-sm`, bordered with `border-b border-[#E5E5E5]`
Last data row: no bottom border

### Inverted Row (e.g., Power pricing tier)
```html
<div class="bg-black text-white border-b border-[#333333]">...</div>
```



## Logo / Brand Mark
```
Aslan Finance
```
- Font: Playfair Display italic, 22px (landing), 18px (dashboard)
- Color: #000000
- No logo SVG — pure typography wordmark

## Favicon
The favicon is the Svelte logo (development default) at `src/lib/assets/favicon.svg`.

## Layout Patterns

### How It Works Step
```html
<div class="grid [grid-template-columns:72px_1fr] gap-6 py-7 border-t border-black">
  <span class="font-mono text-[40px] font-normal text-[#E5E5E5] leading-none pt-1">01</span>
  <div class="flex flex-col gap-2">
    <p class="font-display text-[20px] font-normal text-black m-0">Step title</p>
    <p class="text-[15px] text-[#525252] leading-[1.6] m-0" style="font-family: 'Source Serif 4', serif;">Step description</p>
  </div>
</div>
```

### Blockquote
```html
<div class="pl-5 border-l-4 border-black">
  <p class="font-display italic text-[22px] leading-[1.4] text-black m-0">"Quote"</p>
</div>
```

### Stats Row
```html
<div class="flex flex-wrap items-center gap-2 font-mono text-sm">
  <span class="text-accent-gain font-bold">+184% total return</span>
  <span class="text-[#CCCCCC]">·</span>
  <span class="text-[#525252]">6 events found</span>
</div>
```

## Key UX Principles (Updated)
1. **Credibility through restrained motion** — premium easing creates confidence, not distraction
2. **Data density + visual breathing room** — compact data paired with generous padding
3. **Typography hierarchy** — display/serif for emotional moments, mono for precision, sans for actions
4. **Strategic color** — monochrome base + indigo accents only where interaction/hierarchy needed
5. **Organic flow** — wave transitions, smooth reveals (slide-up + fade), scale-lift hover effects
6. **Terminal aesthetics + premium UX** — financial restraint meets fluid, modern micro-interactions
7. **Progressive disclosure** — free tier with credits, gradual feature reveals on card hovers
