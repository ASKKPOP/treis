import type { PlanOption } from '@treis/core'

export interface ExpectedOutcome {
  type: 'file-exists' | 'file-contains' | 'no-violation' | 'complete'
  path?: string
  pattern?: string
  description: string
}

export interface BenchmarkFixture {
  name: string
  domain: 'code' | 'writing' | 'research' | 'data' | 'mixed'
  intent: string
  /** Pre-built PlanOption to skip the AI negotiation phase — benchmark tests execution only */
  planOption: PlanOption
  expectedOutcomes: ExpectedOutcome[]
}

export interface BenchmarkResult {
  name: string
  domain: string
  passed: boolean
  totalSteps: number
  reason?: string
  durationMs: number
}
