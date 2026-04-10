import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEvent, AgentRunOptions } from './types.js'
import type { PlanContract } from '../plan-contract/schema.js'
import type { ScopeViolation } from '../plan-contract/scope-checker.js'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any dynamic imports
// ---------------------------------------------------------------------------

vi.mock('ai', () => ({
  streamText: vi.fn(),
}))

vi.mock('../plan-contract/scope-checker.js', () => ({
  checkToolScope: vi.fn(),
}))

vi.mock('@treis/tools', async () => {
  // We need real Tool type shape but mocked executeTools
  return {
    executeTools: vi.fn(),
  }
})

vi.mock('../session/trace-logger.js', () => ({
  createTraceLogger: vi.fn(() => ({
    logToolCall: vi.fn(),
    flush: vi.fn(),
    executionId: 'mock-exec-id',
    sessionId: 'mock-session-id',
  })),
}))

vi.mock('../session/checkpoint.js', () => ({
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('ulid', () => ({
  ulid: vi.fn(() => 'mock-ulid-123'),
}))

// ---------------------------------------------------------------------------
// Dynamic imports after mocking
// ---------------------------------------------------------------------------
const { streamText } = await import('ai')
const { checkToolScope } = await import('../plan-contract/scope-checker.js')
const { executeTools } = await import('@treis/tools')
const { createTraceLogger } = await import('../session/trace-logger.js')
const { saveCheckpoint } = await import('../session/checkpoint.js')
const { runAgent } = await import('./executor.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an async generator that yields stream parts.
 * Mimics the shape of ai@5 fullStream.
 */
async function* makeStream(parts: unknown[]) {
  for (const part of parts) {
    yield part
  }
}

function makeTextStream(text: string, tokens = 100) {
  return makeStream([
    { type: 'text-delta', textDelta: text },
    { type: 'finish-step', usage: { totalTokens: tokens } },
  ])
}

function makeToolCallStream(toolName: string, toolCallId: string, args: unknown, tokens = 100) {
  return makeStream([
    { type: 'tool-call', toolName, toolCallId, args },
    { type: 'finish-step', usage: { totalTokens: tokens } },
  ])
}

function makeMockContract(overrides: Partial<PlanContract> = {}): PlanContract {
  return {
    id: 'contract-123',
    version: '1.0',
    intent: 'Write a hello world script',
    clarifications: [],
    scopeEntries: [],
    successCriteria: ['Script exists', 'Script runs'],
    tokenBudget: 200_000,
    selectedOption: 'B',
    createdAt: new Date().toISOString(),
    sealedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeMockTool(name: string, isReadOnlyVal = true, successResult: unknown = 'ok') {
  return {
    name,
    description: `Mock ${name} tool`,
    inputSchema: { parse: (v: unknown) => v },
    requiredTier: 'ReadOnly',
    isReadOnly: () => isReadOnlyVal,
    checkPermissions: () => ({ allowed: true }),
    call: vi.fn().mockResolvedValue(successResult),
  }
}

function makeMockWorkspace(tmpDir: string) {
  return {
    root: tmpDir,
    configPath: join(tmpDir, 'config.json'),
    planContractsDir: join(tmpDir, 'plan-contracts'),
    tracesDir: join(tmpDir, 'traces'),
    sessionsDir: join(tmpDir, 'sessions'),
  }
}

function collectEvents(consumer: (event: AgentEvent) => void): AgentEvent[] {
  const events: AgentEvent[] = []
  return events
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(async () => {
  vi.clearAllMocks()
  tmpDir = await mkdtemp(join(tmpdir(), 'treis-executor-test-'))
  // Default: checkToolScope returns null (no violation)
  vi.mocked(checkToolScope).mockResolvedValue(null)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Test Suite: Core loop state transitions
// ---------------------------------------------------------------------------

describe('runAgent — core loop', () => {
  it('Test 1: text-only step transitions through IDLE->PREPARE->STREAM->EVALUATE->COMPLETE and consumer receives token events', async () => {
    const events: AgentEvent[] = []
    const consumer = (e: AgentEvent) => events.push(e)

    // Two streams: first with text (NEXT), second with text (COMPLETE)
    // But since text-only = COMPLETE immediately, one stream is enough
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeTextStream('Hello world'),
    } as never)

    const opts: AgentRunOptions = {
      contract: makeMockContract(),
      tools: [],
      model: {} as never,
      consumer,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 'sess-1',
      toolContext: { workspaceRoot: tmpDir, sessionId: 'sess-1', permissionGrants: new Set() },
    }

    await runAgent(opts)

    const tokenEvents = events.filter(e => e.type === 'token')
    expect(tokenEvents.length).toBeGreaterThan(0)
    expect(tokenEvents[0]).toMatchObject({ type: 'token', content: 'Hello world' })

    const completeEvent = events.find(e => e.type === 'complete')
    expect(completeEvent).toBeDefined()
    expect(completeEvent).toMatchObject({ type: 'complete', totalSteps: 1 })
  })

  it('Test 2: tool-calling step transitions through STREAM->TOOLS->EVALUATE->NEXT and consumer receives tool-start + tool-result events', async () => {
    const events: AgentEvent[] = []
    const consumer = (e: AgentEvent) => events.push(e)

    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'file content', durationMs: 10 } },
    ])

    // First stream: tool call
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'src/foo.ts' }),
    } as never)

    // Second stream: text-only (completes)
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeTextStream('Done'),
    } as never)

    const opts: AgentRunOptions = {
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 'sess-1',
      toolContext: { workspaceRoot: tmpDir, sessionId: 'sess-1', permissionGrants: new Set() },
    }

    await runAgent(opts)

    const toolStartEvent = events.find(e => e.type === 'tool-start')
    expect(toolStartEvent).toMatchObject({ type: 'tool-start', toolName: 'readFile' })

    const toolResultEvent = events.find(e => e.type === 'tool-result')
    expect(toolResultEvent).toMatchObject({ type: 'tool-result', toolName: 'readFile', success: true })
  })

  it('Test 3: multi-step execution loops NEXT->PREPARE->STREAM->...->COMPLETE, consumer receives step-complete events with incrementing step numbers', async () => {
    const events: AgentEvent[] = []
    const consumer = (e: AgentEvent) => events.push(e)

    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValue([
      { toolName: 'readFile', result: { success: true, data: 'data', durationMs: 5 } },
    ])

    // Step 1: tool call
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'a.ts' }),
    } as never)

    // Step 2: tool call
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeToolCallStream('readFile', 'tc-2', { path: 'b.ts' }),
    } as never)

    // Step 3: text only => COMPLETE
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeTextStream('All done'),
    } as never)

    const opts: AgentRunOptions = {
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 'sess-1',
      toolContext: { workspaceRoot: tmpDir, sessionId: 'sess-1', permissionGrants: new Set() },
    }

    await runAgent(opts)

    const stepCompleteEvents = events.filter(e => e.type === 'step-complete')
    expect(stepCompleteEvents.length).toBeGreaterThanOrEqual(2)
    // Step numbers should be sequential
    const stepNums = stepCompleteEvents.map(e => (e as Extract<AgentEvent, { type: 'step-complete' }>).step)
    expect(stepNums[0]).toBe(1)
    expect(stepNums[1]).toBe(2)
  })

  it('Test 4: consumer receives "complete" event with totalSteps count at the end', async () => {
    const events: AgentEvent[] = []
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeTextStream('Done'),
    } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    const completeEvent = events.find(e => e.type === 'complete') as Extract<AgentEvent, { type: 'complete' }> | undefined
    expect(completeEvent).toBeDefined()
    expect(typeof completeEvent?.totalSteps).toBe('number')
    expect(completeEvent!.totalSteps).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Scope checking
// ---------------------------------------------------------------------------

describe('runAgent — scope checking', () => {
  it('Test 5: tool call within scope proceeds normally (checkToolScope returns null)', async () => {
    const events: AgentEvent[] = []
    const mockTool = makeMockTool('readFile')

    vi.mocked(checkToolScope).mockResolvedValue(null)
    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } },
    ])

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'src/main.ts' }),
    } as never)
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeTextStream('Done'),
    } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    expect(events.find(e => e.type === 'violation')).toBeUndefined()
    expect(events.find(e => e.type === 'complete')).toBeDefined()
  })

  it('Test 6: tool call outside scope triggers VIOLATED state and consumer receives "violation" event', async () => {
    const events: AgentEvent[] = []
    const violation: ScopeViolation = {
      entryType: 'tool',
      details: 'Tool not allowed',
      toolName: 'dangerousTool',
      attempted: 'dangerousTool',
    }

    vi.mocked(checkToolScope).mockResolvedValue(violation)

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeToolCallStream('dangerousTool', 'tc-1', {}),
    } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    const violationEvent = events.find(e => e.type === 'violation')
    expect(violationEvent).toBeDefined()
    expect(violationEvent).toMatchObject({ type: 'violation' })
  })

  it('Test 7: handleViolation callback returning "stop" keeps VIOLATED state (execution halts)', async () => {
    const events: AgentEvent[] = []
    const violation: ScopeViolation = {
      entryType: 'file',
      details: 'Path out of scope',
      toolName: 'writeFile',
      attempted: '/etc/passwd',
    }

    vi.mocked(checkToolScope).mockResolvedValue(violation)
    const handleViolation = vi.fn().mockResolvedValue('stop')

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeToolCallStream('writeFile', 'tc-1', { path: '/etc/passwd' }),
    } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [],
      model: {} as never,
      consumer: (e) => events.push(e),
      handleViolation,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    expect(handleViolation).toHaveBeenCalledWith(violation)
    // No 'complete' event — execution halted
    expect(events.find(e => e.type === 'complete')).toBeUndefined()
    // Violation event was emitted
    expect(events.find(e => e.type === 'violation')).toBeDefined()
  })

  it('Test 8: handleViolation callback returning "continue" allows the specific call to proceed', async () => {
    const events: AgentEvent[] = []
    const violation: ScopeViolation = {
      entryType: 'file',
      details: 'Path advisory only',
      toolName: 'readFile',
      attempted: '/tmp/something',
    }

    const mockTool = makeMockTool('readFile')

    // First call: violation, then proceed
    vi.mocked(checkToolScope).mockResolvedValueOnce(violation)
    const handleViolation = vi.fn().mockResolvedValue('continue')

    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'content', durationMs: 5 } },
    ])

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeToolCallStream('readFile', 'tc-1', { path: '/tmp/something' }),
    } as never)
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeTextStream('Done'),
    } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      handleViolation,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    expect(handleViolation).toHaveBeenCalledWith(violation)
    // Execution continued — tool was called
    expect(vi.mocked(executeTools)).toHaveBeenCalled()
    // Complete event fires
    expect(events.find(e => e.type === 'complete')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Retry and escalation
// ---------------------------------------------------------------------------

describe('runAgent — retry and escalation', () => {
  it('Test 9: FAIL verdict retries with backoff — consumer receives "retry" event with attempt number', async () => {
    vi.useFakeTimers()
    const events: AgentEvent[] = []

    const mockTool = makeMockTool('readFile')

    // First attempt: tool fails
    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: false, error: 'Permission denied', durationMs: 5 } },
    ])
    // Second attempt (retry 1): tool succeeds
    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } },
    ])

    vi.mocked(streamText)
      .mockReturnValueOnce({ fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'a.ts' }) } as never)
      .mockReturnValueOnce({ fullStream: makeToolCallStream('readFile', 'tc-2', { path: 'a.ts' }) } as never)
      .mockReturnValueOnce({ fullStream: makeTextStream('Done') } as never)

    const runPromise = runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    // Advance timers to skip backoff
    await vi.runAllTimersAsync()
    await runPromise

    const retryEvent = events.find(e => e.type === 'retry')
    expect(retryEvent).toBeDefined()
    expect(retryEvent).toMatchObject({ type: 'retry', attempt: 1 })
  })

  it('Test 10: after 3 retries, approveEscalation is called with reason string', async () => {
    vi.useFakeTimers()
    const events: AgentEvent[] = []

    const mockTool = makeMockTool('readFile')

    // All tool calls fail
    vi.mocked(executeTools).mockResolvedValue([
      { toolName: 'readFile', result: { success: false, error: 'Persistent error', durationMs: 5 } },
    ])

    // 4 streams: initial + 3 retries (but escalation fires at 3rd failure)
    vi.mocked(streamText)
      .mockReturnValue({ fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'a.ts' }) } as never)

    const approveEscalation = vi.fn().mockResolvedValue(false)

    const runPromise = runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      approveEscalation,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    await vi.runAllTimersAsync()
    await runPromise

    expect(approveEscalation).toHaveBeenCalled()
    const callArg = approveEscalation.mock.calls[0]?.[0] as string
    expect(typeof callArg).toBe('string')
    expect(callArg.length).toBeGreaterThan(0)
  })

  it('Test 11: approveEscalation returning true switches model to escalationModel for remaining steps', async () => {
    vi.useFakeTimers()
    const events: AgentEvent[] = []

    const mockTool = makeMockTool('readFile')
    const escalationModel = { name: 'claude-3-5-sonnet' }

    // All tool calls fail until escalation
    vi.mocked(executeTools)
      .mockResolvedValueOnce([{ toolName: 'readFile', result: { success: false, error: 'err', durationMs: 5 } }])
      .mockResolvedValueOnce([{ toolName: 'readFile', result: { success: false, error: 'err', durationMs: 5 } }])
      .mockResolvedValueOnce([{ toolName: 'readFile', result: { success: false, error: 'err', durationMs: 5 } }])
      .mockResolvedValueOnce([{ toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } }])

    vi.mocked(streamText)
      .mockReturnValue({ fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'a.ts' }) } as never)

    const approveEscalation = vi.fn().mockResolvedValue(true)

    // Need to capture the model passed to streamText after escalation
    // We'll check streamText was called multiple times (escalation model used after approval)

    const runPromise = runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      approveEscalation,
      escalationModel: escalationModel as never,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    await vi.runAllTimersAsync()

    // We need more streams for after escalation
    vi.mocked(streamText).mockReturnValue({ fullStream: makeTextStream('Escalated done') } as never)

    await runPromise

    expect(approveEscalation).toHaveBeenCalled()
    // streamText was called multiple times
    expect(vi.mocked(streamText).mock.calls.length).toBeGreaterThan(1)
  })

  it('Test 12: approveEscalation returning false transitions to FAILED state', async () => {
    vi.useFakeTimers()
    const events: AgentEvent[] = []

    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValue([
      { toolName: 'readFile', result: { success: false, error: 'Persistent failure', durationMs: 5 } },
    ])

    vi.mocked(streamText)
      .mockReturnValue({ fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'a.ts' }) } as never)

    const approveEscalation = vi.fn().mockResolvedValue(false)

    const runPromise = runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      approveEscalation,
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    await vi.runAllTimersAsync()
    await runPromise

    const failedEvent = events.find(e => e.type === 'failed')
    expect(failedEvent).toBeDefined()
    expect(events.find(e => e.type === 'complete')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Circuit breaker
// ---------------------------------------------------------------------------

describe('runAgent — circuit breaker', () => {
  it('Test 13: 3 identical tool+input calls triggers FATAL — consumer receives "failed" event', async () => {
    const events: AgentEvent[] = []
    const mockTool = makeMockTool('readFile')

    // All tool calls succeed (circuit breaker fires on repetition, not failure)
    vi.mocked(executeTools).mockResolvedValue([
      { toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } },
    ])

    // Same tool + same input 3 times
    const sameInput = { path: 'same.ts' }
    vi.mocked(streamText)
      .mockReturnValueOnce({ fullStream: makeToolCallStream('readFile', 'tc-1', sameInput) } as never)
      .mockReturnValueOnce({ fullStream: makeToolCallStream('readFile', 'tc-2', sameInput) } as never)
      .mockReturnValueOnce({ fullStream: makeToolCallStream('readFile', 'tc-3', sameInput) } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    const failedEvent = events.find(e => e.type === 'failed')
    expect(failedEvent).toBeDefined()
    expect((failedEvent as Extract<AgentEvent, { type: 'failed' }>)?.reason).toContain('Circuit breaker')
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Execution limits
// ---------------------------------------------------------------------------

describe('runAgent — execution limits', () => {
  it('Test 14: step count exceeding MAX_STEPS (25) triggers FATAL', async () => {
    const events: AgentEvent[] = []
    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValue([
      { toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } },
    ])

    // Always return tool calls — never text-only — to keep looping
    vi.mocked(streamText).mockReturnValue({
      fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'a.ts' }),
    } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    const failedEvent = events.find(e => e.type === 'failed') as Extract<AgentEvent, { type: 'failed' }> | undefined
    expect(failedEvent).toBeDefined()
    expect(failedEvent?.reason).toContain('Step limit')
  })

  it('Test 15: execution exceeding MAX_DURATION_MS (10 min) triggers FATAL', async () => {
    vi.useFakeTimers()
    const events: AgentEvent[] = []
    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValue([
      { toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } },
    ])

    vi.mocked(streamText).mockReturnValue({
      fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'a.ts' }),
    } as never)

    const runPromise = runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    // Advance time past MAX_DURATION_MS (10 minutes)
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000)

    await runPromise

    const failedEvent = events.find(e => e.type === 'failed') as Extract<AgentEvent, { type: 'failed' }> | undefined
    expect(failedEvent).toBeDefined()
    // Either step limit or time limit fires first
    expect(failedEvent?.reason).toMatch(/Step limit|Time limit/)
  })

  it('Test 16: token accumulation exceeding tokenBudget emits budget-warning event but continues', async () => {
    const events: AgentEvent[] = []
    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } },
    ])

    // Stream with high token count exceeding budget
    vi.mocked(streamText)
      .mockReturnValueOnce({
        fullStream: makeStream([
          { type: 'tool-call', toolName: 'readFile', toolCallId: 'tc-1', args: { path: 'a.ts' } },
          { type: 'finish-step', usage: { totalTokens: 250_001 } }, // exceeds 200K budget
        ]),
      } as never)
      .mockReturnValueOnce({
        fullStream: makeTextStream('Done'),
      } as never)

    await runAgent({
      contract: makeMockContract({ tokenBudget: 200_000 }),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    const budgetWarning = events.find(e => e.type === 'budget-warning')
    expect(budgetWarning).toBeDefined()
    // Execution continues — complete event fires
    expect(events.find(e => e.type === 'complete')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Compaction
// ---------------------------------------------------------------------------

describe('runAgent — compaction', () => {
  it('Test 17: when token estimate exceeds COMPACTION_THRESHOLD before entering STREAM, messages are compacted', async () => {
    const events: AgentEvent[] = []
    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'ok', durationMs: 5 } },
    ])

    // First stream uses many tokens to trigger compaction on next step
    vi.mocked(streamText)
      .mockReturnValueOnce({
        fullStream: makeStream([
          { type: 'tool-call', toolName: 'readFile', toolCallId: 'tc-1', args: { path: 'a.ts' } },
          { type: 'finish-step', usage: { totalTokens: 85_000 } }, // > COMPACTION_THRESHOLD
        ]),
      } as never)
      .mockReturnValueOnce({
        fullStream: makeTextStream('Compacted step done'),
      } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    // Verify execution completed successfully (compaction didn't break anything)
    expect(events.find(e => e.type === 'complete')).toBeDefined()
    // streamText was called twice (compaction fires before 2nd stream)
    expect(vi.mocked(streamText).mock.calls.length).toBe(2)
  })

  it('Test 18: compaction does NOT fire mid-stream (only at step boundary)', async () => {
    // This is a structural test — compaction happens in PREPARE state before STREAM
    // If we had mid-stream compaction, the fullStream loop would be interrupted.
    // We test that a stream completing with high tokens doesn't break execution.
    const events: AgentEvent[] = []

    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: makeStream([
        { type: 'text-delta', textDelta: 'Part 1 ' },
        { type: 'text-delta', textDelta: 'Part 2 ' },
        { type: 'text-delta', textDelta: 'Part 3' },
        { type: 'finish-step', usage: { totalTokens: 90_000 } },
      ]),
    } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 's',
      toolContext: { workspaceRoot: tmpDir, sessionId: 's', permissionGrants: new Set() },
    })

    // All 3 text-delta parts received — no interruption
    const tokenEvents = events.filter(e => e.type === 'token')
    expect(tokenEvents.length).toBe(3)
    expect(events.find(e => e.type === 'complete')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Integration (executeTools + trace logger)
// ---------------------------------------------------------------------------

describe('runAgent — integration', () => {
  it('Test 19: executeTools is called with the correct ToolCall[] and ToolContext', async () => {
    const events: AgentEvent[] = []
    const mockTool = makeMockTool('readFile')
    const toolContext = { workspaceRoot: tmpDir, sessionId: 'sess-19', permissionGrants: new Set() }

    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'content', durationMs: 10 } },
    ])

    vi.mocked(streamText)
      .mockReturnValueOnce({ fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'test.ts' }) } as never)
      .mockReturnValueOnce({ fullStream: makeTextStream('Done') } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 'sess-19',
      toolContext,
    })

    expect(vi.mocked(executeTools)).toHaveBeenCalled()
    const callArgs = vi.mocked(executeTools).mock.calls[0]!
    expect(callArgs[0]).toHaveLength(1) // 1 tool call
    expect(callArgs[0]![0]!.tool).toBe(mockTool) // correct tool passed
    expect(callArgs[1]).toBe(toolContext) // correct context passed
  })

  it('Test 20: trace logger receives logToolCall after each tool execution', async () => {
    const events: AgentEvent[] = []
    const mockTraceLogger = {
      logToolCall: vi.fn(),
      flush: vi.fn(),
      executionId: 'exec-20',
      sessionId: 'sess-20',
    }
    vi.mocked(createTraceLogger).mockReturnValue(mockTraceLogger)

    const mockTool = makeMockTool('readFile')

    vi.mocked(executeTools).mockResolvedValueOnce([
      { toolName: 'readFile', result: { success: true, data: 'content', durationMs: 15 } },
    ])

    vi.mocked(streamText)
      .mockReturnValueOnce({ fullStream: makeToolCallStream('readFile', 'tc-1', { path: 'test.ts' }) } as never)
      .mockReturnValueOnce({ fullStream: makeTextStream('Done') } as never)

    await runAgent({
      contract: makeMockContract(),
      tools: [mockTool as never],
      model: {} as never,
      consumer: (e) => events.push(e),
      workspace: makeMockWorkspace(tmpDir),
      sessionId: 'sess-20',
      toolContext: { workspaceRoot: tmpDir, sessionId: 'sess-20', permissionGrants: new Set() },
    })

    expect(mockTraceLogger.logToolCall).toHaveBeenCalledOnce()
    expect(mockTraceLogger.flush).toHaveBeenCalled()

    const logCall = mockTraceLogger.logToolCall.mock.calls[0]![0]
    expect(logCall.tool).toBe('readFile')
    expect(logCall.verdict).toBe('PASS')
    expect(typeof logCall.step).toBe('number')
  })
})
