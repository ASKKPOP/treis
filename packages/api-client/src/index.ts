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

// Health check
export { checkModelHealth } from './health.js'

// Slot manager
export { createSlotManager } from './slot-manager.js'
export type { SlotManagerConfig, SlotManager } from './slot-manager.js'
