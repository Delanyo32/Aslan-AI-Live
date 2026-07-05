// Shared display utilities for terminal report components (WP4.1).
// Grade color mapping — defined once, reused by header / cards / board later.

import type { Letter, Confidence, DimensionId } from "$lib/types/terminal"
import { hostOf } from "$lib/utils"

// Dimension display names. F1–F7 mirror the rubric JSON `name`; F8/F9 from v0.2 §4.2.
export const DIMENSION_NAMES: Record<DimensionId, string> = {
	F1: "Investor Sentiment & Relationship Health",
	F2: "Policy & Governmental Landscape",
	F3: "Competitive Landscape",
	F4: "Supply Landscape",
	F5: "Demand Landscape",
	F6: "Staffing & Talent Health",
	F7: "Operations & Execution",
	F8: "Partnerships & Deals",
	F9: "Value Creation, Distribution & Management"
}

// Letter from a grade string ("B+" → "B"); anything unknown reads as F.
export function gradeLetter(grade: string): Letter {
	const c = grade.charAt(0).toUpperCase()
	return (["A", "B", "C", "D", "F"].includes(c) ? c : "F") as Letter
}

export type GradeStyle = { text: string; bg: string; border: string; dot: string }

// A=green, B=teal/blue, C=amber, D=orange, F=red.
export const GRADE_STYLES: Record<Letter, GradeStyle> = {
	A: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
	B: { text: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200", dot: "bg-teal-500" },
	C: { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
	D: { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500" },
	F: { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" }
}

export function gradeStyle(grade: string): GradeStyle {
	return GRADE_STYLES[gradeLetter(grade)]
}

export type Trend = "up" | "down" | "flat" | "new"

export const TREND: Record<Trend, { arrow: string; label: string; class: string }> = {
	up: { arrow: "↑", label: "Improving", class: "text-emerald-600" },
	down: { arrow: "↓", label: "Deteriorating", class: "text-red-600" },
	flat: { arrow: "→", label: "Stable", class: "text-gray-400" },
	new: { arrow: "＋", label: "New", class: "text-indigo-500" }
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
	high: "High confidence",
	medium: "Medium confidence",
	low: "Low confidence"
}

// Bare domain from a URL, www-stripped (unparseable URLs pass through).
// Used for citation display + favicons.
export function citationDomain(url: string): string {
	return hostOf(url) ?? url
}

export function faviconUrl(url: string): string {
	return `https://www.google.com/s2/favicons?sz=32&domain=${citationDomain(url)}`
}
