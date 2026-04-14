import { env } from "$env/dynamic/private"
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = ({ url }) => ({
	googleEnabled: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
	redirect: url.searchParams.get("redirect") ?? "/dashboard",
})
