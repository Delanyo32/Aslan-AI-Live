import { json } from "@sveltejs/kit"
import { complete, validateToolCall, type Tool, type Context } from "@mariozechner/pi-ai"
import { model } from "$lib/server/ai"
import { UnderstandResponseSchema, type UnderstandResponse } from "$lib/types/pipeline"
import type { RequestHandler } from "./$types"

const TODAY = new Date().toISOString().split("T")[0]
const FIVE_YEARS_AGO = `${new Date().getFullYear() - 5}-01-01`

const SYSTEM_PROMPT = `You are a financial event analyst. The user will describe \
a news-driven trading hypothesis. Analyse it and call the extract_event_spec tool \
with the structured result. Rules:
- primary_query must be a complete sentence as a journalist would write it -- not keywords
- additional_queries must use different eras, angles, and journalist vocabulary
- date_range.start defaults to "${FIVE_YEARS_AGO}" if the user does not specify
- date_range.end defaults to "${TODAY}" if the user does not specify
- clarifying_questions must be empty unless ambiguity is HIGH
- When clarifying_questions are needed, each must have a question string AND 2-4 short options the user can pick from (e.g. ["Specific sanctions only", "All export restrictions broadly", "Any chip-related policy"])
- NEVER put entry/exit timing, direction, or position size in clarifying_questions
- CRITICAL: When the user names a specific company or stock ticker (e.g. "buy NVIDIA", "short TSLA", "trade AMD"), every query in exa_search MUST reference that company by name and ticker. Write queries about how THAT company reacts to the event -- not generic articles about the event itself. Example: "buy NVIDIA on AI model releases" → primary_query should be "NVIDIA stock surges as new AI model launches drive GPU demand" not "AI companies release new models".`

const extractTool: Tool = {
	name: "extract_event_spec",
	description: "Extract the structured event specification from the user's hypothesis",
	parameters: UnderstandResponseSchema
}

export const POST: RequestHandler = async ({ request }) => {
	let query: string
	try {
		const body = await request.json()
		query = body?.query
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 })
	}

	if (!query || typeof query !== "string" || query.trim() === "") {
		return json({ error: "query is required" }, { status: 400 })
	}

	const context: Context = {
		systemPrompt: SYSTEM_PROMPT,
		messages: [{ role: "user", content: query.trim(), timestamp: Date.now() }],
		tools: [extractTool]
	}

	let response
	try {
		response = await complete(model, context)
	} catch (e) {
		console.error("[understand] complete() failed:", e)
		return json({ error: "AI request failed" }, { status: 500 })
	}

	if (response.stopReason !== "toolUse") {
		console.error("[understand] unexpected stopReason:", response.stopReason, response)
		return json({ error: "Model did not call the expected tool" }, { status: 500 })
	}

	const toolCall = response.content.find((b) => b.type === "toolCall")
	if (!toolCall || toolCall.type !== "toolCall") {
		console.error("[understand] no toolCall in response content:", response.content)
		return json({ error: "Model did not call the expected tool" }, { status: 500 })
	}

	let validated: UnderstandResponse
	try {
		validated = validateToolCall([extractTool], toolCall) as UnderstandResponse
	} catch (e) {
		console.error("[understand] validateToolCall failed:", e)
		return json(
			{ error: e instanceof Error ? e.message : "Tool call validation failed" },
			{ status: 500 }
		)
	}

	return json(validated)
}
