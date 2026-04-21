import { getModel } from "@mariozechner/pi-ai"
import { env } from "$env/dynamic/private"

// Lazy init: hooks.server.ts is imported during `new Server(manifest)` (before
// server.init({ env }) populates $env/dynamic/private), so reading env at module
// load time yields undefined. We resolve the model on first access, by which
// point the private env is populated.

let _model: ReturnType<typeof getModel> | null = null

export function getAiModel(): NonNullable<ReturnType<typeof getModel>> {
  if (_model) return _model

  const { OPENROUTER_API_KEY, OPENROUTER_DEFAULT_MODEL } = env

  // pi-ai's getModel() sources the API key from process.env only — it does not
  // accept an apiKey option. In Cloudflare Workers, $env/dynamic/private values
  // are not automatically propagated to process.env, so we set it explicitly.
  if (OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = OPENROUTER_API_KEY

  const modelId = OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4.6"
  const m = getModel("openrouter", modelId as Parameters<typeof getModel>[1])
  if (!m) {
    throw new Error(
      `[ai] Unknown model "${modelId}". Check OPENROUTER_DEFAULT_MODEL in .env.local — ` +
      `use dot notation (e.g. anthropic/claude-sonnet-4.6), not dashes.`,
    )
  }
  _model = m
  return m
}
