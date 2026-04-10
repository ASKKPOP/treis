import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Tool, ToolContext, PermissionCheckResult } from '../base/types.js'
import { PermissionTier } from '../base/types.js'
import { assertWithinWorkspace } from '../utils/path-guard.js'

const inputSchema = z.object({
  path: z.string().describe('File path to read, relative to workspace root'),
  encoding: z.string().default('utf-8').optional(),
})

type FileReadInput = z.infer<typeof inputSchema>

/**
 * FileReadTool reads files within the workspace per TOOL-02.
 * Rejects paths outside workspace root via assertWithinWorkspace (T-01-06).
 */
export const FileReadTool: Tool<FileReadInput, string> = {
  name: 'FileRead',
  description: 'Read a file from the workspace',
  inputSchema,
  requiredTier: PermissionTier.ReadOnly,
  isReadOnly: () => true,
  checkPermissions(_input: FileReadInput, ctx: ToolContext): PermissionCheckResult {
    if (!ctx.permissionGrants.has(PermissionTier.ReadOnly)) {
      return {
        allowed: false,
        requiredTier: PermissionTier.ReadOnly,
        reason: 'ReadOnly permission required',
      }
    }
    return { allowed: true }
  },
  async call(input: FileReadInput, ctx: ToolContext): Promise<string> {
    const fullPath = resolve(ctx.workspaceRoot, input.path)
    await assertWithinWorkspace(fullPath, ctx.workspaceRoot)
    return readFile(fullPath, { encoding: (input.encoding ?? 'utf-8') as BufferEncoding })
  },
}
