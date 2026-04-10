---
phase: 02-engine
plan: 02
subsystem: plan-contract
tags: [engine, ai-sdk, generateObject, tdd, atomic-write]
dependency_graph:
  requires: [02-01]
  provides: [PlanContractEngine, createPlanContractEngine]
  affects: [cli, desktop]
tech_stack:
  added: [ai@5.0.172 (direct dep in @treis/core)]
  patterns: [generateObject-for-structured-output, atomic-temp-rename-write, looser-internal-schema-then-truncate]
key_files:
  created:
    - packages/core/src/plan-contract/engine.ts
    - packages/core/src/plan-contract/engine.test.ts
  modified:
    - packages/core/src/index.ts
    - packages/core/package.json
    - pnpm-lock.yaml
decisions:
  - Use looser internal Zod schema (no max:3) for generateObject call, then truncate to 3 — avoids Zod parse failure when model returns 4+ questions
  - model typed as `object` in PlanContractEngineConfig to avoid @ai-sdk/provider import in core (adapter lives in api-client)
  - Export plan-contract module from @treis/core index (schema, scope-checker, engine)
metrics:
  duration: ~8 min
  completed: 2026-04-10
  tasks: 1
  files: 5
requirements: [PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-08]
---

# Phase 2 Plan 2: Plan Contract Engine Summary

**One-liner:** Plan Contract negotiation engine with clarify/propose/seal phases using generateObject and atomic JSON persistence.

## What Was Built

`packages/core/src/plan-contract/engine.ts` — the core thesis of Treis: AI proposes, Builder picks, scope is sealed.

Three-phase negotiation:
- `clarify(intent)` — calls `generateObject` with a looser internal schema, truncates to max 3 questions (D-07)
- `propose(intent, clarifications)` — calls `generateObject` with `PlanOptionsResponseSchema`, returns exactly 3 A/B/C options
- `seal(intent, clarifications, selectedOption)` — calls `createPlanContract()` factory, writes contract JSON atomically via temp+rename (T-02-05)

## TDD Execution

**RED:** 12 tests written covering all specified behaviors — all failed against placeholder stub.

**GREEN:** Full implementation written — all 12 tests pass.

| Test | Description |
|------|-------------|
| 1 | clarify() calls generateObject and returns questions |
| 2 | clarify() truncates to 3 questions if model returns 4+ |
| 3 | clarify() passes intent as user message content |
| 4 | propose() calls generateObject and returns 3 options |
| 5 | propose() includes clarifications in messages |
| 6 | propose() options have A/B/C labels with Fast/Balanced/Thorough archetypes |
| 7 | seal() creates PlanContract from selected option |
| 8 | seal() writes contract JSON to planContractsDir/{id}.json |
| 9 | seal() uses atomic write — temp file does NOT exist after seal |
| 10 | seal() contract has tokenBudget defaulting to 200000 |
| 11 | Full flow: clarify -> answers -> propose -> select -> seal produces valid persisted contract |
| 12 | clarify() works when model returns exactly 2 questions (minimum) |

## Key Implementation Decisions

### Looser Internal Schema for clarify()
`ClarifyResponseSchema` has `max(3)` which means if a model returns 4 questions, Zod would reject it before we can truncate. Solution: use an internal `ClarifyResponseSchemaInternal` (no max constraint) for the `generateObject` call, then truncate to 3 before returning.

### Model Typing
`PlanContractEngineConfig.model` is typed as `object` to avoid importing `LanguageModelV3` from `@ai-sdk/provider` in `@treis/core` (that lives in `@treis/api-client`). The cast `model as Parameters<typeof generateObject>[0]['model']` satisfies AI SDK v5 at the call site.

### Atomic Write Pattern
Matches `checkpoint.ts` from Phase 1: write to `{id}.json.tmp`, then `rename()` to `{id}.json`. Prevents partial contract files on crash (T-02-05).

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as specified.

### Notes

- `ai@5.0.172` added as direct dependency of `@treis/core` (was only in `@treis/api-client`)
- Plan-contract exports added to `packages/core/src/index.ts` (schema, scope-checker, engine)
- Pre-existing failure: `circuit-breaker.test.ts` references missing `circuit-breaker.js` — this is a pre-existing stub from 02-03, not caused by this plan. 102 tests pass across core.

## Threat Surface Scan

No new network endpoints or trust boundaries introduced. Engine calls `generateObject` (model output parsed by Zod as designed). Seal writes only to `planContractsDir` as specified in T-02-05/T-02-08.

## Self-Check: PASSED

- `packages/core/src/plan-contract/engine.ts` — exists, committed in ed82a17
- `packages/core/src/plan-contract/engine.test.ts` — exists, committed in ed82a17
- `packages/core/src/index.ts` — updated with plan-contract exports, committed in ed82a17
- 12 engine tests pass
- Full workspace build passes
