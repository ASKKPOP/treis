import { resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { PathTraversalError } from '@treis/errors'

/**
 * Assert that targetPath is within workspaceRoot per D-15.
 *
 * Checks both the lexically resolved path (to catch ../traversal) and the
 * real path after resolving symlinks (to catch symlink-based escapes).
 *
 * @returns The validated resolved path
 * @throws PathTraversalError if the path escapes the workspace
 */
export async function assertWithinWorkspace(
  targetPath: string,
  workspaceRoot: string
): Promise<string> {
  const resolvedTarget = resolve(targetPath)
  const resolvedRoot = resolve(workspaceRoot)

  // Lexical check: must start with workspaceRoot/ or equal workspaceRoot
  if (!resolvedTarget.startsWith(resolvedRoot + '/') && resolvedTarget !== resolvedRoot) {
    throw new PathTraversalError(
      `Path escapes workspace: ${resolvedTarget}`,
      { workspaceRoot: resolvedRoot, targetPath }
    )
  }

  // Symlink check: resolve real path and verify again (T-01-07)
  try {
    const realTarget = await realpath(resolvedTarget)
    const realRoot = await realpath(resolvedRoot)
    if (!realTarget.startsWith(realRoot + '/') && realTarget !== realRoot) {
      throw new PathTraversalError(
        `Symlink escapes workspace: ${realTarget}`,
        { workspaceRoot: realRoot, targetPath }
      )
    }
    return realTarget
  } catch (error) {
    if (error instanceof PathTraversalError) throw error
    // File does not exist yet (e.g. write targets) — lexical check above is sufficient
    return resolvedTarget
  }
}
