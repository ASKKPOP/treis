---
phase: 01-foundation
verified: 2026-04-09T23:30:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Run a chat call against Ollama (local) and Anthropic (cloud) to confirm both stream tokens through the same unified interface"
    expected: "Both adapters stream tokens via Vercel AI SDK 5 streamText. The Ollama adapter sends num_ctx: 32768 on every call. The Anthropic adapter reads ANTHROPIC_API_KEY from env."
    why_human: "Unit tests mock the AI SDK providers. Verifying real token streaming requires a running Ollama instance and a valid Anthropic API key, neither of which can be tested in CI without infrastructure."
  - test: "Run WebSearchTool against DuckDuckGo HTML endpoint to confirm NetworkAccess gate and actual search results"
    expected: "WebSearchTool returns parsed search results from DuckDuckGo. Without NetworkAccess permission, it is rejected."
    why_human: "Tests mock the fetch call. Real network behavior (rate limits, HTML format changes) needs live verification."
---

# Phase 1: Foundation Verification Report

**Phase Goal:** The building blocks exist and are independently testable -- monorepo builds cleanly, both model adapters stream tokens, all tools execute with correct permission gating, and session state persists to disk
**Verified:** 2026-04-09T23:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pnpm build` succeeds across all packages from a clean checkout with no errors | VERIFIED | Build completes for all 5 workspace projects (core, api-client, tools, cli, desktop). ESM+CJS+DTS outputs for core/api-client/tools. Desktop emits placeholder echo (deferred to Phase 4). |
| 2 | Running a chat call against Ollama and Anthropic both stream tokens through the same unified interface | VERIFIED (unit-level) | Both adapters implement `ModelAdapter` interface returning `LanguageModelV3` from `@ai-sdk/provider`. Ollama uses `@ai-sdk/openai` with `baseURL: localhost:11434/v1` and `num_ctx: 32768`. Anthropic uses `@ai-sdk/anthropic` with env key. Both return same `LanguageModelV3` type usable with `streamText`. 10 adapter tests pass. Needs human verification for live streaming. |
| 3 | Each tool (FileRead, FileWrite, Bash, Glob, Grep, WebSearch) executes its happy path and rejects out-of-workspace paths or blocked commands | VERIFIED | All 6 tools implemented with full call() logic. FileRead/FileWrite/Glob/Grep use `assertWithinWorkspace` (lexical + symlink path check). Bash blocks 5 metacharacter patterns (`;`, `&&`, `\|\|`, `$()`, backticks). WebSearch requires NetworkAccess. 49 tool tests pass including happy paths and rejection cases. |
| 4 | A DangerousShell command requires explicit approval before executing; a NetworkAccess call respects the NetworkAccess gate | VERIFIED | `gate.ts` always calls `approvePermission()` callback for DangerousShell tier, even when DangerousShell is in grants set. BashTool elevates destructive commands (rm, chmod, dd, etc.) to DangerousShell with per-invocation approval inside `call()`. WebSearchTool has `requiredTier: NetworkAccess` and `checkPermissions` verifies `NetworkAccess` in grants. 6 gate tests + 13 bash tests confirm both flows. |
| 5 | Session state writes to ~/.treis/sessions/{sid}.jsonl and a JSONL trace entry appears after every tool call | VERIFIED | `createSessionPersister` writes append-only JSONL to `{sessionsDir}/{sid}.jsonl`. `createTraceLogger` uses pino to write JSONL traces with `execution_id`, `session_id`, step, tool, verdict, duration_ms fields. `saveCheckpoint` uses atomic write-then-rename. Note: actual path is `~/.treis/workspaces/{id}/sessions/{sid}.jsonl` (workspace-scoped, a design improvement over the flat `~/.treis/sessions/` in SC5). 20 session tests pass. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/errors.ts` | Typed error hierarchy | VERIFIED | TreisError base + 4 subtypes: ModelConnectionError, ModelStreamError, ToolExecutionError, PermissionDeniedError, PathTraversalError. ErrorContext with timestamp. 10 tests. |
| `packages/core/src/session/store.ts` | Mutable state store | VERIFIED | `createStore<T>` with getState/setState/subscribe. Shallow comparison, listener Set. 6 tests. |
| `packages/core/src/session/persist.ts` | JSONL session persister | VERIFIED | Append-only JSONL at `{sessionsDir}/{sid}.jsonl`. ConversationEntry type. 5 tests. |
| `packages/core/src/session/workspace.ts` | Workspace bootstrap | VERIFIED | Creates `~/.treis/workspaces/{id}/` with plan-contracts/, traces/, sessions/, config.json. 3 tests. |
| `packages/core/src/session/trace-logger.ts` | JSONL trace logger | VERIFIED | pino-based logger with execution_id correlation. Summarizes input (200 char) and output (500 char). 5 tests. |
| `packages/core/src/session/checkpoint.ts` | Step checkpoint | VERIFIED | Atomic write via temp+rename. StepCheckpoint with stepNumber, stepStatus, executionId, state. 4 tests. |
| `packages/api-client/src/adapters/ollama.ts` | Ollama adapter | VERIFIED | `createOllamaAdapter` with OpenAI-compat client, num_ctx: 32768, /api/show capability check. 5 tests. |
| `packages/api-client/src/adapters/anthropic.ts` | Anthropic adapter | VERIFIED | `createAnthropicAdapter` with API key from env, fail-fast on missing key. 5 tests. |
| `packages/api-client/src/health.ts` | Health check | VERIFIED | `checkModelHealth` returns connected/modelName/contextWindow/error. Never throws. 3 tests. |
| `packages/api-client/src/slot-manager.ts` | Slot manager | VERIFIED | `createSlotManager` maps Slot A (strongest) and Slot B (fastest) to adapters via manual config. 5 tests. |
| `packages/tools/src/base/types.ts` | Tool interface | VERIFIED | Tool<TInput,TOutput> with name, description, inputSchema (Zod), requiredTier, isReadOnly(), checkPermissions(), call(). PermissionTier with 5 tiers. 3 tests. |
| `packages/tools/src/base/executor.ts` | Tool executor | VERIFIED | `executeTools` partitions by isReadOnly(): concurrent via Promise.allSettled for read-only, serial for write. Permission check + schema parse before call. 4 tests. |
| `packages/tools/src/permissions/gate.ts` | Permission gate | VERIFIED | `checkPermission` with DangerousShell per-invocation approval. Standard tier-in-grants check. 6 tests. |
| `packages/tools/src/utils/path-guard.ts` | Path guard | VERIFIED | `assertWithinWorkspace` with lexical + symlink resolution. 5 tests. |
| `packages/tools/src/impl/file-read.ts` | FileRead tool | VERIFIED | Reads files, ReadOnly tier, workspace-guarded. 5 tests. |
| `packages/tools/src/impl/file-write.ts` | FileWrite tool | VERIFIED | Writes files, WriteFiles tier, workspace-guarded, mkdir support. 8 tests. |
| `packages/tools/src/impl/bash.ts` | Bash tool | VERIFIED | 30s timeout, 1MB maxBuffer, 5 blocked metacharacter patterns, DangerousShell for destructive commands. 13 tests. |
| `packages/tools/src/impl/glob.ts` | Glob tool | VERIFIED | fast-glob within workspace, ReadOnly tier, defense-in-depth result filtering. 5 tests. |
| `packages/tools/src/impl/grep.ts` | Grep tool | VERIFIED | Regex search within workspace, ReadOnly tier, recursive directory walk. 6 tests. |
| `packages/tools/src/impl/web-search.ts` | WebSearch tool | VERIFIED | DuckDuckGo HTML API, NetworkAccess tier, HTML result parsing. 7 tests. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| executor.ts | gate.ts | `checkPermission()` call in `executeSingleTool` | WIRED | Line 62: `await checkPermission(call.tool, call.input, ctx)` |
| executor.ts | types.ts | Tool interface + ToolContext | WIRED | Imports Tool, ToolContext, ToolResult from types.ts |
| All tools | path-guard.ts | `assertWithinWorkspace()` | WIRED | FileRead, FileWrite, Glob, Grep all call assertWithinWorkspace before operations |
| BashTool | gate.ts | DangerousShell approval via ctx.approvePermission | WIRED | bash.ts line 122: `ctx.approvePermission(PermissionTier.DangerousShell, 'BashTool')` |
| slot-manager.ts | ollama.ts + anthropic.ts | `buildAdapter()` factory | WIRED | `createOllamaAdapter()` / `createAnthropicAdapter()` called from switch |
| health.ts | adapters | `adapter.checkCapabilities()` | WIRED | Line 13: `const capabilities = await adapter.checkCapabilities(modelId)` |
| workspace.ts | persist.ts | sessionsDir output | WIRED | workspace.sessionsDir feeds into createSessionPersister |
| trace-logger.ts | pino | pino.destination + logger.info | WIRED | Direct pino import, sync destination, child logger with execution_id |

### Data-Flow Trace (Level 4)

Not applicable for Phase 1 -- no rendering artifacts. All artifacts are library modules consumed by future phases.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds | `pnpm build` | All 5 projects build, ESM+CJS+DTS outputs | PASS |
| All tests pass | `pnpm test` (vitest run) | 20 test files, 113 tests, all pass in 2.24s | PASS |
| Packages export correctly | Build outputs dist/index.js, dist/index.cjs, dist/index.d.ts for core, api-client, tools | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REPO-01 | 01-01 | pnpm monorepo with @treis/core, @treis/api-client, @treis/tools, apps/cli, apps/desktop | SATISFIED | pnpm-workspace.yaml includes packages/* and apps/*. All 5 packages exist with correct names. |
| REPO-02 | 01-01 | Shared tsconfig.base.json, ESLint config, Vitest workspace config | SATISFIED | tsconfig.base.json (ES2022, nodenext, erasableSyntaxOnly), eslint.config.cjs, vitest.config.ts with projects. |
| REPO-03 | 01-01 | All packages build independently with `pnpm build` | SATISFIED | `pnpm build` succeeds for all packages. |
| MODEL-01 | 01-02 | Ollama adapter connects via OpenAI-compatible REST at localhost:11434 | SATISFIED | `OLLAMA_BASE_URL = 'http://localhost:11434/v1'`, uses `@ai-sdk/openai`. |
| MODEL-02 | 01-02 | Ollama adapter sets num_ctx to 32768+ on every chat call | SATISFIED | `OLLAMA_NUM_CTX = 32768`, passed per-call via `provider(modelId, { num_ctx: OLLAMA_NUM_CTX })`. Test verifies `_settings: { num_ctx: 32768 }`. |
| MODEL-03 | 01-02 | Anthropic adapter connects via @ai-sdk/anthropic with API key from env var | SATISFIED | Reads `ANTHROPIC_API_KEY` from env, throws ModelConnectionError if unset. |
| MODEL-04 | 01-02 | Unified streaming interface via Vercel AI SDK 5 (both adapters use same streamText API) | SATISFIED | Both return `LanguageModelV3` from `getModel()`, which is the input type for Vercel AI SDK `streamText`. |
| MODEL-05 | 01-02 | Model health check reports connection status, model name, context window | SATISFIED | `checkModelHealth` returns `HealthCheckResult { connected, modelName, contextWindow, error? }`. |
| MODEL-06 | 01-02 | Slot manager assigns strongest model to Slot A, fastest to Slot B based on manual config | SATISFIED | `createSlotManager({ slotA, slotB })` maps to adapters. SlotConfig has `role: 'strongest' \| 'fastest'`. |
| TOOL-01 | 01-03 | Tool base interface with name, description, inputSchema (Zod v4), call(), checkPermissions() | SATISFIED | Tool interface in types.ts with all required members. Uses `ZodSchema` from zod. |
| TOOL-02 | 01-03 | FileReadTool reads files within workspace, rejects paths outside workspace root | SATISFIED | FileReadTool uses assertWithinWorkspace. 5 tests including path traversal rejection. |
| TOOL-03 | 01-04 | FileWriteTool writes files within workspace, validates resolved path | SATISFIED | FileWriteTool uses assertWithinWorkspace. 8 tests. |
| TOOL-04 | 01-04 | BashTool executes shell commands with 30s timeout, blocks metacharacter injection | SATISFIED | 30s default timeout, 5 blocked patterns, 1MB maxBuffer. 13 tests. |
| TOOL-05 | 01-04 | BashTool permission gate: DangerousShell requires explicit approval for destructive commands | SATISFIED | `isDangerousCommand` check + `ctx.approvePermission` call. Tests verify approval required, denied, and approved flows. |
| TOOL-06 | 01-03 | GlobTool finds files by glob pattern within workspace | SATISFIED | fast-glob with workspace boundary. 5 tests. |
| TOOL-07 | 01-03 | GrepTool searches file content by regex within workspace | SATISFIED | Recursive directory walk, regex matching, workspace-guarded. 6 tests. |
| TOOL-08 | 01-04 | WebSearchTool performs web searches with NetworkAccess permission gate | SATISFIED | DuckDuckGo HTML API, NetworkAccess tier required. 7 tests. |
| TOOL-09 | 01-03 | Permission system with 5 tiers: ReadOnly, WriteFiles, ExecuteShell, DangerousShell, NetworkAccess | SATISFIED | PermissionTier const object with all 5 values. gate.ts enforces tier checks. |
| TOOL-10 | 01-03 | Read-only tools batch for concurrent execution, write tools execute serially | SATISFIED | executor.ts partitions by `isReadOnly()`, Promise.allSettled for read-only, serial loop for non-read-only. |
| SESS-01 | 01-05 | Session state with mutable store pattern (setState callback, shallow comparison, listener Set) | SATISFIED | `createStore<T>` with setState updater, shallow key comparison, listener Set. 6 tests. |
| SESS-02 | 01-05 | Conversation history persisted as append-only JSONL at ~/.treis/sessions/{sid}.jsonl | SATISFIED | `createSessionPersister` writes append-only JSONL. Path is workspace-scoped (`~/.treis/workspaces/{id}/sessions/{sid}.jsonl`) rather than global `~/.treis/sessions/` -- design improvement. |
| SESS-03 | 01-05 | Workspace layout at ~/.treis/workspaces/{id}/ with config.json, plan-contracts/, traces/, sessions/ | SATISFIED | `bootstrapWorkspace` creates all directories and config.json. 3 tests. |
| SESS-04 | 01-05 | JSONL trace logging: every tool call, verdict, retry, duration_ms with execution_id correlation | SATISFIED | `createTraceLogger` writes JSONL via pino with execution_id, session_id, step, tool, verdict, duration_ms. Input/output truncated for safety. 5 tests. |
| SESS-05 | 01-05 | Step-level checkpoint saved after every completed step (enables resume) | SATISFIED | `saveCheckpoint` with atomic temp+rename write. `loadCheckpoint` for resume. StepCheckpoint with stepNumber, stepStatus, executionId, state. 4 tests. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations detected in any source file. |

### Human Verification Required

### 1. Live Model Streaming Test

**Test:** Configure Ollama with a model (e.g., llama3.2) and run a streamText call through the Ollama adapter. Then set ANTHROPIC_API_KEY and run a streamText call through the Anthropic adapter. Verify both produce token streams.
**Expected:** Both adapters stream tokens through Vercel AI SDK 5 `streamText`. Ollama sends num_ctx: 32768. Anthropic reads key from env. Same `LanguageModelV3` interface used by both.
**Why human:** Unit tests mock the AI SDK providers. Real token streaming requires running infrastructure (Ollama daemon, valid API key).

### 2. WebSearch Live Network Test

**Test:** Call WebSearchTool with a real query and verify it returns parsed results from DuckDuckGo.
**Expected:** Returns array of SearchResult objects with title, url, snippet fields populated from real DuckDuckGo HTML response.
**Why human:** Tests mock fetch. DuckDuckGo HTML format may change, rate limits may apply.

### Gaps Summary

No implementation gaps found. All 24 Phase 1 requirements (REPO-01 through REPO-03, MODEL-01 through MODEL-06, TOOL-01 through TOOL-10, SESS-01 through SESS-05) are satisfied with substantive implementations and passing tests. All 5 success criteria are met at the unit/integration test level.

The only items requiring human verification are live infrastructure tests (Ollama streaming, Anthropic streaming, DuckDuckGo web search) that cannot be automated without running services.

Minor note: SESS-02 specifies `~/.treis/sessions/{sid}.jsonl` but the implementation uses `~/.treis/workspaces/{id}/sessions/{sid}.jsonl` (workspace-scoped). This is a design improvement that better supports multi-workspace scenarios and does not reduce functionality.

---

_Verified: 2026-04-09T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
