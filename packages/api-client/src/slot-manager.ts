import type { ModelAdapter, ModelSlot, SlotConfig } from './adapters/types.js'
import { createOllamaAdapter } from './adapters/ollama.js'
import { createAnthropicAdapter } from './adapters/anthropic.js'

export interface SlotManagerConfig {
  slotA: SlotConfig  // strongest model (primary reasoning)
  slotB: SlotConfig  // fastest model (background/quick calls)
}

export interface SlotManager {
  getAdapter(slot: ModelSlot): ModelAdapter
  getModelId(slot: ModelSlot): string
  getConfig(slot: ModelSlot): SlotConfig
}

function buildAdapter(slotConfig: SlotConfig): ModelAdapter {
  switch (slotConfig.provider) {
    case 'ollama':
      return createOllamaAdapter()
    case 'anthropic':
      return createAnthropicAdapter()
    default: {
      const _exhaustive: never = slotConfig.provider
      throw new Error(`Unknown provider: ${_exhaustive}`)
    }
  }
}

/**
 * Create a slot manager that binds model adapters to Slot A (strongest) and Slot B (fastest).
 * Slot assignment comes from manual config — no automatic model selection in Phase 0.
 */
export function createSlotManager(config: SlotManagerConfig): SlotManager {
  const slots = new Map<ModelSlot, { adapter: ModelAdapter; config: SlotConfig }>()

  slots.set('A', { adapter: buildAdapter(config.slotA), config: config.slotA })
  slots.set('B', { adapter: buildAdapter(config.slotB), config: config.slotB })

  return {
    getAdapter(slot: ModelSlot): ModelAdapter {
      const entry = slots.get(slot)
      if (!entry) throw new Error(`No adapter configured for slot ${slot}`)
      return entry.adapter
    },
    getModelId(slot: ModelSlot): string {
      const entry = slots.get(slot)
      if (!entry) throw new Error(`No model configured for slot ${slot}`)
      return entry.config.modelId
    },
    getConfig(slot: ModelSlot): SlotConfig {
      const entry = slots.get(slot)
      if (!entry) throw new Error(`No config for slot ${slot}`)
      return entry.config
    },
  }
}
