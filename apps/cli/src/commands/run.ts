import { createCliInterface } from '../input.js'
import { runDialogue } from '../ui/dialogue.js'
import { displayOptions, selectOption } from '../ui/options.js'
import { createPlanContractEngine, bootstrapWorkspace } from '@treis/core'
import type { PlanContract } from '@treis/core'
import { createSlotManager } from '@treis/api-client'
import { ulid } from 'ulid'

export async function runCommand(task: string): Promise<void> {
  const rl = createCliInterface()

  try {
    // 1. Bootstrap workspace
    const workspaceId = ulid()
    const workspace = await bootstrapWorkspace(workspaceId)

    // 2. Initialize model from env vars
    const provider = (process.env.TREIS_MODEL_PROVIDER ?? 'ollama') as 'ollama' | 'anthropic'
    const modelId = process.env.TREIS_MODEL_ID ?? 'llama3.2'
    const slotManager = createSlotManager({
      slotA: { slot: 'A', provider, modelId, role: 'strongest' },
      slotB: { slot: 'B', provider, modelId, role: 'fastest' },
    })
    const adapter = slotManager.getAdapter('A')
    const model = adapter.getModel(slotManager.getModelId('A'))

    // 3. Plan Contract negotiation
    const engine = createPlanContractEngine({
      model,
      workspace: { planContractsDir: workspace.planContractsDir },
    })

    // Phase A: Clarify
    process.stdout.write('\nThinking about your task...\n')
    const { questions } = await engine.clarify(task)
    const answers = await runDialogue(rl, questions)
    const clarifications = questions.map((q, i) => ({
      question: q,
      answer: answers[i] ?? '',
    }))

    // Phase B: Propose options
    process.stdout.write('\nGenerating plan options...\n')
    const { options } = await engine.propose(task, clarifications)
    displayOptions(options)
    const selected = await selectOption(rl, options)

    // Phase C: Seal contract
    const contract: PlanContract = await engine.seal(task, clarifications, selected)
    process.stdout.write(`\nContract sealed: ${contract.id}\n`)
    process.stdout.write(`Saved to: ${workspace.planContractsDir}/${contract.id}.json\n`)

    // TODO: Plan 02 adds execution stream (runAgent) + result screen here

  } finally {
    rl.close()
  }
}
