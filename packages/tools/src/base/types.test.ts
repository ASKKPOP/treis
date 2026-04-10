import { describe, it, expect } from 'vitest'
import { PermissionTier, type Tool, type ToolContext } from './types.js'
import { z } from 'zod'

describe('PermissionTier', () => {
  it('has exactly 5 values: ReadOnly, WriteFiles, ExecuteShell, DangerousShell, NetworkAccess', () => {
    const values = Object.values(PermissionTier)
    expect(values).toHaveLength(5)
    expect(values).toContain('ReadOnly')
    expect(values).toContain('WriteFiles')
    expect(values).toContain('ExecuteShell')
    expect(values).toContain('DangerousShell')
    expect(values).toContain('NetworkAccess')
  })
})

describe('Tool interface', () => {
  it('can create a tool object satisfying the Tool interface', () => {
    const mockTool: Tool<{ x: number }, string> = {
      name: 'MockTool',
      description: 'A mock tool',
      inputSchema: z.object({ x: z.number() }),
      requiredTier: PermissionTier.ReadOnly,
      isReadOnly: () => true,
      checkPermissions: (_input, ctx) => {
        if (!ctx.permissionGrants.has(PermissionTier.ReadOnly)) {
          return { allowed: false, requiredTier: PermissionTier.ReadOnly, reason: 'Need ReadOnly' }
        }
        return { allowed: true }
      },
      call: async (_input, _ctx) => 'result',
    }

    expect(mockTool.name).toBe('MockTool')
    expect(mockTool.description).toBe('A mock tool')
    expect(mockTool.isReadOnly()).toBe(true)
    expect(mockTool.requiredTier).toBe(PermissionTier.ReadOnly)
  })

  it('requires name, description, inputSchema, call, checkPermissions, isReadOnly', () => {
    // Type-level test — the interface definition enforces these fields
    // Runtime check: verify all required fields on a concrete tool
    const tool: Tool<unknown, unknown> = {
      name: 'T',
      description: 'D',
      inputSchema: z.unknown(),
      requiredTier: PermissionTier.ReadOnly,
      isReadOnly: () => false,
      checkPermissions: () => ({ allowed: true }),
      call: async () => null,
    }
    expect(typeof tool.name).toBe('string')
    expect(typeof tool.description).toBe('string')
    expect(tool.inputSchema).toBeDefined()
    expect(typeof tool.call).toBe('function')
    expect(typeof tool.checkPermissions).toBe('function')
    expect(typeof tool.isReadOnly).toBe('function')
  })
})
