import { createXai } from '@ai-sdk/xai'
import type { ModelAdapter, ModelCapabilities } from './types.js'

export function createGrokAdapter(apiKey?: string): ModelAdapter {
  const key = apiKey ?? process.env.XAI_API_KEY
  if (!key) throw new Error('XAI_API_KEY environment variable is not set')

  const provider = createXai({ apiKey: key })

  return {
    name: 'grok',
    providerType: 'grok',
    getModel(modelId: string) {
      return provider(modelId)
    },
    async checkCapabilities(modelId: string): Promise<ModelCapabilities> {
      return { supportsToolCalling: true, contextWindow: 131_072, modelName: modelId }
    },
  }
}
