import { writeFile, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'

export interface StepCheckpoint {
  stepNumber: number
  stepStatus: 'completed' | 'failed' | 'in_progress'
  timestamp: number
  executionId: string
  state: Record<string, unknown>
}

const CHECKPOINT_FILENAME = 'checkpoint.json'

export async function saveCheckpoint(
  workspaceRoot: string,
  checkpoint: StepCheckpoint
): Promise<void> {
  const checkpointPath = join(workspaceRoot, CHECKPOINT_FILENAME)
  const tempPath = checkpointPath + '.tmp'

  // Atomic write: write to temp file, then rename (T-01-16 mitigation)
  await writeFile(tempPath, JSON.stringify(checkpoint, null, 2), 'utf-8')
  await rename(tempPath, checkpointPath)
}

export async function loadCheckpoint(
  workspaceRoot: string
): Promise<StepCheckpoint | null> {
  const checkpointPath = join(workspaceRoot, CHECKPOINT_FILENAME)
  try {
    const content = await readFile(checkpointPath, 'utf-8')
    return JSON.parse(content) as StepCheckpoint
  } catch {
    return null  // No checkpoint exists
  }
}
