import { EXECUTION_LIMITS } from './types.js'

// ---------------------------------------------------------------------------
// Retry Injection (D-14, AGENT-04)
// ---------------------------------------------------------------------------

export interface RetryInjection {
  role: 'user'
  content: string
}

/**
 * Build an error context injection message to prepend before the next streamText call.
 *
 * Injected as a user message so the model understands what failed and can try
 * a different approach. Error message truncated to 200 chars per D-14 (T-02-11:
 * prevents leaking full stack traces into model context).
 */
export function buildRetryInjection(
  toolName: string,
  errorType: string,
  errorMessage: string,
  retryCount: number,
): RetryInjection {
  return {
    role: 'user',
    content: [
      `[Retry ${retryCount}/${EXECUTION_LIMITS.MAX_RETRIES}] The previous step failed.`,
      `Tool: ${toolName}`,
      `Error type: ${errorType}`,
      `Error: ${errorMessage.slice(0, 200)}`,
      `Please try a different approach or fix the issue.`,
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Retry Handler (D-14, AGENT-04, AGENT-05)
// ---------------------------------------------------------------------------

export interface RetryHandler {
  /** Returns true if another retry should be attempted (attempt < MAX_RETRIES). */
  shouldRetry(attempt: number): boolean
  /** Returns true when attempt reaches MAX_RETRIES — offer escalation (AGENT-05). */
  shouldEscalate(attempt: number): boolean
  /** Returns the backoff delay in ms for the given attempt number (1-indexed). */
  getBackoffMs(attempt: number): number
}

/**
 * Create a retry handler with exponential backoff (D-14, AGENT-04).
 *
 * Max 3 retries with 1s/2s/4s backoff.
 * After 3rd failure, shouldEscalate returns true (AGENT-05).
 *
 * Note: Does NOT call setTimeout — the executor is responsible for
 * applying the delay. This keeps the handler pure and easily testable.
 */
export function createRetryHandler(): RetryHandler {
  return {
    shouldRetry(attempt: number): boolean {
      return attempt < EXECUTION_LIMITS.MAX_RETRIES
    },

    shouldEscalate(attempt: number): boolean {
      return attempt >= EXECUTION_LIMITS.MAX_RETRIES
    },

    getBackoffMs(attempt: number): number {
      const backoffs = EXECUTION_LIMITS.RETRY_BACKOFF_MS
      const index = Math.min(attempt - 1, backoffs.length - 1)
      return backoffs[index] ?? backoffs[backoffs.length - 1]!
    },
  }
}
