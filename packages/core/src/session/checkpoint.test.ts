import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveCheckpoint, loadCheckpoint } from './checkpoint.js'
import type { StepCheckpoint } from './checkpoint.js'

describe('checkpoint', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('saveCheckpoint writes step state to checkpoint.json atomically', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-ckpt-'))

    const checkpoint: StepCheckpoint = {
      stepNumber: 3,
      stepStatus: 'completed',
      timestamp: Date.now(),
      executionId: 'exec-100',
      state: { toolsCalled: 5, lastTool: 'FileRead' },
    }

    await saveCheckpoint(tempDir, checkpoint)
    const loaded = await loadCheckpoint(tempDir)

    expect(loaded).not.toBeNull()
    expect(loaded!.stepNumber).toBe(3)
    expect(loaded!.stepStatus).toBe('completed')
    expect(loaded!.executionId).toBe('exec-100')
    expect(loaded!.state.toolsCalled).toBe(5)
    expect(loaded!.state.lastTool).toBe('FileRead')
  })

  it('loadCheckpoint reads checkpoint.json and returns the step state', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-ckpt-'))

    const checkpoint: StepCheckpoint = {
      stepNumber: 1,
      stepStatus: 'in_progress',
      timestamp: 1234567890,
      executionId: 'exec-200',
      state: { progress: 0.5 },
    }

    await saveCheckpoint(tempDir, checkpoint)
    const loaded = await loadCheckpoint(tempDir)

    expect(loaded).toEqual(checkpoint)
  })

  it('loadCheckpoint returns null if no checkpoint exists', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-ckpt-'))

    const loaded = await loadCheckpoint(tempDir)
    expect(loaded).toBeNull()
  })

  it('saveCheckpoint overwrites previous checkpoint (latest step only)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-ckpt-'))

    await saveCheckpoint(tempDir, {
      stepNumber: 1,
      stepStatus: 'completed',
      timestamp: 1000,
      executionId: 'exec-300',
      state: { step1Done: true },
    })

    await saveCheckpoint(tempDir, {
      stepNumber: 2,
      stepStatus: 'completed',
      timestamp: 2000,
      executionId: 'exec-300',
      state: { step2Done: true },
    })

    const loaded = await loadCheckpoint(tempDir)
    expect(loaded).not.toBeNull()
    expect(loaded!.stepNumber).toBe(2)
    expect(loaded!.state.step2Done).toBe(true)
    expect(loaded!.state).not.toHaveProperty('step1Done')
  })
})
