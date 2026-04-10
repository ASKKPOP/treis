---
phase: 01-foundation
plan: 04
subsystem: tools
tags: [tools, security, bash, file-write, web-search, metacharacter-blocking, permission-gates]
dependency_graph:
  requires: ["01-03"]
  provides: ["FileWriteTool", "BashTool", "WebSearchTool", "@treis/tools complete"]
  affects: ["agent loop tool dispatch", "plan contract execution"]
tech_stack:
  added: []
  patterns:
    - "Reject-not-sanitize metacharacter blocking (5 BLOCKED_PATTERNS regexes)"
    - "DangerousShell per-invocation approval inside call() for command-aware gating"
    - "AbortController + setTimeout for 30s exec timeout"
    - "vi.stubGlobal fetch mocking for network tool unit tests"
key_files:
  created:
    - packages/tools/src/impl/file-write.ts
    - packages/tools/src/impl/bash.ts
    - packages/tools/src/impl/web-search.ts
    - packages/tools/src/impl/file-write.test.ts
    - packages/tools/src/impl/bash.test.ts
    - packages/tools/src/impl/web-search.test.ts
  modified:
    - packages/tools/src/index.ts
decisions:
  - "Reject, never sanitize: BLOCKED_PATTERNS throws PermissionDeniedError on match — sanitization is error-prone per D-13"
  - "DangerousShell approval inside call() not gate.ts: BashTool.requiredTier is statically ExecuteShell; destructive detection requires the actual command string available only at call time"
  - "isDangerousCommand uses prefix match (mkfs.*) to catch variant commands like mkfs.ext4"
  - "exitCode from exec() uses error.status (process exit code) not error.code (errno string)"
  - "WebSearchTool isReadOnly() returns false: network calls have server-side side effects (rate limits, logging)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-10"
  tasks: 2
  files: 7
---

# Phase 01 Plan 04: Write/Dangerous Tools — FileWriteTool, BashTool, WebSearchTool

**One-liner:** Three security-hardened write/dangerous tools completing @treis/tools: FileWriteTool with path traversal guard, BashTool with 5-pattern metacharacter blocking and DangerousShell per-invocation approval, WebSearchTool behind NetworkAccess gate.

## What Was Built

### Task 1: FileWriteTool + BashTool

**FileWriteTool** (`packages/tools/src/impl/file-write.ts`):
- Writes files within workspace using `assertWithinWorkspace` path guard (T-01-12)
- Creates parent directories via `mkdir({ recursive: true })` by default
- Requires `WriteFiles` permission tier; `isReadOnly()` returns false
- Rejects paths via `PathTraversalError` for both relative (`../../`) and absolute (`/tmp/`) traversal

**BashTool** (`packages/tools/src/impl/bash.ts`):
- `BLOCKED_PATTERNS`: 5 regex patterns block metacharacters before `exec()` per D-13/T-01-10
  - `;` (command chaining), `&&` (conditional), `||` (conditional), `$(` (substitution), backtick (substitution)
- `DANGEROUS_COMMANDS`: `rm`, `rmdir`, `chmod`, `chown`, `chgrp`, `mkfs`, `dd`, `kill`, `killall`, `shutdown`, `reboot`, `halt`, `mv`, `cp`
- `isDangerousCommand()` uses prefix match to catch `mkfs.ext4` style variants
- `DEFAULT_TIMEOUT_MS = 30_000` enforced via `AbortController`; returns `exitCode: 124` on timeout
- `maxBuffer: 1024 * 1024` prevents memory exhaustion (T-01-14)
- DangerousShell per-invocation approval inside `call()` — not in `gate.ts` — because detection requires the actual command string

### Task 2: WebSearchTool + index.ts exports

**WebSearchTool** (`packages/tools/src/impl/web-search.ts`):
- Requires `NetworkAccess` permission tier; `isReadOnly()` returns false (network side effects)
- Phase 0: DuckDuckGo HTML API as free fallback (no API key needed)
- Parses `result__a` links and `result__snippet` elements via regex
- Wraps all errors (HTTP failures + network errors) as `ToolExecutionError`

**index.ts updated** — all 6 tools now exported:
- `FileReadTool`, `GlobTool`, `GrepTool` (from 01-03)
- `FileWriteTool`, `BashTool` (+ `BashOutput`, `BLOCKED_PATTERNS`), `WebSearchTool` (+ `SearchResult`) (from 01-04)

## Test Coverage

| Suite | Tests | Key assertions |
|-------|-------|----------------|
| file-write.test.ts | 8 | write, mkdir, PathTraversalError, checkPermissions |
| bash.test.ts | 13 | echo, 5 metacharacter rejects, timeout, DangerousShell approval x3, tier classification |
| web-search.test.ts | 7 | tier, isReadOnly, checkPermissions x2, mocked results, HTTP error, network error |
| **Total new** | **28** | |
| **Grand total @treis/tools** | **62** | All passing |

## Commits

| Hash | Description |
|------|-------------|
| 61db9d6 | feat(01-04): implement FileWriteTool and BashTool with metacharacter blocking |
| 8d2a6a1 | feat(01-04): implement WebSearchTool and export all 6 tools from @treis/tools |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mkfs variant prefix matching in isDangerousCommand**
- **Found during:** Task 1 test run (BashTool test for `mkfs.ext4`)
- **Issue:** `DANGEROUS_COMMANDS.includes(firstWord)` matched only exact `mkfs`, not `mkfs.ext4`
- **Fix:** Changed to `DANGEROUS_COMMANDS.some((d) => firstWord === d || firstWord.startsWith(d + '.'))`
- **Files modified:** `packages/tools/src/impl/bash.ts`
- **Commit:** 61db9d6

**2. [Rule 1 - Bug] TypeScript DTS build error — exitCode type**
- **Found during:** Task 2 build verification
- **Issue:** `(error as NodeJS.ErrnoException).code` is `string | undefined` (errno string), not a number; TypeScript rejected cast to `number` in DTS build
- **Fix:** Use `error.status` (process exit code, a number) with fallback to `1` if error present, `0` otherwise
- **Files modified:** `packages/tools/src/impl/bash.ts`
- **Commit:** 8d2a6a1

## Threat Surface

All mitigations from the plan's threat register were implemented:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-01-10 | 5 BLOCKED_PATTERNS reject metacharacters before exec() | Implemented + tested |
| T-01-11 | DangerousShell per-invocation approval in call() | Implemented + tested |
| T-01-12 | assertWithinWorkspace before writeFile | Implemented + tested |
| T-01-13 | DDG results accepted as untrusted model context | Accepted (by design) |
| T-01-14 | 30s AbortController timeout + 1MB maxBuffer | Implemented + tested |

## Self-Check: PASSED

Files exist:
- packages/tools/src/impl/file-write.ts — FOUND
- packages/tools/src/impl/bash.ts — FOUND
- packages/tools/src/impl/web-search.ts — FOUND
- packages/tools/src/index.ts (updated) — FOUND

Commits exist:
- 61db9d6 — FOUND
- 8d2a6a1 — FOUND

Tests: 62/62 passing
Build: ESM + CJS + DTS all succeed
