---
phase: 03-cli
plan: 02
subsystem: cli
tags: [cli, agent-consumer, violation-handler, escalation-handler, execution-stream, result-screen]
dependency_graph:
  requires: [03-01]
  provides: [cli-execution-stream, violation-ui, escalation-ui, result-screen, complete-e2e-flow]
  affects: []
tech_stack:
  added: []
  patterns: [agent-consumer-factory, violation-handler-callback, escalation-callback, process-stdout-write-streaming]
key_files:
  created:
    - apps/cli/src/consumer.ts
    - apps/cli/src/ui/violation.ts
    - apps/cli/src/ui/execution.ts
    - apps/cli/src/ui/result.ts
  modified:
    - apps/cli/src/commands/run.ts
decisions:
  - violation/escalation-required events are no-ops in consumer — handleViolation/approveEscalation callbacks own all display (Pitfall 6)
  - ToolContext uses permissionGrants Set<PermissionTier> not array — matched actual type in packages/tools/src/base/types.ts
  - ToolContext requires sessionId field — passed workspaceId from bootstrap
  - PermissionTier.ReadOnly/WriteFiles/ExecuteShell granted; DangerousShell and NetworkAccess excluded (T-03-04 mitigated)
  - workspaceRoot defaults to process.cwd() — Builder runs CLI from directory they intend to modify (T-03-07 mitigated)
  - renderResultScreen shows all criteria as [ ] (unchecked) — manual verification per research open question 4 resolution
metrics:
  duration: 126s
  completed: 2026-04-10
  tasks_completed: 2
  files_changed: 5
---

# Phase 3 Plan 2: Execution Stream, Violation Handling, and Result Screen Summary

**One-liner:** AgentConsumer factory streaming all 10 event types to terminal, violation/escalation readline callbacks, sealed-contract display, and result checklist complete the `treis "task"` end-to-end CLI flow.

## What Was Built

Task 1 created three files that implement the execution phase UI:

- `apps/cli/src/consumer.ts` — `buildConsumer()` returns `{ consumer: AgentConsumer; state: ConsumerState }`. The consumer handles all 10 `AgentEvent` types via a switch: `token` content is streamed character-by-character with `process.stdout.write`; `tool-start`/`tool-result` display step-annotated tool status; `step-complete`/`retry`/`budget-warning` provide progress feedback; `complete` stores `totalSteps` in `ConsumerState`; `failed` writes to stderr; `violation`/`escalation-required` are explicit no-ops to prevent duplicate display when callbacks fire.

- `apps/cli/src/ui/violation.ts` — `buildViolationHandler(rl)` returns a closure that displays the violation context and prompts a 1/2/3 loop returning `ViolationDecision` (`'stop' | 'amend' | 'continue'`). `buildEscalationHandler(rl)` returns a closure that prompts y/n and returns `boolean` for cloud model approval.

- `apps/cli/src/ui/execution.ts` — `renderSealedContract(contract)` displays the sealed contract (ID, intent, option, scope entries with type-specific formatting, success criteria numbered list) between sealing and execution.

Task 2 created the result screen and completed the run command wiring:

- `apps/cli/src/ui/result.ts` — `renderResultScreen(contract, totalSteps)` displays a `[ ]` checklist of all success criteria with a "Verify criteria above before marking complete" instruction. Phase 3 manual verification; auto-verification is Phase 4+.

- `apps/cli/src/commands/run.ts` — replaced the `// TODO: Plan 02` stub with the full execution phase: `renderSealedContract(contract)` → instantiate tools (`FileReadTool`, `GlobTool`, `GrepTool`, `FileWriteTool`, `BashTool`) → build `ToolContext` with `permissionGrants: new Set([ReadOnly, WriteFiles, ExecuteShell])` and `sessionId: workspaceId` → `buildConsumer()` → `runAgent(...)` with `handleViolation` and `approveEscalation` callbacks → `renderResultScreen(contract, state.totalSteps)`. The `finally { rl.close() }` block from Plan 01 is preserved.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 8326d32 | Consumer, violation handler, escalation handler, execution display |
| Task 2 | 1451851 | Result screen and complete run command execution wiring |

## Deviations from Plan

**1. [Rule 1 - Bug] ToolContext type mismatch — permissionGrants Set vs permissions array**
- **Found during:** Task 2 implementation
- **Issue:** Plan's code example showed `permissions: [PermissionTier.ReadOnly, ...]` as an array on a field named `permissions`. Actual `ToolContext` type in `packages/tools/src/base/types.ts` requires `permissionGrants: Set<PermissionTier>` and also requires `sessionId: string`.
- **Fix:** Used `permissionGrants: new Set([PermissionTier.ReadOnly, PermissionTier.WriteFiles, PermissionTier.ExecuteShell])` and `sessionId: workspaceId`. No runtime behavior change — same permissions granted.
- **Files modified:** `apps/cli/src/commands/run.ts`
- **Commit:** 1451851

## Known Stubs

None. All exported functions have complete implementations. Success criteria checklist displays `[ ]` for all items — this is the intentional Phase 3 design (manual verification), not a stub. Auto-verification is the Phase 4+ work item.

## Threat Flags

None. No new network endpoints, auth paths, or file-access patterns beyond what the threat model documents (T-03-04 through T-03-07). `DangerousShell` and `NetworkAccess` permission tiers are excluded from the `permissionGrants` Set. `workspaceRoot` is `process.cwd()` and path-guarding in tool implementations enforces this boundary.

## Self-Check: PASSED

- FOUND: apps/cli/src/consumer.ts
- FOUND: apps/cli/src/ui/violation.ts
- FOUND: apps/cli/src/ui/execution.ts
- FOUND: apps/cli/src/ui/result.ts
- FOUND: commit 8326d32 (Task 1)
- FOUND: commit 1451851 (Task 2)
