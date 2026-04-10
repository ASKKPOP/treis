# Phase 2: Engine - Context

**Gathered:** 2026-04-10 (assumptions mode, --auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Plan Contract engine and Agent loop in @treis/core. A Builder states intent in one sentence, the AI asks 2-3 clarifying questions, proposes 3 plan options (A/B/C), Builder picks one and a sealed contract JSON is written to disk. The agent loop then executes the plan with explicit state machine transitions, per-step streaming, retry logic with error context injection, circuit breaking, and scope violation detection. No CLI, no Electron UI.

</domain>

<decisions>
## Implementation Decisions

### Plan Contract Schema
- **D-01:** PlanContract type fields: `id` (ulid), `version` (string), `intent` (string), `clarifications` (Q&A pairs array), `scopeEntries` (ScopeEntry[] union), `successCriteria` (string[]), `tokenBudget` (number, default 200000), `createdAt` (ISO string), `sealedAt` (ISO string). Matches approved design doc.
- **D-02:** ScopeEntry is a discriminated union: `{type: 'file', glob: string}`, `{type: 'tool', name: string}`, `{type: 'url', pattern: string}`, `{type: 'action', description: string}`. Validated with Zod v4.
- **D-03:** Sealed contract persisted to `~/.treis/workspaces/{id}/plan-contracts/{cid}.json` (PLAN-04). Uses `bootstrapWorkspace` from Phase 1 session layer.
- **D-04:** Token budget: 200K default (PLAN-08). Accumulated from streamText usage metadata after each step. Emits WARN when exceeded, continues execution.

### AI Dialogue Flow (Plan Contract Engine)
- **D-05:** Plan negotiation uses two-phase prompt strategy via `streamText`:
  - **Phase A (Clarification):** System prompt instructs model to return 2-3 clarifying questions as JSON array. Single streamText call, structured output mode.
  - **Phase B (Options):** System prompt includes Builder's answers + sealed scope context. Model returns 3 plan options as JSON: always labeled A/B/C with Fast/Balanced/Thorough archetypes. Each option has: label, title, description, tradeoffs, estimatedSteps, scopeEntries[], successCriteria[].
- **D-06:** Builder picks by letter (A/B/C). Contract auto-sealed from the chosen option. No negotiation after sealing — scope is locked.
- **D-07:** Clarifying question count: minimum 2, maximum 3. If the model returns more, truncate to 3. If fewer, proceed.

### Agent Loop State Machine
- **D-08:** State machine implemented as TypeScript class with const state object (same `as const` pattern as PermissionTier — `erasableSyntaxOnly: true` forbids enums). States: `IDLE`, `PREPARE`, `STREAM`, `TOOLS`, `EVALUATE`, `NEXT`, `COMPLETE`, `VIOLATED`, `FAILED`.
- **D-09:** State transition is explicit — each state has an allowed `next` set. Illegal transitions throw `TreisError`. This satisfies AGENT-01 (no state skipping).
- **D-10:** No XState — out of scope per PROJECT.md. Custom enum-based state machine is sufficient for the 8-state linear flow.

### Streaming and Tool Dispatch (Agent Loop)
- **D-11:** Per-step streaming via `streamText` async iterator. Tool calls extracted from the stream as they arrive. Streamed tokens and tool-progress events piped to a `consumer` callback (type: `(event: AgentEvent) => void`). CLI and Electron provide their own consumers — the engine is transport-agnostic (AGENT-02).
- **D-12:** Tool dispatch respects Phase 1 concurrency partitioning: read-only tools via `executeTools` (parallel), write tools via serial execution. Agent loop reuses `executeTools` from `@treis/tools` directly (AGENT-03).
- **D-13:** Compaction only at step boundaries: before entering STREAM state, if conversation history token estimate exceeds 80K tokens, summarize the history to a compact form. Never mid-stream (AGENT-08).

### Retry and Circuit Breaker
- **D-14:** Retry on FAIL verdict: max 3 retries, exponential backoff 1s/2s/4s (AGENT-04). Error context injected as an additional user message at retry start containing: tool name, error type, truncated error message (≤200 chars), retry count.
- **D-15:** Model escalation on 3rd failure: call `approveEscalation(reason: string): Promise<boolean>` callback. If returns true, switch to the cloud adapter (Slot B or configured cloud) for remaining steps in the execution. If returns false, mark step FAILED and halt (AGENT-05).
- **D-16:** Circuit breaker: track `Map<string, number>` keyed by `${toolName}:${JSON.stringify(input)}` per execution. 3 consecutive identical calls → FATAL interrupt (AGENT-06). Cleared after each successful step.
- **D-17:** Loop detector: max 25 steps per execution. Time limit: 10 minutes per execution. Both trigger FATAL on exceed. Tracked per-execution, reset on each `run()` call (AGENT-07).

### Scope Checking
- **D-18:** Scope boundary check runs as pre-hook inside agent loop before every tool call dispatch (PLAN-06). Checks:
  - `file` entries: resolve tool's target path, check against glob patterns with `micromatch`
  - `tool` entries: check tool name against allowed names
  - `url` entries: check URL against pattern (substring match or regex)
  - `action` entries: model-judged — call lightweight "scope check" prompt. Only invoked when action-type ScopeEntries exist.
- **D-19:** Scope violation triggers FATAL interrupt with 3 options exposed via `handleViolation(violation: ScopeViolation): Promise<ViolationDecision>` callback (PLAN-07). Decisions: `'stop'`, `'amend'` (re-seal with updated scope), `'continue'` (override for this call only). Agent loop caller provides the callback.

### Package Structure
- **D-20:** Plan Contract engine lives in `packages/core/src/plan-contract/`:
  - `schema.ts` — Zod v4 schemas for PlanContract and ScopeEntry
  - `engine.ts` — Plan negotiation (clarify + options + seal)
  - `scope-checker.ts` — Pre-hook scope boundary checking
- **D-21:** Agent loop lives in `packages/core/src/agent/`:
  - `types.ts` — AgentState, AgentEvent, AgentContext, consumer callback types
  - `state-machine.ts` — State transition class
  - `executor.ts` — Main run() loop, step execution, compaction
  - `retry.ts` — Retry handler with backoff and error context injection
  - `circuit-breaker.ts` — Same-input detector
- **D-22:** Both plan-contract and agent modules exported from `packages/core/src/index.ts`.

### Claude's Discretion
- Exact system prompt text for clarification and options phases
- Model-judged scope check prompt wording
- History compaction summary format
- ulid vs uuid for contract ID generation (ulid preferred for sortability)
- Exact AgentEvent union type fields for streaming consumer

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Design
- `TREIS_ARCHITECTURE_SPEC.md` — Full architecture spec (16 sections, 55 targets, 28 decisions). The canonical wall for Phase 2 implementation.
- `~/.gstack/projects/treis/desirey-unknown-design-20260409-210907.md` — APPROVED design doc with Plan Contract schema, permission model, failure handling, and ScopeEntry definitions.

### Phase 1 Foundation (reuse)
- `.planning/phases/01-foundation/01-CONTEXT.md` — All locked Phase 1 decisions (D-01 through D-22). Agent loop builds on these.
- `.planning/phases/01-foundation/01-05-SUMMARY.md` — Session persistence layer (store, workspace, trace logger, checkpoint) — all reusable from agent loop.
- `.planning/phases/01-foundation/01-02-SUMMARY.md` — Model adapter API (createSlotManager, getModel, checkModelHealth) — agent loop calls these.
- `.planning/phases/01-foundation/01-03-SUMMARY.md` — Tool executor API (executeTools, Tool interface) — agent loop reuses directly.

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 2 covers PLAN-01..08 and AGENT-01..08. Read these sections carefully.
- `.planning/ROADMAP.md` — Phase 2 success criteria define exactly what must be true.

### Research (to be created)
- `.planning/phases/02-engine/02-RESEARCH.md` — Phase 2 research (Vercel AI SDK structured output, scope checking, state machine patterns). Created by gsd-phase-researcher before planning.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/session/store.ts` — `createStore<T>()` with shallow comparison: agent loop uses this for AgentContext mutable state
- `packages/core/src/session/workspace.ts` — `bootstrapWorkspace()`: plan contract engine uses this to get plan-contracts/ directory path
- `packages/core/src/session/persist.ts` — `createSessionPersister()`: agent loop appends conversation history entries
- `packages/core/src/session/trace-logger.ts` — `createTraceLogger()`: agent loop logs every tool call verdict
- `packages/core/src/session/checkpoint.ts` — `saveCheckpoint()` / `loadCheckpoint()`: agent loop calls after each EVALUATE state
- `packages/core/src/errors.ts` — `TreisError`, `ModelStreamError`, `ToolExecutionError`: retry handler catches these by type
- `packages/api-client/src/slot-manager.ts` — `createSlotManager()`: engine uses Slot A (strongest) for plan negotiation, loop uses per AGENT-05 for escalation
- `packages/tools/src/base/executor.ts` — `executeTools()`: agent loop calls this for tool dispatch (already handles concurrency partitioning)
- `packages/tools/src/base/types.ts` — `Tool`, `PermissionTier`, `ToolContext`: agent loop constructs ToolContext per step

### Established Patterns
- `const` objects with `as const` (not enums) — enforced by `erasableSyntaxOnly: true` in tsconfig. State machine follows same pattern as PermissionTier.
- Zod v4 schemas — all data validation uses Zod v4. Plan Contract schema follows same pattern as tool inputSchema.
- `appendFile` for JSONL — persist.ts pattern. Agent loop conversation history follows same approach.
- Atomic writes (temp + rename) — checkpoint.ts pattern. Plan contract JSON writes should follow the same.
- pino `createTraceLogger` — Phase 1 delivers the trace logger. Agent loop calls `logToolCall()` after every tool execution.

### Integration Points
- Agent loop → `packages/tools/src/base/executor.ts::executeTools()` for tool dispatch
- Agent loop → `packages/api-client/src/index.ts::createSlotManager()` for model routing and escalation
- Plan contract engine → `packages/core/src/session/workspace.ts::bootstrapWorkspace()` for plan-contracts/ directory
- Agent loop → `packages/core/src/session/checkpoint.ts::saveCheckpoint()` after each step
- Agent loop → `packages/core/src/session/trace-logger.ts::createTraceLogger()` for JSONL trace
- Agent loop → `packages/core/src/session/persist.ts::createSessionPersister()` for conversation history

</code_context>

<specifics>
## Specific Ideas

- Plan Contract is the CORE THESIS. The schema and negotiation flow must match the approved design doc exactly. Do not simplify or generalize.
- The `approveEscalation` and `handleViolation` callbacks make the agent loop transport-agnostic. Phase 3 (CLI) and Phase 4 (Desktop) provide their own implementations — the engine just calls the callbacks.
- Scope checking for `action` type entries uses a lightweight model call. Keep the prompt short and deterministic. Return `{allowed: boolean, reason: string}`.
- Circuit breaker tracks per-execution (cleared on each `run()` call). Not across multiple separate plan executions.
- Compaction must only fire at step boundaries. A compaction in the middle of streaming tool calls would break the conversation history. The check is: "before I enter STREAM, is history too long?"

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope.

</deferred>

---

*Phase: 02-engine*
*Context gathered: 2026-04-10*
