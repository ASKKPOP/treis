import { z } from 'zod'
import { exec } from 'node:child_process'
import type { Tool, ToolContext, PermissionCheckResult } from '../base/types.js'
import { PermissionTier } from '../base/types.js'
import { PermissionDeniedError } from '@treis/errors'
import { assertWithinWorkspace } from '../utils/path-guard.js'

const DEFAULT_TIMEOUT_MS = 30_000

// SECURITY-CRITICAL: Block shell metacharacters to prevent injection per D-13 / T-01-10.
// Policy: REJECT commands containing these patterns — do NOT sanitize, sanitization is error-prone.
export const BLOCKED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /;/, description: 'command chaining (;)' },
  { pattern: /&&/, description: 'conditional execution (&&)' },
  { pattern: /\|\|/, description: 'conditional execution (||)' },
  { pattern: /\$\(/, description: 'command substitution ($())' },
  { pattern: /`/, description: 'backtick substitution (`)' },
]

// Commands that require DangerousShell approval per TOOL-05, T-01-11.
const DANGEROUS_COMMANDS = [
  'rm',
  'rmdir',
  'chmod',
  'chown',
  'chgrp',
  'mkfs',
  'dd',
  'kill',
  'killall',
  'shutdown',
  'reboot',
  'halt',
  'mv',
  'cp',
]

const inputSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS).optional(),
  cwd: z.string().optional().describe('Working directory, defaults to workspace root'),
})

type BashInput = z.infer<typeof inputSchema>

export interface BashOutput {
  stdout: string
  stderr: string
  exitCode: number
}

function isDangerousCommand(command: string): boolean {
  const firstWord = command.trim().split(/\s+/)[0] ?? ''
  // Exact match or prefix match for commands like mkfs.ext4 (T-01-11)
  return DANGEROUS_COMMANDS.some(
    (dangerous) => firstWord === dangerous || firstWord.startsWith(dangerous + '.')
  )
}

/**
 * Validate command against BLOCKED_PATTERNS.
 * Throws PermissionDeniedError on any match — reject, never sanitize.
 */
function validateCommand(command: string): void {
  for (const { pattern, description } of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new PermissionDeniedError(
        `Command contains blocked metacharacter: ${description}`,
        { tool: 'BashTool', input: command, requiredTier: PermissionTier.ExecuteShell }
      )
    }
  }
}

/**
 * BashTool executes shell commands per TOOL-04/TOOL-05.
 *
 * Security controls:
 * - Metacharacter blocking (T-01-10): 5 regex patterns, reject before exec
 * - DangerousShell approval (T-01-11): destructive commands require per-invocation approval
 * - 30s timeout via AbortController (T-01-14)
 * - 1MB maxBuffer prevents memory exhaustion (T-01-14)
 */
export const BashTool: Tool<BashInput, BashOutput> = {
  name: 'Bash',
  description: 'Execute a shell command within the workspace',
  inputSchema,
  // Default tier — destructive commands are dynamically elevated inside call()
  requiredTier: PermissionTier.ExecuteShell,
  isReadOnly: () => false,
  checkPermissions(input: BashInput, ctx: ToolContext): PermissionCheckResult {
    if (isDangerousCommand(input.command)) {
      // Destructive command requires DangerousShell per-invocation approval
      return {
        allowed: false,
        requiredTier: PermissionTier.DangerousShell,
        reason: `Destructive command requires DangerousShell approval`,
      }
    }
    if (!ctx.permissionGrants.has(PermissionTier.ExecuteShell)) {
      return {
        allowed: false,
        requiredTier: PermissionTier.ExecuteShell,
        reason: 'ExecuteShell permission required',
      }
    }
    return { allowed: true }
  },
  async call(input: BashInput, ctx: ToolContext): Promise<BashOutput> {
    // SECURITY: Validate metacharacters BEFORE any execution
    validateCommand(input.command)

    // SECURITY-CRITICAL: DangerousShell per-invocation approval inside call().
    // BashTool.requiredTier is statically ExecuteShell (gate.ts checks only that tier).
    // Destructive commands need command-string-aware approval, which only happens here.
    if (isDangerousCommand(input.command)) {
      if (!ctx.approvePermission) {
        throw new PermissionDeniedError(
          `Destructive command "${input.command.trim().split(/\s+/)[0]}" requires DangerousShell approval callback`,
          { tool: 'BashTool', input: input.command, requiredTier: PermissionTier.DangerousShell }
        )
      }
      const approved = await ctx.approvePermission(PermissionTier.DangerousShell, 'BashTool')
      if (!approved) {
        throw new PermissionDeniedError(
          `DangerousShell permission denied for "${input.command.trim().split(/\s+/)[0]}"`,
          { tool: 'BashTool', input: input.command, requiredTier: PermissionTier.DangerousShell }
        )
      }
    }

    const timeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
    // SECURITY: Validate cwd against workspace boundary (T-01-07) to prevent path traversal
    const cwd = input.cwd
      ? await assertWithinWorkspace(input.cwd, ctx.workspaceRoot)
      : ctx.workspaceRoot

    return new Promise((resolve) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      exec(
        input.command,
        { cwd, signal: controller.signal, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          clearTimeout(timer)
          if (controller.signal.aborted) {
            resolve({
              stdout: '',
              stderr: `Command timed out after ${timeout}ms`,
              exitCode: 124,
            })
            return
          }
          // exec error.code is a string like 'ENOENT', not an exit code number.
          // Use error presence as proxy: non-zero exit if exec reported an error.
          const exitCode = error ? (error as NodeJS.ErrnoException & { status?: number }).status ?? 1 : 0
          resolve({
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode,
          })
        }
      )
    })
  },
}
