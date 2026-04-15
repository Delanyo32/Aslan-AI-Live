import { getModel } from "@mariozechner/pi-ai"
import { env } from "$env/dynamic/private"
const { OPENROUTER_API_KEY, OPENROUTER_DEFAULT_MODEL } = env

// Ensure the API key is visible to pi-ai, which reads it from process.env via
// getEnvApiKey(). The library's getModel() does not accept an apiKey option —
// it only sources keys from process.env. In Cloudflare Workers, $env/dynamic/private
// values are not automatically propagated to process.env, so we set it explicitly.
// This is intentional and required for the library to authenticate with OpenRouter.
process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY

const modelId = OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4.6"
export const model = getModel("openrouter", modelId as any)

if (!model) {
	throw new Error(
		`[ai] Unknown model "${modelId}". Check OPENROUTER_DEFAULT_MODEL in .env.local — ` +
		`use dot notation (e.g. anthropic/claude-sonnet-4.6), not dashes.`
	)
}
