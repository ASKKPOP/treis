import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LanguageModelV3 } from '@ai-sdk/provider'

// Mock @ai-sdk/openai before importing the module under test
vi.mock('@ai-sdk/openai', () => {
  const mockModel = {
    specificationVersion: 'v3' as const,
    provider: 'ollama',
    modelId: 'test-model',
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  }

  const mockProvider = vi.fn().mockImplementation((modelId: string, settings?: unknown) => ({
    ...mockModel,
    modelId,
    _settings: settings,
  }))

  const createOpenAI = vi.fn().mockImplementation((options: unknown) => {
    ;(mockProvider as any)._options = options
    return mockProvider
  })

  return { createOpenAI }
})

describe('createOllamaAdapter', () => {
  let createOllamaAdapter: typeof import('./ollama.js').createOllamaAdapter
  let createOpenAI: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    const ollamaModule = await import('./ollama.js')
    const openaiModule = await import('@ai-sdk/openai')
    createOllamaAdapter = ollamaModule.createOllamaAdapter
    createOpenAI = openaiModule.createOpenAI as ReturnType<typeof vi.fn>
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('Test 1: createOllamaAdapter returns a ModelAdapter with provider and config', () => {
    const adapter = createOllamaAdapter()
    expect(adapter).toBeDefined()
    expect(adapter.name).toBe('ollama')
    expect(adapter.providerType).toBe('ollama')
    expect(typeof adapter.getModel).toBe('function')
    expect(typeof adapter.checkCapabilities).toBe('function')
  })

  it('Test 2: Ollama adapter getModel passes num_ctx: 32768 in settings', () => {
    const adapter = createOllamaAdapter()
    const model = adapter.getModel('llama3.2') as any
    // The model should have been created with num_ctx: 32768
    expect(model._settings).toEqual({ num_ctx: 32768 })
  })

  it('Test 3: Ollama adapter uses http://localhost:11434/v1 as baseURL', () => {
    createOllamaAdapter()
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:11434/v1',
      })
    )
  })

  it('Test 7: Ollama checkCapabilities returns supportsToolCalling and contextWindow', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'llama3.2', modelfile: '...' }),
    }) as any

    const adapter = createOllamaAdapter()
    const caps = await adapter.checkCapabilities('llama3.2')
    expect(caps.contextWindow).toBe(32768)
    expect(typeof caps.supportsToolCalling).toBe('boolean')
    expect(caps.modelName).toBe('llama3.2')
  })

  it('Test 8: getModel() returns object satisfying LanguageModelV3 interface', () => {
    const adapter = createOllamaAdapter()
    const model = adapter.getModel('llama3.2')
    // Type-level check: model must be assignable to LanguageModelV3
    const _typeCheck: LanguageModelV3 = model
    expect(_typeCheck).toBeDefined()
  })
})
