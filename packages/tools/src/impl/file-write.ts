import { z } from 'zod'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import type { Tool, ToolContext, PermissionCheckResult } from '../base/types.js'
import { PermissionTier } from '../base/types.js'
import { assertWithinWorkspace } from '../utils/path-guard.js'

const inputSchema = z.object({
  path: z.string().describe('File path to write, relative to workspace root'),
  content: z.string().describe('Content to write to the file'),
  createDirs: z.boolean().default(true).optional(),
})

type FileWriteInput = z.infer<typeof inputSchema>

/**
 * FileWriteTool writes files within the workspace per TOOL-03.
 * Rejects paths outside workspace root via assertWithinWorkspace (T-01-12).
 */
export const FileWriteTool: Tool<FileWriteInput, { path: string; bytesWritten: number }> = {
  name: 'FileWrite',
  description: 'Write content to a file within the workspace',
  inputSchema,
  requiredTier: PermissionTier.WriteFiles,
  isReadOnly: () => false,
  checkPermissions(_input: FileWriteInput, ctx: ToolContext): PermissionCheckResult {
    if (!ctx.permissionGrants.has(PermissionTier.WriteFiles)) {
      return {
        allowed: false,
        requiredTier: PermissionTier.WriteFiles,
        reason: 'WriteFiles permission required',
      }
    }
    return { allowed: true }
  },
  async call(input: FileWriteInput, ctx: ToolContext) {
    const fullPath = resolve(ctx.workspaceRoot, input.path)
    await assertWithinWorkspace(fullPath, ctx.workspaceRoot)

    if (input.createDirs !== false) {
      await mkdir(dirname(fullPath), { recursive: true })
    }

    await writeFile(fullPath, input.content, 'utf-8')
    return { path: input.path, bytesWritten: Buffer.byteLength(input.content, 'utf-8') }
  },
}
