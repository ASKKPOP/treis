import type { Tool, ToolContext, ToolResult } from './types.js'
import { checkPermission } from '../permissions/gate.js'

export interface ToolCall {
  tool: Tool
  input: unknown
}

export interface ExecutionResult {
  toolName: string
  result: ToolResult
}

/**
 * Execute a batch of tool calls per D-14, TOOL-10.
 *
 * Read-only tools are batched concurrently via Promise.allSettled.
 * Non-read-only tools are executed serially to prevent race conditions.
 */
export async function executeTools(
  calls: ToolCall[],
  ctx: ToolContext
): Promise<ExecutionResult[]> {
  // Partition into read-only and non-read-only
  const readOnly = calls.filter(c => c.tool.isReadOnly())
  const nonReadOnly = calls.filter(c => !c.tool.isReadOnly())

  const results: ExecutionResult[] = []

  // Batch read-only tools concurrently (D-14)
  if (readOnly.length > 0) {
    const batchResults = await Promise.allSettled(
      readOnly.map(c => executeSingleTool(c, ctx))
    )
    for (let i = 0; i < batchResults.length; i++) {
      const r = batchResults[i]!
      results.push({
        toolName: readOnly[i]!.tool.name,
        result:
          r.status === 'fulfilled'
            ? r.value
            : { success: false, error: String(r.reason), durationMs: 0 },
      })
    }
  }

  // Execute non-read-only tools serially
  for (const call of nonReadOnly) {
    const result = await executeSingleTool(call, ctx)
    results.push({ toolName: call.tool.name, result })
  }

  return results
}

async function executeSingleTool(
  call: ToolCall,
  ctx: ToolContext
): Promise<ToolResult> {
  const start = Date.now()
  try {
    await checkPermission(call.tool, call.input, ctx)
    const parsed = call.tool.inputSchema.parse(call.input)
    const data = await call.tool.call(parsed, ctx)
    return { success: true, data, durationMs: Date.now() - start }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    }
  }
}
