interface TreisApi {
  query: (payload: unknown) => Promise<unknown>
  amend: (decision: string) => Promise<void>
  modelHealth: () => Promise<unknown>
  onStream: (cb: (ev: unknown) => void) => () => void
  onToolProgress: (cb: (ev: unknown) => void) => () => void
  onToolResult: (cb: (ev: unknown) => void) => () => void
  onInterrupt: (cb: (ev: unknown) => void) => () => void
  onStatus: (cb: (ev: unknown) => void) => () => void
}

declare global {
  interface Window {
    treis: TreisApi
  }
}

export {}
