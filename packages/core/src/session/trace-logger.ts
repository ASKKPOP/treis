import pino from 'pino'
import { join } from 'node:path'

export interface TraceEntry {
  step: number
  tool: string
  input: string     // summarized, max 200 chars
  output: string    // summarized, max 500 chars
  verdict: 'PASS' | 'WARN' | 'FAIL' | 'FATAL' | 'PENDING'
  durationMs: number
}

export interface TraceLogger {
  logToolCall(entry: TraceEntry): void
  flush(): void
  readonly executionId: string
  readonly sessionId: string
}

function summarize(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}

export function createTraceLogger(
  tracesDir: string,
  executionId: string,
  sessionId: string
): TraceLogger {
  const logPath = join(tracesDir, `${executionId}.jsonl`)

  const dest = pino.destination({ dest: logPath, mkdir: true, sync: true })
  const logger = pino({ level: 'info' }, dest)
    .child({ execution_id: executionId, session_id: sessionId })

  return {
    executionId,
    sessionId,

    logToolCall(entry: TraceEntry): void {
      logger.info({
        ts: Date.now(),
        step: entry.step,
        tool: entry.tool,
        input: summarize(entry.input, 200),    // Never log raw input (D-22 / T-01-15)
        output: summarize(entry.output, 500),
        verdict: entry.verdict,
        duration_ms: entry.durationMs,
      })
    },

    flush(): void {
      dest.flushSync()
    },
  }
}
