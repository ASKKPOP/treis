# Phase 4: Desktop - Research

**Researched:** 2026-04-10
**Domain:** Electron 35 + electron-vite 3 + React 19 + IPC streaming + electron-builder macOS DMG
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DESK-01 | Electron 35+ shell with React 19 renderer, built with electron-vite | electron-vite scaffold (`npm create @quick-start/electron@latest -- --template react-ts`), installs Electron 41.2.0 (current), React 19.2.5 |
| DESK-02 | IPC bridge with 7 named channels (query, stream, tool-progress, tool-result, interrupt, status, model-health) | ipcMain.handle + webContents.send pattern; contextBridge exposeInMainWorld in preload; channels match TREIS_ARCHITECTURE_SPEC.md §10.1 |
| DESK-03 | Agent loop runs in worker thread, not main process (prevents UI blocking) | Node.js worker_threads in Electron main process; electron-vite `?modulePath` worker import; parentPort.postMessage relay to webContents.send |
| DESK-04 | Intent input screen with single text input | React screen component; invoke('treis:query') on submit |
| DESK-05 | AI dialogue screen with chat-style Q&A | React chat component; streaming tokens via treis:stream channel; disable input while AI typing |
| DESK-06 | Plan options screen with 3-card layout (A/B/C) | React card grid; invoke('treis:query', selectedOption) on card click |
| DESK-07 | Sealed contract screen showing scope, boundaries, criteria with "Begin Execution" button | Render PlanContract JSON; invoke to start agent execution |
| DESK-08 | Execution stream screen with step counter, tool calls, evaluator verdicts | Stream via treis:stream + treis:tool-progress + treis:tool-result; React state accumulation |
| DESK-09 | Result screen with deliverable summary and success criteria checklist | Render contract.successCriteria with checkboxes after complete event |
| DESK-10 | DMG packaging via electron-builder for macOS distribution | electron-builder 26.8.1; `arch: ['x64', 'arm64']` + `target: dmg`; pnpm build:mac |
| BENCH-05 | Demo GIF capturing Plan Contract flow from intent to completion | LICEcap or Kap (need install); brew install kap or licecap; ffmpeg alternative; committed to docs/ |
</phase_requirements>

---

## Summary

Phase 4 wraps the proven CLI engine in an Electron shell. The engine (Phases 1-3) is already complete and stable — `@treis/core`, `@treis/api-client`, and `@treis/tools` all export their public APIs cleanly. The desktop app is effectively a React UI layer over the existing `runAgent` / `createPlanContractEngine` calls, connected via Electron IPC.

The critical architectural constraint is DESK-03: the agent loop MUST run in a Node.js worker thread spawned from the main process, not in the main process itself. This prevents the agent's blocking async work from freezing the Electron event loop and the UI. The worker relays `AgentEvent` objects to the main process via `parentPort.postMessage`, and the main process forwards them to the renderer via `webContents.send`.

The IPC bridge design is fully specified in `TREIS_ARCHITECTURE_SPEC.md` §10.1 — 7 named channels with a clear renderer-to-main `invoke` / main-to-renderer `emit` split. The preload script exposes a typed `window.treis` API via `contextBridge.exposeInMainWorld`. The renderer consumes this API from React hooks.

For packaging (DESK-10), electron-builder 26.8.1 targets `dmg` + `zip` for both `arm64` and `x64` architectures. Code signing is deferred to v2 (PLAT-05) but the build config stubs must be in place.

**Primary recommendation:** Scaffold electron-vite with react-ts template, implement the IPC bridge + worker thread in the first plan, then build screens top-down (intent → result) in waves.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.2.0 | Desktop shell | Current stable; spec says 35+ [VERIFIED: npm registry] |
| electron-vite | 5.0.0 | Build tool (main+preload+renderer) | Purpose-built for Electron's three-context build; HMR in renderer; hot reload in main [VERIFIED: npm registry] |
| react | 19.2.5 | Renderer UI | Already chosen in CLAUDE.md; current stable [VERIFIED: npm registry] |
| electron-builder | 26.8.1 | macOS DMG packaging | Already chosen in CLAUDE.md; fine-grained DMG control [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | 4.2.2 | Utility CSS | All UI styling; no CSS-in-JS overhead [VERIFIED: npm registry] |
| @headlessui/react | 2.2.10 | Accessible modal/dialog | Contract violation modal (DESK-02 interrupt channel) [VERIFIED: npm registry] |
| @vitejs/plugin-react | 6.0.1 | Vite React plugin | Required by electron-vite react-ts template [VERIFIED: npm registry] |
| vitest | 3.x (workspace) | Unit tests | Already in monorepo; add desktop vitest.config.ts with `projects` key [VERIFIED: existing codebase] |
| playwright | 1.59.1 | E2E Electron tests | experimental `electron.launch()` support; for smoke test after DMG build [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tailwindcss | CSS modules | Tailwind 4 has faster build, less boilerplate for a focused single-app UI |
| @headlessui/react | @radix-ui/react-dialog | headlessui is lighter; radix is acceptable alternative; both work with React 19 |
| worker_threads | UtilityProcess | electron-vite `?modulePath` worker import works cleanly with worker_threads; UtilityProcess is heavier and needs IPC serialization |

**Installation (inside apps/desktop):**
```bash
# Scaffold (from repo root, replaces stub):
npm create @quick-start/electron@latest apps/desktop -- --template react-ts

# After scaffold, add project dependencies:
pnpm --filter @treis/desktop add @treis/core @treis/api-client @treis/tools
pnpm --filter @treis/desktop add tailwindcss @headlessui/react
pnpm --filter @treis/desktop add -D electron-builder playwright
```

**Version verification:** All versions confirmed via `npm view [package] version` on 2026-04-10. [VERIFIED: npm registry]

---

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop/
├── electron.vite.config.ts     # main / preload / renderer vite configs
├── electron-builder.config.ts  # DMG packaging config
├── package.json
├── tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts            # Electron app entry, BrowserWindow, ipcMain handlers
│   │   ├── ipc-handlers.ts     # Registers all 7 channels on ipcMain
│   │   └── agent-worker.ts     # Worker thread: runs runAgent, relays AgentEvent via parentPort
│   ├── preload/
│   │   └── index.ts            # contextBridge.exposeInMainWorld('treis', { ... })
│   └── renderer/
│       ├── main.tsx            # React entry point
│       ├── App.tsx             # Screen router (useState machine)
│       ├── screens/
│       │   ├── IntentInput.tsx
│       │   ├── Dialogue.tsx
│       │   ├── PlanOptions.tsx
│       │   ├── SealedContract.tsx
│       │   ├── ExecutionStream.tsx
│       │   └── Result.tsx
│       ├── components/
│       │   ├── ViolationModal.tsx   # interrupt channel handler
│       │   └── StreamTokens.tsx     # token accumulator display
│       └── hooks/
│           └── useTreis.ts          # wraps window.treis IPC calls
├── build/
│   └── icon.icns               # macOS app icon
└── vitest.config.ts
```

### Pattern 1: Worker Thread → Main → Renderer Event Relay

**What:** Agent loop runs in a Node.js worker thread. The main process creates the worker and pipes its messages to the renderer via `webContents.send`.

**When to use:** Any CPU-intensive or long-running async operation that must not block Electron's main event loop.

**Example:**
```typescript
// src/main/agent-worker.ts  (runs in worker thread)
import { parentPort, workerData } from 'node:worker_threads'
import { runAgent } from '@treis/core'
// ... setup tools, model from workerData
await runAgent({
  // ...
  consumer: (event) => {
    parentPort!.postMessage(event)  // relay AgentEvent to main process
  },
})
parentPort!.postMessage({ type: 'complete', totalSteps: state.totalSteps })

// src/main/ipc-handlers.ts  (main process)
import { Worker } from 'node:worker_threads'
import workerPath from './agent-worker?modulePath'  // electron-vite worker import

ipcMain.handle('treis:query', (event, payload) => {
  const { sender } = event  // webContents of the renderer
  const worker = new Worker(workerPath, { workerData: payload })
  worker.on('message', (agentEvent) => {
    // Map AgentEvent type → IPC channel
    if (agentEvent.type === 'token') sender.send('treis:stream', agentEvent)
    if (agentEvent.type === 'tool-start') sender.send('treis:tool-progress', agentEvent)
    if (agentEvent.type === 'tool-result') sender.send('treis:tool-result', agentEvent)
    if (agentEvent.type === 'violation') sender.send('treis:interrupt', agentEvent)
    if (agentEvent.type === 'complete') sender.send('treis:status', { done: true, ...agentEvent })
  })
})
// Source: TREIS_ARCHITECTURE_SPEC.md §10.1 + Electron multithreading docs [VERIFIED: codebase + electronjs.org]
```

### Pattern 2: Preload contextBridge Typed API

**What:** Preload script exposes a narrow, typed `window.treis` object to the renderer via `contextBridge`. No raw `ipcRenderer` is exposed.

**When to use:** Always — this is the only secure way to expose IPC to the renderer in Electron's context-isolated mode.

**Example:**
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const treisApi = {
  // Renderer → Main (invoke = async request/response)
  query: (payload: unknown) => ipcRenderer.invoke('treis:query', payload),
  amend: (decision: string) => ipcRenderer.invoke('treis:amend', decision),
  modelHealth: () => ipcRenderer.invoke('treis:model-health'),

  // Main → Renderer (on = subscribe to push events)
  onStream: (cb: (ev: unknown) => void) => {
    ipcRenderer.on('treis:stream', (_e, ev) => cb(ev))
    return () => ipcRenderer.removeAllListeners('treis:stream')
  },
  onToolProgress: (cb: (ev: unknown) => void) => {
    ipcRenderer.on('treis:tool-progress', (_e, ev) => cb(ev))
    return () => ipcRenderer.removeAllListeners('treis:tool-progress')
  },
  onInterrupt: (cb: (ev: unknown) => void) => {
    ipcRenderer.on('treis:interrupt', (_e, ev) => cb(ev))
    return () => ipcRenderer.removeAllListeners('treis:interrupt')
  },
  onStatus: (cb: (ev: unknown) => void) => {
    ipcRenderer.on('treis:status', (_e, ev) => cb(ev))
    return () => ipcRenderer.removeAllListeners('treis:status')
  },
}

contextBridge.exposeInMainWorld('treis', treisApi)

// Renderer type augmentation: src/renderer/env.d.ts
declare global {
  interface Window {
    treis: typeof treisApi
  }
}
// Source: Electron contextBridge docs [CITED: electronjs.org/docs/latest/api/context-bridge]
```

### Pattern 3: React Screen State Machine

**What:** App.tsx manages current screen as a simple enum state — no router library needed for a linear wizard flow.

**When to use:** Linear multi-step UI flows with no URL-based navigation.

**Example:**
```typescript
// src/renderer/App.tsx
type Screen = 'intent' | 'dialogue' | 'options' | 'contract' | 'execution' | 'result'

export function App() {
  const [screen, setScreen] = useState<Screen>('intent')
  const [contract, setContract] = useState<PlanContract | null>(null)

  return (
    <>
      {screen === 'intent' && <IntentInput onSubmit={() => setScreen('dialogue')} />}
      {screen === 'dialogue' && <Dialogue onComplete={() => setScreen('options')} />}
      {screen === 'options' && <PlanOptions onSelected={() => setScreen('contract')} />}
      {screen === 'contract' && <SealedContract contract={contract!} onBegin={() => setScreen('execution')} />}
      {screen === 'execution' && <ExecutionStream onComplete={() => setScreen('result')} />}
      {screen === 'result' && <Result contract={contract!} />}
      <ViolationModal />  {/* rendered over any screen when interrupt fires */}
    </>
  )
}
// Source: TREIS_ARCHITECTURE_SPEC.md §13.1 [VERIFIED: codebase]
```

### Pattern 4: electron-builder Universal DMG

**What:** Build two separate Electron apps (arm64, x64) and merge them into a single universal DMG.

**When to use:** macOS distribution targeting both Apple Silicon and Intel.

**Example:**
```json
// electron-builder.config.json (in apps/desktop)
{
  "appId": "io.treis.desktop",
  "productName": "Treis",
  "directories": { "buildResources": "build", "output": "release" },
  "mac": {
    "category": "public.app-category.developer-tools",
    "target": [
      { "target": "dmg", "arch": ["universal"] }
    ],
    "icon": "build/icon.icns",
    "hardenedRuntime": false
  },
  "dmg": {
    "title": "Treis ${version}",
    "artifactName": "Treis-${version}.dmg"
  }
}
```
```bash
# Build universal DMG
pnpm electron-builder --mac --universal
```
Note: `hardenedRuntime: false` is correct for Phase 4 (no code signing). Set to `true` only when notarization is added in v2 (PLAT-05). [CITED: electron.build/mac.html]

### Anti-Patterns to Avoid

- **Exposing raw ipcRenderer via contextBridge:** Never do `contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)` — this gives the renderer the ability to send arbitrary IPC messages.
- **Running runAgent in the main process directly:** Blocks the Electron event loop; all AI/tool execution must be in a worker thread.
- **Using ipcRenderer.sendSync:** Blocks the renderer thread synchronously until main process responds. Use `invoke` (Promise-based) exclusively.
- **Subscribing to IPC events without cleanup:** React useEffect cleanup must call the unsubscribe function returned by `onStream` / `onToolProgress` etc., or events accumulate across re-renders.
- **Importing Electron modules in the renderer:** The renderer cannot import `electron` directly when `contextIsolation: true` (the default). Only the preload can.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Electron build pipeline | Custom Vite config for main+preload+renderer | electron-vite 5 | Handles three-context build, HMR, hot reload, sourcemaps — 200+ lines of config eliminated |
| macOS DMG packaging | Custom shell scripts with `hdiutil` | electron-builder 26 | Code signing, universal binary merge, DMG layout, artifact naming all built in |
| Worker thread bundling | Manual webpack/esbuild for worker scripts | electron-vite `?modulePath` suffix | Automatically bundles worker file and returns its output path for `new Worker(path)` |
| IPC type safety | Hand-written cast everywhere | Typed `window.treis` declaration in `env.d.ts` | Single source of truth for preload API shape; TypeScript catches mismatches at compile time |
| CSS-in-JS runtime | styled-components, emotion | Tailwind 4 (build-time) | Zero runtime overhead; works with React 19 concurrent renderer |

**Key insight:** electron-vite eliminates the hardest part of Electron + Vite integration: correctly targeting Node.js globals in main/preload while keeping browser globals in renderer. Without it, configuring Rollup/Vite for three different module contexts is error-prone.

---

## Common Pitfalls

### Pitfall 1: Worker Thread Path Resolution in Production vs Dev
**What goes wrong:** `new Worker('./agent-worker.js')` works in dev but fails in the packaged app because paths are relative to CWD, not the app bundle.
**Why it happens:** electron-builder packages files into an ASAR archive; relative paths break.
**How to avoid:** Always use electron-vite's `?modulePath` import (`import workerPath from './agent-worker?modulePath'`) — it returns the correct absolute path in both dev and prod.
**Warning signs:** Worker construction succeeds in `electron-vite dev` but throws `ENOENT` or similar after `electron-builder` packaging.

### Pitfall 2: IPC Listener Accumulation (Memory Leak)
**What goes wrong:** `ipcRenderer.on('treis:stream', cb)` in a React `useEffect` without cleanup adds a new listener on every re-render; tokens arrive multiple times.
**Why it happens:** `ipcRenderer.on` does not auto-remove listeners; React re-renders fire useEffect multiple times.
**How to avoid:** Always return the unsubscribe function from useEffect:
```typescript
useEffect(() => {
  const unsub = window.treis.onStream((ev) => setTokens(t => t + ev.content))
  return unsub
}, [])
```
**Warning signs:** Token display shows repeated text; event handlers fire N times per event.

### Pitfall 3: violationHandler / escalationHandler Blocked in Worker
**What goes wrong:** The agent's `handleViolation` callback requires an async prompt (user interaction), but the worker thread cannot directly invoke IPC to the renderer.
**Why it happens:** worker_threads have no access to Electron APIs; they can only communicate via `parentPort`.
**How to avoid:** The main process registers a pending violation resolver. When `type === 'violation'` arrives from the worker, main sends `treis:interrupt` to renderer and awaits a `treis:amend` invoke from the renderer. Main resolves the pending Promise, unblocking the worker.
**Pattern:**
```typescript
// main/ipc-handlers.ts
let pendingViolation: ((decision: string) => void) | null = null

worker.on('message', (ev) => {
  if (ev.type === 'violation') {
    sender.send('treis:interrupt', ev)
    // worker pauses here via a SharedArrayBuffer or Promise in workerData
  }
})
ipcMain.handle('treis:amend', (_e, decision) => {
  pendingViolation?.(decision)
})
```
**Warning signs:** App freezes on contract violation; renderer receives interrupt event but agent never resumes.

### Pitfall 4: react/renderer Cannot Import @treis/core Directly
**What goes wrong:** React renderer tries to import `@treis/core` and crashes with "cannot find module 'node:fs'" or similar.
**Why it happens:** `@treis/core` uses Node.js built-ins (fs, path, worker_threads); renderer runs in a browser-like context without these.
**How to avoid:** All `@treis/core` imports live in `src/main/` only. The renderer interacts with core exclusively through the IPC bridge (`window.treis.*`). Data passed over IPC must be plain JSON-serializable objects.
**Warning signs:** Vite renderer build errors mentioning missing Node built-ins.

### Pitfall 5: electron-builder `files` array excludes workspace packages
**What goes wrong:** The packaged app cannot find `@treis/core` or other workspace packages.
**Why it happens:** electron-builder bundles only what's explicitly included; pnpm workspace symlinks in `node_modules` may not resolve.
**How to avoid:** Configure electron-builder's `files` pattern to include `node_modules` and ensure all workspace packages are built (`dist/`) before packaging. Use `pnpm build` at repo root before `electron-builder`.
**Warning signs:** `MODULE_NOT_FOUND` for workspace packages in the packaged app.

### Pitfall 6: Violation Promise synchronization across Worker ↔ Main boundary
**What goes wrong:** Agent worker blocks indefinitely on violation because the Promise passed to `handleViolation` never resolves.
**Why it happens:** Worker threads cannot share Promises across thread boundaries; `workerData` only holds serializable values.
**How to avoid:** Use `Atomics.wait` / `Atomics.notify` on a shared `SharedArrayBuffer` for synchronization, or restructure to use `postMessage` with an ack pattern where the worker polls for a response. The simplest approach: use `MessageChannel` ports passed via `workerData` so the worker can await a reply via `receiveMessageOnPort`.
**Warning signs:** Violation modal appears, user clicks an option, but execution never resumes.

---

## Code Examples

Verified patterns from codebase and official sources:

### Worker Thread Setup (electron-vite)
```typescript
// src/main/ipc-handlers.ts
import { Worker } from 'node:worker_threads'
import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import workerPath from './agent-worker?modulePath'  // electron-vite asset resolution

export function registerIpcHandlers(sender: WebContents) {
  let activeWorker: Worker | null = null

  ipcMain.handle('treis:query', async (_event, payload) => {
    const { port1, port2 } = new MessageChannel()
    activeWorker = new Worker(workerPath, {
      workerData: { payload, violationPort: port2 },
      transferList: [port2],
    })
    activeWorker.on('message', (agentEvent) => {
      switch (agentEvent.type) {
        case 'token': sender.send('treis:stream', agentEvent); break
        case 'tool-start': sender.send('treis:tool-progress', agentEvent); break
        case 'tool-result': sender.send('treis:tool-result', agentEvent); break
        case 'violation': sender.send('treis:interrupt', agentEvent); break
        case 'complete':
        case 'failed': sender.send('treis:status', agentEvent); break
      }
    })
    // port1 used to resolve violation decisions back to worker
    ipcMain.handleOnce('treis:amend', (_e, decision) => {
      port1.postMessage(decision)
    })
  })
}
// Source: TREIS_ARCHITECTURE_SPEC.md §10.1; electron-vite docs [VERIFIED: codebase + electron-vite.org]
```

### Violation Synchronization (worker side)
```typescript
// src/main/agent-worker.ts
import { workerData, parentPort } from 'node:worker_threads'
import { receiveMessageOnPort } from 'node:worker_threads'

const { violationPort } = workerData

const handleViolation = async (violation) => {
  parentPort!.postMessage({ type: 'violation', violation })
  // Block worker until renderer sends decision via port
  let msg = null
  while (!msg) {
    msg = receiveMessageOnPort(violationPort)
    if (!msg) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }
  return msg.message as ViolationDecision
}
// Source: Node.js worker_threads docs [CITED: nodejs.org/api/worker_threads.html]
```

### Preload Bridge Pattern
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('treis', {
  query: (payload: unknown) => ipcRenderer.invoke('treis:query', payload),
  amend: (decision: string) => ipcRenderer.invoke('treis:amend', decision),
  modelHealth: () => ipcRenderer.invoke('treis:model-health'),
  onStream: (cb: (ev: unknown) => void) => {
    const handler = (_e: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:stream', handler)
    return () => ipcRenderer.off('treis:stream', handler)
  },
  onToolProgress: (cb: (ev: unknown) => void) => {
    const handler = (_e: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:tool-progress', handler)
    return () => ipcRenderer.off('treis:tool-progress', handler)
  },
  onToolResult: (cb: (ev: unknown) => void) => {
    const handler = (_e: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:tool-result', handler)
    return () => ipcRenderer.off('treis:tool-result', handler)
  },
  onInterrupt: (cb: (ev: unknown) => void) => {
    const handler = (_e: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:interrupt', handler)
    return () => ipcRenderer.off('treis:interrupt', handler)
  },
  onStatus: (cb: (ev: unknown) => void) => {
    const handler = (_e: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on('treis:status', handler)
    return () => ipcRenderer.off('treis:status', handler)
  },
})
// Source: Electron contextBridge docs [CITED: electronjs.org/docs/latest/api/context-bridge]
```

### electron-builder Config (macOS universal DMG)
```json
{
  "appId": "io.treis.desktop",
  "productName": "Treis",
  "directories": {
    "buildResources": "build",
    "output": "release"
  },
  "files": [
    "out/**/*",
    "node_modules/**/*",
    "!node_modules/**/test/**",
    "!node_modules/**/*.map"
  ],
  "mac": {
    "category": "public.app-category.developer-tools",
    "hardenedRuntime": false,
    "target": [
      { "target": "dmg", "arch": ["universal"] }
    ],
    "icon": "build/icon.icns"
  },
  "dmg": {
    "title": "Treis ${version}",
    "artifactName": "Treis-${version}-macOS.dmg"
  }
}
```
Build command: `pnpm exec electron-builder --mac --universal`
[CITED: electron.build/mac.html]

---

## IPC Channel Reference

Per `TREIS_ARCHITECTURE_SPEC.md` §10.1 — all 7 channels mapped to AgentEvent types: [VERIFIED: codebase]

| Channel | Direction | Trigger | AgentEvent Type(s) |
|---------|-----------|---------|---------------------|
| `treis:query` | R→M invoke | User submits intent or selects option | — (payload varies by phase) |
| `treis:stream` | M→R emit | Token arrives from model | `token` |
| `treis:tool-progress` | M→R emit | Tool starts executing | `tool-start` |
| `treis:tool-result` | M→R emit | Tool finishes | `tool-result` |
| `treis:interrupt` | M→R emit | Violation or escalation | `violation`, `escalation-required` |
| `treis:status` | M→R emit | Step complete, complete, failed | `step-complete`, `complete`, `failed`, `budget-warning` |
| `treis:model-health` | R→M invoke | Renderer polls on mount | — (returns HealthCheckResult) |

The `treis:amend` channel (violation decision response) is an additional invoke channel not in the spec's original 7 but required for the violation synchronization loop.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Electron Forge as default scaffolding | electron-vite for build tooling | 2023-2024 | Better DX, HMR in renderer, hot reload in main, single config file |
| Electron 32 | Electron 35+ (spec), 41 current | EOL March 2025 | Electron 32 is EOL — use ^35 or latest |
| ipcRenderer.send + ipcMain.on (one-way) | ipcRenderer.invoke + ipcMain.handle (request/response) | Electron 7+ (2019) | invoke returns Promise; no callback race conditions |
| Zod 3 | Zod 4 (already in use) | July 2025 | Already using Zod 4 in @treis/core; no change needed |

**Deprecated/outdated:**
- `remote` module: Removed in Electron 14. Never use `require('electron').remote`.
- `ipcRenderer.sendSync`: Blocks renderer thread. Avoid entirely.
- Direct `ipcRenderer` exposure via contextBridge: Security vulnerability.

---

## BENCH-05: Demo GIF

**Requirement:** Demo GIF committed to `docs/` or `assets/` capturing full Plan Contract flow.

**Tools and status:**
- `ffmpeg`: NOT installed [VERIFIED: command -v ffmpeg → not found]
- `kap`: NOT installed [VERIFIED: ls /Applications/Kap.app → not found]
- `licecap`: NOT installed [VERIFIED: ls /Applications/LICEcap.app → not found]
- `brew`: AVAILABLE [VERIFIED: /usr/local/bin/brew]

**Plan:** Install Kap via Homebrew Cask (`brew install --cask kap`) in Wave 0 of the final plan, record the demo GIF manually using the running Electron app. Kap exports directly to GIF. The GIF should be committed to `docs/demo.gif`.

**Fallback:** If Kap install is blocked, use `brew install --cask licecap`. If neither works, use the macOS built-in Screenshot.app screen recording → convert to GIF via `ffmpeg` (installed as part of the plan).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | v24.14.1 | — |
| pnpm | Monorepo | ✓ | in use | — |
| Electron (npm) | DESK-01 | ✓ (npm) | 41.2.0 | — |
| electron-vite (npm) | DESK-01 | ✓ (npm) | 5.0.0 | — |
| electron-builder (npm) | DESK-10 | ✓ (npm) | 26.8.1 | — |
| React 19 (npm) | DESK-04..09 | ✓ (npm) | 19.2.5 | — |
| Tailwind 4 (npm) | UI | ✓ (npm) | 4.2.2 | CSS modules |
| Kap (desktop) | BENCH-05 | ✗ | — | `brew install --cask licecap` |
| ffmpeg (CLI) | BENCH-05 fallback | ✗ | — | `brew install ffmpeg` |
| Playwright (npm) | E2E tests | ✓ (npm) | 1.59.1 | Manual smoke test |
| @treis/core (workspace) | All IPC | ✓ | 0.0.1 | — |

**Missing dependencies with no fallback:**
- None that block implementation.

**Missing dependencies with fallback:**
- `kap` / `ffmpeg`: BENCH-05 GIF recording. Plan must include a Wave 0 step to `brew install --cask kap`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (already in monorepo) |
| Config file | `apps/desktop/vitest.config.ts` (Wave 0 creation) |
| Quick run command | `pnpm --filter @treis/desktop test` |
| Full suite command | `pnpm test` (root, runs all projects) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DESK-02 | IPC handler registration and event routing | unit | `pnpm --filter @treis/desktop test -- ipc-handlers` | ❌ Wave 0 |
| DESK-03 | Worker thread spawns, relays AgentEvents to main | unit (mock worker) | `pnpm --filter @treis/desktop test -- agent-worker` | ❌ Wave 0 |
| DESK-07 | Sealed contract screen renders scopeEntries and successCriteria | unit (React Testing Library) | `pnpm --filter @treis/desktop test -- SealedContract` | ❌ Wave 0 |
| DESK-10 | DMG builds and exists at release/ path | smoke (bash) | `test -f apps/desktop/release/*.dmg` | ❌ Wave 0 |
| BENCH-05 | docs/demo.gif exists and is > 0 bytes | smoke | `test -s docs/demo.gif` | ❌ Wave 0 |
| DESK-01 | App launches and BrowserWindow opens | E2E (Playwright) | `pnpm --filter @treis/desktop test:e2e` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @treis/desktop test`
- **Per wave merge:** `pnpm test` (root suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/desktop/vitest.config.ts` — projects[] config matching root pattern
- [ ] `apps/desktop/src/main/ipc-handlers.test.ts` — covers DESK-02
- [ ] `apps/desktop/src/main/agent-worker.test.ts` — covers DESK-03 (mock worker)
- [ ] `apps/desktop/src/renderer/screens/SealedContract.test.tsx` — covers DESK-07
- [ ] `apps/desktop/tests/app.e2e.ts` — Playwright smoke test, covers DESK-01

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user accounts in Phase 4 |
| V3 Session Management | no | Local-only, no session cookies |
| V4 Access Control | partial | contextBridge exposes only named IPC methods; no raw ipcRenderer |
| V5 Input Validation | yes | Intent text from renderer: validate non-empty, max length before sending to core engine |
| V6 Cryptography | no | No secrets handled in renderer; model API keys stay in main process env |

### Known Threat Patterns for Electron Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer executing arbitrary Node.js | Elevation of Privilege | `nodeIntegration: false` (Electron default); contextBridge exposes only safe IPC subset |
| XSS in React renderer executes Electron APIs | Elevation of Privilege | contextBridge narrows surface; `contextIsolation: true` (Electron default) |
| Raw ipcRenderer exposed via preload | Elevation of Privilege | Never expose — wrap all channels in named helper functions |
| Malicious tool output displayed as HTML | XSS | Render tool output as text, never `dangerouslySetInnerHTML` |
| Main process blocks on synchronous IPC | DoS | Use `invoke` (async) not `sendSync` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tailwind 4 works cleanly with React 19 in Electron renderer context | Standard Stack | Low: CSS modules is a well-understood fallback |
| A2 | `receiveMessageOnPort` + short `Atomics.wait` polling is sufficient for violation sync | Code Examples (worker side) | Medium: may need SharedArrayBuffer approach instead; test during implementation |
| A3 | electron-builder universal build works without code signing in Phase 4 | Code Examples (builder config) | Low: hardenedRuntime: false explicitly set for Phase 4; signing is Phase 2 item (PLAT-05) |

---

## Open Questions

1. **Violation synchronization mechanism**
   - What we know: worker_threads cannot await IPC Promises; must use `MessageChannel` or `SharedArrayBuffer`
   - What's unclear: `receiveMessageOnPort` polling latency and CPU usage profile
   - Recommendation: Implement with `receiveMessageOnPort` + 50ms Atomics.wait poll; benchmark during Plan execution; switch to SharedArrayBuffer if latency is unacceptable

2. **App icon asset**
   - What we know: electron-builder expects `build/icon.icns` for macOS
   - What's unclear: No Treis icon asset exists yet; need 1024x1024 PNG → icns conversion
   - Recommendation: Create a minimal placeholder icon as part of Wave 0; use `sips` (macOS built-in) to generate `.icns` from any PNG

3. **Model config for desktop app**
   - What we know: CLI uses `TREIS_MODEL_PROVIDER` / `TREIS_MODEL_ID` env vars (Phase 3 decision)
   - What's unclear: Desktop app should use same env vars or expose a settings UI
   - Recommendation: Read same env vars in main process for Phase 4; config file / settings UI deferred to Phase 2 (consistent with Phase 3 CLI decision)

---

## Sources

### Primary (HIGH confidence)
- Existing codebase: `/packages/core/src/agent/types.ts` — AgentEvent type definitions verified
- Existing codebase: `/TREIS_ARCHITECTURE_SPEC.md §10.1, §13.1` — IPC channels, screen flow
- Existing codebase: `/apps/cli/src/commands/run.ts` — full flow to mirror in desktop
- npm registry (`npm view`): electron 41.2.0, electron-vite 5.0.0, electron-builder 26.8.1, react 19.2.5, tailwindcss 4.2.2
- [electron-vite Getting Started](https://electron-vite.org/guide/) — scaffold command, project structure, worker import syntax

### Secondary (MEDIUM confidence)
- [Electron IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc) — invoke/handle patterns, contextBridge
- [Electron Multithreading](https://www.electronjs.org/docs/latest/tutorial/multithreading/) — worker_threads in main process
- [electron.build/mac.html](https://www.electron.build/mac.html) — universal DMG config, hardenedRuntime
- [electron-vite Dev Guide](https://electron-vite.org/guide/dev) — `?modulePath` worker import
- [Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge) — exposeInMainWorld API surface

### Tertiary (LOW confidence)
- None — all key claims verified against codebase or official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm registry
- Architecture: HIGH — IPC design verified against TREIS_ARCHITECTURE_SPEC.md and official Electron docs
- Worker thread synchronization: MEDIUM — pattern is documented but implementation details need validation
- Pitfalls: HIGH — sourced from Electron official docs and verified codebase patterns
- DMG packaging: HIGH — electron-builder docs verified

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable ecosystem; electron-vite/electron-builder release cadence is low)
