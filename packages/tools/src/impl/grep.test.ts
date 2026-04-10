import { describe, it, expect } from 'vitest'
import { GrepTool } from './grep.js'
import { PermissionTier, type ToolContext } from '../base/types.js'
import { PathTraversalError } from '@treis/core'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function makeTmpWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'treis-grep-'))
}

function makeCtx(workspaceRoot: string): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test',
    permissionGrants: new Set([PermissionTier.ReadOnly]),
  }
}

describe('GrepTool', () => {
  it('isReadOnly() returns true', () => {
    expect(GrepTool.isReadOnly()).toBe(true)
  })

  it('has requiredTier of ReadOnly', () => {
    expect(GrepTool.requiredTier).toBe(PermissionTier.ReadOnly)
  })

  it('returns matching lines with file path and line number', async () => {
    const workspace = await makeTmpWorkspace()
    await writeFile(join(workspace, 'foo.ts'), 'line one\nhello world\nline three\n')
    const ctx = makeCtx(workspace)
    const matches = await GrepTool.call({ pattern: 'hello' }, ctx)
    expect(matches.length).toBe(1)
    expect(matches[0]!.file).toBe('foo.ts')
    expect(matches[0]!.line).toBe(2)
    expect(matches[0]!.content).toContain('hello world')
  })

  it('returns empty array when no matches', async () => {
    const workspace = await makeTmpWorkspace()
    await writeFile(join(workspace, 'bar.ts'), 'nothing here\n')
    const ctx = makeCtx(workspace)
    const matches = await GrepTool.call({ pattern: 'XYZZY_NOT_FOUND' }, ctx)
    expect(matches).toEqual([])
  })

  it('searches a specific file when path is provided', async () => {
    const workspace = await makeTmpWorkspace()
    await writeFile(join(workspace, 'target.txt'), 'find me\nnot this\n')
    await writeFile(join(workspace, 'other.txt'), 'find me too\n')
    const ctx = makeCtx(workspace)
    const matches = await GrepTool.call({ pattern: 'find me', path: 'target.txt' }, ctx)
    // Should only match in target.txt
    expect(matches.every(m => m.file === 'target.txt')).toBe(true)
  })

  it('rejects search path outside workspace with PathTraversalError', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      GrepTool.call({ pattern: 'root', path: '/etc' }, ctx)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })
})
