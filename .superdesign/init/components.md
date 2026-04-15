# Components — Aslan Finance

## UI Component Library
No shadcn/ui or custom component library. UI is built with:
- **bits-ui** — headless primitives (Dialog, etc.)
- **Tailwind CSS v4** — utility-first styling
- Custom Svelte components in `src/lib/components/`

---

## `Container` — `src/lib/components/layout/Container.svelte`
Max-width wrapper.

```svelte
<script lang="ts">
  let { children } = $props();
</script>

<div class="max-w-[1100px] mx-auto px-6 max-sm:px-4">
  {@render children()}
</div>
```

---

## `WaitlistModal` — `src/lib/components/WaitlistModal.svelte`
Dialog modal for "coming soon" waitlist signups. Uses bits-ui Dialog.

```svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';

  interface Props {
    title: string;
    interest: string;
    onclose: () => void;
  }

  let { title, interest, onclose }: Props = $props();
  let open    = $state(true);
  let email   = $state('');
  let btnText = $state('Join waitlist →');
  let error   = $state('');
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/60 z-[200]" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-bg-surface border border-bg-border p-8 max-w-[400px] w-[90%]"
    >
      <Dialog.Close class="absolute top-3 right-3.5 bg-transparent border-none text-text-muted text-sm cursor-pointer p-1 leading-none hover:text-text-primary">✕</Dialog.Close>
      <Dialog.Title class="font-sans text-base text-text-primary mb-5">{title}</Dialog.Title>
      <form onsubmit={handleSubmit}>
        <input
          class="w-full py-2.5 px-3 bg-bg-base border text-text-primary font-sans text-sm rounded-none outline-none focus:border-text-secondary"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          autocomplete="email"
        />
        <button
          class="mt-3 block w-full bg-transparent border border-bg-border text-text-primary font-sans text-sm py-2.5 px-4 cursor-pointer rounded-none transition-[background] duration-100 hover:not-disabled:bg-bg-elevated"
          type="submit"
        >{btnText}</button>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

---

## `TeaserChart` — `src/lib/components/charts/TeaserChart.svelte`
Simplified portfolio line chart with gradient overlay to tease content.

```svelte
<script lang="ts">
  interface Props {
    portfolio_series: { date: string; value: number }[];
  }
  let { portfolio_series }: Props = $props();
  // ... SVG path computation ...
</script>

<div class="relative w-full overflow-hidden" bind:clientWidth={cw}>
  <svg width={cw} height={200} aria-hidden="true">
    <path d={linePath} fill="none" stroke="var(--chart-line)" stroke-width="1.5" />
  </svg>
  <div
    class="absolute w-full bottom-0 h-[60%] pointer-events-none"
    style="background: linear-gradient(to bottom, transparent, var(--bg-base))"
    aria-hidden="true"
  ></div>
</div>
```

---

## Backtest Components — `src/lib/components/backtest/`

| Component                | Description                                   |
|--------------------------|-----------------------------------------------|
| `BacktestInput.svelte`   | Main query input for creating a backtest      |
| `BacktestReport.svelte`  | Full backtest results report                  |
| `StepCard.svelte`        | Pipeline step progress card                   |
| `ProcessingLog.svelte`   | Streaming log of pipeline steps               |
| `ResearchResults.svelte` | Research phase results display                |
| `RuleSelector.svelte`    | Trade rule selection UI                       |
| `ClarifyingQuestions.svelte` | AI clarifying questions step              |
| `IntentConfirmation.svelte`  | Confirm backtest intent                   |
| `TickerConfirmation.svelte`  | Confirm tickers to analyze                |
| `UnderstandPreview.svelte`   | Preview of understanding step             |
| `UnderstandSummaryCard.svelte` | Summary card for understand step        |
| `TickerSummaryCard.svelte`   | Summary card for ticker                   |
| `QuerySummaryCard.svelte`    | Summary card for query                    |
| `RuleSummaryCard.svelte`     | Summary card for trade rules              |

---

## Chart Components — `src/lib/components/charts/`

| Component              | Description                               |
|------------------------|-------------------------------------------|
| `PortfolioChart.svelte`| Full portfolio value over time chart      |
| `EventChart.svelte`    | Events-annotated chart                    |
| `TeaserChart.svelte`   | Blurred teaser chart for public pages     |

---

## Inline Button Patterns (no shared Button component)

### Primary (black fill)
```html
<a href="..." class="font-sans text-xs tracking-[0.1em] uppercase bg-black text-white px-[18px] py-2 border-2 border-black no-underline transition-colors duration-100 hover:bg-white hover:text-black">
  Register →
</a>
```

### Secondary (text link)
```html
<a href="..." class="font-sans text-xs tracking-[0.1em] uppercase text-black no-underline hover:underline">
  How it works
</a>
```

### Disabled state
```html
<button disabled class="... disabled:opacity-35 disabled:cursor-not-allowed">Run Backtest →</button>
```

---

## Inline Input Pattern

### Hero Textarea
```html
<textarea
  class="w-full min-h-[120px] px-6 py-5 bg-transparent border-none text-black text-[17px] leading-[1.65] resize-none outline-none"
  style="font-family: 'Source Serif 4', Georgia, serif;"
  placeholder="Buy Nvidia every time..."
></textarea>
```

### Email Input
```html
<input
  class="w-full py-2.5 px-3 bg-bg-base border border-bg-border text-text-primary font-sans text-sm rounded-none outline-none focus:border-text-secondary"
  type="email"
  placeholder="your@email.com"
/>
```

---

## Data Table Pattern
```html
<div class="flex flex-col border border-black">
  <!-- Header row -->
  <div class="grid [grid-template-columns:1fr_60px_50px_80px_70px] px-[14px] py-[10px] font-sans text-[10px] tracking-[0.08em] text-[#525252] bg-bg-surface uppercase border-b border-black">
    <span>DATE</span>
    <span>TICKER</span>
    <span>DIR</span>
    <span class="text-right">P&L ($)</span>
    <span class="text-right">P&L (%)</span>
  </div>
  <!-- Data rows -->
  <div class="grid [grid-template-columns:1fr_60px_50px_80px_70px] px-[14px] py-[10px] font-mono text-sm text-black border-b border-black">
    <span>2022-10-07</span>
    <span>NVDA</span>
    <span>Long</span>
    <span class="text-right text-accent-gain font-bold">+$2,240</span>
    <span class="text-right text-accent-gain font-bold">+22.4%</span>
  </div>
</div>
```

---

## Badge/Tag Pattern
```html
<span class="font-mono text-[10px] tracking-[0.1em] uppercase bg-black text-white px-2 py-[3px]">US Stocks</span>
```

## Section Header Pattern
```html
<span class="font-mono text-xs tracking-[0.1em] text-[#525252] uppercase">Section Title</span>
```

## Blockquote Pattern
```html
<div class="pl-5 border-l-4 border-black">
  <p class="font-display italic text-[22px] leading-[1.4] text-black m-0">"Quote text here"</p>
</div>
```
