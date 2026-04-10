import { describe, it, expect } from 'vitest'
import { FileWriteTool } from './file-write.js'
import { PermissionTier, type ToolContext } from '../base/types.js'
import { PathTraversalError } from '@treis/core'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function makeTmpWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'treis-filewrite-'))
}

function makeCtx(workspaceRoot: string): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test',
    permissionGrants: new Set([PermissionTier.WriteFiles]),
  }
}

describe('FileWriteTool', () => {
  it('isReadOnly() returns false', () => {
    expect(FileWriteTool.isReadOnly()).toBe(false)
  })

  it('has requiredTier of WriteFiles', () => {
    expect(FileWriteTool.requiredTier).toBe(PermissionTier.WriteFiles)
  })

  it('writes file contents to a path within workspace', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    const result = await FileWriteTool.call({ path: 'hello.txt', content: 'Hello, Treis!' }, ctx)
    expect(result.path).toBe('hello.txt')
    expect(result.bytesWritten).toBeGreaterThan(0)
    const written = await readFile(join(workspace, 'hello.txt'), 'utf-8')
    expect(written).toBe('Hello, Treis!')
  })

  it('creates parent directories if they do not exist', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await FileWriteTool.call({ path: 'nested/deep/file.txt', content: 'nested content' }, ctx)
    const written = await readFile(join(workspace, 'nested/deep/file.txt'), 'utf-8')
    expect(written).toBe('nested content')
  })

  it('rejects path outside workspace with PathTraversalError', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      FileWriteTool.call({ path: '../../etc/evil.txt', content: 'evil' }, ctx)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects absolute path outside workspace with PathTraversalError', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      FileWriteTool.call({ path: '/tmp/escaped.txt', content: 'evil' }, ctx)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('checkPermissions returns allowed when WriteFiles is granted', () => {
    const ctx = makeCtx('/workspace')
    const result = FileWriteTool.checkPermissions({ path: 'out.txt', content: 'x' }, ctx)
    expect(result.allowed).toBe(true)
  })

  it('checkPermissions returns not allowed when WriteFiles is not granted', () => {
    const ctx: ToolContext = {
      workspaceRoot: '/workspace',
      sessionId: 'test',
      permissionGrants: new Set([PermissionTier.ReadOnly]),
    }
    const result = FileWriteTool.checkPermissions({ path: 'out.txt', content: 'x' }, ctx)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.requiredTier).toBe(PermissionTier.WriteFiles)
    }
  })
})
