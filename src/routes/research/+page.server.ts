// The research paper's data is baked JSON (scripts/build-research-snapshot.ts)
// bundled into the worker — a paper's numbers must not change under the reader.
import industry from "$lib/data/research/industry.json"

export const load = () => ({ industry })
