// Rubric loader (WP0.2) — imports the nine framework files, validates each
// against the frozen §2.4 schema at module init, and exports the lookup +
// RUBRIC_VERSION (max of the file versions; reports pin the version that
// graded them, §5 invariant 9).

import type { DimensionId } from "$lib/types/terminal"
import { validateRubricFramework, type RubricFramework } from "./schema"
import F1 from "./F1.json"
import F2 from "./F2.json"
import F3 from "./F3.json"
import F4 from "./F4.json"
import F5 from "./F5.json"
import F6 from "./F6.json"
import F7 from "./F7.json"
import F8 from "./F8.json"
import F9 from "./F9.json"

const files: [string, unknown][] = [
	["F1.json", F1],
	["F2.json", F2],
	["F3.json", F3],
	["F4.json", F4],
	["F5.json", F5],
	["F6.json", F6],
	["F7.json", F7],
	["F8.json", F8],
	["F9.json", F9]
]

export const FRAMEWORKS = {} as Record<DimensionId, RubricFramework>

for (const [file, raw] of files) {
	const errors = validateRubricFramework(raw)
	if (errors.length > 0) throw new Error(`invalid rubric ${file}: ${errors.join("; ")}`)
	const fw = raw as RubricFramework
	// weight sum is a data invariant the schema can't see (cross-signal)
	const sum = fw.signals.reduce((s, sig) => s + sig.weight, 0)
	if (Math.abs(sum - 1) > 0.01)
		throw new Error(`invalid rubric ${file}: signal weights sum to ${sum.toFixed(3)}, expected 1.0`)
	FRAMEWORKS[fw.id] = fw
}

const semverMax = (a: string, b: string): string => {
	const pa = a.split(".").map(Number)
	const pb = b.split(".").map(Number)
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? a : b
	return a
}

export const RUBRIC_VERSION = Object.values(FRAMEWORKS)
	.map((f) => f.version)
	.reduce(semverMax)
