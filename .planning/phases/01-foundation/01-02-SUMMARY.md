---
phase: 01-foundation
plan: 02
subsystem: api-client
tags: [model-adapters, ollama, anthropic, streaming, slot-manager, health-check]
dependency_graph:
  requires: ["01-01"]
  provides: ["@treis/api-client"]
  affects: ["agent-loop", "cli", "desktop"]
tech_stack:
  added: ["@ai-sdk/provider ^3", "@types/node ^22"]
  patterns: ["ModelAdapter interface", "Slot A/B assignment", "fail-fast API key validation"]
key_files:
  created:
    - packages/api-client/src/adapters/types.ts
    - packages/api-client/src/adapters/ollama.ts
    - packages/api-client/src/adapters/anthropic.ts
    - packages/api-client/src/adapters/ollama.test.ts
    - packages/api-client/src/adapters/anthropic.test.ts
    - packages/api-client/src/health.ts
    - packages/api-client/src/health.test.ts
    - packages/api-client/src/slot-manager.ts
    - packages/api-client/src/slot-manager.test.ts
  modified:
    - packages/api-client/src/index.ts
    - packages/api-client/package.json
decisions:
  - "Use @ai-sdk/openai createOpenAI with baseURL override for Ollama (createOpenAICompatible not available in v3.x)"
  - "LanguageModelV3 from @ai-sdk/provider is the unified model interface (AI SDK v5 uses V2/V3, not V1)"
  - "num_ctx:32768 passed via runtime cast — types only accept 1 arg but runtime supports 2"
  - "API key never stored in error context per T-01-03 security mitigation"
  - "Health check never throws — returns structured HealthCheckResult per T-01-05"
metrics:
  duration: "18 minutes"
  completed: "2026-04-10T06:03:00Z"
  tasks_completed: 2
  files_modified: 11
---

# Phase 01 Plan 02: @treis/api-client Model Adapters Summary

**One-liner:** Ollama and Anthropic model adapters with `LanguageModelV3` unified interface, `num_ctx:32768` enforcement, fail-fast API key validation, health check, and A/B slot manager.

## What Was Built

The `@treis/api-client` package now provides two model adapters behind a unified `ModelAdapter` interface. The agent loop (Phase 2) can call either adapter with the same `getModel()` API, passing the result directly to Vercel AI SDK `streamText`. Health checks probe model availability and return structured results without throwing. The slot manager assigns models to Slot A (strongest) and Slot B (fastest) from a manual config.

### Files Created

| File | Purpose |
|------|---------|
| `src/adapters/types.ts` | `ModelAdapter`, `ModelCapabilities`, `ModelSlot`, `SlotConfig`, `HealthCheckResult` types |
| `src/adapters/ollama.ts` | Ollama adapter via `createOpenAI` with `baseURL: http://localhost:11434/v1` and `num_ctx:32768` |
| `src/adapters/anthropic.ts` | Anthropic adapter reading `ANTHROPIC_API_KEY`, throws `ModelConnectionError` if unset |
| `src/health.ts` | `checkModelHealth` — structured result, never throws |
| `src/slot-manager.ts` | `createSlotManager` — binds adapters to A/B slots from config |

### Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 RED | a839f43 | Failing tests for Ollama and Anthropic adapters |
| Task 1 GREEN | add9e51 | Adapter implementations + index.ts exports |
| Task 2 RED | 7bceeab | Failing tests for health check and slot manager |
| Task 2 GREEN | f248be3 | health.ts, slot-manager.ts, package.json fixes |

## Test Results

- 4 test files, 18 tests — all passing
- `pnpm --filter @treis/api-client test` exits 0
- `pnpm --filter @treis/api-client build` exits 0 (ESM + CJS + DTS)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing Dep] `@treis/core` not in api-client dependencies**
- **Found during:** Task 1 GREEN — `anthropic.ts` imports `ModelConnectionError` from `@treis/core`
- **Fix:** Added `"@treis/core": "workspace:*"` to `dependencies` in `package.json`
- **Files modified:** `packages/api-client/package.json`
- **Commit:** add9e51

**2. [Rule 1 - Bug] `createOpenAICompatible` not exported by `@ai-sdk/openai` v3.x**
- **Found during:** Task 1 research — plan referenced `createOpenAICompatible` but installed version (3.0.52) only exports `createOpenAI`
- **Fix:** Used `createOpenAI` with `baseURL` and `name` options — provides identical Ollama compatibility. Runtime verified.
- **Files modified:** `packages/api-client/src/adapters/ollama.ts`
- **Commit:** add9e51

**3. [Rule 1 - Bug] Plan referenced `LanguageModelV1` but AI SDK v5 uses `LanguageModelV3`**
- **Found during:** Task 1 research — `ai` package v5.0.172 and `@ai-sdk/openai` v3.0.52 use `LanguageModelV3` from `@ai-sdk/provider`
- **Fix:** Used `LanguageModelV3` as the unified type. Added `@ai-sdk/provider ^3` as direct dependency for DTS build.
- **Files modified:** `packages/api-client/src/adapters/types.ts`, `packages/api-client/package.json`
- **Commit:** f248be3

**4. [Rule 3 - Missing Dep] `@ai-sdk/provider` not declared as direct dependency**
- **Found during:** Task 1/2 build — DTS generation failed: `Cannot find module '@ai-sdk/provider'`
- **Fix:** Added `"@ai-sdk/provider": "^3"` to `dependencies`
- **Files modified:** `packages/api-client/package.json`
- **Commit:** f248be3

**5. [Rule 3 - Missing Dep] `@types/node` not in devDependencies**
- **Found during:** Task 2 build — DTS generation failed: `Cannot find name 'process'`
- **Fix:** Added `"@types/node": "^22"` to `devDependencies`
- **Files modified:** `packages/api-client/package.json`
- **Commit:** f248be3

**6. [Rule 1 - Bug] `@ai-sdk/openai` provider typed as single-arg but `num_ctx` requires second arg**
- **Found during:** Task 2 build — TypeScript error: `Expected 1 arguments, but got 2`
- **Fix:** Cast provider to `any` with explanatory comment. Runtime support confirmed via direct test.
- **Files modified:** `packages/api-client/src/adapters/ollama.ts`
- **Commit:** f248be3

## Known Stubs

None — all adapters wire to real providers. `checkCapabilities` on Ollama makes a real HTTP call to `/api/show`. Anthropic capabilities are static constants (all Claude models support tool calling and have 200K context).

## Threat Surface Scan

No new threat surface beyond the plan's threat model. Confirmed:
- T-01-03 mitigated: API key read from env only, not logged, not in error context
- T-01-05 mitigated: `checkModelHealth` wraps `checkCapabilities` in try/catch, returns `{ connected: false, error }` on failure

## Self-Check: PASSED

All key files confirmed present. All 4 task commits confirmed in git log.

| Check | Result |
|-------|--------|
| `packages/api-client/src/adapters/types.ts` | FOUND |
| `packages/api-client/src/adapters/ollama.ts` | FOUND |
| `packages/api-client/src/adapters/anthropic.ts` | FOUND |
| `packages/api-client/src/health.ts` | FOUND |
| `packages/api-client/src/slot-manager.ts` | FOUND |
| `packages/api-client/dist/index.js` | FOUND |
| `packages/api-client/dist/index.d.ts` | FOUND |
| Commit a839f43 (RED tests T1) | FOUND |
| Commit add9e51 (GREEN adapters) | FOUND |
| Commit 7bceeab (RED tests T2) | FOUND |
| Commit f248be3 (GREEN health+slot) | FOUND |
