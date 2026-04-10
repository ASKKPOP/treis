import { describe, it, expect, beforeAll } from 'vitest'
import { runBenchmark, isModelAvailable } from './runner.js'
import { REFERENCE_PLANS } from './fixtures/index.js'

describe('Benchmark Suite', () => {
  let modelReady: boolean

  beforeAll(async () => {
    modelReady = await isModelAvailable()
  })

  it('achieves >= 80% success rate across 10 reference plans', async (ctx) => {
    if (!modelReady) {
      ctx.skip()
      return
    }

    const results = await runBenchmark(REFERENCE_PLANS)
    const successCount = results.filter((r) => r.passed).length
    const successRate = successCount / results.length

    // Report results
    console.table(
      results.map((r) => ({
        plan: r.name,
        domain: r.domain,
        passed: r.passed ? 'PASS' : 'FAIL',
        steps: r.totalSteps,
        durationMs: r.durationMs,
        reason: r.reason ?? '',
      })),
    )
    console.log(
      `\nSuccess rate: ${(successRate * 100).toFixed(0)}% (${successCount}/${results.length})`,
    )

    expect(successRate).toBeGreaterThanOrEqual(0.8)
  }, 300_000) // 5-minute timeout
})
