import type { PlanContract } from '@treis/core'

export function renderResultScreen(contract: PlanContract, totalSteps: number): void {
  process.stdout.write('\n========== RESULT ==========\n')
  process.stdout.write(`Completed in ${totalSteps} steps.\n\n`)
  process.stdout.write('Success Criteria:\n')
  for (const criterion of contract.successCriteria) {
    process.stdout.write(`  [ ] ${criterion}\n`)
  }
  process.stdout.write('\nVerify criteria above before marking complete.\n')
  process.stdout.write('============================\n')
}
