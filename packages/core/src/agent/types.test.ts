import { describe, it, expect } from 'vitest'
import { AgentState, StepVerdict, EXECUTION_LIMITS } from './types.js'

describe('AgentState', () => {
  it('Test 18: has exactly 9 states', () => {
    const keys = Object.keys(AgentState)
    expect(keys).toHaveLength(9)
  })

  it('Test 19: values are string literals matching their keys', () => {
    for (const [key, value] of Object.entries(AgentState)) {
      expect(value).toBe(key)
    }
  })

  it('contains all expected states', () => {
    expect(AgentState.IDLE).toBe('IDLE')
    expect(AgentState.PREPARE).toBe('PREPARE')
    expect(AgentState.STREAM).toBe('STREAM')
    expect(AgentState.TOOLS).toBe('TOOLS')
    expect(AgentState.EVALUATE).toBe('EVALUATE')
    expect(AgentState.NEXT).toBe('NEXT')
    expect(AgentState.COMPLETE).toBe('COMPLETE')
    expect(AgentState.VIOLATED).toBe('VIOLATED')
    expect(AgentState.FAILED).toBe('FAILED')
  })
})

describe('StepVerdict', () => {
  it('has PASS, FAIL, FATAL values', () => {
    expect(StepVerdict.PASS).toBe('PASS')
    expect(StepVerdict.FAIL).toBe('FAIL')
    expect(StepVerdict.FATAL).toBe('FATAL')
  })
})

describe('EXECUTION_LIMITS', () => {
  it('has required limit constants', () => {
    expect(EXECUTION_LIMITS.MAX_STEPS).toBe(25)
    expect(EXECUTION_LIMITS.MAX_RETRIES).toBe(3)
    expect(EXECUTION_LIMITS.CIRCUIT_BREAKER_THRESHOLD).toBe(3)
    expect(EXECUTION_LIMITS.RETRY_BACKOFF_MS).toEqual([1000, 2000, 4000])
  })
})
