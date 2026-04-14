import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { getPolar } from "$lib/server/polar"
import { env as privateEnv } from "$env/dynamic/private"
import { env as publicEnv } from "$env/dynamic/public"
const { POLAR_PRODUCT_STARTER, POLAR_PRODUCT_PRO, POLAR_PRODUCT_POWER } = privateEnv
const PUBLIC_BASE_URL = publicEnv.PUBLIC_BASE_URL

const productIds: Record<string, string> = {
	starter: POLAR_PRODUCT_STARTER,
	pro: POLAR_PRODUCT_PRO,
	power: POLAR_PRODUCT_POWER,
}

const creditsByPack: Record<string, number> = {
	starter: 10,
	pro: 30,
	power: 100,
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized" }, { status: 401 })
	}

	const body = await request.json()
	const pack = body?.pack as string

	if (!pack || !(pack in productIds)) {
		return json({ error: "Invalid pack" }, { status: 400 })
	}

	const productId = productIds[pack]
	if (!productId) {
		return json({ error: "Product not configured" }, { status: 500 })
	}

	const checkout = await getPolar().checkouts.create({
		products: [productId],
		successUrl: `${PUBLIC_BASE_URL}/dashboard/credits?success=1`,
		metadata: {
			user_id: locals.user.id,
			pack,
			credits: String(creditsByPack[pack]),
		},
	})

	return json({ url: checkout.url })
}
