import type { PlanContract } from '../plan-contract/schema.js'
import type { ScopeViolation } from '../plan-contract/scope-checker.js'
import type { Tool, ToolContext } from '@treis/tools'
import type { WorkspaceLayout } from '../session/workspace.js'

// ---------------------------------------------------------------------------
// Agent State (D-08, AGENT-01)
// Using const object instead of enum due to erasableSyntaxOnly constraint
// ---------------------------------------------------------------------------
export const AgentState = {
  IDLE: 'IDLE',
  PREPARE: 'PREPARE',
  STREAM: 'STREAM',
  TOOLS: 'TOOLS',
  EVALUATE: 'EVALUATE',
  NEXT: 'NEXT',
  COMPLETE: 'COMPLETE',
  VIOLATED: 'VIOLATED',
  FAILED: 'FAILED',
} as const

export type AgentState = (typeof AgentState)[keyof typeof AgentState]

// ---------------------------------------------------------------------------
// Step Verdict
// ---------------------------------------------------------------------------
export const StepVerdict = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  FATAL: 'FATAL',
} as const

export type StepVerdict = (typeof StepVerdict)[keyof typeof StepVerdict]

// ---------------------------------------------------------------------------
// Agent Events (D-11, AGENT-02)
// ---------------------------------------------------------------------------
export type AgentEvent =
  | { type: 'token'; content: string; step: number }
  | { type: 'tool-start'; toolName: string; input: unknown; step: number }
  | { type: 'tool-result'; toolName: string; output: unknown; success: boolean; step: number }
  | { type: 'step-complete'; step: number; verdict: StepVerdict }
  | { type: 'retry'; step: number; attempt: number; reason: string }
  | { type: 'violation'; violation: ScopeViolation }
  | { type: 'escalation-required'; reason: string }
  | { type: 'budget-warning'; usedTokens: number; budgetTokens: number }
  | { type: 'complete'; totalSteps: number }
  | { type: 'failed'; reason: string; step: number }

export type AgentConsumer = (event: AgentEvent) => void

// ---------------------------------------------------------------------------
// Violation Decision (re-exported from scope-checker for agent loop consumers)
// ---------------------------------------------------------------------------
export type { ScopeViolation }
export type ViolationDecision = 'stop' | 'amend' | 'continue'

// ---------------------------------------------------------------------------
// Agent Run Options (D-11, D-15, D-19)
// ---------------------------------------------------------------------------
export interface AgentRunOptions {
  contract: PlanContract
  tools: Tool[]
  // LanguageModelV3 — using any to avoid cross-package type coupling at Phase 0
  model: unknown
  consumer: AgentConsumer
  approveEscalation?: (reason: string) => Promise<boolean>
  handleViolation?: (violation: ScopeViolation) => Promise<ViolationDecision>
  // Cloud model for escalation (Slot B, deferred to Phase 2)
  escalationModel?: unknown
  workspace: WorkspaceLayout
  sessionId: string
  toolContext: ToolContext
}

// ---------------------------------------------------------------------------
// Execution Limits (D-17)
// ---------------------------------------------------------------------------
export const EXECUTION_LIMITS = {
  MAX_STEPS: 25,
  MAX_DURATION_MS: 10 * 60 * 1000, // 10 minutes
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: [1000, 2000, 4000] as const, // exponential backoff ms
  TOKEN_BUDGET_DEFAULT: 200_000,
  COMPACTION_THRESHOLD: 80_000, // tokens before compaction fires
  CIRCUIT_BREAKER_THRESHOLD: 3,
} as const
