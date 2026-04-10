import { describe, it, expect, beforeEach } from 'vitest'
import { StateMachine, TRANSITIONS } from './state-machine.js'
import { AgentState } from './types.js'
import { TreisError } from '../errors.js'

describe('StateMachine', () => {
  let sm: StateMachine

  beforeEach(() => {
    sm = new StateMachine()
  })

  it('Test 1: starts in IDLE state', () => {
    expect(sm.state).toBe(AgentState.IDLE)
  })

  it('Test 2: IDLE -> PREPARE succeeds', () => {
    sm.transition(AgentState.PREPARE)
    expect(sm.state).toBe(AgentState.PREPARE)
  })

  it('Test 3: PREPARE -> STREAM succeeds', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    expect(sm.state).toBe(AgentState.STREAM)
  })

  it('Test 4: STREAM -> TOOLS succeeds (tool calls present)', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.TOOLS)
    expect(sm.state).toBe(AgentState.TOOLS)
  })

  it('Test 5: STREAM -> EVALUATE succeeds (no tool calls - text-only step)', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    expect(sm.state).toBe(AgentState.EVALUATE)
  })

  it('Test 6: TOOLS -> EVALUATE succeeds', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.TOOLS)
    sm.transition(AgentState.EVALUATE)
    expect(sm.state).toBe(AgentState.EVALUATE)
  })

  it('Test 7: EVALUATE -> NEXT succeeds', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.NEXT)
    expect(sm.state).toBe(AgentState.NEXT)
  })

  it('Test 8: EVALUATE -> COMPLETE succeeds', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.COMPLETE)
    expect(sm.state).toBe(AgentState.COMPLETE)
  })

  it('Test 9: EVALUATE -> VIOLATED succeeds', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.VIOLATED)
    expect(sm.state).toBe(AgentState.VIOLATED)
  })

  it('Test 10: EVALUATE -> FAILED succeeds', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.FAILED)
    expect(sm.state).toBe(AgentState.FAILED)
  })

  it('Test 11: NEXT -> PREPARE succeeds (loops back for next step)', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.NEXT)
    sm.transition(AgentState.PREPARE)
    expect(sm.state).toBe(AgentState.PREPARE)
  })

  it('Test 12: IDLE -> STREAM throws TreisError (skip not allowed)', () => {
    expect(() => sm.transition(AgentState.STREAM)).toThrow(TreisError)
    expect(() => sm.transition(AgentState.STREAM)).toThrow(/Illegal state transition: IDLE -> STREAM/)
  })

  it('Test 13: COMPLETE -> IDLE throws TreisError (terminal state)', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.COMPLETE)
    expect(() => sm.transition(AgentState.IDLE)).toThrow(TreisError)
    expect(() => sm.transition(AgentState.IDLE)).toThrow(/Illegal state transition: COMPLETE -> IDLE/)
  })

  it('Test 14: VIOLATED -> IDLE throws TreisError (terminal state)', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.VIOLATED)
    expect(() => sm.transition(AgentState.IDLE)).toThrow(TreisError)
  })

  it('Test 15: FAILED -> IDLE throws TreisError (terminal state)', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.FAILED)
    expect(() => sm.transition(AgentState.IDLE)).toThrow(TreisError)
  })

  it('Test 16: STREAM -> COMPLETE throws TreisError (must go through EVALUATE)', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    expect(() => sm.transition(AgentState.COMPLETE)).toThrow(TreisError)
    expect(() => sm.transition(AgentState.COMPLETE)).toThrow(/Illegal state transition: STREAM -> COMPLETE/)
  })

  it('Test 17: reset() returns state to IDLE', () => {
    sm.transition(AgentState.PREPARE)
    sm.transition(AgentState.STREAM)
    sm.transition(AgentState.EVALUATE)
    sm.transition(AgentState.COMPLETE)
    sm.reset()
    expect(sm.state).toBe(AgentState.IDLE)
  })
})

describe('TRANSITIONS', () => {
  it('terminal states have empty transition arrays', () => {
    expect(TRANSITIONS[AgentState.COMPLETE]).toHaveLength(0)
    expect(TRANSITIONS[AgentState.VIOLATED]).toHaveLength(0)
    expect(TRANSITIONS[AgentState.FAILED]).toHaveLength(0)
  })

  it('STREAM can go to both TOOLS and EVALUATE', () => {
    expect(TRANSITIONS[AgentState.STREAM]).toContain(AgentState.TOOLS)
    expect(TRANSITIONS[AgentState.STREAM]).toContain(AgentState.EVALUATE)
  })
})
