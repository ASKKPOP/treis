import { EXECUTION_LIMITS } from './types.js'

export interface CircuitBreakerResult {
  triggered: boolean
  count: number
  key: string
}

/**
 * Tracks consecutive identical tool calls per execution (D-16, AGENT-06).
 *
 * Key: `${toolName}:${JSON.stringify(input)}`
 * Threshold: N consecutive identical calls -> triggered=true (FATAL)
 * Cleared after each successful step or on explicit clear().
 *
 * Security: T-02-10 — 3-call threshold prevents infinite tool retry loops.
 */
export class CircuitBreaker {
  private counts = new Map<string, number>()
  private readonly threshold: number

  constructor(threshold = EXECUTION_LIMITS.CIRCUIT_BREAKER_THRESHOLD) {
    this.threshold = threshold
  }

  /**
   * Record a tool invocation.
   * Returns triggered=true if the same tool+input has been called >= threshold times.
   */
  record(toolName: string, input: unknown): CircuitBreakerResult {
    const key = `${toolName}:${JSON.stringify(input)}`
    const current = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, current)

    return {
      triggered: current >= this.threshold,
      count: current,
      key,
    }
  }

  /**
   * Reset all counters.
   * Call after a successful step completes to reset the per-step tracking.
   */
  clear(): void {
    this.counts.clear()
  }
}
