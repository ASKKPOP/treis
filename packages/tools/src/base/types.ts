import type { ZodSchema } from 'zod'

/**
 * Permission tier constants per D-09, D-10.
 * Using const object instead of enum due to erasableSyntaxOnly constraint.
 */
export const PermissionTier = {
  ReadOnly: 'ReadOnly',
  WriteFiles: 'WriteFiles',
  ExecuteShell: 'ExecuteShell',
  DangerousShell: 'DangerousShell',
  NetworkAccess: 'NetworkAccess',
} as const

export type PermissionTier = (typeof PermissionTier)[keyof typeof PermissionTier]

export interface ToolContext {
  workspaceRoot: string
  sessionId: string
  permissionGrants: Set<PermissionTier>
  approvePermission?: (tier: PermissionTier, toolName: string) => Promise<boolean>
}

export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  durationMs: number
}

export type PermissionCheckResult =
  | { allowed: true }
  | { allowed: false; requiredTier: PermissionTier; reason: string }

export interface Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly description: string
  readonly inputSchema: ZodSchema<TInput>
  readonly requiredTier: PermissionTier
  isReadOnly(): boolean
  checkPermissions(input: TInput, ctx: ToolContext): PermissionCheckResult
  call(input: TInput, ctx: ToolContext): Promise<TOutput>
}
