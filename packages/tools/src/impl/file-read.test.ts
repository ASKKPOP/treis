import { describe, it, expect } from 'vitest'
import { FileReadTool } from './file-read.js'
import { PermissionTier, type ToolContext } from '../base/types.js'
import { PathTraversalError } from '@treis/core'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function makeTmpWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'treis-fileread-'))
}

function makeCtx(workspaceRoot: string): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test',
    permissionGrants: new Set([PermissionTier.ReadOnly]),
  }
}

describe('FileReadTool', () => {
  it('isReadOnly() returns true', () => {
    expect(FileReadTool.isReadOnly()).toBe(true)
  })

  it('has requiredTier of ReadOnly', () => {
    expect(FileReadTool.requiredTier).toBe(PermissionTier.ReadOnly)
  })

  it('reads a file within workspace and returns contents', async () => {
    const workspace = await makeTmpWorkspace()
    const filePath = join(workspace, 'hello.txt')
    await writeFile(filePath, 'Hello, Treis!')
    const ctx = makeCtx(workspace)
    const result = await FileReadTool.call({ path: 'hello.txt' }, ctx)
    expect(result).toBe('Hello, Treis!')
  })

  it('rejects path outside workspace with PathTraversalError', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      FileReadTool.call({ path: '../../etc/passwd' }, ctx)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects absolute path outside workspace with PathTraversalError', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      FileReadTool.call({ path: '/etc/passwd' }, ctx)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })
})
