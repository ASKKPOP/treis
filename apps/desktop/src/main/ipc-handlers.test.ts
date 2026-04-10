// @vitest-environment node
// IPC handler tests must run in Node environment so node:worker_threads mocks work correctly
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Use vi.hoisted() so these mock fns are available when vi.mock factories run
// (vi.mock calls are hoisted to the top of the file by Vitest's transformer)
// ---------------------------------------------------------------------------
const { mockHandle, mockHandleOnce, mockWorkerOn, mockWorkerTerminate } = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockHandleOnce: vi.fn(),
  mockWorkerOn: vi.fn(),
  mockWorkerTerminate: vi.fn(),
}))

const { mockCheckModelHealth, mockCreateSlotManager } = vi.hoisted(() => ({
  mockCheckModelHealth: vi.fn().mockResolvedValue({
    connected: true,
    modelName: 'llama3.2',
    contextWindow: 4096,
  }),
  mockCreateSlotManager: vi.fn().mockReturnValue({
    getAdapter: vi.fn().mockReturnValue({ getModel: vi.fn() }),
    getModelId: vi.fn().mockReturnValue('llama3.2'),
  }),
}))

// ---------------------------------------------------------------------------
// Mock electron
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  ipcMain: {
    handle: mockHandle,
    handleOnce: mockHandleOnce,
  },
}))

// ---------------------------------------------------------------------------
// Mock ?modulePath worker import (electron-vite resolves this at build time)
// ---------------------------------------------------------------------------
vi.mock('./agent-worker?modulePath', () => ({
  default: '/fake/worker.js',
}))

// ---------------------------------------------------------------------------
// Mock @treis/api-client
// ---------------------------------------------------------------------------
vi.mock('@treis/api-client', () => ({
  checkModelHealth: mockCheckModelHealth,
  createSlotManager: mockCreateSlotManager,
}))

// ---------------------------------------------------------------------------
// Mock node:worker_threads Worker + MessageChannel (preserve all named exports)
// ---------------------------------------------------------------------------
vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: vi.fn().mockImplementation(() => ({
      on: mockWorkerOn,
      terminate: mockWorkerTerminate,
    })),
    MessageChannel: vi.fn().mockImplementation(() => ({
      port1: { postMessage: vi.fn() },
      port2: {},
    })),
  }
})

// ---------------------------------------------------------------------------
// Import SUT after mocks are registered
// ---------------------------------------------------------------------------
import { registerIpcHandlers } from './ipc-handlers.js'

// ---------------------------------------------------------------------------
// Helper: build a mock WebContents
// ---------------------------------------------------------------------------
type MockSender = { send: ReturnType<typeof vi.fn> }

function makeSender(): MockSender & import('electron').WebContents {
  return { send: vi.fn() } as unknown as MockSender & import('electron').WebContents
}

// ---------------------------------------------------------------------------
// Helper: invoke a named IPC handler registered via ipcMain.handle
// ---------------------------------------------------------------------------
async function invokeHandler(name: string, ...args: unknown[]): Promise<unknown> {
  const call = mockHandle.mock.calls.find((c) => c[0] === name)
  if (!call) throw new Error(`Handler not registered: ${name}`)
  const fn = call[1] as (...a: unknown[]) => Promise<unknown>
  return fn({}, ...args)
}

// ---------------------------------------------------------------------------
// Helper: get the 'message' callback registered on the worker
// ---------------------------------------------------------------------------
type WorkerEventHandler = (data: unknown) => void

function getWorkerMessageHandler(): WorkerEventHandler {
  const call = mockWorkerOn.mock.calls.find((c: unknown[]) => c[0] === 'message')
  if (!call) throw new Error('Worker message handler not registered')
  return call[1] as WorkerEventHandler
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    // Clear only call records, not implementations (clearAllMocks would wipe Worker's mockImplementation)
    mockHandle.mockClear()
    mockHandleOnce.mockClear()
    mockWorkerOn.mockClear()
    mockWorkerTerminate.mockClear()
  })

  it('registers treis:query handler', () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    expect(mockHandle).toHaveBeenCalledWith('treis:query', expect.any(Function))
  })

  it('registers treis:model-health handler', () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    expect(mockHandle).toHaveBeenCalledWith('treis:model-health', expect.any(Function))
  })

  it('treis:model-health returns checkModelHealth result', async () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    const result = await invokeHandler('treis:model-health')
    expect(result).toEqual({ connected: true, modelName: 'llama3.2', contextWindow: 4096 })
  })

  it('routes token event to treis:stream', async () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    await invokeHandler('treis:query', { action: 'clarify', data: 'test' })

    const messageHandler = getWorkerMessageHandler()
    messageHandler({ type: 'token', content: 'hello', step: 1 })

    expect(sender.send).toHaveBeenCalledWith('treis:stream', {
      type: 'token',
      content: 'hello',
      step: 1,
    })
  })

  it('routes tool-start event to treis:tool-progress', async () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    await invokeHandler('treis:query', { action: 'clarify', data: 'test' })

    const messageHandler = getWorkerMessageHandler()
    messageHandler({ type: 'tool-start', toolName: 'FileRead', input: {}, step: 1 })

    expect(sender.send).toHaveBeenCalledWith(
      'treis:tool-progress',
      expect.objectContaining({ type: 'tool-start' }),
    )
  })

  it('routes tool-result event to treis:tool-result', async () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    await invokeHandler('treis:query', { action: 'clarify', data: 'test' })

    const messageHandler = getWorkerMessageHandler()
    messageHandler({ type: 'tool-result', toolName: 'FileRead', output: 'data', success: true, step: 1 })

    expect(sender.send).toHaveBeenCalledWith(
      'treis:tool-result',
      expect.objectContaining({ type: 'tool-result' }),
    )
  })

  it('routes violation event to treis:interrupt', async () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    await invokeHandler('treis:query', { action: 'clarify', data: 'test' })

    const messageHandler = getWorkerMessageHandler()
    messageHandler({ type: 'violation', violation: { reason: 'out of scope' } })

    expect(sender.send).toHaveBeenCalledWith(
      'treis:interrupt',
      expect.objectContaining({ type: 'violation' }),
    )
  })

  it('routes complete event to treis:status', async () => {
    const sender = makeSender()
    registerIpcHandlers(sender)
    await invokeHandler('treis:query', { action: 'clarify', data: 'test' })

    const messageHandler = getWorkerMessageHandler()
    messageHandler({ type: 'complete', totalSteps: 5 })

    expect(sender.send).toHaveBeenCalledWith(
      'treis:status',
      expect.objectContaining({ type: 'complete' }),
    )
  })
})
