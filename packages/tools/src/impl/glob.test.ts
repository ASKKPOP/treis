import { describe, it, expect } from 'vitest'
import { GlobTool } from './glob.js'
import { PermissionTier, type ToolContext } from '../base/types.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function makeTmpWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'treis-glob-'))
}

function makeCtx(workspaceRoot: string): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test',
    permissionGrants: new Set([PermissionTier.ReadOnly]),
  }
}

describe('GlobTool', () => {
  it('isReadOnly() returns true', () => {
    expect(GlobTool.isReadOnly()).toBe(true)
  })

  it('has requiredTier of ReadOnly', () => {
    expect(GlobTool.requiredTier).toBe(PermissionTier.ReadOnly)
  })

  it('returns matching file paths within workspace', async () => {
    const workspace = await makeTmpWorkspace()
    await writeFile(join(workspace, 'a.ts'), '')
    await writeFile(join(workspace, 'b.ts'), '')
    await writeFile(join(workspace, 'c.txt'), '')

    const ctx = makeCtx(workspace)
    const results = await GlobTool.call({ pattern: '**/*.ts' }, ctx)
    expect(results.length).toBe(2)
    expect(results.every(f => f.endsWith('.ts'))).toBe(true)
    expect(results.every(f => f.startsWith(workspace))).toBe(true)
  })

  it('returns empty array when no files match', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    const results = await GlobTool.call({ pattern: '**/*.nonexistent' }, ctx)
    expect(results).toEqual([])
  })

  it('rejects cwd that escapes workspace with PathTraversalError', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    const { PathTraversalError } = await import('@treis/core')
    await expect(
      GlobTool.call({ pattern: '**/*.ts', cwd: '../../etc' }, ctx)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })
})
