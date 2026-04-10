import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { ModelAdapter, ModelCapabilities } from './types.js'

export function createGeminiAdapter(apiKey?: string): ModelAdapter {
  const key = apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set')

  const provider = createGoogleGenerativeAI({ apiKey: key })

  return {
    name: 'gemini',
    providerType: 'gemini',
    getModel(modelId: string) {
      return provider(modelId)
    },
    async checkCapabilities(modelId: string): Promise<ModelCapabilities> {
      return { supportsToolCalling: true, contextWindow: 1_000_000, modelName: modelId }
    },
  }
}
