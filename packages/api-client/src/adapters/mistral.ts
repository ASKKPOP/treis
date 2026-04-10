import { createMistral } from '@ai-sdk/mistral'
import type { ModelAdapter, ModelCapabilities } from './types.js'

export function createMistralAdapter(apiKey?: string): ModelAdapter {
  const key = apiKey ?? process.env.MISTRAL_API_KEY
  if (!key) throw new Error('MISTRAL_API_KEY environment variable is not set')

  const provider = createMistral({ apiKey: key })

  return {
    name: 'mistral',
    providerType: 'mistral',
    getModel(modelId: string) {
      return provider(modelId)
    },
    async checkCapabilities(modelId: string): Promise<ModelCapabilities> {
      return { supportsToolCalling: true, contextWindow: 128_000, modelName: modelId }
    },
  }
}
