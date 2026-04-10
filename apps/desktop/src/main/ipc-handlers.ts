import { Worker, MessageChannel } from 'node:worker_threads'
import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { checkModelHealth } from '@treis/api-client'
import { createSlotManager } from '@treis/api-client'
import workerPath from './agent-worker?modulePath'

export function registerIpcHandlers(sender: WebContents): void {
  let activeWorker: Worker | null = null
  let violationPort1: import('node:worker_threads').MessagePort | null = null

  // Channel 1: treis:query — renderer invokes to submit intent, answers, or option selection
  ipcMain.handle('treis:query', async (_event, payload: { action: string; data: unknown }) => {
    // Terminate any existing worker before starting a new one
    if (activeWorker) {
      activeWorker.terminate()
      activeWorker = null
    }

    const { port1, port2 } = new MessageChannel()
    violationPort1 = port1

    activeWorker = new Worker(workerPath, {
      workerData: { payload, violationPort: port2 },
      transferList: [port2],
    })

    activeWorker.on('message', (agentEvent: { type: string; [key: string]: unknown }) => {
      // Channels 2-6: route AgentEvent types to named IPC push channels
      switch (agentEvent.type) {
        case 'token':
          sender.send('treis:stream', agentEvent)          // Channel 2
          break
        case 'tool-start':
          sender.send('treis:tool-progress', agentEvent)  // Channel 3
          break
        case 'tool-result':
          sender.send('treis:tool-result', agentEvent)    // Channel 4
          break
        case 'violation':
        case 'escalation-required':
          sender.send('treis:interrupt', agentEvent)       // Channel 5
          break
        case 'step-complete':
        case 'complete':
        case 'failed':
        case 'budget-warning':
        case 'retry':
          sender.send('treis:status', agentEvent)          // Channel 6
          break
        // Internal relay types: clarify-response, options-response, contract-sealed
        default:
          sender.send('treis:status', agentEvent)
          break
      }
    })

    activeWorker.on('error', (err) => {
      sender.send('treis:status', { type: 'failed', reason: err.message, step: 0 })
    })

    activeWorker.on('exit', () => {
      activeWorker = null
    })

    // Violation resolution: renderer sends decision back via treis:amend
    // handleOnce so each violation resolves exactly once
    ipcMain.handleOnce('treis:amend', (_e, decision: string) => {
      if (violationPort1) {
        violationPort1.postMessage(decision)
      }
    })
  })

  // Channel 7: treis:model-health — renderer polls model availability
  ipcMain.handle('treis:model-health', async () => {
    const provider = (process.env.TREIS_MODEL_PROVIDER ?? 'ollama') as 'ollama' | 'anthropic'
    const modelId = process.env.TREIS_MODEL_ID ?? 'llama3.2'
    const slotManager = createSlotManager({
      slotA: { slot: 'A', provider, modelId, role: 'strongest' },
      slotB: { slot: 'B', provider, modelId, role: 'fastest' },
    })
    const adapter = slotManager.getAdapter('A')
    return checkModelHealth(adapter, modelId)
  })
}
