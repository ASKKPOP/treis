import { describe, it, expect } from 'vitest'
import { assertWithinWorkspace } from './path-guard.js'
import { PathTraversalError } from '@treis/core'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function makeTmpWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'treis-test-'))
}

describe('assertWithinWorkspace', () => {
  it('allows a path within workspace root', async () => {
    const workspace = await makeTmpWorkspace()
    const target = join(workspace, 'foo.txt')
    // Should not throw (file doesn't need to exist for non-symlink check)
    const result = await assertWithinWorkspace(target, workspace)
    expect(result).toBe(target)
  })

  it('rejects /etc/passwd when workspaceRoot is /tmp/workspace', async () => {
    const workspace = await makeTmpWorkspace()
    await expect(
      assertWithinWorkspace('/etc/passwd', workspace)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('rejects path traversal via ../ sequences', async () => {
    const workspace = await makeTmpWorkspace()
    const traversal = join(workspace, '../../../etc/passwd')
    await expect(
      assertWithinWorkspace(traversal, workspace)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })

  it('allows workspace root itself', async () => {
    const workspace = await makeTmpWorkspace()
    const result = await assertWithinWorkspace(workspace, workspace)
    // realpath resolves symlinks (e.g. /var -> /private/var on macOS)
    const realWorkspace = await realpath(workspace)
    expect(result).toBe(realWorkspace)
  })

  it('rejects path that starts with workspace prefix but is not within it', async () => {
    const workspace = await makeTmpWorkspace()
    // e.g. /tmp/treis-test-abc and /tmp/treis-test-abcEVIL
    const sibling = workspace + 'EVIL'
    await expect(
      assertWithinWorkspace(sibling, workspace)
    ).rejects.toBeInstanceOf(PathTraversalError)
  })
})
