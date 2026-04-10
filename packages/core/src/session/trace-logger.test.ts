import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTraceLogger } from './trace-logger.js'

describe('createTraceLogger', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('creates a logger with execution_id and session_id', () => {
    tempDir = join(tmpdir(), 'treis-trace-sync-' + Date.now())
    const logger = createTraceLogger(tempDir, 'exec-123', 'sess-456')

    expect(logger.executionId).toBe('exec-123')
    expect(logger.sessionId).toBe('sess-456')
  })

  it('logToolCall writes a JSONL entry with all D-16 fields', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-trace-'))
    const logger = createTraceLogger(tempDir, 'exec-001', 'sess-001')

    logger.logToolCall({
      step: 1,
      tool: 'FileRead',
      input: 'path/to/file.ts',
      output: 'file contents here',
      verdict: 'PASS',
      durationMs: 42,
    })

    // Flush and wait for pino sync write
    logger.flush()
    // Small delay to ensure file write completes
    await new Promise(resolve => setTimeout(resolve, 100))

    const content = await readFile(join(tempDir, 'exec-001.jsonl'), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(1)

    const entry = JSON.parse(lines[lines.length - 1])
    expect(entry.step).toBe(1)
    expect(entry.tool).toBe('FileRead')
    expect(entry.input).toBe('path/to/file.ts')
    expect(entry.output).toBe('file contents here')
    expect(entry.verdict).toBe('PASS')
    expect(entry.duration_ms).toBe(42)
    expect(entry.execution_id).toBe('exec-001')
    expect(entry.session_id).toBe('sess-001')
    expect(typeof entry.ts).toBe('number')
  })

  it('each trace entry is a valid JSON line', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-trace-'))
    const logger = createTraceLogger(tempDir, 'exec-002', 'sess-002')

    logger.logToolCall({ step: 1, tool: 'Grep', input: 'pattern', output: 'match', verdict: 'PASS', durationMs: 10 })
    logger.logToolCall({ step: 2, tool: 'Bash', input: 'ls', output: 'files', verdict: 'WARN', durationMs: 20 })

    logger.flush()
    await new Promise(resolve => setTimeout(resolve, 100))

    const content = await readFile(join(tempDir, 'exec-002.jsonl'), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })

  it('input summary is truncated (never raw full input)', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-trace-'))
    const logger = createTraceLogger(tempDir, 'exec-003', 'sess-003')

    const longInput = 'x'.repeat(500)
    logger.logToolCall({
      step: 1,
      tool: 'FileRead',
      input: longInput,
      output: 'short',
      verdict: 'PASS',
      durationMs: 5,
    })

    logger.flush()
    await new Promise(resolve => setTimeout(resolve, 100))

    const content = await readFile(join(tempDir, 'exec-003.jsonl'), 'utf-8')
    const lines = content.trim().split('\n')
    const entry = JSON.parse(lines[lines.length - 1])

    expect(entry.input.length).toBeLessThanOrEqual(200)
    expect(entry.input.endsWith('...')).toBe(true)
  })

  it('output summary is truncated for long outputs', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'treis-trace-'))
    const logger = createTraceLogger(tempDir, 'exec-004', 'sess-004')

    const longOutput = 'y'.repeat(1000)
    logger.logToolCall({
      step: 1,
      tool: 'Bash',
      input: 'cmd',
      output: longOutput,
      verdict: 'PASS',
      durationMs: 100,
    })

    logger.flush()
    await new Promise(resolve => setTimeout(resolve, 100))

    const content = await readFile(join(tempDir, 'exec-004.jsonl'), 'utf-8')
    const lines = content.trim().split('\n')
    const entry = JSON.parse(lines[lines.length - 1])

    expect(entry.output.length).toBeLessThanOrEqual(500)
    expect(entry.output.endsWith('...')).toBe(true)
  })
})
