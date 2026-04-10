import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface WorkspaceLayout {
  root: string
  configPath: string
  planContractsDir: string
  tracesDir: string
  sessionsDir: string
}

export async function bootstrapWorkspace(
  workspaceId: string,
  baseDir?: string
): Promise<WorkspaceLayout> {
  const root = join(baseDir ?? join(homedir(), '.treis', 'workspaces'), workspaceId)

  const planContractsDir = join(root, 'plan-contracts')
  const tracesDir = join(root, 'traces')
  const sessionsDir = join(root, 'sessions')
  const configPath = join(root, 'config.json')

  // Create all directories (recursive = idempotent)
  await mkdir(planContractsDir, { recursive: true })
  await mkdir(tracesDir, { recursive: true })
  await mkdir(sessionsDir, { recursive: true })

  // Create config.json if it doesn't exist
  try {
    await access(configPath)
  } catch {
    await writeFile(configPath, JSON.stringify({
      workspaceId,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8')
  }

  return { root, configPath, planContractsDir, tracesDir, sessionsDir }
}
