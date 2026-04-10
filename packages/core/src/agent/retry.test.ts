import { describe, it, expect } from 'vitest'
import { createRetryHandler, buildRetryInjection } from './retry.js'
import { EXECUTION_LIMITS } from './types.js'

describe('buildRetryInjection', () => {
  it('Test 8: returns a user-role message with tool name and error info', () => {
    const result = buildRetryInjection('readFile', 'IOError', 'File not found', 1)
    expect(result.role).toBe('user')
    expect(result.content).toContain('readFile')
    expect(result.content).toContain('IOError')
    expect(result.content).toContain('File not found')
  })

  it('Test 9: error message is truncated to 200 chars in injection', () => {
    const longError = 'x'.repeat(500)
    const result = buildRetryInjection('tool', 'Error', longError, 1)
    // The truncated portion should be at most 200 chars of the error message
    const errorLine = result.content.split('\n').find(l => l.startsWith('Error:'))!
    const errorValue = errorLine.replace('Error: ', '')
    expect(errorValue.length).toBeLessThanOrEqual(200)
  })

  it('Test 10: retry count is included in injection text', () => {
    const result = buildRetryInjection('tool', 'Error', 'something failed', 2)
    expect(result.content).toContain('2')
    expect(result.content).toContain(`${EXECUTION_LIMITS.MAX_RETRIES}`)
  })

  it('includes "please try a different approach" guidance', () => {
    const result = buildRetryInjection('tool', 'Error', 'failed', 1)
    expect(result.content.toLowerCase()).toContain('different approach')
  })
})

describe('createRetryHandler', () => {
  it('Test 11: shouldRetry returns true for attempt 1', () => {
    const handler = createRetryHandler()
    expect(handler.shouldRetry(1)).toBe(true)
  })

  it('Test 11: shouldRetry returns true for attempt 2', () => {
    const handler = createRetryHandler()
    expect(handler.shouldRetry(2)).toBe(true)
  })

  it('Test 12: shouldRetry returns false for attempt 3 (at MAX_RETRIES)', () => {
    const handler = createRetryHandler()
    expect(handler.shouldRetry(3)).toBe(false)
  })

  it('Test 13: getBackoffMs returns 1000 for attempt 1', () => {
    const handler = createRetryHandler()
    expect(handler.getBackoffMs(1)).toBe(1000)
  })

  it('Test 13: getBackoffMs returns 2000 for attempt 2', () => {
    const handler = createRetryHandler()
    expect(handler.getBackoffMs(2)).toBe(2000)
  })

  it('Test 13: getBackoffMs returns 4000 for attempt 3', () => {
    const handler = createRetryHandler()
    expect(handler.getBackoffMs(3)).toBe(4000)
  })

  it('getBackoffMs returns max value for attempt beyond range', () => {
    const handler = createRetryHandler()
    expect(handler.getBackoffMs(10)).toBe(4000)
  })

  it('Test 14: shouldEscalate returns true when attempt reaches MAX_RETRIES', () => {
    const handler = createRetryHandler()
    expect(handler.shouldEscalate(3)).toBe(true)
  })

  it('shouldEscalate returns false for attempt below MAX_RETRIES', () => {
    const handler = createRetryHandler()
    expect(handler.shouldEscalate(1)).toBe(false)
    expect(handler.shouldEscalate(2)).toBe(false)
  })

  it('shouldEscalate returns true for attempt beyond MAX_RETRIES', () => {
    const handler = createRetryHandler()
    expect(handler.shouldEscalate(4)).toBe(true)
  })
})
