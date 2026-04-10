import { contextBridge, ipcRenderer } from 'electron'

// Expose a typed, minimal API to the renderer via contextBridge.
// ipcRenderer is NOT exposed directly — only these 8 named functions.
// contextIsolation: true prevents renderer from accessing Node.js (T-04-01).
contextBridge.exposeInMainWorld('treis', {
  // Invoke channels (renderer -> main, returns Promise)
  query: (payload: unknown) => ipcRenderer.invoke('treis:query', payload),
  amend: (decision: string) => ipcRenderer.invoke('treis:amend', decision),
  modelHealth: () => ipcRenderer.invoke('treis:model-health'),

  // Push event subscriptions (main -> renderer, returns unsubscribe fn)
  onStream: (cb: (ev: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:stream', handler)
    return () => ipcRenderer.removeListener('treis:stream', handler)
  },

  onToolProgress: (cb: (ev: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:tool-progress', handler)
    return () => ipcRenderer.removeListener('treis:tool-progress', handler)
  },

  onToolResult: (cb: (ev: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:tool-result', handler)
    return () => ipcRenderer.removeListener('treis:tool-result', handler)
  },

  onInterrupt: (cb: (ev: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:interrupt', handler)
    return () => ipcRenderer.removeListener('treis:interrupt', handler)
  },

  onStatus: (cb: (ev: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:status', handler)
    return () => ipcRenderer.removeListener('treis:status', handler)
  },
})
