import { describe, it, expect, vi } from 'vitest'
import { checkPermission } from './gate.js'
import { PermissionTier, type Tool, type ToolContext } from '../base/types.js'
import { PermissionDeniedError } from '@treis/core'
import { z } from 'zod'

function makeCtx(grants: PermissionTier[], approvePermission?: ToolContext['approvePermission']): ToolContext {
  return {
    workspaceRoot: '/tmp/workspace',
    sessionId: 'test-session',
    permissionGrants: new Set(grants),
    approvePermission,
  }
}

function makeTool(tier: PermissionTier, readOnly = false): Tool {
  return {
    name: `Mock-${tier}`,
    description: 'mock',
    inputSchema: z.unknown(),
    requiredTier: tier,
    isReadOnly: () => readOnly,
    checkPermissions: () => ({ allowed: true }),
    call: async () => null,
  }
}

describe('checkPermission', () => {
  it('allows ReadOnly tool when ReadOnly is granted', async () => {
    const tool = makeTool(PermissionTier.ReadOnly, true)
    const ctx = makeCtx([PermissionTier.ReadOnly])
    await expect(checkPermission(tool, {}, ctx)).resolves.toBeUndefined()
  })

  it('rejects WriteFiles tool when only ReadOnly is granted', async () => {
    const tool = makeTool(PermissionTier.WriteFiles)
    const ctx = makeCtx([PermissionTier.ReadOnly])
    await expect(checkPermission(tool, {}, ctx)).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('allows WriteFiles tool when WriteFiles is granted', async () => {
    const tool = makeTool(PermissionTier.WriteFiles)
    const ctx = makeCtx([PermissionTier.WriteFiles])
    await expect(checkPermission(tool, {}, ctx)).resolves.toBeUndefined()
  })

  it('DangerousShell always requires per-invocation approval even if ExecuteShell is granted', async () => {
    const tool = makeTool(PermissionTier.DangerousShell)
    const approve = vi.fn().mockResolvedValue(true)
    const ctx = makeCtx([PermissionTier.ExecuteShell, PermissionTier.DangerousShell], approve)
    await expect(checkPermission(tool, {}, ctx)).resolves.toBeUndefined()
    expect(approve).toHaveBeenCalledWith(PermissionTier.DangerousShell, tool.name)
  })

  it('DangerousShell throws PermissionDeniedError when approval is denied', async () => {
    const tool = makeTool(PermissionTier.DangerousShell)
    const approve = vi.fn().mockResolvedValue(false)
    const ctx = makeCtx([PermissionTier.DangerousShell], approve)
    await expect(checkPermission(tool, {}, ctx)).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('DangerousShell throws PermissionDeniedError when no approvePermission callback', async () => {
    const tool = makeTool(PermissionTier.DangerousShell)
    const ctx = makeCtx([PermissionTier.DangerousShell])
    await expect(checkPermission(tool, {}, ctx)).rejects.toBeInstanceOf(PermissionDeniedError)
  })
})
