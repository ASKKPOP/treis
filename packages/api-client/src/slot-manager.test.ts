import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SlotConfig } from './adapters/types.js'

// Mock the adapter factories so slot manager tests don't need real providers
vi.mock('./adapters/ollama.js', () => ({
  createOllamaAdapter: vi.fn().mockReturnValue({
    name: 'ollama',
    providerType: 'ollama',
    getModel: vi.fn(),
    checkCapabilities: vi.fn(),
  }),
}))

vi.mock('./adapters/anthropic.js', () => ({
  createAnthropicAdapter: vi.fn().mockReturnValue({
    name: 'anthropic',
    providerType: 'anthropic',
    getModel: vi.fn(),
    checkCapabilities: vi.fn(),
  }),
}))

describe('createSlotManager', () => {
  let createSlotManager: typeof import('./slot-manager.js').createSlotManager

  const slotAConfig: SlotConfig = {
    slot: 'A',
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    role: 'strongest',
  }

  const slotBConfig: SlotConfig = {
    slot: 'B',
    provider: 'ollama',
    modelId: 'llama3.2',
    role: 'fastest',
  }

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./slot-manager.js')
    createSlotManager = mod.createSlotManager
  })

  it('Test 4: createSlotManager with config returns manager for Slot A and Slot B', () => {
    const manager = createSlotManager({ slotA: slotAConfig, slotB: slotBConfig })
    expect(manager).toBeDefined()
    expect(typeof manager.getAdapter).toBe('function')
    expect(typeof manager.getModelId).toBe('function')
    expect(typeof manager.getConfig).toBe('function')
  })

  it('Test 5: Slot A is assigned the strongest role model', () => {
    const manager = createSlotManager({ slotA: slotAConfig, slotB: slotBConfig })
    const configA = manager.getConfig('A')
    expect(configA.role).toBe('strongest')
    expect(configA.modelId).toBe('claude-3-5-sonnet-20241022')
  })

  it('Test 6: Slot B is assigned the fastest role model', () => {
    const manager = createSlotManager({ slotA: slotAConfig, slotB: slotBConfig })
    const configB = manager.getConfig('B')
    expect(configB.role).toBe('fastest')
    expect(configB.modelId).toBe('llama3.2')
  })

  it('Test 7: getAdapter("A") returns the adapter assigned to Slot A', () => {
    const manager = createSlotManager({ slotA: slotAConfig, slotB: slotBConfig })
    const adapterA = manager.getAdapter('A')
    expect(adapterA).toBeDefined()
    expect(typeof adapterA.getModel).toBe('function')
  })

  it('getModelId returns the model ID for each slot', () => {
    const manager = createSlotManager({ slotA: slotAConfig, slotB: slotBConfig })
    expect(manager.getModelId('A')).toBe('claude-3-5-sonnet-20241022')
    expect(manager.getModelId('B')).toBe('llama3.2')
  })
})
