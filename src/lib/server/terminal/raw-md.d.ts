// Ambient type for Vite/bun `?raw` markdown imports (rulebook.md loaded in synthesis.ts).
// The bundler inlines the file as a string at build time; this only satisfies
// `bun run check` (svelte-check/tsc). Same self-contained-ambient pattern as bun-test.d.ts.
declare module "*.md?raw" {
	const content: string
	export default content
}
