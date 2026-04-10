import { describe, it, expect, vi } from 'vitest'
import { executeTools, type ToolCall } from './executor.js'
import { PermissionTier, type Tool, type ToolContext } from './types.js'
import { PermissionDeniedError } from '@treis/core'
import { z } from 'zod'

function makeCtx(grants: PermissionTier[] = [PermissionTier.ReadOnly, PermissionTier.WriteFiles]): ToolContext {
  return {
    workspaceRoot: '/tmp/workspace',
    sessionId: 'test-session',
    permissionGrants: new Set(grants),
  }
}

function makeTool(name: string, readOnly: boolean, tier: PermissionTier, result: unknown = `result-${name}`): Tool {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: z.unknown(),
    requiredTier: tier,
    isReadOnly: () => readOnly,
    checkPermissions: () => ({ allowed: true }),
    call: vi.fn().mockResolvedValue(result),
  }
}

describe('executeTools', () => {
  it('batches read-only tools concurrently via Promise.allSettled', async () => {
    const order: string[] = []
    const readTool1: Tool = {
      name: 'Read1',
      description: 'r1',
      inputSchema: z.unknown(),
      requiredTier: PermissionTier.ReadOnly,
      isReadOnly: () => true,
      checkPermissions: () => ({ allowed: true }),
      call: vi.fn().mockImplementation(async () => {
        order.push('Read1-start')
        await new Promise(r => setTimeout(r, 10))
        order.push('Read1-end')
        return 'r1'
      }),
    }
    const readTool2: Tool = {
      name: 'Read2',
      description: 'r2',
      inputSchema: z.unknown(),
      requiredTier: PermissionTier.ReadOnly,
      isReadOnly: () => true,
      checkPermissions: () => ({ allowed: true }),
      call: vi.fn().mockImplementation(async () => {
        order.push('Read2-start')
        await new Promise(r => setTimeout(r, 5))
        order.push('Read2-end')
        return 'r2'
      }),
    }

    const calls: ToolCall[] = [
      { tool: readTool1, input: {} },
      { tool: readTool2, input: {} },
    ]
    const ctx = makeCtx()
    const results = await executeTools(calls, ctx)
    expect(results).toHaveLength(2)
    expect(results[0].result.success).toBe(true)
    expect(results[1].result.success).toBe(true)
    // Both starts happen before both ends (concurrent execution)
    const r1Start = order.indexOf('Read1-start')
    const r2Start = order.indexOf('Read2-start')
    const r1End = order.indexOf('Read1-end')
    expect(r1Start).toBeLessThan(r1End)
    expect(r2Start).toBeLessThan(r1End) // Read2 starts before Read1 ends
  })

  it('runs non-read-only tools serially', async () => {
    const order: string[] = []
    const writeTool1: Tool = {
      name: 'Write1',
      description: 'w1',
      inputSchema: z.unknown(),
      requiredTier: PermissionTier.WriteFiles,
      isReadOnly: () => false,
      checkPermissions: () => ({ allowed: true }),
      call: vi.fn().mockImplementation(async () => {
        order.push('Write1-start')
        await new Promise(r => setTimeout(r, 10))
        order.push('Write1-end')
        return 'w1'
      }),
    }
    const writeTool2: Tool = {
      name: 'Write2',
      description: 'w2',
      inputSchema: z.unknown(),
      requiredTier: PermissionTier.WriteFiles,
      isReadOnly: () => false,
      checkPermissions: () => ({ allowed: true }),
      call: vi.fn().mockImplementation(async () => {
        order.push('Write2-start')
        return 'w2'
      }),
    }

    const calls: ToolCall[] = [
      { tool: writeTool1, input: {} },
      { tool: writeTool2, input: {} },
    ]
    const ctx = makeCtx([PermissionTier.WriteFiles])
    const results = await executeTools(calls, ctx)
    expect(results).toHaveLength(2)
    // Write1 must end before Write2 starts (serial)
    expect(order.indexOf('Write1-end')).toBeLessThan(order.indexOf('Write2-start'))
  })

  it('checks permissions before each tool call', async () => {
    const noPermTool: Tool = {
      name: 'NoPermTool',
      description: 'np',
      inputSchema: z.unknown(),
      requiredTier: PermissionTier.WriteFiles,
      isReadOnly: () => false,
      checkPermissions: () => ({ allowed: false, requiredTier: PermissionTier.WriteFiles, reason: 'No write' }),
      call: vi.fn(),
    }

    const calls: ToolCall[] = [{ tool: noPermTool, input: {} }]
    // Only ReadOnly granted — WriteFiles should fail
    const ctx = makeCtx([PermissionTier.ReadOnly])
    const results = await executeTools(calls, ctx)
    expect(results).toHaveLength(1)
    expect(results[0].result.success).toBe(false)
    expect(noPermTool.call).not.toHaveBeenCalled()
  })

  it('returns successful results for read-only tools', async () => {
    const tool = makeTool('R', true, PermissionTier.ReadOnly, 'file-contents')
    const calls: ToolCall[] = [{ tool, input: {} }]
    const results = await executeTools(calls, makeCtx())
    expect(results[0].result.success).toBe(true)
    expect(results[0].result.data).toBe('file-contents')
    expect(results[0].toolName).toBe('R')
  })
})
