import { z } from 'zod'
import type { Tool, ToolContext, PermissionCheckResult } from '../base/types.js'
import { PermissionTier } from '../base/types.js'
import { ToolExecutionError } from '@treis/errors'

const inputSchema = z.object({
  query: z.string().describe('Search query string'),
  maxResults: z.number().default(5).optional(),
})

type WebSearchInput = z.infer<typeof inputSchema>

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/**
 * WebSearchTool searches the web via DuckDuckGo HTML API per TOOL-08.
 *
 * Security: Requires NetworkAccess permission (T-01-13).
 * Network side effects (rate limits, server-side logging) make isReadOnly() false.
 * Phase 1+: Support Brave Search API via BRAVE_API_KEY env var.
 */
export const WebSearchTool: Tool<WebSearchInput, SearchResult[]> = {
  name: 'WebSearch',
  description: 'Search the web for information. Requires NetworkAccess permission.',
  inputSchema,
  requiredTier: PermissionTier.NetworkAccess,
  isReadOnly: () => false, // Network calls have side effects (rate limits, server logging)
  checkPermissions(_input: WebSearchInput, ctx: ToolContext): PermissionCheckResult {
    if (!ctx.permissionGrants.has(PermissionTier.NetworkAccess)) {
      return {
        allowed: false,
        requiredTier: PermissionTier.NetworkAccess,
        reason: 'NetworkAccess permission required for web search',
      }
    }
    return { allowed: true }
  },
  async call(input: WebSearchInput, _ctx: ToolContext): Promise<SearchResult[]> {
    const maxResults = input.maxResults ?? 5

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Treis/0.1 (open-source AI execution platform)' },
      })

      if (!response.ok) {
        throw new ToolExecutionError(
          `Web search failed with status ${response.status}`,
          { tool: 'WebSearch', input: input.query }
        )
      }

      const html = await response.text()
      return parseDuckDuckGoResults(html, maxResults)
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error
      throw new ToolExecutionError(
        `Web search error: ${error instanceof Error ? error.message : String(error)}`,
        { tool: 'WebSearch', input: input.query }
      )
    }
  },
}

function parseDuckDuckGoResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = []

  // Extract result links (title + URL)
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi
  // Extract result snippets
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/gi

  const links: Array<{ url: string; title: string }> = []
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkRegex.exec(html)) !== null && links.length < max) {
    links.push({ url: linkMatch[1] ?? '', title: linkMatch[2] ?? '' })
  }

  const snippets: string[] = []
  let snippetMatch: RegExpExecArray | null
  while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < max) {
    snippets.push(snippetMatch[1] ?? '')
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i]?.title ?? '',
      url: links[i]?.url ?? '',
      snippet: snippets[i] ?? '',
    })
  }

  return results
}
