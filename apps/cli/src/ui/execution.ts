import type { PlanContract } from '@treis/core'

export function renderSealedContract(contract: PlanContract): void {
  process.stdout.write('\n========== SEALED CONTRACT ==========\n')
  process.stdout.write(`ID: ${contract.id}\n`)
  process.stdout.write(`Intent: ${contract.intent}\n`)
  process.stdout.write(`Option: ${contract.selectedOption}\n\n`)
  process.stdout.write('Scope:\n')
  for (const entry of contract.scopeEntries) {
    switch (entry.type) {
      case 'file':
        process.stdout.write(`  file: ${entry.glob}\n`)
        break
      case 'tool':
        process.stdout.write(`  tool: ${entry.name}\n`)
        break
      case 'url':
        process.stdout.write(`  url: ${entry.pattern}\n`)
        break
      case 'action':
        process.stdout.write(`  action: ${entry.description}\n`)
        break
    }
  }
  process.stdout.write('\nSuccess Criteria:\n')
  contract.successCriteria.forEach((c, i) =>
    process.stdout.write(`  ${i + 1}. ${c}\n`)
  )
  process.stdout.write('=====================================\n\n')
}
