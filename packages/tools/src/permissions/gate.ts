import { PermissionDeniedError } from '@treis/errors'
import { PermissionTier, type Tool, type ToolContext } from '../base/types.js'

/**
 * Permission gate per D-10, D-11, D-12.
 *
 * DangerousShell always requires per-invocation approval even when ExecuteShell
 * or DangerousShell is in the grants set (D-11).
 */
export async function checkPermission(
  tool: Tool,
  _input: unknown,
  ctx: ToolContext
): Promise<void> {
  // DangerousShell ALWAYS requires per-invocation approval (D-11)
  if (tool.requiredTier === PermissionTier.DangerousShell) {
    if (!ctx.approvePermission) {
      throw new PermissionDeniedError(
        `Tool ${tool.name} requires DangerousShell approval callback`,
        { tool: tool.name, requiredTier: PermissionTier.DangerousShell }
      )
    }
    const approved = await ctx.approvePermission(PermissionTier.DangerousShell, tool.name)
    if (!approved) {
      throw new PermissionDeniedError(
        `DangerousShell permission denied for ${tool.name}`,
        { tool: tool.name, requiredTier: PermissionTier.DangerousShell }
      )
    }
    return
  }

  // Standard tier check — tool's required tier must be in grants
  if (!ctx.permissionGrants.has(tool.requiredTier)) {
    throw new PermissionDeniedError(
      `Tool ${tool.name} requires ${tool.requiredTier} permission`,
      { tool: tool.name, requiredTier: tool.requiredTier }
    )
  }
}
