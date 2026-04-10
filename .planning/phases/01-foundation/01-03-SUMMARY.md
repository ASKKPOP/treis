---
phase: 01-foundation
plan: "03"
subsystem: tools
tags: [tools, permissions, file-system, security]
dependency_graph:
  requires: ["01-01"]
  provides: ["@treis/tools package", "Tool interface", "PermissionTier", "FileReadTool", "GlobTool", "GrepTool"]
  affects: ["@treis/core agent loop", "plan contract executor"]
tech_stack:
  added: ["fast-glob"]
  patterns: ["const-object-as-enum", "Promise.allSettled concurrency partitioning", "realpath symlink guard"]
key_files:
  created:
    - packages/tools/src/base/types.ts
    - packages/tools/src/base/executor.ts
    - packages/tools/src/permissions/gate.ts
    - packages/tools/src/utils/path-guard.ts
    - packages/tools/src/impl/file-read.ts
    - packages/tools/src/impl/glob.ts
    - packages/tools/src/impl/grep.ts
    - packages/tools/src/base/types.test.ts
    - packages/tools/src/base/executor.test.ts
    - packages/tools/src/permissions/gate.test.ts
    - packages/tools/src/utils/path-guard.test.ts
    - packages/tools/src/impl/file-read.test.ts
    - packages/tools/src/impl/glob.test.ts
    - packages/tools/src/impl/grep.test.ts
  modified:
    - packages/tools/src/index.ts
    - packages/tools/package.json
decisions:
  - "Used const-object-as-const instead of TypeScript enum due to erasableSyntaxOnly: true in tsconfig.base.json"
  - "DangerousShell always requires per-invocation approvePermission callback regardless of grants (D-11)"
  - "Read-only tools batched via Promise.allSettled; non-read-only serial to prevent races (D-14)"
  - "assertWithinWorkspace does lexical check + realpath symlink resolution (T-01-07)"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-09"
  tasks_completed: 2
  files_created: 14
  files_modified: 2
  tests_added: 34
---

# Phase 01 Plan 03: @treis/tools Foundation Summary

**One-liner:** Tool interface with 5-tier PermissionTier, DangerousShell per-invocation gate, Promise.allSettled read-only batch executor, and three path-guarded read-only tools (FileRead, Glob, Grep).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Tool interface, PermissionTier, permission gate, executor | `63b89f8` | types.ts, gate.ts, executor.ts + tests |
| 2 | FileReadTool, GlobTool, GrepTool with path traversal guard | `61a7009` | path-guard.ts, file-read.ts, glob.ts, grep.ts + tests |

## What Was Built

### Task 1: Core Types and Infrastructure

**`packages/tools/src/base/types.ts`** — Tool interface and PermissionTier

- `PermissionTier` implemented as `const` object with `as const` (not TypeScript `enum`) due to `erasableSyntaxOnly: true` constraint
- 5 tiers: ReadOnly, WriteFiles, ExecuteShell, DangerousShell, NetworkAccess
- `Tool<TInput, TOutput>` interface: name, description, inputSchema (ZodSchema), requiredTier, isReadOnly(), checkPermissions(), call()
- `ToolContext`: workspaceRoot, sessionId, permissionGrants (Set), optional approvePermission callback

**`packages/tools/src/permissions/gate.ts`** — Permission gate

- `checkPermission()`: DangerousShell tier always calls `approvePermission` callback regardless of grants (D-11)
- No callback present → throws PermissionDeniedError immediately
- Callback returns false → throws PermissionDeniedError
- Standard tiers: checks `permissionGrants.has(tool.requiredTier)`

**`packages/tools/src/base/executor.ts`** — Tool executor

- `executeTools()`: partitions calls into read-only and non-read-only
- Read-only tools run concurrently via `Promise.allSettled` (D-14)
- Non-read-only tools run serially in order
- Permission check occurs inside `executeSingleTool` before `inputSchema.parse` and `call()`
- Failed tools return `{ success: false, error: message }` rather than propagating

### Task 2: Path Guard and Read-Only Tools

**`packages/tools/src/utils/path-guard.ts`** — Path traversal guard (D-15, T-01-06, T-01-07)

- Lexical check: `resolve(target).startsWith(resolve(root) + '/')` catches `../` traversal
- Symlink check: `realpath()` resolves symlinks then re-validates to catch symlink-based escapes
- File-not-found is non-fatal for the symlink check (write targets don't exist yet)

**`packages/tools/src/impl/file-read.ts`** — FileReadTool

- Reads files via `resolve(workspaceRoot, input.path)` then `assertWithinWorkspace`
- Returns file contents as string with configurable encoding (default utf-8)
- `isReadOnly()` → true, `requiredTier` → ReadOnly

**`packages/tools/src/impl/glob.ts`** — GlobTool

- Uses `fast-glob` with `absolute: true, onlyFiles: true`
- cwd defaults to workspaceRoot; custom cwd validated via `assertWithinWorkspace`
- Results filtered to ensure all paths remain within workspace (defense in depth)

**`packages/tools/src/impl/grep.ts`** — GrepTool

- Recursive directory search skipping `node_modules` and `.git`
- Per-file regex with `lastIndex` reset to prevent cross-line state pollution
- Returns `GrepMatch[]`: `{ file: string (relative), line: number, content: string }`
- ReDoS risk accepted per threat model T-01-09 (P0 scope)

## Test Results

```
Test Files  7 passed (7)
     Tests  34 passed (34)
```

- `src/base/types.test.ts` — 3 tests (PermissionTier values, Tool interface)
- `src/permissions/gate.test.ts` — 6 tests (allow/deny tiers, DangerousShell callback scenarios)
- `src/base/executor.test.ts` — 4 tests (concurrent batch, serial, permission check, success result)
- `src/utils/path-guard.test.ts` — 5 tests (allow within, reject /etc, reject traversal, root, prefix-not-sibling)
- `src/impl/file-read.test.ts` — 5 tests (read file, reject traversal, reject absolute outside)
- `src/impl/glob.test.ts` — 5 tests (match files, no match, reject cwd escape)
- `src/impl/grep.test.ts` — 6 tests (match with line number, no match, single file, reject outside)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript enum incompatible with erasableSyntaxOnly**

- **Found during:** Task 1 implementation
- **Issue:** Plan specified `export enum PermissionTier { ... }` but `tsconfig.base.json` has `"erasableSyntaxOnly": true` (TS 5.8 feature), which forbids TypeScript-specific syntax that requires type-erasure like `enum`
- **Fix:** Used `export const PermissionTier = { ... } as const` with `export type PermissionTier = (typeof PermissionTier)[keyof typeof PermissionTier]` — identical runtime behavior, fully compatible
- **Files modified:** `packages/tools/src/base/types.ts`
- **Commit:** `63b89f8`

**2. [Rule 1 - Bug] macOS /var symlink causes test assertion failure**

- **Found during:** Task 2 test run
- **Issue:** macOS `/var/folders/...` (from `os.tmpdir()`) is a symlink to `/private/var/folders/...`. `assertWithinWorkspace` correctly returns the realpath, but the test expected the un-resolved path
- **Fix:** Updated test to use `await realpath(workspace)` as the expected value
- **Files modified:** `packages/tools/src/utils/path-guard.test.ts`
- **Commit:** `61a7009`

## Known Stubs

None. All tools are fully wired and functional.

## Threat Surface Scan

No new security-relevant surface introduced beyond what was planned in the threat model. The three tools (FileRead, Glob, Grep) are read-only with path validation. All paths within the plan's STRIDE register (T-01-06, T-01-07, T-01-08, T-01-09) were addressed as specified.

## Self-Check: PASSED

Files verified:
- `packages/tools/src/base/types.ts` — FOUND
- `packages/tools/src/base/executor.ts` — FOUND
- `packages/tools/src/permissions/gate.ts` — FOUND
- `packages/tools/src/utils/path-guard.ts` — FOUND
- `packages/tools/src/impl/file-read.ts` — FOUND
- `packages/tools/src/impl/glob.ts` — FOUND
- `packages/tools/src/impl/grep.ts` — FOUND

Commits verified:
- `63b89f8` — FOUND (feat(01-03): Tool interface, PermissionTier, permission gate, and executor)
- `61a7009` — FOUND (feat(01-03): FileReadTool, GlobTool, GrepTool with path traversal guard)
