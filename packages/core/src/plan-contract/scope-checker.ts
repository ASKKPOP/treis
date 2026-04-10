import micromatch from 'micromatch'
import type { PlanContract, ScopeEntry } from './schema.js'

/**
 * Describes a scope boundary violation found by checkToolScope.
 * Returned to the agent loop so it can decide the appropriate response.
 */
export interface ScopeViolation {
  entryType: ScopeEntry['type']
  details: string
  toolName: string
  attempted: string
}

/**
 * The agent loop's response to a scope violation (D-18).
 * - stop: Halt execution immediately, report to Builder
 * - amend: Propose a contract amendment, await Builder approval
 * - continue: Log and continue (advisory-only mode)
 */
export type ViolationDecision = 'stop' | 'amend' | 'continue'

/**
 * Check if a tool call is within the sealed contract's scope (PLAN-06, D-18).
 *
 * Runs as a pre-hook before every tool dispatch in the agent loop:
 * - tool entries: whitelist — only listed tools are permitted
 * - file entries: tool input 'path' must match at least one micromatch glob
 * - url entries: tool input 'url' must contain at least one pattern as substring
 * - action entries: delegated to checkAction callback (model-judged boundary)
 *
 * Returns null if the call is within scope, or a ScopeViolation describing the breach.
 *
 * Security note (T-02-03): AI could craft tool input to bypass glob patterns;
 * Phase 0 accepts this risk since scope is advisory and not a hard security boundary.
 */
export async function checkToolScope(
  toolName: string,
  toolInput: unknown,
  contract: PlanContract,
  checkAction?: (description: string, toolName: string, toolInput: unknown) => Promise<boolean>,
): Promise<ScopeViolation | null> {
  const entries = contract.scopeEntries

  // --- Tool name check (whitelist) ---
  const toolEntries = entries.filter(
    (e): e is Extract<ScopeEntry, { type: 'tool' }> => e.type === 'tool'
  )
  if (toolEntries.length > 0) {
    const allowedTools = toolEntries.map(e => e.name)
    if (!allowedTools.includes(toolName)) {
      return {
        entryType: 'tool',
        details: `Tool "${toolName}" not in allowed tools: [${allowedTools.join(', ')}]`,
        toolName,
        attempted: toolName,
      }
    }
  }

  // --- File glob check (via micromatch) ---
  const fileEntries = entries.filter(
    (e): e is Extract<ScopeEntry, { type: 'file' }> => e.type === 'file'
  )
  if (fileEntries.length > 0 && isObjectWithStringProp(toolInput, 'path')) {
    const targetPath = (toolInput as Record<string, unknown>)['path'] as string
    const globs = fileEntries.map(e => e.glob)
    if (!micromatch.isMatch(targetPath, globs)) {
      return {
        entryType: 'file',
        details: `Path "${targetPath}" doesn't match scope globs: [${globs.join(', ')}]`,
        toolName,
        attempted: targetPath,
      }
    }
  }

  // --- URL pattern check (substring match) ---
  const urlEntries = entries.filter(
    (e): e is Extract<ScopeEntry, { type: 'url' }> => e.type === 'url'
  )
  if (urlEntries.length > 0 && isObjectWithStringProp(toolInput, 'url')) {
    const targetUrl = (toolInput as Record<string, unknown>)['url'] as string
    const patterns = urlEntries.map(e => e.pattern)
    const matches = patterns.some(p => targetUrl.includes(p))
    if (!matches) {
      return {
        entryType: 'url',
        details: `URL "${targetUrl}" doesn't match scope patterns: [${patterns.join(', ')}]`,
        toolName,
        attempted: targetUrl,
      }
    }
  }

  // --- Action entries (model-judged, D-18) ---
  // Only enforced when checkAction callback is provided; otherwise skipped (advisory)
  const actionEntries = entries.filter(
    (e): e is Extract<ScopeEntry, { type: 'action' }> => e.type === 'action'
  )
  if (actionEntries.length > 0 && checkAction) {
    for (const entry of actionEntries) {
      const allowed = await checkAction(entry.description, toolName, toolInput)
      if (!allowed) {
        return {
          entryType: 'action',
          // Truncate details to 200 chars to avoid leaking full tool input (T-02-04)
          details: `Action "${entry.description}" scope check rejected tool "${toolName}"`,
          toolName,
          attempted: JSON.stringify(toolInput).slice(0, 200),
        }
      }
    }
  }

  return null // All checks passed — call is within scope
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function isObjectWithStringProp(value: unknown, prop: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    prop in value &&
    typeof (value as Record<string, unknown>)[prop] === 'string'
  )
}
