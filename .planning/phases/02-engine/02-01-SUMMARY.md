---
phase: 02-engine
plan: 01
subsystem: plan-contract
tags: [schema, zod-v4, micromatch, scope-checker, tdd]
dependency_graph:
  requires: []
  provides:
    - PlanContractSchema (packages/core/src/plan-contract/schema.ts)
    - ScopeEntrySchema (packages/core/src/plan-contract/schema.ts)
    - PlanOptionSchema (packages/core/src/plan-contract/schema.ts)
    - ClarifyResponseSchema (packages/core/src/plan-contract/schema.ts)
    - checkToolScope (packages/core/src/plan-contract/scope-checker.ts)
  affects:
    - packages/core — new plan-contract subdirectory added
tech_stack:
  added:
    - ulid@3.0.2 (ULID generation for contract IDs)
    - micromatch@4.0.8 (glob matching for file scope entries)
    - "@types/micromatch@4.0.10" (TypeScript types for micromatch)
  patterns:
    - Zod v4 discriminatedUnion for ScopeEntry variants
    - Factory function pattern for createPlanContract()
    - Pre-hook pattern for checkToolScope() in agent loop
key_files:
  created:
    - packages/core/src/plan-contract/schema.ts
    - packages/core/src/plan-contract/schema.test.ts
    - packages/core/src/plan-contract/scope-checker.ts
    - packages/core/src/plan-contract/scope-checker.test.ts
  modified:
    - packages/core/package.json (added ulid, micromatch, @types/micromatch)
    - pnpm-lock.yaml
decisions:
  - Zod v4 discriminatedUnion used for ScopeEntry (not z.union) for efficient single-pass parsing
  - URL matching uses substring containment (not regex or glob) for simplicity; scope is advisory in Phase 0
  - Action entries are skipped when no checkAction callback is provided (not an error)
  - ScopeViolation.attempted for action entries is JSON.stringify truncated to 200 chars (T-02-04)
metrics:
  duration: "~4 minutes"
  completed_date: "2026-04-10"
  tasks_completed: 3
  tests_added: 33
  files_created: 4
  files_modified: 2
---

# Phase 2 Plan 01: Plan Contract Schema and Scope Checker Summary

Zod v4 PlanContract schema with discriminated ScopeEntry union and micromatch-backed scope pre-hook.

## What Was Built

### schema.ts — Zod v4 typed contract structure

- `ScopeEntrySchema` — discriminated union on `type` field: `file | tool | url | action`
- `PlanContractSchema` — sealed contract with `id`, `intent`, `selectedOption` (`A|B|C`), `scopeEntries`, `successCriteria`, `tokenBudget` (default 200,000), `version` (default `1.0`)
- `ClarifyResponseSchema` — 2–3 clarifying questions from model (Phase A of contract flow)
- `PlanOptionSchema` — A/B/C labelled options with `Fast|Balanced|Thorough` archetypes
- `PlanOptionsResponseSchema` — exactly 3 options required
- `createPlanContract()` — factory that generates ulid ID, sets `createdAt`/`sealedAt` to ISO timestamps

### scope-checker.ts — pre-hook for agent loop

- `checkToolScope(toolName, toolInput, contract, checkAction?)` — returns `ScopeViolation | null`
- Tool whitelist: if tool entries exist, only listed tool names pass
- File glob: `micromatch.isMatch(path, globs)` — path must match at least one file entry glob
- URL substring: target URL must contain at least one url entry pattern
- Action entries: delegated to async `checkAction` callback; skipped if no callback (advisory mode)

## Tests (33 added)

| File | Tests | Result |
|------|-------|--------|
| schema.test.ts | 19 | All pass |
| scope-checker.test.ts | 14 | All pass |

Total core tests after this plan: 66 (all pass).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 0 — Install deps | 24f8819 | chore(02-01): install ulid and micromatch dependencies |
| 1 — Schema (TDD) | 8576706 | feat(02-01): implement PlanContract Zod v4 schema with factory |
| 2 — Scope checker (TDD) | fae1809 | feat(02-01): implement checkToolScope pre-hook with micromatch |

## Deviations from Plan

### Extra tests added

**[Rule 2 - Missing coverage] Additional edge case tests**
- **Found during:** Task 1 and Task 2
- **Issue:** Plan specified 17 schema tests and 13 scope-checker tests; added 2 and 1 extras respectively for better coverage (rejects fewer than 3 options, rejects 4 questions, URL with no url property gracefully)
- **Fix:** Added tests — no schema changes needed
- **Files modified:** schema.test.ts, scope-checker.test.ts
- **Effect:** 19 + 14 = 33 tests instead of 30

No other deviations. Plan executed exactly as written.

## Known Stubs

None. All schemas and the scope-checker are fully wired with real logic. No placeholder data.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries were introduced beyond what the plan's threat model documents.

## Self-Check: PASSED

- [x] `packages/core/src/plan-contract/schema.ts` — exists
- [x] `packages/core/src/plan-contract/schema.test.ts` — exists
- [x] `packages/core/src/plan-contract/scope-checker.ts` — exists
- [x] `packages/core/src/plan-contract/scope-checker.test.ts` — exists
- [x] Commit 24f8819 — found
- [x] Commit 8576706 — found
- [x] Commit fae1809 — found
- [x] 33 plan-contract tests pass
- [x] 66 total core tests pass
- [x] Build succeeds for all packages
