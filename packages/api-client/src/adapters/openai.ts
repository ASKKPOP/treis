import { createOpenAI } from '@ai-sdk/openai'
import type { ModelAdapter, ModelCapabilities } from './types.js'

export function createOpenAIAdapter(apiKey?: string): ModelAdapter {
  const key = apiKey ?? process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY environment variable is not set')

  const provider = createOpenAI({ apiKey: key })

  return {
    name: 'openai',
    providerType: 'openai',
    getModel(modelId: string) {
      return provider(modelId)
    },
    async checkCapabilities(modelId: string): Promise<ModelCapabilities> {
      return { supportsToolCalling: true, contextWindow: 128_000, modelName: modelId }
    },
  }
}
