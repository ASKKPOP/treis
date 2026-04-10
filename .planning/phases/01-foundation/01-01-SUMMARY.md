---
phase: 01-foundation
plan: 01
subsystem: monorepo-scaffold
tags: [monorepo, typescript, vitest, tsup, pnpm, error-hierarchy]
dependency_graph:
  requires: []
  provides:
    - pnpm workspace with packages/* and apps/* globs
    - tsconfig.base.json with strict + nodenext ESM
    - vitest root config with projects key
    - "@treis/api-client stub package"
    - "@treis/tools stub package"
    - "@treis/core with typed error hierarchy"
    - "@treis/cli stub app"
    - "@treis/desktop stub app"
  affects:
    - All subsequent plans (every package imports from this scaffold)
tech_stack:
  added:
    - typescript@5.9.3 (^5.8)
    - tsup@8.5.1 (^8)
    - vitest@3.2.4 (^3)
    - eslint@9.39.4 (^9)
    - pnpm workspaces
    - zod@^4 (in api-client, tools, core)
    - ai@^5 (in api-client)
    - "@ai-sdk/anthropic (in api-client)"
    - "@ai-sdk/openai (in api-client)"
    - fast-glob@latest (in tools)
    - pino@^9 (in core, tools devDeps)
    - commander@^14 (in cli)
  patterns:
    - tsup dual ESM+CJS output (format: ['esm', 'cjs'])
    - per-package vitest.config.ts with src/**/*.test.ts
    - workspace:* cross-package references
    - ESM-first with nodenext module resolution
    - TDD: tests written before implementation
key_files:
  created:
    - pnpm-workspace.yaml
    - package.json (root)
    - tsconfig.base.json
    - tsconfig.json (root typecheck)
    - vitest.config.ts (root with projects)
    - eslint.config.cjs (ESLint 9 flat config)
    - .gitignore
    - packages/api-client/package.json
    - packages/api-client/tsconfig.json
    - packages/api-client/tsup.config.ts
    - packages/api-client/src/index.ts
    - packages/api-client/vitest.config.ts
    - packages/tools/package.json
    - packages/tools/tsconfig.json
    - packages/tools/tsup.config.ts
    - packages/tools/src/index.ts
    - packages/tools/vitest.config.ts
    - packages/core/package.json
    - packages/core/tsconfig.json
    - packages/core/tsup.config.ts
    - packages/core/src/index.ts
    - packages/core/src/errors.ts
    - packages/core/src/errors.test.ts
    - packages/core/vitest.config.ts
    - apps/cli/package.json
    - apps/cli/tsconfig.json
    - apps/cli/tsup.config.ts
    - apps/cli/src/index.ts
    - apps/cli/vitest.config.ts
    - apps/desktop/package.json
    - apps/desktop/tsconfig.json
    - apps/desktop/src/index.ts
    - apps/desktop/vitest.config.ts
  modified: []
decisions:
  - "Removed composite:true from all package tsconfigs — tsup DTS worker creates temp tsconfig with files:[entry] only; composite:true requires all files listed, causing TS6307. Root tsconfig simplified to noEmit flat include."
  - "Used ESLint 9 flat config (eslint.config.cjs) instead of .eslintrc.cjs — plan specified eslint ^9 which uses flat config format by default."
  - "Set vitest passWithNoTests:true at root — vitest exits code 1 with no test files by default; plan requires pnpm test exits 0 even before tests exist."
  - "Fixed exports condition ordering: types first, then import, then require — tsup/esbuild warns when types comes after runtime conditions."
  - "Pinned @vitest/coverage-v8 to ^3 to match vitest ^3 — using latest pulled v4 which has unmet peer dep on vitest@4."
  - "Used ai@^5 (not ^6) for @treis/api-client — research doc referenced ai@6.x but that version may not be stable; ^5 is current stable Vercel AI SDK."
metrics:
  duration_minutes: 7
  completed_date: "2026-04-10"
  tasks_completed: 3
  tasks_total: 3
  files_created: 34
  files_modified: 0
  test_count: 10
  commits: 3
---

# Phase 1 Plan 1: Monorepo Scaffold Summary

**One-liner:** pnpm monorepo with 5 packages (api-client, tools, core, cli, desktop), tsup ESM+CJS dual builds, Vitest workspace, and typed error hierarchy (TreisError + 5 subclasses) exported from @treis/core.

## What Was Built

A complete pnpm monorepo scaffold that enables all downstream plans. Every package builds independently via tsup (ESM + CJS dual output) and tests run via Vitest with the `projects` key. The typed error hierarchy in `@treis/core` provides the foundation for structured error handling and trace logging across the entire agent system.

### Packages Scaffolded

| Package | Name | Dependencies |
|---------|------|-------------|
| packages/api-client | @treis/api-client | ai, @ai-sdk/anthropic, @ai-sdk/openai, zod |
| packages/tools | @treis/tools | zod, fast-glob |
| packages/core | @treis/core | workspace:* (api-client, tools), pino, zod |
| apps/cli | @treis/cli | workspace:* (core), commander |
| apps/desktop | @treis/desktop | workspace:* (core) — Electron deferred Phase 4 |

### Error Hierarchy (packages/core/src/errors.ts)

```
TreisError (base)
├── ModelConnectionError   — connection/auth failures
├── ModelStreamError       — token stream interruptions
├── ToolExecutionError     — tool invocation failures (requires tool in context)
├── PermissionDeniedError  — insufficient permission tier (has requiredTier field)
└── PathTraversalError     — path outside workspace root (has workspaceRoot + targetPath)
```

All errors include `context.timestamp` per D-22 for trace logging.

## Verification Results

- `pnpm install` — exits 0, 245 packages installed, no peer dependency warnings
- `pnpm build` — exits 0, all 5 packages produce dist/ with ESM + CJS + DTS
- `pnpm test` — exits 0, 10 tests pass (all in @treis/core errors.test.ts)
- `pnpm typecheck` — exits 0, no TypeScript errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] composite:true conflicts with tsup DTS worker**
- **Found during:** Task 3 (when errors.ts was added as a second source file)
- **Issue:** tsup DTS worker creates a temporary tsconfig with `"files": ["src/index.ts"]`. With `composite: true`, TypeScript requires ALL project files to be listed — any unlisted file triggers TS6307. This was invisible with a single-file package but breaks the moment a second module is added.
- **Fix:** Removed `composite: true` from all 5 package tsconfigs. Changed `include: ["src"]` to `include: ["src/**/*"]` for explicit glob. Simplified root tsconfig.json from project-references to a flat noEmit typecheck config.
- **Files modified:** packages/core/tsconfig.json, packages/api-client/tsconfig.json, packages/tools/tsconfig.json, apps/cli/tsconfig.json, apps/desktop/tsconfig.json, tsconfig.json
- **Commit:** a1a2eb4

**2. [Rule 1 - Bug] ESLint 9 uses flat config format**
- **Found during:** Task 1
- **Issue:** Plan specified `.eslintrc.cjs` (ESLint 8 legacy format) but package.json declares `eslint: ^9`. ESLint 9 uses flat config (`eslint.config.cjs`) by default.
- **Fix:** Created `eslint.config.cjs` with flat config format instead of `.eslintrc.cjs`.
- **Files modified:** eslint.config.cjs (created with correct format)
- **Commit:** 18c2d74

**3. [Rule 1 - Bug] vitest exits code 1 with no test files**
- **Found during:** Task 2 (running pnpm test before any tests existed)
- **Issue:** Vitest exits with code 1 when no test files are found. Plan requires `pnpm test` to exit 0.
- **Fix:** Added `passWithNoTests: true` to root vitest.config.ts.
- **Files modified:** vitest.config.ts
- **Commit:** 01e4e68

**4. [Rule 1 - Bug] exports field types condition ordering**
- **Found during:** Task 2 build output
- **Issue:** tsup/esbuild warns when `types` condition comes after `import`/`require` in exports field — the types condition is unreachable.
- **Fix:** Reordered exports to put `types` first in all package.json files.
- **Files modified:** packages/api-client/package.json, packages/tools/package.json, packages/core/package.json
- **Commit:** 01e4e68

**5. [Rule 1 - Bug] @vitest/coverage-v8 version mismatch**
- **Found during:** Task 2 pnpm install
- **Issue:** Plan specified `@vitest/coverage-v8: latest` which resolved to v4.1.4, requiring vitest@4. Root package.json has vitest@^3.
- **Fix:** Changed `@vitest/coverage-v8` to `^3` to align with vitest version.
- **Files modified:** package.json
- **Commit:** 01e4e68

## Known Stubs

The following stubs are intentional scaffolding for future plans:

| File | Stub | Resolved By |
|------|------|-------------|
| packages/api-client/src/index.ts | `export const VERSION = '0.0.1'` | Plan 01-02 (model adapters) |
| packages/tools/src/index.ts | `export const VERSION = '0.0.1'` | Plan 01-03 (tool system) |
| apps/cli/src/index.ts | `export const VERSION = '0.0.1'` | Later phase (CLI commands) |
| apps/desktop/src/index.ts | `export const VERSION = '0.0.1'` | Phase 4 (Electron) |
| apps/desktop build script | echo stub | Phase 4 (Electron setup) |

These stubs do not prevent this plan's goal (scaffold the monorepo) from being achieved.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: leaked-source | leaked-src/ (untracked) | Repo contains an untracked `leaked-src/` directory with what appears to be proprietary source code. CLAUDE.md mandates clean-room development. No code from this directory was referenced or used. Recommend adding to .gitignore and auditing. |

## Self-Check: PASSED

- pnpm-workspace.yaml: FOUND
- tsconfig.base.json: FOUND
- vitest.config.ts: FOUND (contains `projects:`)
- packages/core/src/errors.ts: FOUND
- packages/core/src/errors.test.ts: FOUND
- packages/core/src/index.ts: FOUND (contains `export * from './errors.js'`)
- Commits 18c2d74, 01e4e68, a1a2eb4: FOUND in git log
