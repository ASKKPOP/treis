---
phase: 04-desktop
plan: "01"
subsystem: desktop
tags: [electron, ipc, worker-threads, react, electron-vite]
dependency_graph:
  requires: []
  provides: [desktop-scaffold, ipc-bridge, worker-runner, treis-hook]
  affects: [04-02, 04-03]
tech_stack:
  added:
    - electron@41
    - electron-vite@5
    - electron-builder@26
    - "@vitejs/plugin-react@4"
    - tailwindcss@4
    - "@tailwindcss/vite@4"
    - "@headlessui/react@2.2"
    - lucide-react
    - react@19
    - react-dom@19
    - jsdom@26
    - "@testing-library/react@16"
  patterns:
    - electron-vite three-context build (main + preload + renderer)
    - contextBridge.exposeInMainWorld typed API (8 named functions only)
    - worker_threads agent runner with parentPort relay
    - MessageChannel port-pair for synchronous violation resolution
    - "@vitest-environment node annotation for node:worker_threads mocking"
key_files:
  created:
    - apps/desktop/package.json (rewritten)
    - apps/desktop/electron.vite.config.ts
    - apps/desktop/electron-builder.config.json
    - apps/desktop/tsconfig.node.json
    - apps/desktop/tsconfig.web.json
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/ipc-handlers.ts
    - apps/desktop/src/main/agent-worker.ts
    - apps/desktop/src/main/ipc-handlers.test.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/renderer/main.tsx
    - apps/desktop/src/renderer/App.tsx
    - apps/desktop/src/renderer/env.d.ts
    - apps/desktop/src/renderer/index.html
    - apps/desktop/src/renderer/index.css
    - apps/desktop/src/renderer/hooks/useTreis.ts
    - apps/desktop/build/icon.png
    - apps/desktop/vitest.config.ts (updated)
  modified:
    - apps/desktop/tsconfig.json (split into node/web references)
    - pnpm-lock.yaml
  deleted:
    - apps/desktop/src/index.ts (old stub)
decisions:
  - "@vitejs/plugin-react pinned to ^4 (not ^6): electron-vite 5 bundles Vite 7; plugin-react@6 requires Vite 8"
  - "IPC handler tests use @vitest-environment node annotation: jsdom environment does not mock node:worker_threads for static imports in SUT modules"
  - "vi.mockClear() per mock fn instead of vi.clearAllMocks(): clearAllMocks wipes mockImplementation on Worker mock, breaking subsequent tests"
  - "Stub ipc-handlers.ts created in Task 1 to unblock build; replaced in Task 2 with full implementation"
  - "checkModelHealth(adapter, modelId) used in treis:model-health handler — ModelAdapter has no .healthCheck() method"
metrics:
  duration: ~14 minutes
  completed: 2026-04-10T09:27:56Z
  tasks_completed: 2
  files_created: 17
  files_modified: 3
  files_deleted: 1
---

# Phase 4 Plan 1: Electron Shell + IPC Bridge Summary

Electron desktop app scaffolded with electron-vite 5 + React 19, 7-channel IPC bridge wired through typed contextBridge preload, and agent loop running in worker thread with parentPort relay to main process.

## What Was Built

**Task 1: Electron + electron-vite scaffold**

- Replaced the placeholder `package.json` with the full Electron 41 + React 19 + electron-vite 5 dependency set
- Split `tsconfig.json` into `tsconfig.node.json` (main/preload, no DOM) and `tsconfig.web.json` (renderer, with DOM + JSX)
- Created `electron.vite.config.ts` with `externalizeDepsPlugin` for main/preload and React + Tailwind 4 for renderer
- Created `electron-builder.config.json` targeting macOS DMG universal binary
- `src/main/index.ts`: BrowserWindow with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, `minWidth: 900`, `minHeight: 600`
- `src/preload/index.ts`: `contextBridge.exposeInMainWorld('treis', {...})` exposing exactly 8 named functions — ipcRenderer is NOT directly exposed
- Renderer scaffolded: `index.html`, `main.tsx`, `App.tsx` (Screen type with 6 values), `env.d.ts` (TreisApi interface), `index.css` (`@import "tailwindcss"`)
- `pnpm --filter @treis/desktop build` succeeds with electron-vite

**Task 2: IPC handlers, worker thread, useTreis hook**

- `ipc-handlers.ts`: registers all 7 channels — `treis:query` spawns Worker with MessageChannel port pair; routes `AgentEvent` types to correct push channels; `treis:model-health` calls `checkModelHealth(adapter, modelId)`
- `agent-worker.ts`: mirrors CLI `run.ts` flow — handles `clarify` / `propose` / `execute` actions; violation blocking uses `receiveMessageOnPort(violationPort)` with 50ms Atomics.wait yield; escalation auto-declines in Phase 4
- `useTreis.ts`: React hook wrapping `window.treis` with `useCallback` subscriptions and `useEffect` cleanup via `listenersRef`
- `ipc-handlers.test.ts`: 8 tests covering channel registration, model-health handler, and all 5 event routing paths (token→stream, tool-start→tool-progress, tool-result→tool-result, violation→interrupt, complete→status)

## Deviations from Plan

**1. [Rule 1 - Bug] @vitejs/plugin-react version downgraded from ^6 to ^4**
- **Found during:** Task 1 build
- **Issue:** `@vitejs/plugin-react@6` requires `vite@^8.0.0` but electron-vite 5 bundles Vite 7; resulted in `ERR_PACKAGE_PATH_NOT_EXPORTED` on build
- **Fix:** Pinned `@vitejs/plugin-react` to `^4` which supports Vite 5/6/7
- **Files modified:** `apps/desktop/package.json`
- **Commit:** 27f2dec (package.json change) / 4d5b2d0 (noted in commit message)

**2. [Rule 1 - Bug] ipc-handlers.ts stub created in Task 1 to unblock build**
- **Found during:** Task 1 build — `main/index.ts` imports `./ipc-handlers.js` which didn't exist yet
- **Fix:** Created minimal stub in Task 1, replaced with full implementation in Task 2
- **Files modified:** `apps/desktop/src/main/ipc-handlers.ts`

**3. [Rule 1 - Bug] Test environment annotation required for worker_threads mocking**
- **Found during:** Task 2 test run
- **Issue:** Vitest's jsdom environment does not intercept `node:worker_threads` static imports from the SUT module — `mockWorkerOn` had 0 calls after invoking the handler
- **Fix:** Added `// @vitest-environment node` annotation to `ipc-handlers.test.ts`
- **Files modified:** `apps/desktop/src/main/ipc-handlers.test.ts`

**4. [Rule 1 - Bug] vi.clearAllMocks() replaced with per-mock mockClear()**
- **Found during:** Task 2 test debugging
- **Issue:** `vi.clearAllMocks()` in `beforeEach` wipes `mockImplementation` on the Worker mock, causing subsequent tests to get `undefined` from `new Worker()`
- **Fix:** Use `.mockClear()` on each named mock fn in `beforeEach`
- **Files modified:** `apps/desktop/src/main/ipc-handlers.test.ts`

**5. [Rule 1 - Bug] checkModelHealth API used instead of adapter.healthCheck()**
- **Found during:** Task 2 implementation
- **Issue:** Plan specified `adapter.healthCheck()` but `ModelAdapter` interface has no `healthCheck` method — correct API is `checkModelHealth(adapter, modelId)` from `@treis/api-client`
- **Fix:** Used `checkModelHealth` imported from `@treis/api-client`
- **Files modified:** `apps/desktop/src/main/ipc-handlers.ts`

## Known Stubs

- `apps/desktop/src/renderer/App.tsx`: placeholder div with screen name — full screen components wired in Plans 02 and 03 (intentional; plan explicitly states "screens will be wired in Plans 02/03")
- `apps/desktop/build/icon.png`: 64x64 placeholder PNG — real icon to be added before release (intentional; plan says "a real icon can replace it later")

## Threat Flags

No new threat surface introduced beyond what was modeled in the plan's threat register. All 6 threats addressed:
- T-04-01: contextIsolation+exposeInMainWorld implemented (verified)
- T-04-02: sandbox:false with contextIsolation:true (implemented as specified)
- T-04-03: env vars read in main/worker only, never sent to renderer (verified)
- T-04-04: malformed payload error caught and sent as treis:status failed (implemented)
- T-04-05: runAgent enforces EXECUTION_LIMITS from @treis/core (delegate to core)
- T-04-06: no remote content loaded, no webview (verified)

## Self-Check: PASSED

All 18 files verified present on disk. Both task commits confirmed in git log:
- `27f2dec` feat(04-01): Electron + electron-vite scaffold and project config
- `4d5b2d0` feat(04-01): IPC handlers, worker thread agent runner, and useTreis hook

Build verification: `pnpm --filter @treis/desktop build` exits 0.
Test verification: `pnpm --filter @treis/desktop test` — 8/8 tests pass.
