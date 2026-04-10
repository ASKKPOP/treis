import { describe, it, expect, vi } from 'vitest'
import { checkToolScope } from './scope-checker.js'
import type { PlanContract } from './schema.js'
import { PlanContractSchema } from './schema.js'

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeContract(overrides: Partial<{
  scopeEntries: PlanContract['scopeEntries']
}>): PlanContract {
  const base = {
    id: '01HXYZ12345ABCDEFGHJKMNPQR',
    version: '1.0',
    intent: 'Test intent',
    clarifications: [],
    scopeEntries: overrides.scopeEntries ?? [],
    successCriteria: ['Done'],
    tokenBudget: 200_000,
    selectedOption: 'A' as const,
    createdAt: new Date().toISOString(),
    sealedAt: new Date().toISOString(),
  }
  return PlanContractSchema.parse(base)
}

// ---------------------------------------------------------------------------
// Tool-type scope entries
// ---------------------------------------------------------------------------

describe('checkToolScope - tool name checking', () => {
  it('returns null when tool name matches an allowed tool in scope entries', async () => {
    const contract = makeContract({
      scopeEntries: [
        { type: 'tool', name: 'FileRead' },
        { type: 'tool', name: 'Grep' },
      ],
    })
    const result = await checkToolScope('FileRead', {}, contract)
    expect(result).toBeNull()
  })

  it('returns ScopeViolation when tool name is NOT in allowed tools list', async () => {
    const contract = makeContract({
      scopeEntries: [
        { type: 'tool', name: 'FileRead' },
        { type: 'tool', name: 'Grep' },
      ],
    })
    const result = await checkToolScope('BashTool', {}, contract)
    expect(result).not.toBeNull()
    expect(result?.entryType).toBe('tool')
    expect(result?.toolName).toBe('BashTool')
    expect(result?.attempted).toBe('BashTool')
    expect(result?.details).toContain('BashTool')
  })

  it('returns null when no tool-type scope entries exist (all tools allowed)', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'file', glob: 'src/**' }],
    })
    const result = await checkToolScope('AnyTool', {}, contract)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// File-type scope entries (micromatch glob matching)
// ---------------------------------------------------------------------------

describe('checkToolScope - file glob checking', () => {
  it('returns null when file path matches a glob pattern in scope entries', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'file', glob: 'src/**' }],
    })
    const result = await checkToolScope('FileRead', { path: 'src/foo.ts' }, contract)
    expect(result).toBeNull()
  })

  it('returns ScopeViolation when file path does NOT match any glob pattern', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'file', glob: 'src/**' }],
    })
    const result = await checkToolScope('FileRead', { path: 'lib/bar.ts' }, contract)
    expect(result).not.toBeNull()
    expect(result?.entryType).toBe('file')
    expect(result?.attempted).toBe('lib/bar.ts')
    expect(result?.details).toContain('lib/bar.ts')
  })

  it('returns null when no file-type scope entries exist (all paths allowed)', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'tool', name: 'FileRead' }],
    })
    const result = await checkToolScope('FileRead', { path: 'anywhere/file.ts' }, contract)
    expect(result).toBeNull()
  })

  it('handles tool input with no path property gracefully (no file scope violation)', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'file', glob: 'src/**' }],
    })
    // No 'path' in input — should not trigger file check
    const result = await checkToolScope('Grep', { pattern: 'foo' }, contract)
    expect(result).toBeNull()
  })

  it('matches if ANY of multiple glob patterns matches', async () => {
    const contract = makeContract({
      scopeEntries: [
        { type: 'file', glob: 'src/**' },
        { type: 'file', glob: 'tests/**' },
      ],
    })
    // Matches second pattern
    const result = await checkToolScope('FileRead', { path: 'tests/foo.test.ts' }, contract)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// URL-type scope entries
// ---------------------------------------------------------------------------

describe('checkToolScope - URL pattern checking', () => {
  it('returns ScopeViolation for URL not matching url-type pattern', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'url', pattern: 'api.example.com' }],
    })
    const result = await checkToolScope('HttpGet', { url: 'https://evil.com/data' }, contract)
    expect(result).not.toBeNull()
    expect(result?.entryType).toBe('url')
    expect(result?.attempted).toBe('https://evil.com/data')
  })

  it('returns null for URL matching url-type pattern (substring match)', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'url', pattern: 'api.example.com' }],
    })
    const result = await checkToolScope('HttpGet', { url: 'https://api.example.com/users' }, contract)
    expect(result).toBeNull()
  })

  it('handles tool input with no url property gracefully', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'url', pattern: 'api.example.com' }],
    })
    const result = await checkToolScope('FileRead', { path: 'src/foo.ts' }, contract)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Action-type scope entries (callback delegation)
// ---------------------------------------------------------------------------

describe('checkToolScope - action entry callback', () => {
  it('invokes checkAction callback when action entries present', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'action', description: 'Deploy to staging only' }],
    })
    const checkAction = vi.fn().mockResolvedValue(true)
    const result = await checkToolScope('Deploy', { target: 'staging' }, contract, checkAction)
    expect(checkAction).toHaveBeenCalledWith(
      'Deploy to staging only',
      'Deploy',
      { target: 'staging' }
    )
    expect(result).toBeNull()
  })

  it('returns ScopeViolation when checkAction returns false', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'action', description: 'Deploy to staging only' }],
    })
    const checkAction = vi.fn().mockResolvedValue(false)
    const result = await checkToolScope('Deploy', { target: 'production' }, contract, checkAction)
    expect(result).not.toBeNull()
    expect(result?.entryType).toBe('action')
    expect(result?.toolName).toBe('Deploy')
  })

  it('skips action entries when no checkAction callback provided', async () => {
    const contract = makeContract({
      scopeEntries: [{ type: 'action', description: 'Deploy to staging only' }],
    })
    // No callback — action entries are skipped (not enforced)
    const result = await checkToolScope('Deploy', { target: 'production' }, contract)
    expect(result).toBeNull()
  })
})
