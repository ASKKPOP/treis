# Phase 2: Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 02-engine
**Mode:** --auto (all decisions auto-selected)
**Areas discussed:** Plan Contract Schema, AI Dialogue Flow, State Machine Pattern, Retry/Error Injection, Scope Checking Strategy, Package Structure

---

## Plan Contract Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Follow approved design doc exactly | PlanContract with id, intent, clarifications[], scopeEntries[], successCriteria[], tokenBudget, timestamps | ✓ |
| Simplified schema | Fewer fields, looser structure | |
| Extensible schema with metadata | Extra plugin fields | |

**User's choice:** [auto] Follow approved design doc (recommended default)
**Notes:** The approved design doc at ~/.gstack/projects/treis/... is the legal clean-room wall. Schema must match it exactly.

| Option | Description | Selected |
|--------|-------------|----------|
| Discriminated union ScopeEntry | file/tool/url/action with type discriminant | ✓ |
| Single string-based entries | Just pattern strings, no type discrimination | |
| Separate arrays per type | fileScope[], toolScope[], etc. | |

**User's choice:** [auto] Discriminated union (recommended default)
**Notes:** Typed ScopeEntry required by PLAN-05. Discriminated union enables exhaustive type checking in scope-checker.

---

## AI Dialogue Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Two-phase structured output | Phase A: clarifying questions JSON. Phase B: 3 options JSON. Separate streamText calls. | ✓ |
| Single-prompt multi-turn | One long conversation, model decides when to propose options | |
| Template-filled contract | Static template + model fills fields | |

**User's choice:** [auto] Two-phase structured output (recommended default)
**Notes:** Explicit phases give the engine control over the flow. Builder sees questions, answers, then sees options. Clean separation.

| Option | Description | Selected |
|--------|-------------|----------|
| Always A/B/C labeled Fast/Balanced/Thorough | Predictable structure, easy to pick | ✓ |
| Model-named options | Model invents option names | |
| Only 1 option (recommended path) | No choice, model picks | |

**User's choice:** [auto] Always A/B/C Fast/Balanced/Thorough (recommended default)
**Notes:** PLAN-02 requires 3 options with tradeoffs. Fixed labels make CLI and Desktop implementation predictable.

---

## State Machine Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript class with const states | Same `as const` pattern as PermissionTier. Zero deps. | ✓ |
| XState | Powerful FSM library, visual debugger | |
| Simple switch/case | No class, just a function | |

**User's choice:** [auto] TypeScript class with const states (recommended default)
**Notes:** XState is out of scope per PROJECT.md. The 8-state linear flow doesn't need it. `erasableSyntaxOnly` forbids enum — const object is the correct pattern (established in Phase 1).

---

## Retry / Error Injection

| Option | Description | Selected |
|--------|-------------|----------|
| Error as additional user message at retry start | Tool name, error type, truncated message, retry count | ✓ |
| Error injected into system prompt | Modifies the persistent system prompt | |
| Error summary appended to last assistant turn | Modifies conversation history in-place | |

**User's choice:** [auto] Error as additional user message (recommended default)
**Notes:** User message injection keeps conversation history clean. Model sees the error as context, not a broken assistant turn.

| Option | Description | Selected |
|--------|-------------|----------|
| approveEscalation callback for model escalation | Transport-agnostic, CLI and Desktop provide their own impl | ✓ |
| Automatic escalation (no approval) | Just switches to cloud without asking | |
| No escalation | 3rd failure always halts | |

**User's choice:** [auto] approveEscalation callback (recommended default)
**Notes:** Builder must control escalation (cost implication of switching to cloud). Callback keeps engine transport-agnostic — core principle of Phase 2.

---

## Scope Checking Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Programmatic for file/tool/url, model-judged for action | micromatch for globs, string match for tool/url | ✓ |
| Model-judged for all entries | Single model call checks all scope types | |
| Programmatic only (skip action type) | Ignore action-type ScopeEntries | |

**User's choice:** [auto] Programmatic + model-judged hybrid (recommended default)
**Notes:** File/tool/url matching is deterministic and fast (no latency). Action entries require model judgment — only called when action-type entries exist. Matches PLAN-05 spec.

| Option | Description | Selected |
|--------|-------------|----------|
| handleViolation callback with Stop/Amend/Continue | Transport-agnostic, caller handles UX | ✓ |
| Built-in terminal prompt in engine | Engine directly reads stdin | |
| Always stop on violation | No user choice | |

**User's choice:** [auto] handleViolation callback (recommended default)
**Notes:** PLAN-07 requires 3 options. Callback keeps engine transport-agnostic. CLI and Desktop each provide their own violation handler.

---

## Package Structure

| Option | Description | Selected |
|--------|-------------|----------|
| plan-contract/ and agent/ subdirs in packages/core/src/ | Clear separation by domain | ✓ |
| Everything in packages/core/src/ flat | Simple but harder to navigate | |
| Separate packages (@treis/plan-contract, @treis/agent) | More isolation, more overhead | |

**User's choice:** [auto] Subdirectories in packages/core/src/ (recommended default)
**Notes:** Phase 3 and 4 import from @treis/core. Subdirectories keep related files together without adding new packages to the monorepo.

---

## Claude's Discretion

- Exact system prompt wording for clarification and options phases
- Model-judged scope check prompt text
- History compaction summary format
- ulid vs uuid for contract ID (ulid preferred)
- AgentEvent union type field names

## Deferred Ideas

None — analysis stayed within phase scope.
