# Extractable Components — Aslan Finance

Components that appear across multiple pages and benefit from extraction as reusable `<sd-component>` blocks.

## Priority 1: Layout Components (appear on every page)

### LandingNav
- **Source**: `src/routes/+page.svelte` (lines 53–66, inline)
- **Description**: Top nav for landing page. Logo (Playfair italic), nav links, conditional auth buttons.
- **Props to extract**: `isLoggedIn: boolean`, `logoHref: string`
- **Note**: Not a standalone component — inline in +page.svelte

### DashboardNav
- **Source**: `src/routes/dashboard/+layout.svelte` (lines 41–69)
- **Description**: Dashboard nav with credits display, explore link, account link, mobile hamburger.
- **Props to extract**: `credits: number`, `creditsLabel: string`, `activeItem: string`

### LandingFooter
- **Source**: `src/routes/+page.svelte` (lines 274–284, inline)
- **Description**: Simple footer with copyright and legal links. 4px top border.
- **Props to extract**: none needed (all static)

## Priority 2: Reusable Section Patterns

### PricingTable
- **Source**: `src/routes/+page.svelte` (lines 212–237)
- **Description**: 3-row table with Starter/Pro/Power credit packs. Power row inverts to black.
- **Props to extract**: none (static data)

### HowItWorksStep
- **Source**: `src/routes/+page.svelte` (lines 129–150)
- **Description**: Numbered step row with large mono number and description text.
- **Props to extract**: `number: string`, `title: string`, `description: string`

### DataTable
- **Source**: Inline in +page.svelte example section, also BacktestReport
- **Description**: Grid-based data table with header row and bordered data rows.
- **Props to extract**: column definitions, rows

## Priority 3: Interactive Components

### HeroInput
- **Source**: `src/routes/+page.svelte` (lines 83–111)
- **Description**: The main query input card — textarea + market type bar + CTA button.
- **Props to extract**: `placeholder: string`, `ctaLabel: string`

### WaitlistModal
- **Source**: `src/lib/components/WaitlistModal.svelte`
- **Description**: Already standalone. bits-ui Dialog with email form.
- **Props**: `title: string`, `interest: string`, `onclose: () => void`

## Patterns NOT Worth Extracting (too simple, inline is fine)
- Simple `<a>` nav links
- Section headers (`<span class="font-mono text-xs uppercase">`)
- Individual badges/tags
- `<Container>` (already extracted)
