import { createOpenAI } from '@ai-sdk/openai'
import type { ModelAdapter, ModelCapabilities } from './types.js'

const OLLAMA_BASE_URL = 'http://localhost:11434/v1'

/**
 * CRITICAL: 32768 is non-negotiable. Ollama defaults to 2048 which kills agent loops.
 * This must be passed on every model call, not at provider creation.
 */
const OLLAMA_NUM_CTX = 32768

export function createOllamaAdapter(baseUrl: string = OLLAMA_BASE_URL): ModelAdapter {
  const provider = createOpenAI({
    name: 'ollama',
    baseURL: baseUrl,
    // Ollama does not require an auth token but some deployments may use one
    apiKey: 'ollama',
  })

  return {
    name: 'ollama',
    providerType: 'ollama',
    getModel(modelId: string) {
      // CRITICAL: num_ctx MUST be passed per-call. Ollama resets to 2048 otherwise.
      return provider(modelId, { num_ctx: OLLAMA_NUM_CTX })
    },
    async checkCapabilities(modelId: string): Promise<ModelCapabilities> {
      // Hit Ollama's native /api/show endpoint (not OpenAI-compat) to get model info
      const showUrl = baseUrl.replace('/v1', '/api/show')
      const resp = await fetch(showUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId }),
      })
      if (!resp.ok) {
        throw new Error(`Ollama model check failed: ${resp.status} ${resp.statusText}`)
      }
      await resp.json()
      return {
        // Tool calling support varies by model template; default true for Llama 3+ family
        supportsToolCalling: true,
        contextWindow: OLLAMA_NUM_CTX,
        modelName: modelId,
      }
    },
  }
}
