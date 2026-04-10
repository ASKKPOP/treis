import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter, ModelCapabilities } from './adapters/types.js'

function makeAdapter(overrides?: Partial<ModelAdapter>): ModelAdapter {
  return {
    name: 'test',
    providerType: 'ollama',
    getModel: vi.fn(),
    checkCapabilities: vi.fn().mockResolvedValue({
      supportsToolCalling: true,
      contextWindow: 32768,
      modelName: 'test-model',
    } satisfies ModelCapabilities),
    ...overrides,
  }
}

describe('checkModelHealth', () => {
  let checkModelHealth: typeof import('./health.js').checkModelHealth

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./health.js')
    checkModelHealth = mod.checkModelHealth
  })

  it('Test 1: returns { connected: true, modelName, contextWindow: 32768 } when adapter is reachable', async () => {
    const adapter = makeAdapter()
    const result = await checkModelHealth(adapter, 'llama3.2')
    expect(result.connected).toBe(true)
    expect(result.modelName).toBe('test-model')
    expect(result.contextWindow).toBe(32768)
    expect(result.error).toBeUndefined()
  })

  it('Test 2: returns { connected: false, error: string } when connection fails', async () => {
    const adapter = makeAdapter({
      checkCapabilities: vi.fn().mockRejectedValue(new Error('Connection refused')),
    })
    const result = await checkModelHealth(adapter, 'llama3.2')
    expect(result.connected).toBe(false)
    expect(result.error).toContain('Connection refused')
    expect(result.contextWindow).toBe(0)
  })

  it('Test 3: returns connected status with model name for Anthropic adapter', async () => {
    const adapter = makeAdapter({
      name: 'anthropic',
      providerType: 'anthropic',
      checkCapabilities: vi.fn().mockResolvedValue({
        supportsToolCalling: true,
        contextWindow: 200_000,
        modelName: 'claude-3-5-sonnet-20241022',
      } satisfies ModelCapabilities),
    })
    const result = await checkModelHealth(adapter, 'claude-3-5-sonnet-20241022')
    expect(result.connected).toBe(true)
    expect(result.modelName).toBe('claude-3-5-sonnet-20241022')
    expect(result.contextWindow).toBe(200_000)
  })
})
