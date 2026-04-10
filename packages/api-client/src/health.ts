import type { ModelAdapter, HealthCheckResult } from './adapters/types.js'

/**
 * Check model health by calling the adapter's capability probe.
 * Returns a structured result — never throws per T-01-05.
 * Connection failures are captured as { connected: false, error } rather than propagated.
 */
export async function checkModelHealth(
  adapter: ModelAdapter,
  modelId: string
): Promise<HealthCheckResult> {
  try {
    const capabilities = await adapter.checkCapabilities(modelId)
    return {
      connected: true,
      modelName: capabilities.modelName,
      contextWindow: capabilities.contextWindow,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      connected: false,
      modelName: modelId,
      contextWindow: 0,
      error: message,
    }
  }
}
