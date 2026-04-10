import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrapWorkspace } from './workspace.js'

describe('bootstrapWorkspace', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('creates workspace with config.json, plan-contracts/, traces/, sessions/', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-ws-'))
    const layout = await bootstrapWorkspace('test-ws-1', tempDir)

    // Verify all directories exist
    const planStats = await stat(layout.planContractsDir)
    expect(planStats.isDirectory()).toBe(true)

    const tracesStats = await stat(layout.tracesDir)
    expect(tracesStats.isDirectory()).toBe(true)

    const sessionsStats = await stat(layout.sessionsDir)
    expect(sessionsStats.isDirectory()).toBe(true)

    // Verify config.json exists and is valid JSON
    const configContent = await readFile(layout.configPath, 'utf-8')
    const config = JSON.parse(configContent)
    expect(config.workspaceId).toBe('test-ws-1')
    expect(config.createdAt).toBeDefined()
  })

  it('is idempotent (calling twice does not error)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-ws-'))

    const layout1 = await bootstrapWorkspace('test-ws-2', tempDir)
    const layout2 = await bootstrapWorkspace('test-ws-2', tempDir)

    expect(layout1.root).toBe(layout2.root)

    // Config should not be overwritten
    const configContent = await readFile(layout2.configPath, 'utf-8')
    const config = JSON.parse(configContent)
    expect(config.workspaceId).toBe('test-ws-2')
  })

  it('returns correct layout paths', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-ws-'))
    const layout = await bootstrapWorkspace('ws-paths', tempDir)

    expect(layout.root).toBe(join(tempDir, 'ws-paths'))
    expect(layout.configPath).toBe(join(tempDir, 'ws-paths', 'config.json'))
    expect(layout.planContractsDir).toBe(join(tempDir, 'ws-paths', 'plan-contracts'))
    expect(layout.tracesDir).toBe(join(tempDir, 'ws-paths', 'traces'))
    expect(layout.sessionsDir).toBe(join(tempDir, 'ws-paths', 'sessions'))
  })
})
