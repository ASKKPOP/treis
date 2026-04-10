import type { LanguageModelV3 } from '@ai-sdk/provider'

/**
 * Unified model adapter interface.
 * Both Ollama and Anthropic adapters implement this interface,
 * enabling the agent loop to call streamText interchangeably per MODEL-04.
 */
export type ProviderType = 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'mistral' | 'grok'

export interface ModelAdapter {
  readonly name: string
  readonly providerType: ProviderType
  getModel(modelId: string): LanguageModelV3
  checkCapabilities(modelId: string): Promise<ModelCapabilities>
}

export interface ModelCapabilities {
  supportsToolCalling: boolean
  contextWindow: number
  modelName: string
}

export type ModelSlot = 'A' | 'B'

export interface SlotConfig {
  slot: ModelSlot
  provider: ProviderType
  modelId: string
  role: 'strongest' | 'fastest'
}

export interface HealthCheckResult {
  connected: boolean
  modelName: string
  contextWindow: number
  error?: string
}
