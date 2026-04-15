import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { waitlist } from "$lib/server/db/schema"

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 })
	}

	const { email, interest } = body as { email?: string; interest?: string }

	const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	if (!email || !EMAIL_RE.test(email)) {
		return json({ error: "invalid_email" }, { status: 400 })
	}

	await locals.db.insert(waitlist).values({ id: crypto.randomUUID(), email, interest: interest ?? null })

	return json({ success: true })
}
