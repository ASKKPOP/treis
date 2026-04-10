---
phase: 03-cli
plan: 01
subsystem: cli
tags: [cli, commander, readline, plan-contract, negotiation]
dependency_graph:
  requires: [02-engine]
  provides: [cli-entry-point, readline-singleton, plan-contract-negotiation-ui]
  affects: [03-02]
tech_stack:
  added: [ulid@^3.0.2, @treis/tools workspace, @treis/api-client workspace]
  patterns: [commander-argument-action, readline-promises-singleton, env-var-model-config]
key_files:
  created:
    - apps/cli/src/input.ts
    - apps/cli/src/commands/run.ts
    - apps/cli/src/ui/dialogue.ts
    - apps/cli/src/ui/options.ts
  modified:
    - apps/cli/package.json
    - apps/cli/tsup.config.ts
    - apps/cli/src/index.ts
decisions:
  - tsup banner adds shebang to dist output — source file has no shebang (avoids duplicate)
  - top-level await in index.ts is valid in ESM (type:module) — no IIFE wrapper needed
  - TREIS_MODEL_PROVIDER + TREIS_MODEL_ID env vars for model config in Phase 3 (config file Phase 4+)
  - readline interface created once in runCommand and closed in finally — prevents stdin hang
metrics:
  duration: 2m 6s
  completed: 2026-04-10
  tasks_completed: 2
  files_changed: 7
---

# Phase 3 Plan 1: CLI Scaffold and Plan Contract Negotiation UI Summary

**One-liner:** Commander entry point with tsup shebang banner, singleton readline/promises interface, and clarify→propose→seal Plan Contract negotiation flow wired to env-var model config.

## What Was Built

Task 1 established the CLI scaffold: `apps/cli/src/index.ts` is a Commander 14 program with `.argument('<task>')` and `await program.parseAsync(process.argv)`. The tsup config adds a `banner.js` with `#!/usr/bin/env node` so the built `dist/index.js` is directly executable. `apps/cli/src/input.ts` exports a `createCliInterface()` singleton factory backed by `node:readline/promises` — one interface per process shared across all screens.

Task 2 wired the full Plan Contract negotiation phase:

- `apps/cli/src/ui/dialogue.ts` — `runDialogue(rl, questions)` renders each question with `process.stdout.write` and collects answers via `rl.question()`
- `apps/cli/src/ui/options.ts` — `displayOptions(options)` renders the three plan options with label, archetype, title, description, tradeoffs, and estimated steps; `selectOption(rl, options)` loops until the Builder enters a valid 1/2/3 or A/B/C choice
- `apps/cli/src/commands/run.ts` — `runCommand(task)` orchestrates: bootstrap workspace → initialize model from env vars → clarify → dialogue → propose → display options → select → seal; readline closed in `finally`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 9c53daf | CLI scaffold — entry point, readline singleton, package wiring |
| Task 2 | e374fd6 | Dialogue + options UI and Plan Contract run command |

## Deviations from Plan

**1. [Rule 3 - Blocking] Temporary run.ts stub for Task 1 build verification**
- **Found during:** Task 1 build
- **Issue:** `src/index.ts` imports `runCommand` from `./commands/run.js` which did not exist yet; build fails without it
- **Fix:** Created a one-line stub `export async function runCommand(_task: string): Promise<void> {}` to allow Task 1 build to succeed; overwritten with full implementation in Task 2
- **Files modified:** `apps/cli/src/commands/run.ts`
- **Commit:** 9c53daf (stub), e374fd6 (full)

## Known Stubs

None. All exported functions have complete implementations. The `// TODO: Plan 02 adds execution stream` comment in `run.ts` is intentional scope deferral, not a stub — the Plan Contract negotiation phase (this plan's goal) is fully functional.

## Threat Flags

None. No new network endpoints, auth paths, or file-access patterns beyond what the threat model documented (T-03-01 through T-03-03). ANTHROPIC_API_KEY is read from env only when `TREIS_MODEL_PROVIDER=anthropic` — it is never logged.
