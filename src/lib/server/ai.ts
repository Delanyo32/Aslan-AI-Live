import { getModel } from "@mariozechner/pi-ai"
import { env } from "$env/dynamic/private"

// Lazy init: hooks.server.ts is imported during `new Server(manifest)` (before
// server.init({ env }) populates $env/dynamic/private), so reading env at module
// load time yields undefined. We resolve models on first access, by which
// point the private env is populated.

type AiModel = NonNullable<ReturnType<typeof getModel>>

// Models newer than pi-ai's registry (checked: absent through pi-ai 0.73.1),
// declared in the same plain-object shape getModel returns. Pricing ($/M tokens),
// context, and max output pinned from openrouter.ai/api/v1/models on 2026-08-15.
const CUSTOM_MODELS: Record<string, AiModel> = {
	"openai/gpt-5.6-luna": {
		id: "openai/gpt-5.6-luna",
		name: "OpenAI: GPT-5.6 Luna",
		api: "openai-completions",
		provider: "openrouter",
		baseUrl: "https://openrouter.ai/api/v1",
		reasoning: true,
		input: ["text", "image"],
		// cacheRead not published via the models API; 0 only affects cost accounting.
		cost: { input: 0.1, output: 0.6, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_050_000,
		maxTokens: 128_000
	} as AiModel
}

const cache = new Map<string, AiModel>()

/**
 * Resolve an OpenRouter model. No argument → the session default
 * (OPENROUTER_DEFAULT_MODEL). With an id → that model, so callers (e.g. the
 * reality pipeline's per-role map) can pick per task. Custom entries cover
 * models the pi-ai registry doesn't know yet.
 */
export function getAiModel(modelId?: string): AiModel {
	const { OPENROUTER_API_KEY, OPENROUTER_DEFAULT_MODEL } = env

	// pi-ai's getModel() sources the API key from process.env only — it does not
	// accept an apiKey option. In Cloudflare Workers, $env/dynamic/private values
	// are not automatically propagated to process.env, so we set it explicitly.
	if (OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY

	const id = modelId ?? OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4.6"
	const cached = cache.get(id)
	if (cached) return cached

	const m = CUSTOM_MODELS[id] ?? getModel("openrouter", id as Parameters<typeof getModel>[1])
	if (!m) {
		throw new Error(
			`[ai] Unknown model "${id}". Check OPENROUTER_DEFAULT_MODEL in .env.local — ` +
			`use dot notation (e.g. anthropic/claude-sonnet-4.6), not dashes — or add the ` +
			`model to CUSTOM_MODELS in ai.ts if it is newer than pi-ai's registry.`,
		)
	}
	cache.set(id, m)
	return m
}
