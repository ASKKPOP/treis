import { useEffect, useCallback, useRef } from 'react'

export function useTreis() {
  const listenersRef = useRef<Array<() => void>>([])

  // Subscribe to IPC push events with cleanup tracking
  const onStream = useCallback((cb: (ev: unknown) => void) => {
    const unsub = window.treis.onStream(cb)
    listenersRef.current.push(unsub)
    return unsub
  }, [])

  const onToolProgress = useCallback((cb: (ev: unknown) => void) => {
    const unsub = window.treis.onToolProgress(cb)
    listenersRef.current.push(unsub)
    return unsub
  }, [])

  const onToolResult = useCallback((cb: (ev: unknown) => void) => {
    const unsub = window.treis.onToolResult(cb)
    listenersRef.current.push(unsub)
    return unsub
  }, [])

  const onInterrupt = useCallback((cb: (ev: unknown) => void) => {
    const unsub = window.treis.onInterrupt(cb)
    listenersRef.current.push(unsub)
    return unsub
  }, [])

  const onStatus = useCallback((cb: (ev: unknown) => void) => {
    const unsub = window.treis.onStatus(cb)
    listenersRef.current.push(unsub)
    return unsub
  }, [])

  // Cleanup all listeners on unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach((unsub) => unsub())
      listenersRef.current = []
    }
  }, [])

  return {
    query: window.treis.query,
    amend: window.treis.amend,
    modelHealth: window.treis.modelHealth,
    onStream,
    onToolProgress,
    onToolResult,
    onInterrupt,
    onStatus,
  }
}
