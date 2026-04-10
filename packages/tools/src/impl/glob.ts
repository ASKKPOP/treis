import { z } from 'zod'
import fg from 'fast-glob'
import { resolve } from 'node:path'
import type { Tool, ToolContext, PermissionCheckResult } from '../base/types.js'
import { PermissionTier } from '../base/types.js'
import { assertWithinWorkspace } from '../utils/path-guard.js'

const inputSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files'),
  cwd: z.string().optional().describe('Working directory, defaults to workspace root'),
})

type GlobInput = z.infer<typeof inputSchema>

/**
 * GlobTool finds files by glob pattern within the workspace per TOOL-06.
 */
export const GlobTool: Tool<GlobInput, string[]> = {
  name: 'Glob',
  description: 'Find files matching a glob pattern within the workspace',
  inputSchema,
  requiredTier: PermissionTier.ReadOnly,
  isReadOnly: () => true,
  checkPermissions(_input: GlobInput, ctx: ToolContext): PermissionCheckResult {
    if (!ctx.permissionGrants.has(PermissionTier.ReadOnly)) {
      return {
        allowed: false,
        requiredTier: PermissionTier.ReadOnly,
        reason: 'ReadOnly permission required',
      }
    }
    return { allowed: true }
  },
  async call(input: GlobInput, ctx: ToolContext): Promise<string[]> {
    const cwd = input.cwd ? resolve(ctx.workspaceRoot, input.cwd) : ctx.workspaceRoot
    await assertWithinWorkspace(cwd, ctx.workspaceRoot)

    const files = await fg(input.pattern, {
      cwd,
      absolute: true,
      dot: false,
      onlyFiles: true,
    })

    // Filter results to ensure all are within workspace (defense in depth)
    const resolvedRoot = resolve(ctx.workspaceRoot)
    return files.filter(f => f.startsWith(resolvedRoot + '/') || f === resolvedRoot)
  },
}
