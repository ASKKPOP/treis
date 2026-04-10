import { describe, it, expect } from 'vitest'
import {
  TreisError,
  ModelConnectionError,
  ModelStreamError,
  ToolExecutionError,
  PermissionDeniedError,
  PathTraversalError,
} from './errors.js'

describe('TreisError base class', () => {
  it('has message, name, and context with timestamp', () => {
    const err = new TreisError('base error')
    expect(err.message).toBe('base error')
    expect(err.name).toBe('TreisError')
    expect(err.context).toBeDefined()
    expect(typeof err.context.timestamp).toBe('number')
    expect(err.context.timestamp).toBeGreaterThan(0)
  })

  it('accepts optional context fields', () => {
    const err = new TreisError('error with context', { tool: 'FileRead', input: 'some-input' })
    expect(err.context.tool).toBe('FileRead')
    expect(err.context.input).toBe('some-input')
    expect(typeof err.context.timestamp).toBe('number')
  })

  it('is an instance of Error', () => {
    const err = new TreisError('base')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ModelConnectionError', () => {
  it('extends TreisError with correct name', () => {
    const err = new ModelConnectionError('connection failed')
    expect(err).toBeInstanceOf(TreisError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ModelConnectionError')
    expect(err.message).toBe('connection failed')
    expect(typeof err.context.timestamp).toBe('number')
  })
})

describe('ModelStreamError', () => {
  it('extends TreisError with correct name', () => {
    const err = new ModelStreamError('stream interrupted')
    expect(err).toBeInstanceOf(TreisError)
    expect(err.name).toBe('ModelStreamError')
    expect(err.message).toBe('stream interrupted')
    expect(typeof err.context.timestamp).toBe('number')
  })
})

describe('ToolExecutionError', () => {
  it('extends TreisError with tool and context', () => {
    const err = new ToolExecutionError('tool failed', { tool: 'BashTool' })
    expect(err).toBeInstanceOf(TreisError)
    expect(err.name).toBe('ToolExecutionError')
    expect(err.message).toBe('tool failed')
    expect(err.context.tool).toBe('BashTool')
    expect(typeof err.context.timestamp).toBe('number')
  })

  it('accepts input in context', () => {
    const err = new ToolExecutionError('tool failed', { tool: 'FileRead', input: 'path/to/file' })
    expect(err.context.tool).toBe('FileRead')
    expect(err.context.input).toBe('path/to/file')
    expect(typeof err.context.timestamp).toBe('number')
  })
})

describe('PermissionDeniedError', () => {
  it('extends TreisError with requiredTier field', () => {
    const err = new PermissionDeniedError('permission denied', { requiredTier: 'ExecuteShell' })
    expect(err).toBeInstanceOf(TreisError)
    expect(err.name).toBe('PermissionDeniedError')
    expect(err.message).toBe('permission denied')
    expect(err.requiredTier).toBe('ExecuteShell')
    expect(typeof err.context.timestamp).toBe('number')
  })
})

describe('PathTraversalError', () => {
  it('extends TreisError with workspaceRoot and targetPath in context', () => {
    const err = new PathTraversalError('path traversal detected', {
      workspaceRoot: '/home/user/.treis',
      targetPath: '/etc/passwd',
    })
    expect(err).toBeInstanceOf(TreisError)
    expect(err.name).toBe('PathTraversalError')
    expect(err.message).toBe('path traversal detected')
    expect(err.context.workspaceRoot).toBe('/home/user/.treis')
    expect(err.context.targetPath).toBe('/etc/passwd')
    expect(typeof err.context.timestamp).toBe('number')
  })
})

describe('All errors include context.timestamp', () => {
  it('every error class sets timestamp in context', () => {
    const errors = [
      new TreisError('test'),
      new ModelConnectionError('test'),
      new ModelStreamError('test'),
      new ToolExecutionError('test', { tool: 'BashTool' }),
      new PermissionDeniedError('test', { requiredTier: 'ReadOnly' }),
      new PathTraversalError('test', { workspaceRoot: '/root', targetPath: '/outside' }),
    ]
    for (const err of errors) {
      expect(typeof err.context.timestamp).toBe('number')
      expect(err.context.timestamp).toBeGreaterThan(0)
    }
  })
})
