type Listener<T> = (state: T) => void

export interface Store<T> {
  getState(): Readonly<T>
  setState(updater: (current: T) => Partial<T>): void
  subscribe(listener: Listener<T>): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = { ...initial }
  const listeners = new Set<Listener<T>>()

  return {
    getState: (): Readonly<T> => state,

    setState: (updater: (current: T) => Partial<T>): void => {
      const patch = updater(state)
      const next = { ...state, ...patch }
      // Shallow comparison — only notify if something actually changed
      const changed = (Object.keys(patch) as Array<keyof T>).some(
        k => patch[k] !== state[k]
      )
      if (!changed) return
      state = next
      listeners.forEach(l => l(state))
    },

    subscribe: (listener: Listener<T>): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
