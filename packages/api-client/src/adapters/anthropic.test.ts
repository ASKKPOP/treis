import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LanguageModelV3 } from '@ai-sdk/provider'

// Mock @ai-sdk/anthropic before importing the module under test
vi.mock('@ai-sdk/anthropic', () => {
  const mockModel = {
    specificationVersion: 'v3' as const,
    provider: 'anthropic',
    modelId: 'test-model',
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  }

  const mockProvider = vi.fn().mockImplementation((modelId: string) => ({
    ...mockModel,
    modelId,
  }))

  const createAnthropic = vi.fn().mockImplementation(() => mockProvider)

  return { createAnthropic }
})

// Mock @treis/core for ModelConnectionError
vi.mock('@treis/core', async () => {
  const actual = await vi.importActual<typeof import('@treis/core')>('@treis/core')
  return actual
})

describe('createAnthropicAdapter', () => {
  let createAnthropicAdapter: typeof import('./anthropic.js').createAnthropicAdapter
  let createAnthropic: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    delete process.env.ANTHROPIC_API_KEY
    const anthropicModule = await import('./anthropic.js')
    const sdkModule = await import('@ai-sdk/anthropic')
    createAnthropicAdapter = anthropicModule.createAnthropicAdapter
    createAnthropic = sdkModule.createAnthropic as ReturnType<typeof vi.fn>
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.ANTHROPIC_API_KEY
  })

  it('Test 4: createAnthropicAdapter returns a ModelAdapter reading ANTHROPIC_API_KEY from env', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-123'
    const adapter = createAnthropicAdapter()
    expect(adapter).toBeDefined()
    expect(adapter.name).toBe('anthropic')
    expect(adapter.providerType).toBe('anthropic')
    expect(typeof adapter.getModel).toBe('function')
    expect(typeof adapter.checkCapabilities).toBe('function')
    expect(createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key-123' })
    )
  })

  it('Test 5: Anthropic adapter fails fast with ModelConnectionError if ANTHROPIC_API_KEY is unset', async () => {
    const { ModelConnectionError } = await import('@treis/core')
    expect(() => createAnthropicAdapter()).toThrow(ModelConnectionError)
    expect(() => createAnthropicAdapter()).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('Test 6 (part A): Both adapters implement the same ModelAdapter interface', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const adapter = createAnthropicAdapter()
    // Verify all ModelAdapter interface properties
    expect(typeof adapter.name).toBe('string')
    expect(typeof adapter.providerType).toBe('string')
    expect(typeof adapter.getModel).toBe('function')
    expect(typeof adapter.checkCapabilities).toBe('function')
  })

  it('Test 8: getModel() returns object satisfying LanguageModelV3 interface', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const adapter = createAnthropicAdapter()
    const model = adapter.getModel('claude-3-5-sonnet-20241022')
    // Type-level check: model must be assignable to LanguageModelV3
    const _typeCheck: LanguageModelV3 = model
    expect(_typeCheck).toBeDefined()
  })

  it('Test checkCapabilities returns structured result for Anthropic', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const adapter = createAnthropicAdapter()
    const caps = await adapter.checkCapabilities('claude-3-5-sonnet-20241022')
    expect(caps.supportsToolCalling).toBe(true)
    expect(caps.contextWindow).toBe(200_000)
    expect(caps.modelName).toBe('claude-3-5-sonnet-20241022')
  })
})
