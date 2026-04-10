export const VERSION = '0.0.1'

// Adapter types
export type {
  ModelAdapter,
  ModelCapabilities,
  ModelSlot,
  SlotConfig,
  HealthCheckResult,
} from './adapters/types.js'

// Adapters
export { createOllamaAdapter } from './adapters/ollama.js'
export { createAnthropicAdapter } from './adapters/anthropic.js'
