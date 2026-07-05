// Rubric JSON validation — contract file (§2.4 of SPEC v0.3). Frozen after WP0.1.
// Frameworks are versioned data, not prose in prompts; this validates one
// framework file at load time. Hand-rolled on purpose: no zod/ajv (house rule 2).

import type { DimensionId } from "$lib/types/terminal"

export type RubricRecipe = {
	primitive: "search" | "contents" | "agent_run" | "monitor_feed"
	query_template?: string
	category?: string
	days?: number
	contents?: string
	domains?: string[]
	cadence?: string
}

export type RubricSignal = {
	id: string
	description: string
	polarity: "supports" | "undermines" | "both"
	weight: number // signal weights sum to 1.0 per framework (checked by rubrics/index.ts loader, WP0.2)
	recipe: RubricRecipe
}

export type RubricFalseSignal = {
	id: string
	description: string
	recipe: RubricRecipe
	action: "cap:C" | "cap:D" | "discount" | "composite_cap:C"
}

export type RubricFramework = {
	version: string // semver
	id: DimensionId
	name: string
	question: string
	weight: number // F9: 2.0, F3/F5: 1.5, others 1.0
	veto?: boolean // F9 only
	signals: RubricSignal[]
	grade_anchors: { A: string; C: string; F: string }
	false_signals: RubricFalseSignal[]
	evidence_policy: {
		min_sources: number
		min_independent: number
		recency_days: number
		notes?: string
	}
}

const DIMENSION_IDS = new Set(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"])
const PRIMITIVES = new Set(["search", "contents", "agent_run", "monitor_feed"])
const POLARITIES = new Set(["supports", "undermines", "both"])
const ACTIONS = new Set(["cap:C", "cap:D", "discount", "composite_cap:C"])

const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

function validateRecipe(v: unknown, path: string, errors: string[]): void {
	if (!isObj(v)) { errors.push(`${path}: recipe must be an object`); return }
	if (!isStr(v.primitive) || !PRIMITIVES.has(v.primitive))
		errors.push(`${path}.primitive: must be one of search | contents | agent_run | monitor_feed`)
	if (v.query_template !== undefined && !isStr(v.query_template))
		errors.push(`${path}.query_template: must be a non-empty string`)
	if (v.category !== undefined && !isStr(v.category))
		errors.push(`${path}.category: must be a non-empty string`)
	if (v.days !== undefined && (!isNum(v.days) || v.days <= 0))
		errors.push(`${path}.days: must be a positive number`)
	if (v.contents !== undefined && !isStr(v.contents))
		errors.push(`${path}.contents: must be a non-empty string`)
	if (v.domains !== undefined && (!Array.isArray(v.domains) || !v.domains.every(isStr)))
		errors.push(`${path}.domains: must be an array of strings`)
	if (v.cadence !== undefined && !isStr(v.cadence))
		errors.push(`${path}.cadence: must be a non-empty string`)
}

/**
 * Validate one framework JSON value against the §2.4 format.
 * Returns [] when valid; otherwise a list of human-readable errors.
 */
export function validateRubricFramework(value: unknown): string[] {
	const errors: string[] = []
	if (!isObj(value)) return ["framework must be a JSON object"]

	if (!isStr(value.version) || !/^\d+\.\d+\.\d+$/.test(value.version))
		errors.push(`version: must be a semver string like "1.0.0"`)
	if (!isStr(value.id) || !DIMENSION_IDS.has(value.id))
		errors.push(`id: must be "F1"…"F9"`)
	if (!isStr(value.name)) errors.push("name: must be a non-empty string")
	if (!isStr(value.question)) errors.push("question: must be a non-empty string")
	if (!isNum(value.weight) || value.weight <= 0)
		errors.push("weight: must be a positive number")
	if (value.veto !== undefined && typeof value.veto !== "boolean")
		errors.push("veto: must be a boolean")

	if (!Array.isArray(value.signals) || value.signals.length === 0) {
		errors.push("signals: must be a non-empty array")
	} else {
		value.signals.forEach((s: unknown, i: number) => {
			const path = `signals[${i}]`
			if (!isObj(s)) { errors.push(`${path}: must be an object`); return }
			if (!isStr(s.id)) errors.push(`${path}.id: must be a non-empty string`)
			if (!isStr(s.description)) errors.push(`${path}.description: must be a non-empty string`)
			if (!isStr(s.polarity) || !POLARITIES.has(s.polarity))
				errors.push(`${path}.polarity: must be supports | undermines | both`)
			if (!isNum(s.weight) || s.weight <= 0 || s.weight > 1)
				errors.push(`${path}.weight: must be a number in (0, 1]`)
			validateRecipe(s.recipe, `${path}.recipe`, errors)
		})
	}

	if (!isObj(value.grade_anchors)) {
		errors.push("grade_anchors: must be an object with A, C, F")
	} else {
		for (const k of ["A", "C", "F"] as const) {
			if (!isStr(value.grade_anchors[k]))
				errors.push(`grade_anchors.${k}: must be a non-empty string`)
		}
	}

	if (!Array.isArray(value.false_signals)) {
		errors.push("false_signals: must be an array")
	} else {
		value.false_signals.forEach((f: unknown, i: number) => {
			const path = `false_signals[${i}]`
			if (!isObj(f)) { errors.push(`${path}: must be an object`); return }
			if (!isStr(f.id)) errors.push(`${path}.id: must be a non-empty string`)
			if (!isStr(f.description)) errors.push(`${path}.description: must be a non-empty string`)
			if (!isStr(f.action) || !ACTIONS.has(f.action))
				errors.push(`${path}.action: must be cap:C | cap:D | discount | composite_cap:C`)
			validateRecipe(f.recipe, `${path}.recipe`, errors)
		})
	}

	if (!isObj(value.evidence_policy)) {
		errors.push("evidence_policy: must be an object")
	} else {
		const p = value.evidence_policy
		if (!isNum(p.min_sources) || p.min_sources < 1)
			errors.push("evidence_policy.min_sources: must be a number ≥ 1")
		if (!isNum(p.min_independent) || p.min_independent < 0)
			errors.push("evidence_policy.min_independent: must be a number ≥ 0")
		if (!isNum(p.recency_days) || p.recency_days <= 0)
			errors.push("evidence_policy.recency_days: must be a positive number")
		if (p.notes !== undefined && !isStr(p.notes))
			errors.push("evidence_policy.notes: must be a non-empty string")
	}

	return errors
}
