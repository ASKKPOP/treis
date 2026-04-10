import type { Interface as ReadlineInterface } from 'node:readline/promises'
import type { ViolationDecision, ScopeViolation } from '@treis/core'

export function buildViolationHandler(
  rl: ReadlineInterface,
): (violation: ScopeViolation) => Promise<ViolationDecision> {
  return async (violation: ScopeViolation): Promise<ViolationDecision> => {
    process.stdout.write('\n\n--- CONTRACT VIOLATION ---\n')
    process.stdout.write(`Tool: ${violation.toolName}\n`)
    process.stdout.write(`Reason: ${violation.details}\n\n`)
    process.stdout.write('Options:\n')
    process.stdout.write('  1) Stop execution\n')
    process.stdout.write('  2) Amend scope and continue\n')
    process.stdout.write('  3) Continue (override for this call only)\n')

    let decision: ViolationDecision | undefined
    while (!decision) {
      const answer = await rl.question('\nChoice (1/2/3): ')
      switch (answer.trim()) {
        case '1':
          decision = 'stop'
          break
        case '2':
          decision = 'amend'
          break
        case '3':
          decision = 'continue'
          break
        default:
          process.stdout.write('Invalid. Enter 1, 2, or 3.\n')
      }
    }
    return decision
  }
}

export function buildEscalationHandler(
  rl: ReadlineInterface,
): (reason: string) => Promise<boolean> {
  return async (reason: string): Promise<boolean> => {
    process.stdout.write(`\n\nEscalation requested: ${reason}\n`)
    const answer = await rl.question('Switch to cloud model (costs API credits)? (y/n): ')
    return answer.trim().toLowerCase() === 'y'
  }
}
