import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionPersister } from './persist.js'
import type { ConversationEntry } from './persist.js'

describe('createSessionPersister', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('appends messages as JSONL lines to {sid}.jsonl', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-persist-'))
    const persister = createSessionPersister(tempDir, 'session-1')

    const entry: ConversationEntry = {
      role: 'user',
      content: 'Hello world',
      timestamp: Date.now(),
    }
    await persister.append(entry)

    const content = await readFile(persister.filePath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(1)

    const parsed = JSON.parse(lines[0])
    expect(parsed.role).toBe('user')
    expect(parsed.content).toBe('Hello world')
  })

  it('each JSONL line is valid JSON parseable by JSON.parse', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-persist-'))
    const persister = createSessionPersister(tempDir, 'session-2')

    await persister.append({ role: 'user', content: 'msg1', timestamp: 1 })
    await persister.append({ role: 'assistant', content: 'msg2', timestamp: 2 })
    await persister.append({ role: 'system', content: 'msg3', timestamp: 3 })

    const content = await readFile(persister.filePath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(3)

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })

  it('writes are append-only (existing content preserved)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-persist-'))
    const persister = createSessionPersister(tempDir, 'session-3')

    await persister.append({ role: 'user', content: 'first', timestamp: 1 })
    const after1 = await readFile(persister.filePath, 'utf-8')

    await persister.append({ role: 'assistant', content: 'second', timestamp: 2 })
    const after2 = await readFile(persister.filePath, 'utf-8')

    // The second write should contain both entries
    expect(after2.startsWith(after1)).toBe(true)
    const lines = after2.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).content).toBe('first')
    expect(JSON.parse(lines[1]).content).toBe('second')
  })

  it('filePath matches expected path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-persist-'))
    const persister = createSessionPersister(tempDir, 'my-session')

    expect(persister.filePath).toBe(join(tempDir, 'my-session.jsonl'))
  })

  it('supports metadata in entries', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-persist-'))
    const persister = createSessionPersister(tempDir, 'session-meta')

    await persister.append({
      role: 'tool',
      content: 'result',
      timestamp: Date.now(),
      metadata: { toolName: 'FileRead', duration: 100 },
    })

    const content = await readFile(persister.filePath, 'utf-8')
    const parsed = JSON.parse(content.trim())
    expect(parsed.metadata.toolName).toBe('FileRead')
    expect(parsed.metadata.duration).toBe(100)
  })
})
