import { z } from 'zod'
import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import type { Tool, ToolContext, PermissionCheckResult } from '../base/types.js'
import { PermissionTier } from '../base/types.js'
import { assertWithinWorkspace } from '../utils/path-guard.js'

const inputSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z.string().optional().describe('Path to search in, defaults to workspace root'),
  include: z.string().optional().describe('Glob pattern for files to include (currently unused, reserved)'),
})

type GrepInput = z.infer<typeof inputSchema>

export interface GrepMatch {
  file: string
  line: number
  content: string
}

/**
 * GrepTool searches file contents by regex within the workspace per TOOL-07.
 * Note: ReDoS from untrusted regex accepted as per threat model T-01-09 (P0 risk accepted).
 */
export const GrepTool: Tool<GrepInput, GrepMatch[]> = {
  name: 'Grep',
  description: 'Search file contents by regex pattern within the workspace',
  inputSchema,
  requiredTier: PermissionTier.ReadOnly,
  isReadOnly: () => true,
  checkPermissions(_input: GrepInput, ctx: ToolContext): PermissionCheckResult {
    if (!ctx.permissionGrants.has(PermissionTier.ReadOnly)) {
      return {
        allowed: false,
        requiredTier: PermissionTier.ReadOnly,
        reason: 'ReadOnly permission required',
      }
    }
    return { allowed: true }
  },
  async call(input: GrepInput, ctx: ToolContext): Promise<GrepMatch[]> {
    const searchPath = input.path
      ? resolve(ctx.workspaceRoot, input.path)
      : ctx.workspaceRoot
    await assertWithinWorkspace(searchPath, ctx.workspaceRoot)

    const matches: GrepMatch[] = []

    async function searchFile(filePath: string): Promise<void> {
      try {
        const content = await readFile(filePath, 'utf-8')
        const lines = content.split('\n')
        // Create fresh regex per file to reset lastIndex correctly
        const regex = new RegExp(input.pattern, 'g')
        for (let i = 0; i < lines.length; i++) {
          regex.lastIndex = 0
          if (regex.test(lines[i]!)) {
            matches.push({
              file: relative(ctx.workspaceRoot, filePath),
              line: i + 1,
              content: lines[i]!.trim(),
            })
          }
        }
      } catch {
        // Skip binary or unreadable files
      }
    }

    async function searchDir(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        // Skip common large/irrelevant directories
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await searchDir(fullPath)
        } else if (entry.isFile()) {
          await searchFile(fullPath)
        }
      }
    }

    const pathStat = await stat(searchPath)
    if (pathStat.isFile()) {
      await searchFile(searchPath)
    } else {
      await searchDir(searchPath)
    }

    return matches
  },
}
