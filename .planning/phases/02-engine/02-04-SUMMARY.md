---
phase: 02-engine
plan: "04"
subsystem: agent-executor
tags: [agent, streaming, tool-dispatch, retry, circuit-breaker, scope-checking]
dependency_graph:
  requires: [02-01, 02-02, 02-03]
  provides: [runAgent]
  affects: [packages/core/src/agent/executor.ts]
tech_stack:
  added: []
  patterns: [streaming-async-iterator, state-machine-driven-loop, circuit-breaker, exponential-backoff]
key_files:
  created:
    - packages/core/src/agent/executor.ts
    - packages/core/src/agent/executor.test.ts
  modified: []
decisions:
  - "Circuit breaker cleared on retry (not on success) so it tracks consecutive failures rather than cross-step calls"
  - "step-- on retry keeps step counter at same logical step number across retry attempts"
  - "mockImplementation required over mockReturnValue for async generator mocks (generators exhaust after first consumption)"
  - "Text-only (no tool calls) step goes directly STREAM→EVALUATE→COMPLETE — model done signal"
metrics:
  duration: ~11 min
  completed_date: "2026-04-10"
  tasks_completed: 1
  files_created: 2
requirements: [AGENT-02, AGENT-03, AGENT-07, AGENT-08]
---

# Phase 02 Plan 04: Agent Executor Summary

**One-liner:** `runAgent()` orchestrates the full agent loop — streaming model output via `ai@5` `fullStream`, dispatching tools with scope pre-hook and circuit breaker, retrying failures with exponential backoff and escalation offer, and enforcing 25-step/10-minute execution limits.

## What Was Built

`packages/core/src/agent/executor.ts` exports `runAgent(options: AgentRunOptions): Promise<void>` — the main execution engine for sealed Plan Contracts.

### Core Loop State Transitions

```
IDLE → PREPARE → STREAM → [TOOLS →] EVALUATE → NEXT → PREPARE → ... → COMPLETE
                                              ↘ VIOLATED (scope breach)
                                              ↘ FAILED (retry exhausted, circuit breaker, limits)
```

### Key Behaviors

**Streaming (AGENT-02):** Consumes `fullStream` async iterator from `ai@5.0.172`. Emits `token` events for `text-delta` parts, `tool-start` for `tool-call` parts, accumulates `finish-step` token counts.

**Tool dispatch (AGENT-03):** Calls `executeTools()` from `@treis/tools` which handles read-only concurrency partitioning vs serial write tool execution.

**Scope checking (D-18, T-02-15):** `checkToolScope()` runs before every tool dispatch. Violations trigger consumer `violation` event, then `handleViolation` callback. `'stop'`/`'amend'` → VIOLATED terminal state; `'continue'` → proceeds.

**Circuit breaker (D-16, T-02-14):** `CircuitBreaker.record()` called before each tool execution. Three consecutive identical `toolName+input` calls trigger FATAL `failed` event. Cleared on retry (so intentional retries don't falsely trigger it).

**Retry (D-14, AGENT-04):** `RetryHandler.shouldRetry(attempt)` allows up to 3 retries with 1s/2s/4s exponential backoff. On each retry, `buildRetryInjection()` injects error context as a user message, and `cb.clear()` resets the circuit breaker.

**Escalation (AGENT-05):** After 3 failed retries, `approveEscalation` callback is called with a reason string. If approved AND `escalationModel` provided, switches to escalation model and continues. If declined, transitions to FAILED.

**Execution limits (D-17, AGENT-07, T-02-13):**
- `step >= MAX_STEPS (25)` → emits `failed` with "Step limit exceeded", terminates
- `Date.now() - startTime > MAX_DURATION_MS (600000)` → emits `failed` with "Time limit exceeded", terminates

**Token budget (D-04, PLAN-08):** Accumulated from `finish-step` usage. Emits `budget-warning` when `totalTokensUsed > contract.tokenBudget` but execution continues.

**Compaction (D-13, AGENT-08):** Fires only at step boundaries before entering STREAM state. If `totalTokensUsed > COMPACTION_THRESHOLD (80K)`, retains system prompt + last 3 messages. Never mid-stream.

**Checkpointing (SESS-05):** `saveCheckpoint()` called after each successful EVALUATE state with step number, timestamp, and execution metadata.

**Trace logging (D-22, T-02-16):** `createTraceLogger()` per execution. `logToolCall()` after each tool execution with input truncated to 200 chars, output to 500 chars. `flush()` called after loop exits.

## Test Coverage

20 tests across 6 categories, all passing (145 total suite tests pass):

| Category | Tests | Key Assertions |
|----------|-------|----------------|
| Core loop | 1-4 | State transitions, token events, step-complete, complete |
| Scope checking | 5-8 | null=proceed, violation=VIOLATED, stop=halt, continue=proceed |
| Retry/escalation | 9-12 | retry event with attempt#, approveEscalation called, model switch, FAILED |
| Circuit breaker | 13 | 3 identical calls → failed event with "Circuit breaker" reason |
| Execution limits | 14-16 | Step limit FATAL, time limit FATAL, budget-warning continues |
| Compaction+integration | 17-20 | Compaction at boundary, no mid-stream, executeTools args, logToolCall |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Async generator mock exhaustion on retry**
- **Found during:** Task 1 (TDD GREEN phase — Tests 10, 12 failing)
- **Issue:** `vi.mocked(streamText).mockReturnValue({ fullStream: makeToolCallStream(...) })` returned the SAME async generator object on every call. Once consumed by the first `for await` loop, subsequent calls yielded zero parts — causing text-only path (COMPLETE) instead of retry.
- **Fix:** Changed `mockReturnValue` to `mockImplementation(() => ({ fullStream: ... }))` so a fresh generator is created on each `streamText` call.
- **Files modified:** `packages/core/src/agent/executor.test.ts`

**2. [Rule 1 - Bug] Circuit breaker cleared at wrong boundary**
- **Found during:** Task 1 (Tests 10-12 vs Test 13 conflict)
- **Issue:** Initially `cb.clear()` was called after each successful step (following circuit-breaker.ts design intent). This prevented Test 13 (3 identical tool calls across separate successful steps should fire FATAL) from working correctly AND conflicted with retry tests where the circuit breaker would fire during retry attempts with the same input.
- **Fix:** Remove `cb.clear()` from successful step path. Add `cb.clear()` to the retry path only. Circuit breaker now accumulates across steps (catches infinite same-tool loops) but resets on retry (intentional retry with same tool doesn't penalize).
- **Files modified:** `packages/core/src/agent/executor.ts`

**3. [Rule 1 - Bug] Fake timer interleaving with Promise.all**
- **Found during:** Task 1 (Tests 9-12 with `vi.useFakeTimers()`)
- **Issue:** Pattern `await vi.runAllTimersAsync(); await runPromise` doesn't work — `runAllTimersAsync` completes before the agent creates its setTimeout backoff delays.
- **Fix:** Changed to `await Promise.all([runAgent(...), vi.runAllTimersAsync()])` so both run concurrently and the timer loop drains dynamically created timeouts.
- **Files modified:** `packages/core/src/agent/executor.test.ts`

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary schema changes introduced. The executor enforces the threat mitigations already registered in the plan's threat model:

| T-ID | Mitigation Status |
|------|-----------------|
| T-02-13 | Implemented — MAX_STEPS + MAX_DURATION_MS guards |
| T-02-14 | Implemented — CircuitBreaker with threshold=3 |
| T-02-15 | Implemented — checkToolScope() before every tool dispatch |
| T-02-16 | Implemented — logToolCall() truncates input/output |
| T-02-17 | Implemented — StateMachine enforces transition order |
| T-02-18 | Accepted — Unknown tool "error" fallback logged but not blocked |

## Self-Check: PASSED

- FOUND: `packages/core/src/agent/executor.ts`
- FOUND: `packages/core/src/agent/executor.test.ts`
- FOUND: `.planning/phases/02-engine/02-04-SUMMARY.md`
- FOUND: RED commit `2bd0d64` — test(02-04): add failing tests for runAgent executor
- FOUND: GREEN commit `5974c17` — feat(02-04): implement runAgent executor
- All 20 executor tests pass, 145/145 total suite tests pass
- Build: `pnpm --filter @treis/core build` succeeds cleanly
