import { describe, it, expect, vi, afterEach } from 'vitest'
import { WebSearchTool } from './web-search.js'
import { PermissionTier, type ToolContext } from '../base/types.js'
import { ToolExecutionError } from '@treis/core'

function makeCtx(withNetworkAccess: boolean): ToolContext {
  return {
    workspaceRoot: '/workspace',
    sessionId: 'test',
    permissionGrants: withNetworkAccess
      ? new Set([PermissionTier.NetworkAccess])
      : new Set([PermissionTier.ReadOnly]),
  }
}

// Minimal DuckDuckGo-like HTML for mocking
const MOCK_DDG_HTML = `
<html><body>
<a class="result__a" href="https://example.com">Example Domain</a>
<a class="result__snippet">An example snippet from the web.</a>
<a class="result__a" href="https://openai.com">OpenAI</a>
<a class="result__snippet">AI research lab</a>
</body></html>
`

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WebSearchTool', () => {
  it('has requiredTier of NetworkAccess', () => {
    expect(WebSearchTool.requiredTier).toBe(PermissionTier.NetworkAccess)
  })

  it('isReadOnly() returns false (network side effects)', () => {
    expect(WebSearchTool.isReadOnly()).toBe(false)
  })

  it('checkPermissions rejects when NetworkAccess not granted', () => {
    const ctx = makeCtx(false)
    const result = WebSearchTool.checkPermissions({ query: 'test' }, ctx)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.requiredTier).toBe(PermissionTier.NetworkAccess)
    }
  })

  it('checkPermissions allows when NetworkAccess is granted', () => {
    const ctx = makeCtx(true)
    const result = WebSearchTool.checkPermissions({ query: 'test' }, ctx)
    expect(result.allowed).toBe(true)
  })

  it('call returns search results array with title, url, snippet', async () => {
    const ctx = makeCtx(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => MOCK_DDG_HTML,
    }))

    const results = await WebSearchTool.call({ query: 'example test', maxResults: 2 }, ctx)
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]).toHaveProperty('title')
    expect(results[0]).toHaveProperty('url')
    expect(results[0]).toHaveProperty('snippet')
  })

  it('handles search API errors gracefully with ToolExecutionError', async () => {
    const ctx = makeCtx(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }))

    await expect(
      WebSearchTool.call({ query: 'test' }, ctx)
    ).rejects.toBeInstanceOf(ToolExecutionError)
  })

  it('wraps network errors as ToolExecutionError', async () => {
    const ctx = makeCtx(true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))

    await expect(
      WebSearchTool.call({ query: 'test' }, ctx)
    ).rejects.toBeInstanceOf(ToolExecutionError)
  })
})
