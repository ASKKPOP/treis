import type { AgentConsumer, AgentEvent } from '@treis/core'

export interface ConsumerState {
  totalSteps: number
}

export function buildConsumer(): { consumer: AgentConsumer; state: ConsumerState } {
  const state: ConsumerState = { totalSteps: 0 }

  const consumer: AgentConsumer = (event: AgentEvent) => {
    switch (event.type) {
      case 'token':
        process.stdout.write(event.content)
        break

      case 'tool-start':
        process.stdout.write(`\n[Step ${event.step}] Running ${event.toolName}...\n`)
        break

      case 'tool-result': {
        const status = event.success ? 'OK' : 'FAILED'
        process.stdout.write(`  ${event.toolName}: ${status}\n`)
        break
      }

      case 'step-complete':
        process.stdout.write(`\n[Step ${event.step}] Complete (${event.verdict})\n`)
        break

      case 'retry':
        process.stdout.write(`  Retry ${event.attempt}/3: ${event.reason}\n`)
        break

      case 'budget-warning':
        process.stdout.write(`\n  Warning: Token budget: ${event.usedTokens}/${event.budgetTokens}\n`)
        break

      case 'complete':
        state.totalSteps = event.totalSteps
        process.stdout.write(`\nExecution complete. ${event.totalSteps} steps.\n`)
        break

      case 'failed':
        process.stderr.write(`\nFailed at step ${event.step}: ${event.reason}\n`)
        break

      // 'violation' and 'escalation-required' are handled via callbacks in AgentRunOptions,
      // not here — avoids duplicate display (Pitfall 6 from research)
      case 'violation':
      case 'escalation-required':
        break
    }
  }

  return { consumer, state }
}
