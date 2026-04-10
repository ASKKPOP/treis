import { workerData, parentPort, receiveMessageOnPort, MessagePort } from 'node:worker_threads'
import { runAgent, createPlanContractEngine, bootstrapWorkspace } from '@treis/core'
import type { PlanContract, PlanOption } from '@treis/core'
import { createSlotManager } from '@treis/api-client'
import { FileReadTool, GlobTool, GrepTool, FileWriteTool, BashTool, PermissionTier } from '@treis/tools'
import type { ToolContext } from '@treis/tools'
import { ulid } from 'ulid'

const { payload, violationPort } = workerData as {
  payload: { action: string; data: unknown }
  violationPort: MessagePort
}
const { action, data } = payload

async function main(): Promise<void> {
  const provider = (process.env.TREIS_MODEL_PROVIDER ?? 'ollama') as 'ollama' | 'anthropic'
  const modelId = process.env.TREIS_MODEL_ID ?? 'llama3.2'
  const slotManager = createSlotManager({
    slotA: { slot: 'A', provider, modelId, role: 'strongest' },
    slotB: { slot: 'B', provider, modelId, role: 'fastest' },
  })
  const adapter = slotManager.getAdapter('A')
  const model = adapter.getModel(slotManager.getModelId('A'))

  const workspaceId = ulid()
  const workspace = await bootstrapWorkspace(workspaceId)

  const engine = createPlanContractEngine({
    model,
    workspace: { planContractsDir: workspace.planContractsDir },
  })

  if (action === 'clarify') {
    const result = await engine.clarify(data as string)
    parentPort!.postMessage({ type: 'clarify-response', questions: result.questions })
    return
  }

  if (action === 'propose') {
    const { intent, clarifications } = data as {
      intent: string
      clarifications: PlanContract['clarifications']
    }
    const result = await engine.propose(intent, clarifications)
    parentPort!.postMessage({ type: 'options-response', options: result.options })
    return
  }

  if (action === 'execute') {
    const { intent, clarifications, selectedOption } = data as {
      intent: string
      clarifications: PlanContract['clarifications']
      selectedOption: PlanOption
    }
    const contract = await engine.seal(intent, clarifications, selectedOption)
    parentPort!.postMessage({ type: 'contract-sealed', contract })

    const tools = [FileReadTool, GlobTool, GrepTool, FileWriteTool, BashTool]
    const toolContext: ToolContext = {
      workspaceRoot: process.cwd(),
      sessionId: workspaceId,
      permissionGrants: new Set([
        PermissionTier.ReadOnly,
        PermissionTier.WriteFiles,
        PermissionTier.ExecuteShell,
      ]),
    }

    await runAgent({
      contract,
      tools,
      model,
      consumer: (event) => parentPort!.postMessage(event),
      handleViolation: async (violation) => {
        parentPort!.postMessage({ type: 'violation', violation })
        // Block worker thread until renderer resolves violation via MessageChannel
        let msg: { message: unknown } | undefined
        while (!msg) {
          msg = receiveMessageOnPort(violationPort)
          if (!msg) {
            // Yield CPU briefly without blocking Node event loop in worker
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
          }
        }
        return msg.message as 'stop' | 'amend' | 'continue'
      },
      approveEscalation: async (reason) => {
        parentPort!.postMessage({ type: 'escalation-required', reason })
        // Phase 4: auto-decline escalation — no UI for escalation approval yet
        return false
      },
      workspace,
      sessionId: workspaceId,
      toolContext,
    })
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  parentPort!.postMessage({ type: 'failed', reason: message, step: 0 })
})
