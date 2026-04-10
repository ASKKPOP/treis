# Architecture Patterns: AI Agent Harness

**Domain:** AI agent harness / plan execution platform
**Project:** Treis
**Researched:** 2026-04-09
**Overall confidence:** HIGH — Architecture spec (TREIS_ARCHITECTURE_SPEC.md v1.1) is the authoritative
source. Industry patterns cross-verified with 2026 web sources.

---

## Recommended Architecture

Treis is structured as a harness — infrastructure that wraps an LLM and enforces correctness, scope, and
reliability so the model can focus on reasoning. The architecture has five distinct concerns, each with
explicit boundaries.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TREIS HARNESS                                   │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │ Plan Contract│   │  Agent Loop  │   │  Hook System │                 │
│  │  Engine      │──→│  (Core)      │──→│  (Rails)     │                 │
│  │  @treis/core │   │  @treis/core │   │  @treis/core │                 │
│  └──────────────┘   └──────┬───────┘   └──────────────┘                 │
│                            │                                            │
│              ┌─────────────┼─────────────┐                              │
│              ▼             ▼             ▼                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │  Tool System │   │  API Client  │   │  Session     │                 │
│  │  @treis/tools│   │  @treis/api- │   │  State       │                 │
│  │              │   │  client      │   │  @treis/core │                 │
│  └──────────────┘   └──────────────┘   └──────────────┘                 │
│                                                                         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  IPC Bridge  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                                         │
│  ┌──────────────────────┐              ┌──────────────────────┐         │
│  │   apps/cli           │              │   apps/desktop        │        │
│  │   (commander.js)     │              │   (Electron + React)  │        │
│  └──────────────────────┘              └──────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘

EXTERNAL (loaded at runtime, not rebuilt):
  gstack  → Logos layer (Slot A, decision)
  GSD     → Ethos layer (Slot B, stability)
  Superpowers → Pathos layer (Slot A, execution)
```

---

## Component Boundaries

### Component 1: Plan Contract Engine (`@treis/core/plan-contract/`)

**Responsibility:** Manage the intent → dialogue → options → seal lifecycle. Enforce scope
boundaries during execution.

**Communicates with:**
- Agent Loop — sends sealed contract, receives violation signals
- Hook System — registers PreToolUse scope boundary check
- Session State — persists sealed contract to workspace storage
- apps/desktop (via IPC) — streams dialogue turns, presents option cards, receives Builder pick

**Owns:**
- Contract structure (intent, scope, boundaries, success criteria)
- Option generation (A=Fast, B=Balanced, C=Thorough)
- Violation detection — deterministic check on every file path and URL
- Violation dialog state (Stop / Amend / Continue differently)

**Does NOT own:**
- Tool permission gates (Tool System owns these)
- Model invocation (Agent Loop owns this)
- UI rendering (apps/desktop owns this)

---

### Component 2: Agent Loop (`@treis/core/agent/`)

**Responsibility:** Run the LLM conversation state machine. One turn = one `submitMessage()` call.
Manages message history, streaming, tool dispatch, and explicit state transitions.

**Communicates with:**
- API Client — submits messages, receives streaming chunks
- Tool System — dispatches tool calls, receives results
- Hook System — triggers pre/post hooks at defined points
- Plan Contract Engine — checks scope on each tool use
- Session State — reads/writes message history, usage tracking

**State machine transitions (explicit, not nested conditionals):**
```
IDLE → STREAMING → TOOL_EXEC → STREAMING → [COMPLETED | ERROR | ABORTED | MAX_TURNS]
```

**Per-iteration sequence:**
1. Prepare messages (compact, snip stale, apply budgets)
2. Stream API request (with fallback model switching)
3. Accumulate assistant message
4. Dispatch tool executor (concurrent for read-only, serial for write)
5. Build tool results
6. Fire stop hooks + fire-and-forget background tasks (memory, dream)

**Exit conditions:** completed, max_turns, aborted_streaming, aborted_tools, hook_stopped,
model_error, prompt_too_long.

---

### Component 3: Hook System (`@treis/core/hooks/`)

**Responsibility:** Intercept the agent loop at defined points. Enforce deterministic rails.
Provide extension surface for GSD-compatible hooks.

**Hook points and what fires at each:**
| Hook Point | What Fires |
|------------|-----------|
| SessionStart | Initializer Agent: load KAIROS, TREIS.md, Golden Principles |
| PreToolUse | Scope Boundary Check (Plan Contract), Permission Gate |
| PostToolUse | Evaluator Agent (PASS/WARN/FAIL/FATAL), Schema Validator, Context Monitor |

**Communicates with:**
- Agent Loop — called by loop, can return block/allow/inject-context
- Plan Contract Engine — scope boundary check runs here
- API Client — Evaluator Agent calls model via Slot B

**Does NOT own:**
- Tool execution (Tool System owns this)
- Permission storage (Session State / settings owns this)

---

### Component 4: Tool System (`@treis/tools/`)

**Responsibility:** Define, register, permission-check, and execute tools. Provide concurrency
partitioning (read-only batch vs. write serial).

**Communicates with:**
- Agent Loop — receives dispatch requests, returns results
- Hook System — hooks fire around tool execution
- Session State — reads permission settings

**Tool lifecycle:**
```
Registration → Permission Check → Pre-Hook → Execution → Post-Hook → Result
```

**Permission check order:**
1. Mode bypass → auto-allow
2. Deny rules → skip
3. Allow rules (pattern-matched) → allow
4. Ask rules → prompt user
5. Fallback → ask

**Phase 0 tool set:** FileRead, FileWrite, Bash, WebSearch (+ Glob, Grep)
**Phase 3:** Browser (wraps gstack browse binary), Agent (wraps GSD Task() pattern)

**Concurrency rule:** Read-only tools batch up to ~10 concurrent. Non-read-only tools run serial.
Context modifiers applied atomically after each batch.

---

### Component 5: API Client (`@treis/api-client/`)

**Responsibility:** Adapt between Agent Loop and local/cloud model runtimes. Manage the two-slot
RAM system. Detect tool-use capability per model.

**Communicates with:**
- Agent Loop — receives message arrays, returns streaming chunks
- Session State — reads slot assignments

**Sub-components:**
- Runtime adapters (Ollama in P0, five runtimes in P1) — all expose OpenAI-compat interface
- Benchmark — hardware detect → model bench → slot assign on first run
- Slot Manager — enforces `slotA.size + slotB.size <= availableRAM`
- Tool-use detector — probes each model: Native → XML fallback → ReAct fallback

**Slot model:**
| Slot | Layers | Constraint |
|------|--------|-----------|
| A (Primary) | Logos + Pathos | Sequential use, strongest reasoning |
| B (Secondary) | Ethos | Continuous, sub-2s, never blocks Slot A |

---

### Component 6: Session State (`@treis/core/session/`)

**Responsibility:** Maintain mutable application state across turns. Persist conversation history.
Manage workspace isolation.

**Communicates with:**
- All other components — read/write via setState callback pattern
- File system — JSONL transcript writes per message (incremental, resumable)

**State shape:**
```
ui:          { verbose, statusText, expandedView }
session:     { sessionId, projectRoot, cwd }
permissions: { mode, denials[], elicitations[] }
models:      { slotA, slotB, overrides }
tasks:       Record<taskId, TaskState>
messages:    Message[]
```

**Pattern:** Lightweight mutation-based store (not Redux). Shallow comparison prevents redundant
listener invocations.

**Workspace filesystem layout:**
```
~/.treis/workspaces/{uuid}/
  config.json
  slot-config.json
  golden-principles.md
  TREIS.md
  sessions/current.json, checkpoint.json, history/
  memory/logs/YYYY/MM/DD.md
  plan-contracts/
  skills/
```

---

### Component 7: IPC Bridge (`@treis/core/ipc/`)

**Responsibility:** Stream tokens and events from the agent loop (Node.js main process) to the
Electron renderer (React UI).

**Channels:**
```
treis:query          → submit user message (renderer → main)
treis:stream         ← token chunks (main → renderer)
treis:tool-progress  ← tool executing (main → renderer)
treis:tool-result    ← tool completed (main → renderer)
treis:interrupt      ← contract violation / FATAL (main → renderer, priority)
treis:status         ← step N of M (main → renderer)
treis:model-health   ← Slot A/B status (main → renderer)
```

**Pattern:** `ipcRenderer.invoke` for requests, `ipcMain.emit` for streaming. Zero timeout,
sub-ms latency. Preload script bridges contextBridge for renderer security.

**Communicates with:**
- Agent Loop — subscribes to loop events
- apps/desktop renderer — sends all streamed data

---

### Component 8: apps/cli

**Responsibility:** Commander.js CLI entry point. Thin wrapper over @treis/core. Renders Plan
Contract dialogue in terminal. Streams execution output.

**Communicates with:** @treis/core (direct import, no IPC)

---

### Component 9: apps/desktop (Electron + React + Vite)

**Responsibility:** 7-screen UI flow. Visual Plan Contract flow. Token streaming display.
Contract violation modal. Result screen.

**Communicates with:**
- @treis/core via IPC bridge (preload script)
- Main process runs agent loop
- Renderer displays UI

**Screen flow:** Intent Input → AI Dialogue → Plan Options → Sealed Contract → Execution Stream
→ [Contract Violation Modal] → Result

---

## Data Flow

### Flow 1: Plan Contract Creation

```
Builder input (CLI/UI)
  → Plan Contract Engine: analyze intent
  → API Client (Slot A): generate 2-3 clarifying questions
  → IPC Bridge: stream questions to renderer
  → Builder answers
  → API Client (Slot A): generate 3 options (Fast/Balanced/Thorough)
  → IPC Bridge: stream option cards
  → Builder picks
  → Plan Contract Engine: seal contract (scope, boundaries, success criteria)
  → Session State: persist sealed contract to workspace
```

### Flow 2: Tool Execution (Happy Path)

```
Agent Loop: model returns tool_call
  → Tool System: validate input (Zod schema)
  → Hook System (PreToolUse):
      → Plan Contract Engine: scope boundary check (deterministic)
      → Permission Gate: allow/deny/ask
  → Tool System: execute tool (read-only batch OR write serial)
  → Hook System (PostToolUse):
      → Evaluator Agent (Slot B): PASS/WARN/FAIL/FATAL verdict
      → Schema Validator: check output shape
      → Context Monitor: check token budget thresholds
  → Agent Loop: inject tool result into message history
  → API Client: next iteration
```

### Flow 3: Contract Violation

```
Hook System (PreToolUse): scope boundary check fails
  → Plan Contract Engine: raise FATAL interrupt
  → IPC Bridge: emit 'treis:interrupt' (priority channel)
  → apps/desktop: show violation modal (Stop / Amend / Continue differently)
  → Builder picks:
      Stop    → Session State: save checkpoint, exit loop
      Amend   → Plan Contract Engine: re-seal (new dialogue)
      Continue → Agent Loop: inject alternative-approach instruction, resume
```

### Flow 4: Retry / Recovery

```
Tool fails
  → Agent Loop: increment retryCount
  → Wait: 1s → 2s → 4s (exponential backoff)
  → Inject failure reason as system message
  → Retry tool call (max 3 attempts)
  After 3 failures:
    non-critical → skip with JSONL log entry
    critical     → FATAL interrupt → violation dialog
```

### Flow 5: IPC Token Streaming (Desktop)

```
Renderer: ipcRenderer.invoke('treis:query', message)
  → Main Process: start agent loop iteration
  → API Client: stream from model
  → Main Process: emit('treis:stream', chunk) per token
  → Preload bridge: forward to renderer
  → React: append token to display buffer
  [Tool dispatch]
  → Main Process: emit('treis:tool-progress', { name, input })
  → Main Process: emit('treis:tool-result', { name, result })
  → Main Process: emit('treis:status', { step, total })
```

---

## Patterns to Follow

### Pattern 1: Mutable State Machine for Agent Loop

**What:** Use explicit State object reassigned at continue sites, not nested conditionals.

**When:** Any multi-turn iteration where loop exit reasons must be testable.

**Why:** Makes transition reasons inspectable in tests. Prevents implicit state accumulation.

```typescript
type Transition =
  | { type: 'completed' }
  | { type: 'max_turns'; count: number }
  | { type: 'model_error'; error: Error }
  | { type: 'hook_stopped'; reason: string }
  | { type: 'aborted_streaming' }

let transition: Transition | null = null

while (!transition) {
  // ... each iteration reassigns transition at exit
}
return transition
```

---

### Pattern 2: Withhold Errors Until Recovery Attempted

**What:** On recoverable API errors (e.g., prompt_too_long), do NOT expose to consumer until
async recovery (context compact + retry) has been attempted.

**When:** Any network or model error with a known recovery path.

**Why:** Consumer sees fewer spurious errors. Recovery is transparent.

---

### Pattern 3: Concurrency Partitioning for Tools

**What:** Read-only tools run concurrent (batch up to 10). Non-read-only tools run serial. Context
modifiers applied atomically after batch completes.

**When:** Always in the tool executor.

**Why:** Prevents race conditions on shared state while maximizing throughput for safe operations.

---

### Pattern 4: Per-Message Transcript Writes

**What:** Append each message to JSONL session file immediately after it is finalized. Do not
buffer the full conversation.

**When:** Every turn in the agent loop.

**Why:** Enables resume from any crash point. Prevents total loss on unexpected shutdown.

---

### Pattern 5: Fire-and-Forget Background Tasks

**What:** Memory extraction, dream cycle, prompt suggestion run asynchronously — they do NOT
block the response being returned to Builder.

**When:** Post-tool hooks and session end.

**Why:** Builder latency is not degraded by background bookkeeping.

---

### Pattern 6: Harness Invisible to Model

**What:** The model uses tools exactly as documented. The harness intercepts at defined hook
points without modifying the model's tool interface.

**When:** All deterministic rails, scope checks, and permission gates.

**Why:** Clean separation. Model reasoning is not polluted by harness concerns.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Nested Conditional State

**What:** Using `if (isStreaming && hasTools && !isAborted)` chains across loop iterations.

**Why bad:** Transition reasons become implicit and untestable. Recovery paths are buried.

**Instead:** Explicit State machine with named transition types.

---

### Anti-Pattern 2: Reimplementing Framework Skills

**What:** Building Treis's own equivalents of gstack's browse, GSD's task spawning, or
Superpowers' 1% Rule enforcement.

**Why bad:** Maintenance burden doubles. Upstream improvements not captured. Legal risk (clean-room
boundary erosion).

**Instead:** Load as runtime layers. Wrap binaries (BrowserTool wraps gstack browse binary).
Build the harness, not the skills.

---

### Anti-Pattern 3: Full Context on Every Sub-Agent

**What:** Passing the full parent conversation history to each spawned sub-agent.

**Why bad:** Cross-contamination between steps. Context window exhausted quickly. Hallucinations
compound.

**Instead:** Each agent receives ONLY the context for its domain. Initializer agent produces a
clean snapshot. Executor gets snapshot + current step. Evaluator gets step output + contract.

---

### Anti-Pattern 4: Synchronous Tool Execution for Read-Only Tools

**What:** Running FileRead, Grep, Glob serially even when independent.

**Why bad:** Unnecessary latency on information-gathering steps where the model requested many
reads at once.

**Instead:** Batch read-only tools concurrent (up to 10). Apply results atomically.

---

### Anti-Pattern 5: Global Mutable Permission State

**What:** Storing permission grants in a single global object shared across concurrent tool
dispatches.

**Why bad:** Race conditions when multiple tools check and update permissions simultaneously.

**Instead:** Permission rules are immutable during a batch. Updates applied atomically via
setState after batch.

---

## Suggested Build Order (Dependency-Driven)

The build order follows strict dependency inversion: lower layers must exist before upper layers
can consume them.

### Layer 0 — Monorepo Foundation (no dependencies)
Build first. Everything else imports from here.
- pnpm workspace scaffold + tsconfig base + eslint config
- `@treis/tools`: Tool base interface + permission system (no runtime dependencies)
- `@treis/api-client`: Ollama adapter only (no @treis/* dependencies)

**Rationale:** Tools and API Client have no cross-package dependencies on each other or on core.
They can be developed and tested in complete isolation.

---

### Layer 1 — Core Engine (depends on Layer 0)
Build second. Core imports from tools + api-client.
- Session State (`@treis/core/session/`) — mutable store, workspace layout, JSONL writes
- Plan Contract Engine (`@treis/core/plan-contract/`) — contract lifecycle, seal, violation detection
- Agent Loop (`@treis/core/agent/`) — state machine, imports from api-client + tools + plan-contract + session
- Hook System (`@treis/core/hooks/`) — imports from plan-contract + agent

**Why session before agent loop:** Agent loop reads/writes session state on every turn. Session
must be initialized before the loop can start.

**Why plan-contract before agent loop:** Loop dispatches to plan-contract for scope checks.

---

### Layer 2 — IPC + CLI (depends on Layer 1)
Build third.
- IPC Bridge (`@treis/core/ipc/`) — wraps agent loop events into Electron channels
- `apps/cli` — thin commander.js wrapper over agent loop, no IPC needed

**Why IPC after agent loop:** IPC bridge subscribes to agent loop events. Loop must exist first.

---

### Layer 3 — Desktop App (depends on Layer 2)
Build fourth.
- `apps/desktop` (Electron main + React renderer + Vite)
- Consumes IPC bridge channels
- Implements 7-screen UI flow

**Why desktop last:** Desktop is a consumer of everything below it. Attempting desktop before
the agent loop is proven working (via CLI) adds risk and slows iteration.

---

### Summary Table

| Build Step | What | Depends On | Milestone |
|-----------|------|-----------|----------|
| 1a | Monorepo scaffold | nothing | P0 T01 |
| 1b | `@treis/tools` base + FileRead/Write/Bash/WebSearch | nothing | P0 T04-T07 |
| 1c | `@treis/api-client` Ollama adapter + benchmark + slot manager | nothing | P0 T02-T03 |
| 2a | Session State | nothing (own store) | P0 T10 |
| 2b | Plan Contract Engine | Session State | P0 T09 |
| 2c | Agent Loop | api-client, tools, plan-contract, session | P0 T08 |
| 2d | Hook System | agent loop, plan-contract | P0 T08 (inline) |
| 3a | IPC Bridge | agent loop | P0 T11 |
| 3b | apps/cli | agent loop | P0 T12 (implied) |
| 4a | apps/desktop (Electron shell) | IPC bridge | P0 T13 |
| 4b | 7-screen UI flow | Electron shell + IPC | P0 T14-T17 |
| 5+ | Skill Loader, framework integrations | core engine | P1 T19-T32 |
| 6+ | Three-agent arch, deterministic rails | all core | P2 T33-T45 |

---

## Scalability Considerations

| Concern | Phase 0 (CLI + basic desktop) | Phase 2 (harness hardened) | Phase 3 (API service) |
|---------|------------------------------|---------------------------|----------------------|
| Context window | Manual compact + snip | Auto-compact + circuit breaker | Per-request context isolation |
| Model RAM | Two-slot manual assignment | RAM governor + multi-workspace | Cloud fallback chain |
| Concurrent plans | Single session | Workspace isolation | Multi-tenant GDPR-isolated |
| Tool concurrency | Read-only batch (~10) | Same + dependency-graph waves | Same + distributed tool executors |
| Monitoring | JSONL trace only | SSE monitor (read-only, localhost) | Webhook + SSE + multi-tenant audit |

---

## Sources

- TREIS_ARCHITECTURE_SPEC.md v1.1 (primary authoritative source, HIGH confidence)
- [What Is an AI Agent Harness? (2026)](https://docs.bswen.com/blog/2026-03-25-ai-agent-harness-explained/) — MEDIUM confidence, corroborates harness component model
- [2025 Was Agents. 2026 Is Agent Harnesses.](https://aakashgupta.medium.com/2025-was-agents-2026-is-agent-harnesses-heres-why-that-changes-everything-073e9877655e) — MEDIUM confidence, industry framing
- [Architecting Resilient LLM Agents: Secure Plan Execution](https://arxiv.org/pdf/2509.08646) — MEDIUM confidence, contract enforcement pattern
- [How to Build Planning Into Your Agent (Arize AI)](https://arize.com/blog/how-to-build-planning-into-your-agent/) — MEDIUM confidence, planner/executor separation
- [Building a Production-Ready AI Agent Harness (DEV Community)](https://dev.to/apssouza22/building-a-production-ready-ai-agent-harness-2570) — LOW confidence (single source), build order reference
