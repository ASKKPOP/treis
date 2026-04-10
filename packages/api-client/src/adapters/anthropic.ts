import { createAnthropic } from '@ai-sdk/anthropic'
import { ModelConnectionError } from '@treis/core'
import type { ModelAdapter, ModelCapabilities } from './types.js'

/**
 * Create an Anthropic model adapter.
 * Reads ANTHROPIC_API_KEY from environment — fails fast if not set.
 * Security: API key is never logged or included in error context per T-01-03.
 */
export function createAnthropicAdapter(apiKey?: string): ModelAdapter {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new ModelConnectionError(
      'ANTHROPIC_API_KEY environment variable is not set',
      { tool: 'anthropic-adapter' }
    )
  }

  // Key is passed to SDK only, never stored in error context or logs
  const provider = createAnthropic({ apiKey: key })

  return {
    name: 'anthropic',
    providerType: 'anthropic',
    getModel(modelId: string) {
      return provider(modelId)
    },
    async checkCapabilities(modelId: string): Promise<ModelCapabilities> {
      return {
        supportsToolCalling: true,  // All Claude models support tool calling
        contextWindow: 200_000,     // Claude 3+ default (Haiku/Sonnet/Opus)
        modelName: modelId,
      }
    },
  }
}
