import { generateObject } from 'ai'
import { writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { WorkspaceLayout } from '../session/workspace.js'
import {
  PlanOptionsResponseSchema,
  createPlanContract,
  type PlanContract,
  type PlanOption,
  type ClarifyResponse,
  type PlanOptionsResponse,
} from './schema.js'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PlanContractEngineConfig {
  // Accept LanguageModelV3 from @ai-sdk/provider or any model object
  // The cast to 'any' is deliberate: AI SDK v5 accepts LanguageModelV3 but the
  // TypeScript overloads may require LanguageModel; runtime behaviour is correct.
  model: object
  workspace: Pick<WorkspaceLayout, 'planContractsDir'>
}

export interface PlanContractEngine {
  clarify(intent: string): Promise<ClarifyResponse>
  propose(
    intent: string,
    clarifications: PlanContract['clarifications'],
  ): Promise<PlanOptionsResponse>
  seal(
    intent: string,
    clarifications: PlanContract['clarifications'],
    selectedOption: PlanOption,
  ): Promise<PlanContract>
}

// ---------------------------------------------------------------------------
// System prompts (internal constants — not exposed to Builder, T-02-08)
// ---------------------------------------------------------------------------

const CLARIFY_SYSTEM_PROMPT = `You are a plan negotiation assistant for Treis, an AI work execution platform.

Given a user's intent (a one-sentence description of what they want to accomplish), generate 2-3 clarifying questions that would help you create better plan options. Focus on:
- Scope boundaries (what's included vs excluded)
- Quality preferences (speed vs thoroughness)
- Constraints (time, tools, resources)

Return exactly 2-3 questions. Be concise and specific.`

const OPTIONS_SYSTEM_PROMPT = `You are a plan negotiation assistant for Treis, an AI work execution platform.

Given the user's intent and their answers to clarifying questions, propose exactly 3 plan options:
- Option A (Fast): Minimal scope, fewest steps, quickest completion
- Option B (Balanced): Moderate scope, good coverage, reasonable time
- Option C (Thorough): Full scope, comprehensive coverage, most steps

Each option must include:
- label: 'A', 'B', or 'C'
- archetype: 'Fast', 'Balanced', or 'Thorough'
- title: Short descriptive title
- description: What the plan does
- tradeoffs: What you gain/lose with this option
- estimatedSteps: Number of execution steps (1-50)
- scopeEntries: Array of scope boundaries (file globs, tool names, URLs, actions)
- successCriteria: Array of measurable completion criteria`

// ---------------------------------------------------------------------------
// Internal schema: looser version of ClarifyResponseSchema for the AI call
// The strict schema (max:3) is enforced AFTER we truncate to 3 questions (D-07)
// ---------------------------------------------------------------------------
const ClarifyResponseSchemaInternal = z.object({
  questions: z.array(z.string()).min(2),
})

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPlanContractEngine(
  config: PlanContractEngineConfig,
): PlanContractEngine {
  const { model, workspace } = config

  return {
    async clarify(intent: string): Promise<ClarifyResponse> {
      const { object } = await generateObject({
        // Cast: LanguageModelV3 satisfies the AI SDK v5 model type at runtime
        model: model as Parameters<typeof generateObject>[0]['model'],
        schema: ClarifyResponseSchemaInternal,
        system: CLARIFY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: intent }],
      })

      // Truncate to max 3 questions per D-07
      const questions = object.questions.length > 3
        ? object.questions.slice(0, 3)
        : object.questions

      return { questions }
    },

    async propose(
      intent: string,
      clarifications: PlanContract['clarifications'],
    ): Promise<PlanOptionsResponse> {
      const clarificationText = clarifications
        .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
        .join('\n\n')

      const { object } = await generateObject({
        model: model as Parameters<typeof generateObject>[0]['model'],
        schema: PlanOptionsResponseSchema,
        system: OPTIONS_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: intent },
          {
            role: 'user',
            content: `Here are my answers to your clarifying questions:\n\n${clarificationText}`,
          },
        ],
      })
      return object
    },

    async seal(
      intent: string,
      clarifications: PlanContract['clarifications'],
      selectedOption: PlanOption,
    ): Promise<PlanContract> {
      const contract = createPlanContract(intent, clarifications, selectedOption)

      // Atomic write: write to temp file then rename — T-02-05
      const contractPath = join(workspace.planContractsDir, `${contract.id}.json`)
      const tempPath = contractPath + '.tmp'
      await writeFile(tempPath, JSON.stringify(contract, null, 2), 'utf-8')
      await rename(tempPath, contractPath)

      return contract
    },
  }
}
