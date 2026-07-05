// False-signal screen classification (§2.5.3 / §5.8). The valuable logic here is
// classification: a screen hit is only `confirmed` when independent (non
// company-controlled) sources corroborate it — anything short of that stays
// `suspected` and renders as a flag that never caps a grade (§2.5.3).
// Recipe execution lives in the research layer (the per-dimension agent run
// already surfaces screen hits with citations); this module only classifies.

import { COMPANY_CONTROLLED_DOMAINS } from "./scoring"
import type { EvidenceItem, ScreenHit } from "$lib/types/terminal"

// Confirmation needs ≥2 independent sources. Rule 4/7: independent = not
// company-controlled. We count distinct domains — two articles from the same
// outlet are one source, not corroboration.
const MIN_INDEPENDENT_TO_CONFIRM = 2

/**
 * Assigns confirmed/suspected to raw screen hits. A hit is `confirmed` only when
 * its citations reach ≥2 distinct independent (non company-controlled) domains;
 * otherwise `suspected`. Company-controlled domains are the PR-wire set plus any
 * domain the evidence items already marked company_controlled (the company's own).
 */
export function classifyScreenHits(
	rawHits: readonly Omit<ScreenHit, "status">[],
	evidenceItems: readonly EvidenceItem[]
): ScreenHit[] {
	const companyDomains = new Set(
		evidenceItems
			.filter((i) => i.company_controlled)
			.map((i) => i.source_domain.toLowerCase())
	)
	const controlled = (domain: string) => {
		const d = domain.toLowerCase()
		return COMPANY_CONTROLLED_DOMAINS.has(d) || companyDomains.has(d)
	}

	return rawHits.map((hit) => {
		const independent = new Set(
			hit.citations.map((c) => c.source_domain.toLowerCase()).filter((d) => !controlled(d))
		)
		const status: ScreenHit["status"] =
			independent.size >= MIN_INDEPENDENT_TO_CONFIRM ? "confirmed" : "suspected"
		return { ...hit, status }
	})
}
