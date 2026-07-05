# Product

## Register

product

## Users

Professional and prosumer equity analysts — people who make or defend investment
decisions and are accountable for being right. They arrive with a ticker and a
question, often mid-research, and need to trust what they read fast enough to act
on it. Global coverage (any ticker gets a 9-dimension health report); price-
reconciliation verdicts only where a real price source exists (US/Alpaca). Two
day-one surfaces: the deep report and the monitored watchlist.

## Product Purpose

Aslan Terminal is an AI equity-intelligence terminal. It grades any company across
nine research frameworks (investor sentiment, policy, competition, supply, demand,
staffing, operations, partnerships, value creation) using Exa.ai as the sole
research layer, with false-signal / deception screening as the core differentiator.
Success is an analyst trusting a grade enough to act — because every claim is traced
to evidence, verdicts are accuracy-gated, and the tool flags manufactured signals
rather than amplifying consensus. Positioning: **evidence, not consensus** — reports
never cite street estimates or price targets; a reverse-DCF replaces vs-estimates
framing.

## Brand Personality

Precise, forensic, trustworthy. The voice of a research desk that takes evidence
seriously: calm confidence, no hype, no salesmanship. Editorial standard is
observational, never accusatory ("the filing states X" / "the signal is
unsupported", never "they lied"). The interface should make an analyst feel the
work was done carefully and can be checked. It should evoke earned trust, not
excitement.

## Anti-references

- **No AI-cliché sheen.** No mesh gradients, glowing cards, gradient text, or
  decorative glassmorphism. The current `app.css` carries `.mesh-gradient`,
  `.animate-glow`, and `.hover-lift` — treat these as debt to remove, not the
  brand. Indigo `#4338ca` itself is the deliberate single accent (see DESIGN.md);
  the ban is on the *glow/sheen*, not the color.
- Not a consumer fintech app (Robinhood confetti, playful color, big friendly
  rounded cards). Not a hype "AI tool" landing with animated gradients.
- Not a dense-but-illegible Bloomberg pastiche either — density serves reading,
  it is not decoration.
- No decorative motion, no skeleton-loader theater, no card grids of identical
  icon+heading+text blocks. No side-stripe (`border-left` > 1px) accents.

## Design Principles

- **Evidence is the hero.** Every grade, verdict, and figure frames its source.
  The UI exists to make claims checkable, not to impress. Show the trace.
- **Earned trust over persuasion.** Calm, observational, accuracy-gated. Beta and
  confidence states are shown honestly, never hidden to look more certain.
- **Density serves reading.** Terminal-grade information density where the analyst
  needs it; open space where they don't. Never dense for the aesthetic of density.
- **Numbers are precise instruments.** Monospace, tabular figures for every price,
  grade, and percentage — precision you can read at a glance and align in a column.
- **Restraint is the signal.** Near-monochrome discipline with a single indigo
  accent; color and emphasis are spent only where they carry meaning (a verdict,
  a flag, a gain/loss, an interactive state).

## Accessibility & Inclusion

WCAG 2.1 AA. Body text ≥4.5:1 contrast (≥3:1 for large text), including
placeholders and muted metadata against tinted surfaces. Visible focus states
(the existing 3px focus-visible outline). Fully keyboard operable — this is a tool
for long sessions. Every animation ships a `prefers-reduced-motion: reduce`
alternative. Gain/loss and verdict states must not rely on color alone (pair with
sign, label, or icon) for color-blind analysts.
