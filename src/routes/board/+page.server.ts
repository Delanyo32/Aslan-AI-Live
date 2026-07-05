import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

// The board is now the terminal home. Old /board links land on the desk.
export const load: PageServerLoad = () => {
	throw redirect(308, "/dashboard")
}
