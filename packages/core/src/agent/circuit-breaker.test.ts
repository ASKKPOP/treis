import { describe, it, expect, beforeEach } from 'vitest'
import { CircuitBreaker } from './circuit-breaker.js'

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker

  beforeEach(() => {
    cb = new CircuitBreaker()
  })

  it('Test 1: first call with tool+input returns triggered=false', () => {
    const result = cb.record('readFile', { path: '/tmp/foo.txt' })
    expect(result.triggered).toBe(false)
    expect(result.count).toBe(1)
  })

  it('Test 2: second identical call returns triggered=false, count=2', () => {
    cb.record('readFile', { path: '/tmp/foo.txt' })
    const result = cb.record('readFile', { path: '/tmp/foo.txt' })
    expect(result.triggered).toBe(false)
    expect(result.count).toBe(2)
  })

  it('Test 3: third identical call returns triggered=true (FATAL per AGENT-06)', () => {
    cb.record('readFile', { path: '/tmp/foo.txt' })
    cb.record('readFile', { path: '/tmp/foo.txt' })
    const result = cb.record('readFile', { path: '/tmp/foo.txt' })
    expect(result.triggered).toBe(true)
    expect(result.count).toBe(3)
  })

  it('Test 4: different tool name resets counter (not identical)', () => {
    cb.record('readFile', { path: '/tmp/foo.txt' })
    cb.record('readFile', { path: '/tmp/foo.txt' })
    // Different tool name — should be independent counter
    const result = cb.record('writeFile', { path: '/tmp/foo.txt' })
    expect(result.triggered).toBe(false)
    expect(result.count).toBe(1)
  })

  it('Test 5: different input resets counter (not identical)', () => {
    cb.record('readFile', { path: '/tmp/foo.txt' })
    cb.record('readFile', { path: '/tmp/foo.txt' })
    // Same tool, different input — should be independent counter
    const result = cb.record('readFile', { path: '/tmp/bar.txt' })
    expect(result.triggered).toBe(false)
    expect(result.count).toBe(1)
  })

  it('Test 6: clear() resets all counters', () => {
    cb.record('readFile', { path: '/tmp/foo.txt' })
    cb.record('readFile', { path: '/tmp/foo.txt' })
    cb.clear()
    const result = cb.record('readFile', { path: '/tmp/foo.txt' })
    expect(result.count).toBe(1)
    expect(result.triggered).toBe(false)
  })

  it('Test 7: after clear(), same tool+input starts counting from 1', () => {
    // Reach threshold
    cb.record('shell', { cmd: 'ls' })
    cb.record('shell', { cmd: 'ls' })
    const before = cb.record('shell', { cmd: 'ls' })
    expect(before.triggered).toBe(true)

    cb.clear()

    // After clear, starts fresh
    const after = cb.record('shell', { cmd: 'ls' })
    expect(after.count).toBe(1)
    expect(after.triggered).toBe(false)
  })

  it('supports custom threshold', () => {
    const strictCb = new CircuitBreaker(2)
    strictCb.record('tool', {})
    const result = strictCb.record('tool', {})
    expect(result.triggered).toBe(true)
    expect(result.count).toBe(2)
  })

  it('includes the key in the result', () => {
    const result = cb.record('readFile', { path: '/foo' })
    expect(result.key).toBeDefined()
    expect(typeof result.key).toBe('string')
    expect(result.key).toContain('readFile')
  })
})
