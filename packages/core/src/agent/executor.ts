import { streamText } from 'ai'
import type { ModelMessage, ToolSet } from 'ai'
import { ulid } from 'ulid'
import { StateMachine } from './state-machine.js'
import { CircuitBreaker } from './circuit-breaker.js'
import { createRetryHandler, buildRetryInjection } from './retry.js'
import type { RetryHandler } from './retry.js'
import { checkToolScope } from '../plan-contract/scope-checker.js'
import { createTraceLogger } from '../session/trace-logger.js'
import { saveCheckpoint } from '../session/checkpoint.js'
import { executeTools } from '@treis/tools'
import type { Tool } from '@treis/tools'
import type {
  AgentRunOptions,
  AgentConsumer,
  ViolationDecision,
} from './types.js'
import { AgentState, EXECUTION_LIMITS } from './types.js'
import type { ScopeViolation } from '../plan-contract/scope-checker.js'
import type { PlanContract } from '../plan-contract/schema.js'

// ---------------------------------------------------------------------------
// Main executor (D-11, AGENT-01 through AGENT-08)
// ---------------------------------------------------------------------------

/**
 * Run the agent execution loop for a sealed Plan Contract.
 *
 * State transitions:
 *   IDLE → PREPARE → STREAM → [TOOLS →] EVALUATE → NEXT → PREPARE → ... → COMPLETE
 *   EVALUATE → FAILED or VIOLATED on error/violation.
 *
 * Execution limits (D-17, AGENT-07, T-02-13):
 *   - MAX_STEPS (25): step limit → FATAL
 *   - MAX_DURATION_MS (10min): time limit → FATAL
 *   - TOKEN_BUDGET: warning emitted when exceeded, execution continues (D-04)
 *
 * Retry (D-14, AGENT-04):
 *   - 3 retries with exponential backoff (1s/2s/4s)
 *   - 3rd failure offers escalation (AGENT-05)
 *
 * Circuit breaker (D-16, AGENT-06, T-02-14):
 *   - 3 consecutive identical tool+input calls → FATAL
 *
 * Scope checking (D-18, PLAN-06, T-02-15):
 *   - checkToolScope() runs before every tool dispatch
 *
 * Compaction (D-13, AGENT-08):
 *   - Only at step boundaries before STREAM
 *   - Fires when totalTokensUsed > COMPACTION_THRESHOLD
 */
export async function runAgent(options: AgentRunOptions): Promise<void> {
  const {
    contract,
    tools,
    consumer,
    approveEscalation,
    handleViolation,
    workspace,
    sessionId,
    toolContext,
  } = options

  let currentModel = options.model
  const executionId = ulid()
  const sm = new StateMachine()
  const cb = new CircuitBreaker()
  const retryHandler = createRetryHandler()
  const traceLogger = createTraceLogger(workspace.tracesDir, executionId, sessionId)

  // Per-execution tracking
  let step = 0
  let totalTokensUsed = 0
  let retryCount = 0
  const startTime = Date.now()

  // Track whether we're in a terminal state
  let terminated = false

  // Conversation history (grows across steps)
  const messages: Array<{ role: string; content: unknown }> = [
    {
      role: 'system',
      content: buildSystemContext(contract),
    },
  ]

  // Build AI SDK ToolSet from Tool[]
  const toolDefinitions = buildToolSet(tools)

  // --- Begin loop: IDLE → PREPARE ---
  sm.transition(AgentState.PREPARE)

  while (!terminated) {
    // -------------------------------------------------------------------------
    // Check execution limits before each step (D-17, AGENT-07, T-02-13)
    // -------------------------------------------------------------------------
    if (step >= EXECUTION_LIMITS.MAX_STEPS) {
      consumer({ type: 'failed', reason: `Step limit exceeded (${EXECUTION_LIMITS.MAX_STEPS})`, step })
      terminated = true
      break
    }
    if (Date.now() - startTime > EXECUTION_LIMITS.MAX_DURATION_MS) {
      consumer({ type: 'failed', reason: `Time limit exceeded (${EXECUTION_LIMITS.MAX_DURATION_MS}ms)`, step })
      terminated = true
      break
    }

    step++

    // -------------------------------------------------------------------------
    // PREPARE → STREAM (with compaction check before entering STREAM)
    // -------------------------------------------------------------------------
    if (sm.state === AgentState.NEXT) {
      sm.transition(AgentState.PREPARE)
    }
    // sm.state is PREPARE here

    // Compaction fires only at step boundaries before entering STREAM (D-13)
    if (totalTokensUsed > EXECUTION_LIMITS.COMPACTION_THRESHOLD) {
      compactMessages(messages)
    }

    sm.transition(AgentState.STREAM)

    // -------------------------------------------------------------------------
    // STREAM: Consume fullStream from AI SDK (D-11, AGENT-02)
    // -------------------------------------------------------------------------
    const toolCalls: Array<{ toolName: string; toolCallId: string; input: unknown }> = []
    let stepTokens = 0
    let stepText = ''
    let streamError: unknown = null

    try {
      const result = streamText({
        model: currentModel as Parameters<typeof streamText>[0]['model'],
        messages: messages as unknown as ModelMessage[],
        tools: toolDefinitions as unknown as ToolSet,
        maxRetries: 0, // Agent handles retries — don't let SDK retry
      })

      // fullStream must be consumed in a single for-await loop (Pitfall 3)
      for await (const part of result.fullStream) {
        const p = part as {
          type: string
          textDelta?: string
          toolName?: string
          toolCallId?: string
          args?: unknown
          usage?: { totalTokens?: number }
          error?: unknown
        }

        switch (p.type) {
          case 'text-delta':
            if (p.textDelta) {
              consumer({ type: 'token', content: p.textDelta, step })
              stepText += p.textDelta
            }
            break

          case 'tool-call':
            toolCalls.push({
              toolName: p.toolName!,
              toolCallId: p.toolCallId!,
              input: p.args,
            })
            consumer({ type: 'tool-start', toolName: p.toolName!, input: p.args, step })
            break

          case 'finish-step':
            stepTokens += p.usage?.totalTokens ?? 0
            break

          case 'error':
            streamError = p.error
            break
        }
      }

      totalTokensUsed += stepTokens
    } catch (err) {
      streamError = err
    }

    // Token budget check — emit warning but DO NOT halt (D-04, PLAN-08)
    if (totalTokensUsed > contract.tokenBudget) {
      consumer({ type: 'budget-warning', usedTokens: totalTokensUsed, budgetTokens: contract.tokenBudget })
    }

    // Append assistant text to history if any
    if (stepText) {
      messages.push({ role: 'assistant', content: stepText })
    }

    // Handle stream-level errors as step failures
    if (streamError) {
      // Need to be in EVALUATE to transition to FAILED/NEXT
      sm.transition(AgentState.EVALUATE)

      const outcome = await handleStepFailure({
        sm,
        retryHandler,
        retryCount,
        step,
        errorType: 'StreamError',
        errorMessage: String(streamError),
        consumer,
        messages,
        approveEscalation,
        currentModel,
        escalationModel: options.escalationModel,
        setModel: (m) => { currentModel = m },
      })
      if (outcome === 'retry') {
        retryCount++
        // sm is now in NEXT state
        continue
      }
      terminated = true
      break
    }

    // -------------------------------------------------------------------------
    // TOOLS: Dispatch tool calls with scope checking and circuit breaker
    // -------------------------------------------------------------------------
    if (toolCalls.length > 0) {
      sm.transition(AgentState.TOOLS)

      let stopForViolation = false
      let stopForCircuitBreaker = false
      let stepFailed = false
      let stepFailureError = ''

      for (const tc of toolCalls) {
        // Scope pre-hook (D-18, PLAN-06, T-02-15)
        const violation = await checkToolScope(tc.toolName, tc.input, contract)
        if (violation) {
          consumer({ type: 'violation', violation })

          let decision: ViolationDecision = 'stop'
          if (handleViolation) {
            decision = await handleViolation(violation)
          }

          if (decision === 'continue') {
            // Advisory violation — log and proceed with this tool call
          } else {
            // 'stop' or 'amend' — halt after VIOLATED state
            sm.transition(AgentState.EVALUATE)
            sm.transition(AgentState.VIOLATED)
            stopForViolation = true
            break
          }
        }

        // Circuit breaker check (D-16, AGENT-06, T-02-14)
        const cbResult = cb.record(tc.toolName, tc.input)
        if (cbResult.triggered) {
          consumer({
            type: 'failed',
            reason: `Circuit breaker: tool "${tc.toolName}" called ${cbResult.count} consecutive times with identical input`,
            step,
          })
          stopForCircuitBreaker = true
          break
        }

        // Find tool definition
        const tool = tools.find((t) => t.name === tc.toolName)
        if (!tool) {
          // Unknown tool — log as FAIL
          traceLogger.logToolCall({
            step,
            tool: tc.toolName,
            input: JSON.stringify(tc.input).slice(0, 200),
            output: `Unknown tool: ${tc.toolName}`,
            verdict: 'FAIL',
            durationMs: 0,
          })
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              toolCallId: tc.toolCallId,
              result: `Error: Unknown tool "${tc.toolName}"`,
            }),
          })
          stepFailed = true
          stepFailureError = `Unknown tool: ${tc.toolName}`
          continue
        }

        // Execute tool via @treis/tools (D-12, AGENT-03)
        const [execResult] = await executeTools([{ tool, input: tc.input }], toolContext)
        const toolResult = execResult!.result

        consumer({
          type: 'tool-result',
          toolName: tc.toolName,
          output: toolResult.data ?? toolResult.error,
          success: toolResult.success,
          step,
        })

        // Trace log — truncated for security (T-02-16, D-22)
        traceLogger.logToolCall({
          step,
          tool: tc.toolName,
          input: JSON.stringify(tc.input).slice(0, 200),
          output: JSON.stringify(toolResult.data ?? toolResult.error).slice(0, 500),
          verdict: toolResult.success ? 'PASS' : 'FAIL',
          durationMs: toolResult.durationMs,
        })

        // Append tool result to messages for next model turn
        messages.push({
          role: 'tool',
          content: JSON.stringify({
            toolCallId: tc.toolCallId,
            result: toolResult.data ?? toolResult.error,
          }),
        })

        if (!toolResult.success) {
          stepFailed = true
          stepFailureError = toolResult.error ?? 'Tool execution failed'
        }
      }

      if (stopForViolation) {
        terminated = true
        break
      }

      if (stopForCircuitBreaker) {
        terminated = true
        break
      }

      // -----------------------------------------------------------------------
      // EVALUATE: Determine step verdict
      // -----------------------------------------------------------------------
      sm.transition(AgentState.EVALUATE)

      if (stepFailed) {
        // Handle tool execution failure — retry or FAILED
        const outcome = await handleStepFailure({
          sm,
          retryHandler,
          retryCount,
          step,
          errorType: 'ToolExecutionError',
          errorMessage: stepFailureError,
          consumer,
          messages,
          approveEscalation,
          currentModel,
          escalationModel: options.escalationModel,
          setModel: (m) => { currentModel = m },
        })
        if (outcome === 'retry') {
          retryCount++
          // Clear circuit breaker on retry — same tool may be called again intentionally
          cb.clear()
          // sm is now in NEXT state
          // Decrement step so it increments back to same step on retry
          step--
          continue
        }
        terminated = true
        break
      }

      // Successful step — do NOT clear circuit breaker here; it tracks across steps
      // to catch infinite loops (Tool 13 behavior). Only cleared on retry or at
      // end of execution.
      retryCount = 0
      consumer({ type: 'step-complete', step, verdict: 'PASS' })

      // Save checkpoint after successful EVALUATE (SESS-05)
      await saveCheckpoint(workspace.root, {
        stepNumber: step,
        stepStatus: 'completed',
        timestamp: Date.now(),
        executionId,
        state: { totalTokensUsed, messagesLength: messages.length },
      })

      sm.transition(AgentState.NEXT)

    } else {
      // Text-only step — no tool calls — STREAM → EVALUATE → COMPLETE (Pitfall 5)
      sm.transition(AgentState.EVALUATE)

      retryCount = 0
      consumer({ type: 'step-complete', step, verdict: 'PASS' })

      await saveCheckpoint(workspace.root, {
        stepNumber: step,
        stepStatus: 'completed',
        timestamp: Date.now(),
        executionId,
        state: { totalTokensUsed, messagesLength: messages.length },
      })

      sm.transition(AgentState.COMPLETE)
      consumer({ type: 'complete', totalSteps: step })
      terminated = true
    }
  }

  // Final event for tool-loop completion path
  if (sm.state === AgentState.COMPLETE && !terminated) {
    consumer({ type: 'complete', totalSteps: step })
  }

  traceLogger.flush()
}

// ---------------------------------------------------------------------------
// Step failure handler (D-14, AGENT-04, AGENT-05)
// ---------------------------------------------------------------------------

interface StepFailureOptions {
  sm: StateMachine
  retryHandler: RetryHandler
  retryCount: number
  step: number
  errorType: string
  errorMessage: string
  consumer: AgentConsumer
  messages: Array<{ role: string; content: unknown }>
  approveEscalation: ((reason: string) => Promise<boolean>) | undefined
  currentModel: unknown
  escalationModel: unknown | undefined
  setModel: (model: unknown) => void
}

/**
 * Handle a step failure: retry with backoff or offer escalation.
 * Returns 'retry' if execution should continue, 'failed' if it should halt.
 *
 * IMPORTANT: sm must be in EVALUATE state when called.
 * On 'retry' return: sm transitions to NEXT.
 * On 'failed' return: sm transitions to FAILED.
 */
async function handleStepFailure(opts: StepFailureOptions): Promise<'retry' | 'failed'> {
  const {
    sm,
    retryHandler,
    retryCount,
    step,
    errorType,
    errorMessage,
    consumer,
    messages,
    approveEscalation,
    escalationModel,
    setModel,
  } = opts

  const nextAttempt = retryCount + 1

  if (retryHandler.shouldRetry(nextAttempt)) {
    // Inject error context for the model (D-14, T-02-11)
    const injection = buildRetryInjection('step', errorType, errorMessage, nextAttempt)
    messages.push(injection)
    consumer({ type: 'retry', step, attempt: nextAttempt, reason: errorMessage })

    // Exponential backoff delay
    const backoffMs = retryHandler.getBackoffMs(nextAttempt)
    await new Promise<void>((resolve) => setTimeout(resolve, backoffMs))

    // Transition from EVALUATE to NEXT for retry
    sm.transition(AgentState.NEXT)
    return 'retry'
  }

  // Max retries reached — offer escalation (D-15, AGENT-05)
  if (retryHandler.shouldEscalate(nextAttempt)) {
    const reason = `Step ${step} failed after ${EXECUTION_LIMITS.MAX_RETRIES} retries: ${errorMessage}`
    consumer({ type: 'escalation-required', reason })

    if (approveEscalation) {
      const approved = await approveEscalation(reason)
      if (approved && escalationModel) {
        setModel(escalationModel)
        consumer({ type: 'retry', step, attempt: nextAttempt, reason: 'Escalated to cloud model' })
        sm.transition(AgentState.NEXT)
        return 'retry'
      }
    }
  }

  // No more retries, no escalation — FAILED
  consumer({ type: 'failed', reason: errorMessage, step })
  sm.transition(AgentState.FAILED)

  return 'failed'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSystemContext(contract: PlanContract): string {
  return [
    'You are executing a sealed Plan Contract.',
    `Intent: ${contract.intent}`,
    'Success criteria:',
    ...contract.successCriteria.map((c, i) => `  ${i + 1}. ${c}`),
    '',
    'Execute the plan step by step. Use the available tools to accomplish each step.',
    'When all success criteria are met, provide a final summary without using tools.',
  ].join('\n')
}

/**
 * Build an AI SDK v5 ToolSet from an array of Tool objects.
 * ToolSet shape: Record<string, { description, parameters, execute? }>
 */
function buildToolSet(tools: Tool[]): Record<string, { description: string; parameters: unknown }> {
  const defs: Record<string, { description: string; parameters: unknown }> = {}
  for (const tool of tools) {
    defs[tool.name] = {
      description: tool.description,
      parameters: tool.inputSchema,
    }
  }
  return defs
}

/**
 * Compact message history to reduce token consumption (D-13, AGENT-08).
 * Simple strategy: keep system prompt + last 3 messages.
 * Phase 2+: LLM-based summarization.
 *
 * Security: called only at step boundaries, never mid-stream (T-02-17).
 */
function compactMessages(messages: Array<{ role: string; content: unknown }>): void {
  if (messages.length <= 4) return // Nothing to compact
  const systemMessage = messages[0]! // Always keep system prompt
  const recentMessages = messages.slice(-3) // Keep last 3 messages for context
  messages.length = 0
  messages.push(systemMessage, ...recentMessages)
}
