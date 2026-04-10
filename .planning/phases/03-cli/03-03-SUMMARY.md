---
phase: 03-cli
plan: 03
subsystem: cli-benchmark
tags: [benchmark, vitest, fixtures, plan-contract, runAgent]
dependency_graph:
  requires: [02-engine, 03-01]
  provides: [benchmark-suite, reference-plan-fixtures, benchmark-runner]
  affects: []
tech_stack:
  added: []
  patterns: [pre-sealed-contract-benchmark, per-fixture-temp-workspace, vitest-projects-config]
key_files:
  created:
    - apps/cli/benchmark/types.ts
    - apps/cli/benchmark/fixtures/01-hello-world.ts
    - apps/cli/benchmark/fixtures/02-json-parser.ts
    - apps/cli/benchmark/fixtures/03-readme-writer.ts
    - apps/cli/benchmark/fixtures/04-csv-analyzer.ts
    - apps/cli/benchmark/fixtures/05-todo-app.ts
    - apps/cli/benchmark/fixtures/06-summary-writer.ts
    - apps/cli/benchmark/fixtures/07-config-generator.ts
    - apps/cli/benchmark/fixtures/08-test-writer.ts
    - apps/cli/benchmark/fixtures/09-data-transformer.ts
    - apps/cli/benchmark/fixtures/10-mixed-task.ts
    - apps/cli/benchmark/fixtures/index.ts
    - apps/cli/benchmark/runner.ts
    - apps/cli/benchmark/benchmark.test.ts
  modified:
    - apps/cli/vitest.config.ts
decisions:
  - Benchmark uses pre-sealed PlanContracts (createPlanContract with fixture planOption) to skip AI negotiation — tests execution only, making benchmark deterministic
  - Per-fixture isolated temp workspace under tmpdir()/treis-benchmark/{ulid} prevents cross-contamination (T-03-08)
  - isModelAvailable() uses health.connected field (HealthCheckResult), not health.healthy (plan had wrong field name — auto-fixed Rule 1)
  - Vitest config migrated to projects[] array per Vitest 3.2 deprecation of workspace config
  - Benchmark test project gets testTimeout 600_000 (10 min) to prevent CI blocking (T-03-09)
  - Benchmark files outside src/ are not included in tsup CLI build output
metrics:
  duration: 182s
  completed: 2026-04-10
  tasks_completed: 2
  files_changed: 15
---

# Phase 3 Plan 3: Benchmark Suite Summary

**One-liner:** 10 reference plan fixtures across code/writing/data/mixed domains with deterministic pre-sealed contracts, isolated temp workspaces per fixture, filesystem outcome checking, and Vitest 3.2 projects config with 80% success rate assertion.

## What Was Built

### Task 1: Benchmark Types and 10 Reference Plan Fixtures

`apps/cli/benchmark/types.ts` defines three types:
- `BenchmarkFixture`: name, domain, intent, planOption (PlanOption), expectedOutcomes
- `ExpectedOutcome`: type (file-exists | file-contains | no-violation | complete), path, pattern, description
- `BenchmarkResult`: name, domain, passed, totalSteps, reason, durationMs

10 fixture files cover all required domains:
- **code (4):** 01-hello-world (Python print), 02-json-parser (JS JSON.parse), 05-todo-app (HTML form), 08-test-writer (JS assert/expect)
- **writing (2):** 03-readme-writer (README with install), 06-summary-writer (REST API summary with GET)
- **data (2):** 04-csv-analyzer (Python csv module), 09-data-transformer (Python upper())
- **mixed (2):** 07-config-generator (.gitignore node_modules), 10-mixed-task (package.json my-lib)

Each fixture uses a pre-built `PlanOption` with `label: 'A'`, `archetype: 'Fast'`, `estimatedSteps: 1`, and targeted `scopeEntries` + `successCriteria`. The `REFERENCE_PLANS` barrel exports all 10 as a typed array.

### Task 2: Benchmark Runner, Vitest Test, and Config Update

`apps/cli/benchmark/runner.ts` exports two functions:
- `isModelAvailable()`: Creates a SlotManager from env vars (TREIS_MODEL_PROVIDER/TREIS_MODEL_ID, default ollama/llama3.2), calls `checkModelHealth`, returns `health.connected`
- `runBenchmark(fixtures)`: For each fixture, bootstraps an isolated temp workspace, seals a contract via `createPlanContract`, runs `runAgent` with all 5 tools (FileRead, Glob, Grep, FileWrite, Bash), then checks each expectedOutcome via filesystem access and readFile+regex

Outcome checking implementation:
- `file-exists`: `access(join(workspaceRoot, path))` — resolves if file exists
- `file-contains`: `readFile(path, 'utf-8')` + `new RegExp(pattern, 'i').test(content)` — case-insensitive match
- `no-violation`: checks hadViolation flag set by consumer
- `complete`: always passes if outcome checking reached

`apps/cli/benchmark/benchmark.test.ts` uses `beforeAll` to check `isModelAvailable()`, then `ctx.skip()` in the test if false. The benchmark test has a 300s timeout and asserts `expect(successRate).toBeGreaterThanOrEqual(0.8)`.

`apps/cli/vitest.config.ts` updated from single `include` to `projects` array with two projects: `unit` (src/**/*.test.ts) and `benchmark` (benchmark/**/*.test.ts, testTimeout 600_000).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | e1f271f | feat(03-cli-03): add benchmark types and 10 reference plan fixtures |
| Task 2 | 8b1d987 | feat(03-cli-03): add benchmark runner, Vitest test, and update vitest config |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed health check field name in isModelAvailable()**
- **Found during:** Task 2
- **Issue:** Plan specified `health.healthy` but `checkModelHealth` returns `HealthCheckResult` with `connected: boolean`, not `healthy: boolean`
- **Fix:** Used `health.connected` to match the actual `HealthCheckResult` type from `packages/api-client/src/health.ts`
- **Files modified:** `apps/cli/benchmark/runner.ts`
- **Commit:** 8b1d987

## Known Stubs

None. All benchmark logic is fully implemented. The benchmark test will skip (not fail) when no model is available — this is intentional opt-in behavior for integration tests, not a stub.

## Threat Flags

None. No new network endpoints or auth paths beyond the existing model API surface already documented in the threat model (T-03-08, T-03-09, T-03-10 are all addressed).

## Self-Check: PASSED

All 16 files found. Commits e1f271f and 8b1d987 verified in git log.
