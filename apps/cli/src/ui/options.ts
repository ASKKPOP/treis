import type { Interface as ReadlineInterface } from 'node:readline/promises'
import type { PlanOption } from '@treis/core'

export function displayOptions(options: PlanOption[]): void {
  process.stdout.write('\n========== PLAN OPTIONS ==========\n')
  for (const opt of options) {
    process.stdout.write(`\n  [${opt.label}] ${opt.archetype} — ${opt.title}\n`)
    process.stdout.write(`      ${opt.description}\n`)
    process.stdout.write(`      Tradeoffs: ${opt.tradeoffs}\n`)
    process.stdout.write(`      Estimated steps: ${opt.estimatedSteps}\n`)
  }
  process.stdout.write('\n==================================\n')
}

export async function selectOption(
  rl: ReadlineInterface,
  options: PlanOption[],
): Promise<PlanOption> {
  let pick: PlanOption | undefined
  while (!pick) {
    const answer = await rl.question('\nChoose option (1/2/3 or A/B/C): ')
    const normalized = answer.trim().toUpperCase()
    const byNumber = options[parseInt(normalized, 10) - 1]
    const byLetter = options.find((o) => o.label === normalized)
    pick = byNumber ?? byLetter
    if (!pick) process.stdout.write('  Invalid choice. Try again.\n')
  }
  return pick
}
