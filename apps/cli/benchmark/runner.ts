import { runAgent, createPlanContract, bootstrapWorkspace } from '@treis/core'
import type { AgentConsumer, AgentEvent } from '@treis/core'
import { FileReadTool, GlobTool, GrepTool, FileWriteTool, BashTool, PermissionTier } from '@treis/tools'
import type { ToolContext } from '@treis/tools'
import { createSlotManager, checkModelHealth } from '@treis/api-client'
import { ulid } from 'ulid'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { BenchmarkFixture, BenchmarkResult, ExpectedOutcome } from './types.js'

function getSlotManager() {
  const provider = (process.env.TREIS_MODEL_PROVIDER ?? 'ollama') as 'ollama' | 'anthropic'
  const modelId = process.env.TREIS_MODEL_ID ?? 'llama3.2'
  return createSlotManager({
    slotA: { slot: 'A', provider, modelId, role: 'strongest' },
    slotB: { slot: 'B', provider, modelId, role: 'fastest' },
  })
}

export async function isModelAvailable(): Promise<boolean> {
  try {
    const sm = getSlotManager()
    const adapter = sm.getAdapter('A')
    const modelId = sm.getModelId('A')
    const health = await checkModelHealth(adapter, modelId)
    return health.connected
  } catch {
    return false
  }
}

async function checkOutcome(
  outcome: ExpectedOutcome,
  workspaceRoot: string,
  hadViolation: boolean,
): Promise<{ passed: boolean; reason?: string }> {
  switch (outcome.type) {
    case 'file-exists': {
      try {
        await access(join(workspaceRoot, outcome.path!))
        return { passed: true }
      } catch {
        return { passed: false, reason: `File not found: ${outcome.path}` }
      }
    }
    case 'file-contains': {
      try {
        const content = await readFile(join(workspaceRoot, outcome.path!), 'utf-8')
        const pattern = new RegExp(outcome.pattern!, 'i')
        if (pattern.test(content)) return { passed: true }
        return {
          passed: false,
          reason: `File ${outcome.path} does not match pattern: ${outcome.pattern}`,
        }
      } catch {
        return { passed: false, reason: `Cannot read file: ${outcome.path}` }
      }
    }
    case 'no-violation':
      return hadViolation
        ? { passed: false, reason: 'Scope violation occurred' }
        : { passed: true }
    case 'complete':
      return { passed: true } // If we reach outcome checking, execution completed
    default:
      return { passed: false, reason: `Unknown outcome type: ${(outcome as ExpectedOutcome).type}` }
  }
}

export async function runBenchmark(fixtures: BenchmarkFixture[]): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []
  const sm = getSlotManager()
  const adapter = sm.getAdapter('A')
  const model = adapter.getModel(sm.getModelId('A'))

  for (const fixture of fixtures) {
    const start = Date.now()
    let totalSteps = 0
    let hadViolation = false
    let failReason: string | undefined

    try {
      // Each fixture gets its own temp workspace to avoid cross-contamination (T-03-08)
      const workspaceId = ulid()
      const benchDir = join(tmpdir(), 'treis-benchmark')
      const workspace = await bootstrapWorkspace(workspaceId, benchDir)
      const workspaceRoot = workspace.root

      // Seal contract directly from fixture's planOption (skip AI negotiation)
      const contract = createPlanContract(
        fixture.intent,
        [{ question: 'Confirm task?', answer: 'Yes' }],
        fixture.planOption,
      )

      const tools = [
        FileReadTool,
        GlobTool,
        GrepTool,
        FileWriteTool,
        BashTool,
      ]

      const toolContext: ToolContext = {
        workspaceRoot,
        sessionId: workspaceId,
        permissionGrants: new Set([
          PermissionTier.ReadOnly,
          PermissionTier.WriteFiles,
          PermissionTier.ExecuteShell,
        ]),
      }

      const consumer: AgentConsumer = (event: AgentEvent) => {
        if (event.type === 'complete') totalSteps = event.totalSteps
        if (event.type === 'violation') hadViolation = true
      }

      await runAgent({
        contract,
        tools,
        model,
        consumer,
        handleViolation: async () => 'continue' as const,
        approveEscalation: async () => false,
        workspace,
        sessionId: workspaceId,
        toolContext,
      })

      // Check all expected outcomes
      let allPassed = true
      for (const outcome of fixture.expectedOutcomes) {
        const result = await checkOutcome(outcome, workspaceRoot, hadViolation)
        if (!result.passed) {
          allPassed = false
          failReason = result.reason
          break
        }
      }

      results.push({
        name: fixture.name,
        domain: fixture.domain,
        passed: allPassed,
        totalSteps,
        reason: failReason,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      results.push({
        name: fixture.name,
        domain: fixture.domain,
        passed: false,
        totalSteps,
        reason: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      })
    }
  }

  return results
}
