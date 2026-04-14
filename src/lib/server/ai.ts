import { getModel } from "@mariozechner/pi-ai"
import { env } from "$env/dynamic/private"
const { OPENROUTER_API_KEY, OPENROUTER_DEFAULT_MODEL } = env

// Ensure the API key is visible to pi-ai, which reads it from process.env.
// Vite does not guarantee process.env propagation for all .env.local vars,
// so we set it explicitly here.
process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY

const modelId = OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4.6"
export const model = getModel("openrouter", modelId as any)

if (!model) {
	throw new Error(
		`[ai] Unknown model "${modelId}". Check OPENROUTER_DEFAULT_MODEL in .env.local — ` +
		`use dot notation (e.g. anthropic/claude-sonnet-4.6), not dashes.`
	)
}
