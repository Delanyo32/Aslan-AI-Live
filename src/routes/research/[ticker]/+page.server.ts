import { error } from "@sveltejs/kit"
import industry from "$lib/data/research/industry.json"

// All baked company files, bundled at build time.
const companies = import.meta.glob("$lib/data/research/companies/*.json", { eager: true }) as Record<
	string,
	{ default: Record<string, unknown> }
>

export const load = ({ params }: { params: { ticker: string } }) => {
	const ticker = params.ticker.toUpperCase()
	const hit = Object.entries(companies).find(([path]) => path.endsWith(`/${ticker}.json`))
	if (!hit) error(404, "no such company in the research snapshot")
	return { company: hit[1].default, industry_companies: industry.companies }
}
