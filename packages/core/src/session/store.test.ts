import { describe, it, expect, vi } from 'vitest'
import { createStore } from './store.js'

describe('createStore', () => {
  it('returns getState, setState, subscribe functions', () => {
    const store = createStore({ count: 0 })
    expect(typeof store.getState).toBe('function')
    expect(typeof store.setState).toBe('function')
    expect(typeof store.subscribe).toBe('function')
  })

  it('getState returns the initial state', () => {
    const store = createStore({ count: 0, name: 'test' })
    expect(store.getState()).toEqual({ count: 0, name: 'test' })
  })

  it('setState updates state and notifies listeners', () => {
    const store = createStore({ count: 0 })
    const listener = vi.fn()
    store.subscribe(listener)

    store.setState(current => ({ count: current.count + 1 }))

    expect(store.getState().count).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ count: 1 })
  })

  it('setState with same values does NOT notify listeners (shallow comparison)', () => {
    const store = createStore({ count: 5, name: 'hello' })
    const listener = vi.fn()
    store.subscribe(listener)

    store.setState(() => ({ count: 5 }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('subscribe returns unsubscribe function that removes listener', () => {
    const store = createStore({ count: 0 })
    const listener = vi.fn()
    const unsub = store.subscribe(listener)

    store.setState(() => ({ count: 1 }))
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
    store.setState(() => ({ count: 2 }))
    expect(listener).toHaveBeenCalledTimes(1) // not called again
  })

  it('notifies multiple listeners on change', () => {
    const store = createStore({ value: 'a' })
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    store.subscribe(listener1)
    store.subscribe(listener2)

    store.setState(() => ({ value: 'b' }))

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)
  })
})
