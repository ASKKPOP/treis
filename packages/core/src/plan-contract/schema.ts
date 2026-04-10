import { z } from 'zod'
import { ulid } from 'ulid'

// ---------------------------------------------------------------------------
// ScopeEntry discriminated union (D-02, PLAN-05)
// Using Zod v4 discriminatedUnion for efficient parsing
// ---------------------------------------------------------------------------
export const ScopeEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), glob: z.string() }),
  z.object({ type: z.literal('tool'), name: z.string() }),
  z.object({ type: z.literal('url'), pattern: z.string() }),
  z.object({ type: z.literal('action'), description: z.string() }),
])
export type ScopeEntry = z.infer<typeof ScopeEntrySchema>

// ---------------------------------------------------------------------------
// Plan Contract schema (D-01, D-03)
// The sealed contract produced after the Builder picks an option
// ---------------------------------------------------------------------------
export const PlanContractSchema = z.object({
  id: z.string(),
  version: z.string().default('1.0'),
  intent: z.string().min(1),
  clarifications: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    })
  ),
  scopeEntries: z.array(ScopeEntrySchema),
  successCriteria: z.array(z.string()).min(1),
  tokenBudget: z.number().int().positive().default(200_000),
  selectedOption: z.enum(['A', 'B', 'C']),
  createdAt: z.string().datetime(),
  sealedAt: z.string().datetime(),
})
export type PlanContract = z.infer<typeof PlanContractSchema>

// ---------------------------------------------------------------------------
// Clarify response schema (for generateObject Phase A, D-07)
// The model returns 2–3 clarifying questions before generating options
// ---------------------------------------------------------------------------
export const ClarifyResponseSchema = z.object({
  questions: z.array(z.string()),
})
export type ClarifyResponse = z.infer<typeof ClarifyResponseSchema>

// ---------------------------------------------------------------------------
// Plan option schema (for generateObject Phase B, D-05/D-06)
// Three labelled options presented to the Builder
// ---------------------------------------------------------------------------
export const PlanOptionSchema = z.object({
  label: z.enum(['A', 'B', 'C']),
  archetype: z.enum(['Fast', 'Balanced', 'Thorough']),
  title: z.string().min(1),
  description: z.string().min(1),
  tradeoffs: z.string().min(1),
  estimatedSteps: z.number().int().min(1).max(50),
  scopeEntries: z.array(ScopeEntrySchema),
  successCriteria: z.array(z.string()).min(1),
})
export type PlanOption = z.infer<typeof PlanOptionSchema>

export const PlanOptionsResponseSchema = z.object({
  options: z.array(PlanOptionSchema),
})
export type PlanOptionsResponse = z.infer<typeof PlanOptionsResponseSchema>

// ---------------------------------------------------------------------------
// Factory function for sealing a contract (D-03, D-06)
// Called once the Builder selects an option — produces the immutable contract
// ---------------------------------------------------------------------------
export function createPlanContract(
  intent: string,
  clarifications: PlanContract['clarifications'],
  selectedOption: PlanOption,
): PlanContract {
  const now = new Date().toISOString()
  return PlanContractSchema.parse({
    id: ulid(),
    version: '1.0',
    intent,
    clarifications,
    scopeEntries: selectedOption.scopeEntries,
    successCriteria: selectedOption.successCriteria,
    tokenBudget: 200_000,
    selectedOption: selectedOption.label,
    createdAt: now,
    sealedAt: now,
  })
}
