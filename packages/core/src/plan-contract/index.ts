export {
  PlanContractSchema,
  ScopeEntrySchema,
  PlanOptionSchema,
  PlanOptionsResponseSchema,
  ClarifyResponseSchema,
  createPlanContract,
} from './schema.js'
export type {
  PlanContract,
  ScopeEntry,
  PlanOption,
  PlanOptionsResponse,
  ClarifyResponse,
} from './schema.js'

export { checkToolScope } from './scope-checker.js'
export type {
  ScopeViolation,
  ViolationDecision,
} from './scope-checker.js'

export { createPlanContractEngine } from './engine.js'
export type {
  PlanContractEngine,
  PlanContractEngineConfig,
} from './engine.js'
