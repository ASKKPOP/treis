import { describe, it, expect, vi } from 'vitest'
import { BashTool } from './bash.js'
import { PermissionTier, type ToolContext } from '../base/types.js'
import { PermissionDeniedError } from '@treis/core'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function makeTmpWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'treis-bash-'))
}

function makeCtx(workspaceRoot: string, overrides?: Partial<ToolContext>): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test',
    permissionGrants: new Set([PermissionTier.ExecuteShell]),
    ...overrides,
  }
}

describe('BashTool', () => {
  it('isReadOnly() returns false', () => {
    expect(BashTool.isReadOnly()).toBe(false)
  })

  it('executes a simple command and returns stdout', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    const result = await BashTool.call({ command: 'echo hello' }, ctx)
    expect(result.stdout.trim()).toBe('hello')
    expect(result.exitCode).toBe(0)
  })

  it('classifies non-destructive commands (ls, cat, echo) as ExecuteShell tier', () => {
    // Non-destructive commands should not throw PermissionDeniedError for DangerousShell
    const ctx: ToolContext = {
      workspaceRoot: '/workspace',
      sessionId: 'test',
      // Only ExecuteShell granted — no DangerousShell
      permissionGrants: new Set([PermissionTier.ExecuteShell]),
    }
    const checkLs = BashTool.checkPermissions({ command: 'ls -la' }, ctx)
    expect(checkLs.allowed).toBe(true)

    const checkCat = BashTool.checkPermissions({ command: 'cat README.md' }, ctx)
    expect(checkCat.allowed).toBe(true)

    const checkEcho = BashTool.checkPermissions({ command: 'echo hello' }, ctx)
    expect(checkEcho.allowed).toBe(true)
  })

  it('classifies destructive commands (rm, chmod, chown, mkfs, dd) as DangerousShell tier', () => {
    const ctx: ToolContext = {
      workspaceRoot: '/workspace',
      sessionId: 'test',
      permissionGrants: new Set([PermissionTier.ExecuteShell]),
    }

    for (const cmd of ['rm -rf /', 'chmod 777 /etc', 'chown root:root /etc', 'mkfs.ext4 /dev/sda', 'dd if=/dev/zero of=/dev/sda']) {
      const result = BashTool.checkPermissions({ command: cmd }, ctx)
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.requiredTier).toBe(PermissionTier.DangerousShell)
      }
    }
  })

  it('rejects command containing ; (semicolon injection)', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      BashTool.call({ command: 'ls ; rm -rf /' }, ctx)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('rejects command containing && (conditional chaining)', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      BashTool.call({ command: 'ls && rm -rf /' }, ctx)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('rejects command containing || (conditional chaining)', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      BashTool.call({ command: 'ls || true' }, ctx)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('rejects command containing $() (command substitution)', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      BashTool.call({ command: 'echo $(whoami)' }, ctx)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('rejects command containing backticks (command substitution)', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    await expect(
      BashTool.call({ command: 'echo `whoami`' }, ctx)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('enforces timeout: returns exitCode 124 when command exceeds timeoutMs', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace)
    // Use a very short timeout (100ms) and a command that sleeps longer
    const result = await BashTool.call({ command: 'sleep 10', timeoutMs: 100 }, ctx)
    expect(result.exitCode).toBe(124)
    expect(result.stderr).toMatch(/timed out/)
  }, 5000)

  it('call() with destructive command throws PermissionDeniedError if approvePermission is absent', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace, { approvePermission: undefined })
    await expect(
      BashTool.call({ command: 'rm -rf /tmp/test' }, ctx)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('call() with destructive command throws PermissionDeniedError if approvePermission returns false', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace, {
      approvePermission: vi.fn().mockResolvedValue(false),
    })
    await expect(
      BashTool.call({ command: 'rm -rf /tmp/test' }, ctx)
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('call() with destructive command executes if approvePermission returns true', async () => {
    const workspace = await makeTmpWorkspace()
    const ctx = makeCtx(workspace, {
      // We use 'chmod' on a benign target within the workspace to test approval flow
      approvePermission: vi.fn().mockResolvedValue(true),
    })
    // Create a file to chmod
    const { writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const testFile = join(workspace, 'test.txt')
    await writeFile(testFile, 'test content')
    // chmod should execute when approved
    const result = await BashTool.call({ command: `chmod 644 ${testFile}` }, ctx)
    expect(result.exitCode).toBe(0)
  })
})
