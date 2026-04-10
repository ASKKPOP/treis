---
phase: 02-engine
plan: "03"
subsystem: agent-loop-foundation
tags: [agent, state-machine, circuit-breaker, retry, tdd]
dependency_graph:
  requires: ["02-01"]
  provides: ["agent/types.ts", "agent/state-machine.ts", "agent/circuit-breaker.ts", "agent/retry.ts"]
  affects: ["02-04"]
tech_stack:
  added: []
  patterns: ["const-object-as-const", "guarded-state-machine", "circuit-breaker", "exponential-backoff"]
key_files:
  created:
    - packages/core/src/agent/types.ts
    - packages/core/src/agent/types.test.ts
    - packages/core/src/agent/state-machine.ts
    - packages/core/src/agent/state-machine.test.ts
    - packages/core/src/agent/circuit-breaker.ts
    - packages/core/src/agent/circuit-breaker.test.ts
    - packages/core/src/agent/retry.ts
    - packages/core/src/agent/retry.test.ts
  modified: []
decisions:
  - "RETRY_BACKOFF_MS stored as readonly tuple in EXECUTION_LIMITS to keep backoff values co-located with other limits"
  - "CircuitBreaker uses Map<string, number> keyed by toolName:JSON.stringify(input) for exact identical-call detection"
  - "RetryHandler is pure logic only (no setTimeout) — executor applies delays (Plan 04 responsibility)"
  - "AgentRunOptions.model typed as unknown to avoid cross-package LanguageModelV3 coupling at Phase 0"
metrics:
  duration: "3 minutes"
  completed_date: "2026-04-10"
  tasks_completed: 2
  files_created: 8
  tests_added: 47
requirements:
  - AGENT-01
  - AGENT-04
  - AGENT-05
  - AGENT-06
---

# Phase 2 Plan 03: Agent Loop Foundation Summary

**One-liner:** Agent state machine with TreisError-guarded transitions, circuit breaker for identical-call detection, and exponential-backoff retry handler with error context injection.

## What Was Built

Four foundational modules for the agent executor (Plan 04):

**`packages/core/src/agent/types.ts`**
- `AgentState` const object with 9 states (IDLE, PREPARE, STREAM, TOOLS, EVALUATE, NEXT, COMPLETE, VIOLATED, FAILED) — `as const` pattern, no enums
- `StepVerdict` const object (PASS, FAIL, FATAL)
- `AgentEvent` union type covering all lifecycle events (token, tool-start, tool-result, step-complete, retry, violation, escalation-required, budget-warning, complete, failed)
- `AgentConsumer` callback type
- `AgentRunOptions` interface with contract, tools, model, consumer, callbacks, workspace
- `EXECUTION_LIMITS` constants (MAX_STEPS=25, MAX_RETRIES=3, CIRCUIT_BREAKER_THRESHOLD=3, backoffs=[1000,2000,4000])

**`packages/core/src/agent/state-machine.ts`**
- `TRANSITIONS` record mapping each state to allowed next states
- `StateMachine` class with `transition(next)` — throws `TreisError` on illegal transitions
- `reset()` returns to IDLE between executions
- Terminal states (COMPLETE, VIOLATED, FAILED) have empty transition arrays

**`packages/core/src/agent/circuit-breaker.ts`**
- `CircuitBreaker` class tracking consecutive identical tool+input calls
- Key: `${toolName}:${JSON.stringify(input)}`
- `record()` returns `{ triggered, count, key }` — triggered=true at threshold
- `clear()` resets all counters (called after successful step)
- Configurable threshold (defaults to EXECUTION_LIMITS.CIRCUIT_BREAKER_THRESHOLD=3)

**`packages/core/src/agent/retry.ts`**
- `buildRetryInjection()` creates user-role messages with tool name, error type, and truncated error (200 chars max)
- `createRetryHandler()` factory returning `shouldRetry`, `shouldEscalate`, `getBackoffMs`
- Backoff values: 1s/2s/4s from EXECUTION_LIMITS.RETRY_BACKOFF_MS
- Escalation offered at attempt >= MAX_RETRIES (3)

## Test Results

| Test File | Tests | Result |
|-----------|-------|--------|
| types.test.ts | 5 | PASS |
| state-machine.test.ts | 19 | PASS |
| circuit-breaker.test.ts | 9 | PASS |
| retry.test.ts | 14 | PASS |
| **Total** | **47** | **PASS** |

Full @treis/core suite: **125 tests passing** (47 new + 78 existing).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 46d62ea | feat(02-03): agent types and state machine with guarded transitions |
| Task 2 | ed82a17 | feat(02-03): circuit breaker and retry handler |

## Decisions Made

1. **RetryHandler is pure logic**: No setTimeout calls — the executor (Plan 04) is responsible for applying delays. This makes the handler easily testable and keeps concerns separated.
2. **AgentRunOptions.model typed as unknown**: Avoids hard coupling to `LanguageModelV3` across packages at Phase 0. Plan 04 will cast to the correct type internally.
3. **EXECUTION_LIMITS co-location**: All execution limit constants (steps, retries, thresholds, backoffs) in a single `as const` object in types.ts so they're discoverable in one place.
4. **CircuitBreaker key strategy**: `toolName:JSON.stringify(input)` provides exact identical-call detection while being simple and deterministic.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|------------|
| T-02-09 (DoS via infinite loops) | Terminal states have empty transition arrays — no way to loop |
| T-02-10 (DoS via tool spam) | Circuit breaker fires at 3 identical calls |
| T-02-11 (Info disclosure via error text) | buildRetryInjection truncates error messages to 200 chars |
| T-02-12 (Tampering via illegal transitions) | TreisError thrown on every illegal state transition |

## Self-Check: PASSED

Files exist:
- packages/core/src/agent/types.ts: FOUND
- packages/core/src/agent/state-machine.ts: FOUND
- packages/core/src/agent/circuit-breaker.ts: FOUND
- packages/core/src/agent/retry.ts: FOUND

Commits exist:
- 46d62ea: FOUND
- ed82a17: FOUND
