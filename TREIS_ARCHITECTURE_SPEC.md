# TREIS Architecture Specification
# Clean-Room Implementation Guide · v1.1 · April 2026
#
# PURPOSE: This document captures architectural LOGIC PATTERNS derived from
# analysis of public open-source frameworks (Superpowers, GSD, gstack) and
# publicly observable behavior patterns. All Treis code MUST be written from
# scratch in TypeScript — zero lines from any proprietary source.
#
# LEGAL: This spec serves as the "wall" in a clean-room process.
# Implementors work from THIS document only.
#
# FRAMEWORK INTEGRATION: Treis does NOT reimplement Superpowers, GSD, or gstack.
# These frameworks serve TWO roles:
#   1. BUILD TOOLS — used to plan, execute, and verify Treis development
#   2. RUNTIME LAYERS — loaded as-is into Treis as Logos/Ethos/Pathos layers
# Treis builds the HARNESS + PLATFORM that hosts these existing skill packs.

---

## 1. Agent Loop Architecture

### 1.1 Query Engine Lifecycle

The agent loop manages a single conversation session with mutable message history,
usage tracking, and abort control. Each `submitMessage()` call is one turn.

**State tracked per session:**
- `messages[]` — persistent message array across turns
- `abortController` — cancellation signal for entire session
- `totalUsage` — accumulated API usage (tokens, cost) across all turns
- `permissionDenials[]` — tracks denied tool requests
- `readFileState` — file cache shared across turns

**Initialization pattern:**
- System context and user context fetched once per conversation, memoized
- Git status gathered asynchronously with timeout protection
- Memory files (TREIS.md) discovery-filtered to exclude injected content

### 1.2 Query Loop State Machine

The loop uses **explicit state transitions** — a mutable `State` object reassigned
at continue sites rather than nested if-else chains.

**Mutable state across iterations:**
```
messages             — growing conversation history
toolUseContext       — tool permissions, skill discovery state
autoCompactTracking  — compaction history (turnId, counter, failures)
retryCount           — retry counter for recoverable errors
hasAttemptedRecovery — circuit breaker for recovery attempts
turnCount            — conversation depth counter
transition           — why previous iteration continued (testable)
```

**Per-iteration processing sequence:**
1. Stream request start signal
2. Message preparation:
   a. Extract messages after compact boundary
   b. Apply tool result budgets (truncation)
   c. Execute history snip (remove stale)
   d. Execute microcompact (LRU cache)
   e. Filter via autocompact threshold
3. API streaming:
   a. Call model with prepared messages
   b. Handle fallback model switching
   c. Accumulate assistant messages
   d. Withhold recoverable errors pending recovery
4. Tool execution:
   a. Streaming tool executor runs tools (concurrent if safe)
   b. Tool results built and yielded
5. Stop hooks & cleanup:
   a. Memory extraction (fire-and-forget)
   b. Prompt suggestion (fire-and-forget)
   c. Auto-dream consolidation (fire-and-forget)

**Loop exit reasons (transition types):**
- `prompt_too_long` — API returned 413, recovery failed
- `model_error` — non-retryable API error
- `aborted_streaming` — abort signal mid-stream
- `aborted_tools` — tool execution interrupted
- `hook_stopped` — user interrupted via hook
- `max_turns` — conversation depth limit
- `completed` — natural completion (end_turn)

### 1.3 Error Recovery Patterns

**Reactive compact recovery (prompt_too_long):**
1. Withhold error from consumer until recovery attempted
2. Execute async context collapse
3. Retry API call with reduced context
4. If still fails, emit the withheld error

**Output token recovery:**
- Start: default max tokens (8K)
- Escalate: 64K on recovery attempt
- Circuit breaker: 3 consecutive failures → stop

**Streaming fallback:**
- Detect fallback model switch mid-stream
- Discard partial messages from failed attempt
- Create fresh tool executor
- Retry entire iteration with fallback model

### 1.4 Three-Agent Internal Architecture (Treis-Specific)

Maps to Treis PRD Section 4.1:

**INITIALIZER AGENT (Slot A — Logos)**
- Reads: KAIROS memory, TREIS.md, Plan Contract, Golden Principles
- Produces: clean context snapshot — no stale conversation history
- Logic: reconstructs fresh context from persistent memory each session
- Prevents: context rot from accumulated conversation history

**EXECUTOR AGENT (Slot A — Pathos)**
- Reads: Initializer snapshot + current step specification only
- Does NOT carry full conversation history across steps
- Executes: tools one step at a time
- Logic: scoped context per step prevents cross-contamination

**EVALUATOR AGENT (Slot B — Ethos)**
- Reads: step output + Plan Contract success criteria
- Mindset: assumes Executor made a mistake until proven otherwise
- Returns: PASS → proceed | WARN → log + continue | FAIL → retry with reason | FATAL → stop
- Logic: adversarial evaluation with fast lightweight model

---

## 2. Tool System Architecture

### 2.1 Tool Definition Interface

Every tool conforms to a standard interface:

**Required:**
- `name` — unique identifier
- `description()` — returns context-aware description
- `inputSchema` — Zod schema for input validation
- `call(input, context)` — execution logic
- `checkPermissions(input)` — permission check
- `prompt()` — returns tool description for model

**Optional lifecycle:**
- `validateInput()` — semantic validation beyond schema
- `isEnabled()` — feature-gated availability
- `isConcurrencySafe()` — can run in parallel with same-type tools
- `isReadOnly()` — no side effects (enables batching)
- `isDestructive()` — requires explicit confirmation
- `shouldDefer` — lazy schema loading (ToolSearch required first)

### 2.2 Tool Lifecycle Flow

```
Registration → Permission Check → Pre-Hooks → Execution → Post-Hooks → Result
```

**Registration phase:**
- Tools loaded into context during bootstrap
- MCP tools assembled from server connections (prefixed `mcp__`)
- Feature gates control availability at build time
- Tool pool: built-in + MCP tools, deduplicated by name (built-ins win)

**Permission check phase:**
1. Tool's `validateInput()` — rejects invalid args early
2. Mode check — 'auto' calls classifier; 'bypass' auto-allows
3. Rule-based: check allow/deny/ask rules by tool name + input pattern
4. Hook-based: `executePermissionRequestHooks()`
5. User prompt: blocks until approved/denied

**Execution phase:**
- Concurrency partitioning:
  - Read-only tools → batch for concurrent execution (max ~10)
  - Non-read-only tools → serial, context modifiers queued between
- Pre-hooks fire before execution (can block)
- Tool runs inside try/catch
- Post-hooks fire after completion (can inject context, prevent continuation)

**Result handling:**
- Token budget applied (truncation if exceeds max)
- Result mapped to API format
- Context modifiers applied atomically after batch

### 2.3 Permission System

**Three permission modes:**
- `default` — ask user for each new tool
- `bypass` — auto-allow all (requires confirmation)
- `auto` — classifier-driven

**Rule structure:** `{source, behavior, value}`
- Sources: userSettings | projectSettings | cliArg | session | managed
- Behaviors: allow | deny | ask
- Values: toolName + optional input pattern (e.g., "Bash(git *)")

**Check order:**
1. Mode 'bypass' → auto-allow
2. Deny rules (blanket) → skip
3. Allow rules (pattern-matched) → allow
4. Ask rules → prompt user
5. Fallback → ask

**Permission updates:**
- "Once" — session-scoped, expires at end
- "Always" — persisted to settings file
- Applies to tool name or tool+input pattern

### 2.4 Treis Tool Set (Phase 0)

| Tool | Category | Permission Level | Phase |
|------|----------|-----------------|-------|
| FileReadTool | File System | ReadOnly | P0 |
| FileWriteTool | File System | WriteFiles | P0 |
| BashTool | System | ExecuteShell / DangerousShell | P0 |
| WebSearchTool | Web | NetworkAccess | P0 |
| GlobTool | File System | ReadOnly | P0 (add) |
| GrepTool | File System | ReadOnly | P0 (add) |
| TodoTool | Session | ReadOnly | P1 |
| BrowserTool | Automation | BrowserAuto | P3 |
| SpreadsheetTool | Data | WriteFiles | P3 |
| APITool | Integration | NetworkAccess | P3 |
| AgentTool | Orchestration | Inherits | P3 |

---

## 3. Hook System Architecture

### 3.1 Hook Types and Timing

**Pre-tool hooks:**
- Fire AFTER permission check, BEFORE tool execution
- Input: tool name, input args, permission mode
- Can return: `block` (hard stop) or `allow` (proceed)
- Timeout: ~2 seconds
- Use: safety audits, dynamic permission checks

**Post-tool hooks:**
- Fire AFTER tool completes (success or failure)
- Input: tool name, input, output/error, permission mode
- Can return:
  - `preventContinuation` — stop query loop
  - `blockingError` — hard block
  - `additionalContexts[]` — inject context messages
- Use: output validation, context injection, breach logging

**Session-start hooks:**
- Fire once when session begins
- Use: version checks, state initialization, update notifications

### 3.2 Treis Hook Mapping

| Hook Point | Treis Component | What It Does |
|------------|----------------|--------------|
| SessionStart | Initializer Agent | Load KAIROS memory, TREIS.md, Golden Principles |
| PreToolUse | Scope Boundary Check | Verify paths/URLs within Plan Contract scope |
| PreToolUse | Permission Gate | Check tool permission level |
| PostToolUse | Evaluator Agent | Score step output (PASS/WARN/FAIL/FATAL) |
| PostToolUse | Context Monitor | Warn when context budget exceeds thresholds |
| PostToolUse | Schema Validator | Validate tool output matches expected schema |

### 3.3 Context Monitoring Thresholds

```
Green    (0-60%)   — Full operations
Yellow   (60-75%)  — Optimize, suggest compression
Orange   (75-85%)  — Warn, defer non-critical
Red      (85-95%)  — Force efficiency modes
Critical (95%+)    — Essential operations only
```

Debounce: minimum 5 tool uses between warnings.
Critical fires immediately, overriding debounce.

---

## 4. Skill System Architecture

### 4.1 Skill File Format (SKILL.md)

```yaml
---
name: "skill-name-kebab-case"
description: "One-line description with trigger keywords"
version: "1.0"
allowed-tools: ["FileReadTool", "FileWriteTool", "BashTool"]
arguments: ["arg1", "arg2"]
argument-hint: "<target> [--flags]"
user-invocable: true
execution-context: "fork" | "inline"
agent: "agent-type-name"
paths: "src/** docs/**"
hooks:
  pre_tool_use:
    if: "bash (rm *)"
    run: "block"
---

# Skill Content (Markdown)

Supports variable substitution:
- ${ARG1} — first argument value
- ${TREIS_SKILL_DIR} — skill's directory path
- ${TREIS_SESSION_ID} — current session UUID

## Execution Context References
@~/.treis/skills/shared/common-context.md
@~/.treis/workspaces/{id}/golden-principles.md
```

### 4.2 Skill Discovery and Loading

**Discovery tiers (precedence order):**
1. Built-in: bundled with Treis installation
2. Workspace: `~/.treis/workspaces/{id}/skills/`
3. User: `~/.treis/skills/`
4. Community: installed from registry (`treis.dev/skills`)

**Loading flow:**
1. Discover SKILL.md files via directory scan
2. Parse YAML frontmatter → extract metadata
3. Deduplicate by name (earlier tier wins)
4. Register as invocable commands
5. On invocation: load markdown content → substitute variables → inject into context

**Skill execution modes:**
- `inline` — inject prompt into current conversation context
- `fork` — spawn sub-agent with restricted tool set

### 4.3 Framework Integration — NOT Reimplementation

Treis does NOT build its own skill packs. It loads existing open-source frameworks:

**Logos Layer (Slot A — Decision) = gstack**
- Installed at: `~/.claude/skills/gstack/`
- Installation: git clone + `bun` build via `setup` script
- Key skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`
- Browse server: compiled binary at `browse/dist/browse` (Playwright headless)
- Config: `~/.gstack/` (sessions, analytics, config, learnings)
- Dependencies: bun runtime, Playwright
- Preamble: `preamble-tier: 1` — runs update check + session tracking on every invocation
- 30+ skills auto-generated from `SKILL.md.tmpl` via `bun run gen:skill-docs`

**Ethos Layer (Slot B — Stability) = GSD**
- Core system at: `~/.claude/get-shit-done/` (git repository)
- 60+ thin wrapper skills at: `~/.claude/skills/gsd-*/SKILL.md`
- CLI tools: `~/.claude/get-shit-done/bin/gsd-tools.cjs` (Node.js CommonJS)
- Hooks: `~/.claude/hooks/gsd-*.js` (SessionStart, PreToolUse, PostToolUse)
- State: `.planning/` directory per project (STATE.md, ROADMAP.md, CONTEXT.md)
- Dependencies: Node.js
- Skill pattern: each SKILL.md references shared workflows via `@~/.claude/get-shit-done/workflows/`
- Key skills: `/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-verify-work`, `/gsd-autonomous`

**Pathos Layer (Slot A — Execution) = Superpowers**
- Installed at: `~/.claude/skills/using-superpowers/SKILL.md`
- Zero dependencies — pure markdown instruction file
- Defines: 1% Rule, Red Flag detection, skill invocation protocol
- Platform mappings: references/ (codex, copilot, gemini tool mappings)
- Dispatches to other skills via `Skill()` tool invocation
- Key behavior: mandatory skill check before ANY response, even clarifying questions

**What Treis Builds (the harness):**
- Skill loader compatible with all three frameworks' SKILL.md formats
- Hook system compatible with GSD's SessionStart/PreToolUse/PostToolUse hooks
- Preamble execution compatible with gstack's `preamble-tier` pattern
- Execution context resolution for `@path/to/file.md` references
- Variable substitution (`${TREIS_SKILL_DIR}`, `${TREIS_SESSION_ID}`)
- Permission gating via `allowed-tools` frontmatter field
- Slot routing: which framework runs on Slot A vs Slot B

### 4.4 Skill Loader Compatibility Matrix

| Feature | Superpowers | GSD | gstack | Treis Must Support |
|---------|-------------|-----|--------|--------------------|
| Frontmatter fields | name, description | name, description, argument-hint, allowed-tools, agent | name, version, preamble-tier, description, allowed-tools | All fields (union) |
| External code | None | Node.js .cjs in bin/ | Compiled binary + bun | Shell execution of skill binaries |
| State directory | None | `.planning/` per project | `~/.gstack/` global | Configurable per-framework state dirs |
| Hook integration | None | settings.json hooks | Preamble bash blocks | Both hook types |
| Execution context | Inline markdown | `@path` file references | Template-generated SKILL.md | `@path` resolution + template support |
| Sub-agent spawning | Via Skill() tool | Via Task() with agent types | Via $B browse commands | All three dispatch patterns |
| Version tracking | In skill content | VERSION file | VERSION file | Version detection + auto-sync |

### 4.5 Development Workflow — Using Frameworks to Build Treis

These same frameworks are used during Treis development:

**Planning (gstack as Logos):**
```
/office-hours          → Define Treis value prop, forcing questions
/plan-ceo-review       → Challenge scope for each phase
/plan-eng-review       → Architecture review, test matrix
/plan-design-review    → UI/UX review for desktop app
/autoplan              → Auto-pipeline: CEO → design → eng review
```

**Execution (GSD as Ethos + Superpowers as Pathos):**
```
/gsd-new-project       → Initialize Treis as GSD project
/gsd-plan-phase        → Plan each development phase
/gsd-execute-phase     → Execute with wave-based parallelization
/gsd-verify-work       → UAT verification per phase
/gsd-autonomous        → End-to-end autonomous execution
```

**Quality (Superpowers 1% Rule):**
```
Every skill that MIGHT apply MUST be invoked — no exceptions.
Red Flag detection prevents rationalization.
7-phase pipeline gates enforce quality at each step.
```

---

## 5. State Management Architecture

### 5.1 Application State

**Pattern:** Lightweight mutation-based store (not Redux).
- Single `state` reference mutated through `setState` callback
- Shallow comparison prevents redundant listener invocations
- `Set<Listener>` manages subscriptions with cleanup functions

**AppState shape:**
```
ui:          { verbose, statusText, expandedView }
session:     { sessionId, projectRoot, cwd }
permissions: { mode, denials[], elicitations[] }
models:      { slotA, slotB, overrides }
tasks:       Record<taskId, TaskState>
messages:    Message[]
```

**Persistence pattern:**
- AppState NOT persisted directly to disk
- Changes trigger callbacks:
  - Permission mode changes → notify consumers
  - Model changes → update config file
  - View state → persist UI preferences

### 5.2 Session Lifecycle

**Creation:**
1. Hardware detection (CPU, RAM, available memory)
2. Runtime discovery (Ollama, LM Studio, llama.cpp, Jan, vLLM)
3. Model benchmarking (tok/s, tool support detection, RAM)
4. Slot assignment (A=strongest reasoning, B=fastest lightweight)
5. Session ID assigned (random UUID)
6. Project root locked (frozen at startup)
7. TREIS.md auto-discovery and injection
8. KAIROS memory loaded (if exists)
9. Golden Principles loaded (if exists)

**Persistence:**
- Conversation history: append-only JSONL at `~/.treis/sessions/{sessionId}.jsonl`
- Per-message writes (incremental, resumable)
- Pending buffer before flush; cleanup flush on shutdown
- Session-scoped history filtering (current session first)

**Resume:**
- Load transcript from session JSONL file
- Process resumed conversation (apply compaction/rewriting)
- Inject into REPL context
- Checkpoint resume: skip completed steps, restart from failure

**Cleanup:**
- Registered cleanup callbacks executed in order
- History buffer flushed synchronously if async incomplete
- Temporary files removed

### 5.3 Workspace Isolation (PRD Section 8.1)

```
~/.treis/workspaces/
  {workspace-uuid}/
    config.json              — name, domain skills, resource budget
    slot-config.json         — Slot A/B model assignments
    golden-principles.md     — workspace-level durable rules
    TREIS.md                 — project AI guide
    sessions/
      current.json           — active session state
      checkpoint.json        — step-level resume point
      history/               — all past sessions (JSONL)
    memory/                  — KAIROS logs
      logs/YYYY/MM/DD.md
    plan-contracts/          — all sealed contracts
    skills/                  — workspace-specific skills
  global/
    hardware.json            — benchmark results
    providers.json           — encrypted API keys
    skill-sources.json       — upstream repo tracking
```

---

## 6. Task and Sub-Agent Architecture

### 6.1 Task Types

| Type | Description | Isolation |
|------|-------------|-----------|
| `agent` | Background query (sub-agent) | Own message history |
| `bash` | Background shell command | Process-level |
| `dream` | Memory consolidation agent | Lock-based |

**Task ID format:** type-prefix + 8 random base-36 chars
- `a-` agent, `b-` bash, `d-` dream

### 6.2 Task Lifecycle

```
Registration → Running → Progress Tracking → Terminal (complete|failed|killed) → Eviction
```

**Registration:**
- Create task state (pending → running)
- Initialize output file
- Register cleanup handlers

**Progress tracking:**
- Tool count, token count, recent activities
- Per-message accumulation
- Delta computation for incremental reporting

**Terminal transition:**
- Set status + endTime
- Enqueue notification (if not already notified)

**Eviction:**
- Only after terminal + notified
- Remove from state, delete output file

### 6.3 Sub-Agent Spawning Pattern

From GSD framework analysis — this maps to Treis executor agents:

```
Orchestrator:
  1. Initialize context (load phase state, config)
  2. Resolve model profile (quality/balanced/budget)
  3. For each agent:
     a. Fill template prompt with objectives + context
     b. Include file references to read
     c. Pass model parameter
     d. Spawn with isolation (optional worktree)
  4. Collect results (parallel or sequential)
  5. Handle checkpoints (pause → user response → continue)
  6. Update state, commit artifacts
```

**Agent isolation:**
- Agents do NOT inherit parent session context
- Each receives ONLY required context for its domain
- Preserves parent context for coordination
- Requires explicit prompt templating

**Wave-based parallelization (from GSD):**
- Group tasks by dependency graph
- Wave 1: tasks with no dependencies (parallel)
- Wave 2: tasks depending only on Wave 1 (parallel)
- Sequential between waves (respects dependencies)

---

## 7. Plan Contract Engine (Treis-Specific)

### 7.1 Contract Lifecycle

```
Intent → AI Dialogue (2-3 questions) → 3 Options Proposed → Builder Picks → Contract Sealed → Execution → Result
```

**AI-Led Dialogue (Logos — Slot A):**
1. Builder states intent (one sentence)
2. AI analyzes intent → generates 2-3 clarifying questions
3. AI proposes 3 plan options with tradeoffs:
   - Option A: Fast (minimal scope, quick delivery)
   - Option B: Balanced (moderate scope, good coverage)
   - Option C: Thorough (comprehensive, longer execution)
4. Builder picks one option
5. Contract auto-sealed with scope, boundaries, success criteria

**Contract structure:**
```
TREIS PLAN CONTRACT
  Workspace:  {workspace-name}
  Sealed:     {timestamp} (Builder selected Option {A|B|C})

  Intent:     {one-line intent from Builder}

  Scope — What AI Will Do:
    - [enumerated actions]

  Boundaries — What AI Must Never Do:
    - [enumerated prohibitions]

  Success Criteria:
    - [enumerated measurable outcomes]

  Contract Violation Triggers:
    - [conditions that interrupt execution]
```

### 7.2 Contract Enforcement

**Scope boundary check (deterministic rail):**
- Every file path and URL checked against Contract scope
- On violation: FATAL interrupt immediately

**Contract violation dialog:**
```
CONTRACT VIOLATION — Builder Input Required
  Workspace: {name} | Step {N} of {M}
  AI attempted: {action}
  This violates: {boundary}
  Why AI tried: {reasoning}
  Options:
    A) Stop — review completed work
    B) Amend — modify contract (requires re-seal)
    C) Continue differently — AI finds alternative approach
```

### 7.3 Execution Commands

| Command | Phase | Purpose |
|---------|-------|---------|
| `/discuss` | Dialogue | Free-form AI-led discussion |
| `/scope` | Dialogue | Define boundaries |
| `/success` | Dialogue | Define completion criteria |
| `/risk` | Dialogue | AI surfaces risks |
| `/plan-seal` | Transition | Lock as Plan Contract |
| `/status` | Execution | Check progress (non-interrupting) |
| `/pause` | Execution | Re-enter dialogue mid-execution |
| `/amend` | Execution | Modify contract (requires re-confirmation) |

---

## 8. Deterministic Rails (Harness Engineering)

### 8.1 Rail Types

| Rail | What It Checks | On Failure |
|------|---------------|------------|
| Schema validator | Tool output matches expected JSON schema | Retry (never pass malformed downstream) |
| Scope boundary | Paths/URLs within Plan Contract scope | FATAL interrupt |
| Type checker | Generated code passes `tsc --noEmit` (dev domain) | Retry with error injected |
| Linter | Generated code passes ESLint (dev domain) | Retry with lint output injected |
| Citation check | Factual claims have verifiable source (research/legal) | FATAL |
| Loop detector | Same tool + identical input 3+ times | Circuit breaker → FATAL |
| Token budget | Session tokens exceed limit (default 200K) | WARNING |
| Time limit | Step exceeds timeout (default 5 min) | WARNING → offer continue/stop |

### 8.2 Retry and Backoff Policy

- Max 3 retries per tool call
- Exponential backoff: 1s → 2s → 4s
- Failure reason injected as system message before each retry
- After 3 failures: non-critical skips with log, critical raises FATAL
- Model rotation on 3rd failure: escalate to next available provider

### 8.3 Checkpoint and Resume

- Step-level checkpoint saved after every completed step
- Resume from exact failure point (completed outputs injected, not re-executed)
- `treis resume` — resume last checkpoint
- `treis resume --from N` — re-run from step N with fresh Initializer context

---

## 9. KAIROS Memory System

### 9.1 Memory Structure

```
~/.treis/workspaces/{id}/memory/
  logs/
    YYYY/
      MM/
        DD.md    — daily append-only session logs
  consolidated/  — dream cycle outputs
  entities/      — entity-specific memories
```

### 9.2 Dream Cycle (4-Phase Idle Consolidation)

Runs when Treis is open but inactive (Ethos — Slot B):

1. **Orient** — scan recent session logs, identify active projects
2. **Gather** — pull recurring patterns, key decisions, architectural choices
3. **Consolidate** — compress into durable memory, remove redundancy
4. **Prune** — remove stale/superseded context, keep memory lean

**Dream task behavior:**
- Lock-based coordination (prevents concurrent dreams)
- Tracks recent turns (max 30) and touched file paths
- Rollback on abort (restores prior state)
- Two phases: starting → updating (when memory files modified)

### 9.3 Memory Retrieval

- Full-text search on memory directory
- Relevance scoring: temporal decay + semantic similarity + historical impact
- Token budget enforcement (default 8K tokens for memory context)
- Relevance threshold filtering (default 0.75)

### 9.4 Context Persistence Across Sessions (from GSD patterns)

**Continuation handoff file (`.continue-here.md`):**
- Frontmatter: phase, task, total_tasks, status, last_updated
- Sections: current_state, completed_work, remaining_work, decisions, blockers, next_action
- Deleted after resume (not permanent)
- Command: `/pause` creates it; session resume consumes it

**State accumulation:**
- TREIS.md: project-level AI guide (permanent)
- Golden Principles: workspace-level durable rules (permanent)
- Plan Contracts: sealed contracts (archived after completion)
- Session logs: KAIROS daily logs (consolidated by dream cycle)

---

## 10. IPC and Streaming Architecture

### 10.1 Desktop App IPC (Electron)

**Pattern:** IPC via `ipcMain` / `ipcRenderer` (zero timeout, sub-ms latency)

**Channels:**
```
treis:query         — submit user message to agent loop
treis:stream        — token-by-token streaming response
treis:tool-progress — tool execution progress updates
treis:tool-result   — tool completion results
treis:interrupt     — contract violation / FATAL interrupts
treis:status        — step progress updates
treis:model-health  — Slot A/B model status
```

**Flow:**
1. Renderer sends user message via `ipcRenderer.invoke('treis:query', msg)`
2. Main process runs agent loop
3. Tokens stream back via `ipcMain.emit('treis:stream', chunk)`
4. Tool progress/results stream via respective channels
5. Interrupts push via `treis:interrupt` (priority channel)

### 10.2 API Service Streaming (Phase 3)

**Webhook pattern:**
```
POST /v1/tasks → 202 Accepted { task_id }
...execution...
POST {webhook_url} → { status, result, audit }
```

**SSE monitoring (Phase 2):**
```
GET /monitor (SSE) — real-time step progress
Authorization: Bearer {256-bit-keychain-token}
```

### 10.3 Remote Monitoring (Read-Only — Phase 2)

**Events streamed:**
- Step progress (current step, total, description)
- Model health (Slot A/B status, RAM usage)
- Evaluator verdicts (PASS/WARN/FAIL/FATAL per step)
- Tool calls (name, input summary, result summary)

**Channels:**
- macOS Notification Center (all priorities)
- Monitor app SSE endpoint (localhost:7357)
- Optional webhook (Slack/Teams/custom)

---

## 11. Local Model System

### 11.1 Runtime Adapters

All runtimes expose OpenAI-compatible REST API:

| Runtime | Default Port | Adapter Pattern |
|---------|-------------|-----------------|
| Ollama | 11434 | `/v1/chat/completions` (native OpenAI-compat) |
| LM Studio | 1234 | `/v1/chat/completions` (OpenAI-compat) |
| llama.cpp | 8080 | `/v1/chat/completions` (OpenAI-compat) |
| Jan | 1337 | `/v1/chat/completions` (OpenAI-compat) |
| vLLM | 8000 | `/v1/chat/completions` (OpenAI-compat) |
| Custom | User-defined | Auto-detected |

**Adapter interface:**
```
interface ModelAdapter {
  connect(config): Promise<void>
  listModels(): Promise<Model[]>
  chat(messages, tools?, options?): AsyncGenerator<Chunk>
  benchmark(model): Promise<BenchmarkResult>
  isHealthy(): boolean
}
```

### 11.2 Tool-Use Auto-Detection

Test each model for tool capability in order:

1. **Native** — send `tools` parameter in OpenAI format → check if model responds with `tool_calls`
2. **XML fallback** — inject tool specs as XML in system prompt → parse XML tags from response
3. **ReAct fallback** — use Thought/Action/Observation loop via few-shot examples

### 11.3 Two-Slot RAM System

| Slot | Layers | Profile | Constraint |
|------|--------|---------|------------|
| A (Primary) | Logos + Pathos | Strongest reasoning + generation | Sequential use (no RAM collision) |
| B (Secondary) | Ethos | Fastest lightweight | Continuous, sub-2s response, never blocks Slot A |

**RAM budget:** Total model RAM must fit within available system memory.
Validation: `slotA.size + slotB.size <= availableRAM`

---

## 12. Monorepo Package Architecture

### 12.1 Package Structure

```
treis/
  packages/
    core/                   — @treis/core
      src/
        agent/              — agent loop, query engine
        plan-contract/      — Plan Contract engine
        session/            — session state management
        memory/             — KAIROS memory system
        harness/            — deterministic rails, retry, circuit breaker
        hooks/              — pre/post tool use hooks
        ipc/                — IPC bridge (Electron)
    api-client/             — @treis/api-client
      src/
        adapters/           — runtime adapters (Ollama, LM Studio, etc.)
        benchmark/          — model benchmarking
        slot-manager/       — two-slot RAM management
        tool-detection/     — native/XML/ReAct detection
    tools/                  — @treis/tools
      src/
        base/               — Tool interface, permission system
        file/               — FileReadTool, FileWriteTool, GlobTool, GrepTool
        system/             — BashTool, LSTool
        web/                — WebSearchTool, WebFetchTool
        session/            — TodoTool
        automation/         — BrowserTool (P3)
        data/               — SpreadsheetTool (P3)
        integration/        — APITool (P3)
        orchestration/      — AgentTool (P3)
    skills/                 — @treis/skills
      src/
        loader/             — skill discovery, parsing, injection
        packs/
          logos/            — dialogue skills
          ethos/            — stability skills
          pathos/           — execution pipeline skills
  apps/
    desktop/                — Electron + React + Vite
      src/
        main/               — Electron main process
        renderer/           — React UI
        preload/            — IPC preload bridge
    cli/                    — CLI entry point
  config/
    tsconfig.base.json
    eslint.config.js
  pnpm-workspace.yaml
```

### 12.2 Phase 0 Scope (Build Only These)

```
@treis/core        — agent loop + Plan Contract engine + session state + IPC bridge
@treis/api-client  — Ollama adapter only + benchmark + slot manager
@treis/tools       — FileReadTool + FileWriteTool + BashTool + WebSearchTool
apps/desktop       — Electron shell + React UI + preload IPC
```

---

## 13. UI Architecture (Desktop — Phase 0)

### 13.1 Screen Flow

```
[Intent Input] → [AI Dialogue] → [Plan Options] → [Sealed Contract] → [Execution Stream] → [Result]
```

**Screen 1: Intent Input**
- Single text input box
- "What do you want to do?" prompt
- Submit starts AI-led dialogue

**Screen 2: AI Dialogue**
- Chat-style interface
- AI asks 2-3 clarifying questions
- Builder answers in plain language
- AI controls flow (not Builder)

**Screen 3: Plan Options**
- Three card layout (A / B / C)
- Each card shows: name, tradeoffs, estimated time, scope summary
- Builder clicks one card to select

**Screen 4: Sealed Contract**
- Full Plan Contract displayed
- Scope, Boundaries, Success Criteria visible
- "Begin Execution" button (single confirmation)
- "Edit" button returns to dialogue

**Screen 5: Execution Stream**
- Live step counter (Step N of M)
- Current step description
- Tool calls with results (collapsible)
- Evaluator verdicts per step (PASS/WARN/FAIL)

**Screen 6: Contract Violation (Modal)**
- Violation description
- Why AI attempted the action
- Three options: Stop / Amend / Continue differently

**Screen 7: Result**
- Final deliverable summary
- Generated files listed
- Success criteria checklist (pass/fail per criterion)

### 13.2 IPC Streaming Pattern

```
Renderer                     Main Process
   │                              │
   ├─ invoke('treis:query') ─────→│ Start agent loop
   │                              │
   │←── emit('treis:stream') ─────│ Token chunks
   │←── emit('treis:stream') ─────│
   │←── emit('treis:tool-progress')│ Tool executing...
   │←── emit('treis:tool-result') ─│ Tool completed
   │←── emit('treis:stream') ─────│ More tokens
   │                              │
   │←── emit('treis:interrupt') ──│ CONTRACT VIOLATION
   │                              │
   ├─ invoke('treis:amend') ─────→│ Builder chose option
   │                              │
   │←── emit('treis:stream') ─────│ Continues...
   │←── emit('treis:status') ─────│ Step 5/8 complete
```

---

## 14. Development Targets Summary

### What Treis Builds vs. What It Loads

```
TREIS BUILDS (clean-room TypeScript):          TREIS LOADS (existing frameworks):
┌─────────────────────────────────┐            ┌──────────────────────────────┐
│ @treis/core                     │            │ gstack (Logos layer)         │
│   Agent loop / query engine     │  ←loads──  │   30+ skills, browse binary  │
│   Plan Contract engine          │            │   ~/.claude/skills/gstack/   │
│   Session state management      │            ├──────────────────────────────┤
│   IPC bridge (Electron)         │            │ GSD (Ethos layer)            │
│   Skill loader (compatible)     │  ←loads──  │   60+ skills, CLI tools      │
│   Hook system (compatible)      │            │   ~/.claude/get-shit-done/   │
│   Harness (rails, retry, etc.)  │            ├──────────────────────────────┤
├─────────────────────────────────┤            │ Superpowers (Pathos layer)   │
│ @treis/api-client               │  ←loads──  │   1% Rule, Red Flags         │
│   Runtime adapters (Ollama etc) │            │   ~/.claude/skills/using-*   │
│   Benchmark, slot manager       │            └──────────────────────────────┘
├─────────────────────────────────┤
│ @treis/tools                    │            USED TO BUILD TREIS:
│   File, Bash, Web, etc.         │            ┌──────────────────────────────┐
├─────────────────────────────────┤            │ /office-hours → plan scope   │
│ apps/desktop                    │            │ /plan-eng-review → arch      │
│   Electron + React + Vite       │            │ /gsd-new-project → init      │
│   7-screen UI flow              │            │ /gsd-plan-phase → plan       │
└─────────────────────────────────┘            │ /gsd-execute-phase → build   │
                                               │ /gsd-verify-work → verify    │
                                               └──────────────────────────────┘
```

### Phase 0 Targets (Weeks 1-4) — Harness + Platform Foundation

| # | Target | Package | Notes |
|---|--------|---------|-------|
| T01 | pnpm monorepo scaffold | root | @treis/core, @treis/api-client, @treis/tools, apps/desktop |
| T02 | Ollama adapter (OpenAI-compat REST) | @treis/api-client | Only runtime in P0 |
| T03 | First-run benchmark system | @treis/api-client | Hardware detect → model bench → slot assign |
| T04 | Tool base interface + permission system | @treis/tools | Compatible with framework tool invocations |
| T05 | FileReadTool + FileWriteTool | @treis/tools | Used by all three frameworks |
| T06 | BashTool with permission gates | @treis/tools | GSD needs `gsd-tools.cjs`, gstack needs `$B` browse |
| T07 | WebSearchTool | @treis/tools | NetworkAccess gate |
| T08 | Agent loop (query engine) | @treis/core | State machine with explicit transitions |
| T09 | Plan Contract engine (3-option proposal) | @treis/core | Treis-specific — AI proposes, Builder picks |
| T10 | Session state management | @treis/core | Mutable store pattern |
| T11 | IPC bridge (ipcMain/ipcRenderer) | @treis/core | Token streaming to React renderer |
| T12 | TREIS.md auto-discovery | @treis/core | Injected into every session system prompt |
| T13 | Electron shell + React renderer | apps/desktop | Electron 32+ / React 19 / Vite |
| T14 | Intent → Dialogue → Options → Contract UI | apps/desktop | 7-screen flow |
| T15 | Contract violation interrupt dialog | apps/desktop | 3-option violation modal |
| T16 | Keychain integration (keytar) | apps/desktop | Secure credential storage |
| T17 | Live execution stream UI | apps/desktop | Token streaming + step counter |
| T18 | eKlotho demo (CMS gap report) | integration | End-to-end validation |

### Phase 1 Targets (Weeks 5-10) — Framework Integration Layer

| # | Target | Notes |
|---|--------|-------|
| T19 | **Skill loader** compatible with all 3 frameworks | Parse SKILL.md frontmatter (union of all fields), resolve `@path` execution context refs, substitute variables, handle `preamble-tier` |
| T20 | **gstack integration** (Logos layer on Slot A) | Load gstack skills, support browse binary, resolve `~/.gstack/` config, handle `bun` dependencies |
| T21 | **GSD integration** (Ethos layer on Slot B) | Load 60+ gsd-* skills, wire `gsd-tools.cjs` CLI, support `.planning/` state directory, register GSD hooks in settings |
| T22 | **Superpowers integration** (Pathos layer on Slot A) | Load using-superpowers SKILL.md, enforce 1% Rule + Red Flags, support platform tool mappings |
| T23 | **Hook system** compatible with GSD hooks | SessionStart, PreToolUse, PostToolUse — execute external Node.js/bash scripts |
| T24 | KAIROS memory (daily logs + dream cycle) | Treis-specific memory on top of GSD's `.planning/` state |
| T25 | **Skill auto-sync** — watch upstream repos | Detect updates to Superpowers/GSD/gstack, notify Builder, confirm before applying |
| T26 | **Version pinning** per framework | `treis skills pin gstack 0.15.15` — Builder controls versions |
| T27 | Additional runtime adapters (5 runtimes) | LM Studio, llama.cpp, Jan, vLLM, custom |
| T28 | Commercial API fallback chain | Anthropic, OpenAI, Gemini with priority routing |
| T29 | Tool-use auto-detection (Native/XML/ReAct) | Three-mode detection per local model |
| T30 | Golden Principles file | Workspace durable rules, injected into every session |
| T31 | TodoTool | Session-scoped task tracking |
| T32 | Session history + resume | JSONL persistence + checkpoint resume |

### Phase 2 Targets (Weeks 11-16) — Harness Engineering

| # | Target | Notes |
|---|--------|-------|
| T33 | **Three-agent architecture** (Init/Exec/Eval) | Initializer=Logos on Slot A, Executor=Pathos on Slot A, Evaluator=Ethos on Slot B |
| T34 | **Slot routing** — framework↔slot mapping | gstack skills → Slot A, GSD skills → Slot B, Superpowers → Slot A; sequential sharing on A |
| T35 | Deterministic rails (8 rail types) | Schema/scope/type/lint/citation/loop/token/time |
| T36 | Retry + backoff (3 retries, exponential) | Error recovery with failure reason injection |
| T37 | Checkpoint + resume (step-level) | Compatible with GSD's `.continue-here.md` pattern |
| T38 | Circuit breaker (loop + token + time) | Same-tool-same-input ×3 → FATAL |
| T39 | Context monitoring + thresholds | 5-level system, compatible with GSD's `gsd-context-monitor.js` |
| T40 | Remote monitoring (SSE, read-only) | localhost:7357, Keychain token auth |
| T41 | Audit log (append-only JSONL) | Every tool call, verdict, retry, interrupt — 90-day retention |
| T42 | Multi-workspace + RAM governor | Workspace isolation + slot management |
| T43 | Plugin system (@treis/plugins) | Extension points for community frameworks beyond the core three |
| T44 | macOS code signing + notarization | Distribution requirement |
| T45 | Auto-update (electron-updater) | Background updates |

### Phase 3 Targets (Week 16+) — API Service + Ecosystem

| # | Target | Notes |
|---|--------|-------|
| T46 | REST API service (CRUD + health) | POST /v1/tasks, workspace management |
| T47 | Webhook callbacks (HMAC-signed) | Fire-and-forget event notification |
| T48 | Auth (API key + OAuth 2.0) | Bearer token + scoped JWT |
| T49 | Multi-tenant workspaces (GDPR erasure) | Per-end-user isolation |
| T50 | BrowserTool (Playwright) | **Leverage gstack's browse architecture** — not rebuild |
| T51 | SpreadsheetTool (XLSX/CSV) | Data analysis + report generation |
| T52 | APITool (REST/GraphQL) | Configurable external service calls |
| T53 | AgentTool (sub-agent spawn) | **Leverage GSD's Task() pattern** — not rebuild |
| T54 | Open skill registry (treis.dev) | Community skill packs (npm-based publishing) |
| T55 | Cross-platform (Windows + Linux) | Platform abstraction layer |

---

## 15. Key Architectural Decisions

### From Analysis — Apply to Treis

1. **Mutable state machine for agent loop** — explicit state transitions, not nested conditionals
2. **Withhold errors until recovery attempted** — don't expose recoverable errors to consumer
3. **Per-message transcript writes** — enables resume from any point after crash
4. **History snip before microcompact** — clean stale markers before LRU optimization
5. **Fire-and-forget background tasks** — memory extraction, dream cycle don't block response
6. **Concurrency partitioning** — read-only tools batch concurrent, write tools serial
7. **Context modifiers applied atomically** — prevent race conditions in tool batches
8. **Tool schema deferral** — lazy load schemas for tools not yet discovered
9. **Dependency-driven wave parallelization** — group tasks by deps, parallel within wave
10. **Checkpoint-based interaction** — explicit pause points, not polling
11. **Surgical revision loops** — max 3 iterations with targeted fixes, not rewrites
12. **Model tiering per agent type** — cheap for execution, expensive for planning

### Treis-Specific Decisions

13. **Local-first, zero-key-by-default** — works offline with no API keys
14. **AI proposes, Builder picks** — Builder never designs plans
15. **Sealed Plan Contract before execution** — scope locked before any tool runs
16. **Only interrupt is contract violation** — execution otherwise autonomous
17. **Harness invisible to model** — model uses tools normally; harness intercepts
18. **Two-slot RAM system** — Logos+Pathos sequential on A, Ethos continuous on B
19. **Universal domain** — not code-only; any Builder, any task domain

### Framework Integration Decisions

20. **Load, don't rebuild** — Superpowers/GSD/gstack loaded as-is, Treis builds the harness
21. **Skill loader = union compatibility** — support ALL frontmatter fields from all 3 frameworks
22. **Hook system = GSD-compatible** — SessionStart/PreToolUse/PostToolUse executing external scripts
23. **Preamble support = gstack-compatible** — `preamble-tier` execution before skill content
24. **State directories coexist** — `.planning/` (GSD) + `~/.gstack/` (gstack) + `~/.treis/` (Treis core)
25. **BrowserTool = gstack browse** — Phase 3 wraps existing gstack browse binary, not reimplements
26. **AgentTool = GSD Task()** — Phase 3 wraps existing GSD sub-agent spawning pattern
27. **Version pinning per framework** — Builder controls which version of each framework runs
28. **Auto-sync with confirm** — upstream changes detected but NEVER applied without Builder approval

---

## 16. Development Pipeline — Four-Phase Framework Orchestration

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TREIS DEVELOPMENT PIPELINE                       │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │   PHASE 1    │    │   PHASE 2    │    │   PHASE 3    │◄──┐      │
│  │   Planning   │───→│   Project    │───→│  Development │   │      │
│  │  & Strategy  │    │  Management  │    │  Execution   │   │      │
│  │              │    │              │    │              │   │      │
│  │  gstack      │    │  GSD         │    │ Superpowers  │   │LOOP  │
│  │  CEO / Eng   │    │  PM          │    │ Senior Eng   │   │UNTIL │
│  │  Manager     │    │              │    │              │   │100%  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘   │      │
│                                                 │           │      │
│                                          ┌──────▼───────┐   │      │
│                                          │   PHASE 4    │   │      │
│                                          │  QA &        │───┘      │
│                                          │  Polishing   │          │
│                                          │              │          │
│                                          │  gstack      │          │
│                                          │  QA Lead     │          │
│                                          └──────────────┘          │
│                                                 │                  │
│                                          ┌──────▼───────┐          │
│                                          │    SHIP      │          │
│                                          │  /ship       │          │
│                                          │  /gsd-complete│         │
│                                          └──────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

---

### PHASE 1: Planning & Strategy — gstack (CEO / Eng Manager)

**Role:** Verify ambiguous ideas and meticulously design the entire architecture.
**Framework:** gstack — decision intelligence, structured review, forcing questions.
**Persona:** CEO + Engineering Manager — strategic scope, architectural rigor.

**Gate:** Phase 1 is COMPLETE when architecture is unambiguous and reviewers approve.
Phase 1 runs ONCE per milestone — not repeated in the loop.

#### Step 1.1 — Vision & Scope (CEO Hat)

```bash
/office-hours
```
- 6 YC forcing questions applied to current milestone scope
- Demand reality: who needs this and why RIGHT NOW?
- Status quo: what do people do today without it?
- Narrowest wedge: what is the absolute minimum first version?
- Output: `ceo-plans/{timestamp}.md` — design doc with capabilities + approaches

#### Step 1.2 — Scope Challenge (CEO Review)

```bash
/plan-ceo-review
```
- 4 scope modes: EXPANSION / SELECTIVE / HOLD / REDUCTION
- For Phase 0: always HOLD SCOPE or REDUCTION — ship fast
- Challenge every feature: "Does this make the demo work? No? Cut it."
- Output: `plan-ceo-review-{branch}.md` — scope-locked design

#### Step 1.3 — Architecture Review (Eng Manager Hat)

```bash
/plan-eng-review
```
- ASCII data flow diagrams
- State machine definitions
- Dependency graph between packages
- Test matrix: happy path + edge cases + error paths
- Failure modes and security concerns
- Output: eng review doc with architecture locked

#### Step 1.4 — Design Review (if UI involved)

```bash
/plan-design-review
```
- Rate each design dimension 0-10
- Define what a "10" looks like for each
- Interactive fixes before any implementation
- Output: design review with visual specs locked

#### Step 1.5 — Developer Experience Review

```bash
/plan-devex-review
```
- 20-45 forcing questions
- TTHW (Time To Hello World) analysis
- Friction point identification
- Output: DX review — API ergonomics locked

**Phase 1 Exit Criteria:**
- [ ] Vision doc approved (scope locked)
- [ ] Architecture reviewed (data flow, state machines, deps documented)
- [ ] Design reviewed (if UI) — dimensions scored, 10-standards defined
- [ ] DX reviewed — API surface approved
- [ ] No ambiguity remains — every decision documented

---

### PHASE 2: Project Management — GSD (Project Manager)

**Role:** Split the project into milestones and set up a safe working environment
with less than 50% context usage.
**Framework:** GSD — structured phases, dependency analysis, wave parallelization.
**Persona:** Project Manager — organized, methodical, context-budget-aware.

**Gate:** Phase 2 is COMPLETE when all phases are planned with executable PLAN.md files.
Phase 2 runs ONCE per milestone — not repeated in the loop.

#### Step 2.1 — Initialize Project

```bash
/gsd-new-project
```
- Creates `.planning/` directory structure
- PROJECT.md — vision, core value, key decisions
- ROADMAP.md — phases mapped from Phase 1 architecture
- STATE.md — current position tracker (<100 lines)
- config.json — model profile, branching strategy, commit_docs

#### Step 2.2 — Split Into Phases

Each Phase 1 target group becomes a GSD phase. Example for PRD Phase 0:

```
Phase 1: Monorepo scaffold + package structure       (T01)
Phase 2: Ollama adapter + benchmark system            (T02-T03)
Phase 3: Tool system + permission gates               (T04-T07)
Phase 4: Agent loop + Plan Contract engine            (T08-T09)
Phase 5: Session state + IPC bridge                   (T10-T12)
Phase 6: Electron shell + React renderer              (T13)
Phase 7: UI flow (Intent → Contract → Execution)      (T14-T17)
Phase 8: eKlotho demo integration                     (T18)
```

#### Step 2.3 — Discuss & Plan Each Phase

```bash
# For each phase:
/gsd-discuss-phase N       # Gather implementation decisions → CONTEXT.md
                           # Decisions are LOCKED — downstream agents can't re-ask
```

```bash
/gsd-plan-phase N          # Creates detailed PLAN.md with:
                           #   - Tasks (type, name, files, action, verify, done)
                           #   - Dependencies between tasks
                           #   - Wave grouping for parallelization
                           #   - Success criteria per task
```

```bash
# Plan quality gate (automatic):
# gsd-plan-checker reviews PLAN.md
# Max 3 revision iterations if issues found
# Plan MUST pass before execution begins
```

#### Step 2.4 — Context Budget Enforcement

**CRITICAL: Stay under 50% context usage.**

Strategies:
- Phase CONTEXT.md: keep decisions concise, no redundancy
- PLAN.md: specific file paths + actions, not prose
- STATE.md: digest format, <100 lines always
- Sub-agent isolation: each executor gets ONLY its phase context
- Wave-based execution: parallel agents share no context
- GSD context monitor: warns at 35%, critical at 25% remaining

```
Context Budget Allocation:
  System prompt + TREIS.md:     ~10%
  Phase CONTEXT.md + PLAN.md:   ~15%
  Tool results (accumulated):   ~20%
  Reserve for execution:        ~55%  ← MUST stay above 50%
```

**Phase 2 Exit Criteria:**
- [ ] All phases defined in ROADMAP.md
- [ ] Each phase has CONTEXT.md (decisions locked)
- [ ] Each phase has PLAN.md (tasks, deps, waves, criteria)
- [ ] All plans pass gsd-plan-checker review
- [ ] Context budget verified: <50% usage projected per phase
- [ ] Branching strategy set (none / phase / milestone)

---

### PHASE 3: Development Execution — Superpowers (Senior Engineer)

**Role:** Implement bug-free code by enforcing TDD and writing test code first.
**Framework:** Superpowers — 1% Rule, Red Flag detection, 7-phase pipeline.
**Persona:** Senior Engineer — disciplined, test-first, quality-obsessed.

**Gate:** Phase 3 → Phase 4 when all tests pass and code compiles clean.
Phase 3 LOOPS with Phase 4 until 100% QA pass.

#### Step 3.1 — Superpowers 7-Phase Pipeline (per GSD phase)

For each GSD phase, Superpowers enforces this exact pipeline:

**3.1.1 — /brainstorm**
- Enumerate at least 3 distinct implementation approaches
- Consider tradeoffs: performance, simplicity, extensibility
- Gate: minimum 3 approaches documented before proceeding

**3.1.2 — /plan**
- Map file changes from chosen approach
- Identify risks and edge cases
- Gate: Logos layer (gstack plan-eng-review pattern) approves

**3.1.3 — /tdd-start (MANDATORY — TDD FIRST)**
```
RULE: Tests are written BEFORE implementation code.
NO EXCEPTIONS. Red Flag if implementation starts without failing tests.
```
- Write failing test cases that define expected behavior
- Cover: happy path, edge cases, error conditions
- Gate: tests exist AND fail (proving they test something real)

**3.1.4 — /implement**
- Write code to make failing tests pass
- 1% Rule enforced: if any skill MIGHT apply, it MUST be invoked
- Red Flag detection active: no rationalization about skipping steps
- Atomic commits per task (GSD executor pattern)
- Gate: ALL tests pass

**3.1.5 — /review**
- Security review: injection, XSS, path traversal, secret exposure
- Performance review: O(n) analysis, memory allocation, async patterns
- Edge case review: null handling, boundary values, concurrent access
- Gate: Red Flag checklist cleared — zero unaddressed concerns

**3.1.6 — /verify**
- `tsc --noEmit` passes (zero type errors)
- ESLint passes (zero lint errors)
- All tests pass (unit + integration)
- Test coverage meets threshold (≥80% unit, ≥70% integration)
- Gate: ZERO errors remain

**3.1.7 — /ship (to Phase 4, not to production)**
- Code committed with passing tests
- SUMMARY.md created (dependency graph, key decisions)
- Ready for QA handoff
- Gate: Ethos drift-check passes (GSD `/gsd-verify-work`)

#### Step 3.2 — GSD Executor Integration

```bash
/gsd-execute-phase N       # Spawns executor agents per plan
                           # Each executor follows Superpowers 7-phase pipeline
                           # Wave-based: independent tasks run in parallel
                           # Atomic commits per task
                           # SUMMARY.md created per plan
```

#### Step 3.3 — 1% Rule Enforcement During Execution

```
EXTREMELY IMPORTANT:
If there is even a 1% chance a skill applies, it MUST be invoked.

Red Flag Table (active during all of Phase 3):
  "This is just a simple function"     → Tests still required. TDD applies.
  "I can skip tests for this utility"  → NO. /tdd-start is mandatory.
  "This doesn't need a review"         → /review is mandatory. Always.
  "I'll add tests later"              → NEVER. Tests come FIRST.
  "This is obvious, no edge cases"     → Edge cases are never obvious. Check.
  "I know this pattern already"        → Skills evolve. Read current version.
```

**Phase 3 Exit Criteria:**
- [ ] All GSD phase plans executed
- [ ] Every feature has tests written BEFORE implementation
- [ ] All tests pass (`tsc --noEmit` + ESLint + test suite)
- [ ] Coverage thresholds met (≥80% unit, ≥70% integration)
- [ ] /review completed — zero unaddressed security/performance concerns
- [ ] SUMMARY.md created per plan with dependency graph
- [ ] Handoff to Phase 4 (QA)

---

### PHASE 4: QA & Polishing — gstack (QA Lead)

**Role:** Directly test the UI using Playwright and establish final stability.
**Framework:** gstack — real browser QA, design review, automated regression.
**Persona:** QA Lead — meticulous, user-focused, finds bugs that pass CI.

**Gate:** Phase 4 loops back to Phase 3 if bugs found.
Phase 4 is COMPLETE when 100% QA pass — zero bugs, zero regressions.

#### Step 4.1 — Automated QA (Real Browser)

```bash
/qa
```
- Opens real Chromium (headless or headed via `$B connect`)
- Navigates to running app
- Tests every user flow defined in Plan Contract success criteria
- For each flow:
  1. Execute user actions (click, fill, navigate)
  2. Verify expected outcomes (DOM state, API responses, file outputs)
  3. If bug found → generate test case + fix code + re-verify
  4. Commit atomically per bug fix
- Re-runs full test suite after all fixes
- Output: QA report with pass/fail per flow

#### Step 4.2 — Design Audit (if UI)

```bash
/design-review
```
- Visual audit of every screen
- Rate each design dimension 0-10
- Atomic fix commits with before/after comparison
- Checks: spacing, alignment, color consistency, responsive behavior
- Accessibility: keyboard navigation, screen reader, contrast ratios

#### Step 4.3 — Code Review (Staff Engineer Mode)

```bash
/review
```
- Finds bugs that pass CI (logic errors, race conditions, edge cases)
- Auto-fixes obvious issues (typos, missing error handling, style)
- Flags completeness gaps (missing features, partial implementations)
- Output: review report with fixes applied

#### Step 4.4 — DX Verification (if library/API)

```bash
/devex-review
```
- Live onboarding test: can a new developer use this?
- Compare against Phase 1 DX predictions
- Friction points identified and fixed
- TTHW measured against target

#### Step 4.5 — Loop Decision

```
┌─────────────────────────────────────────────┐
│           QA RESULTS EVALUATION             │
├─────────────────────────────────────────────┤
│                                             │
│  Bugs found?                                │
│    YES → Log bugs as GSD tasks              │
│         → Return to PHASE 3                 │
│         → Fix with TDD (test first!)        │
│         → Return to PHASE 4 for re-verify   │
│                                             │
│  Design issues found?                       │
│    YES → Fix in Phase 4 (atomic commits)    │
│         → Re-run /design-review             │
│                                             │
│  All QA pass + zero bugs + zero regressions?│
│    YES → PHASE 4 COMPLETE                   │
│         → Proceed to SHIP                   │
│                                             │
└─────────────────────────────────────────────┘
```

**Phase 4 Exit Criteria:**
- [ ] /qa passes — all user flows verified in real browser
- [ ] /design-review passes — all dimensions ≥8/10 (if UI)
- [ ] /review passes — zero unaddressed findings
- [ ] /devex-review passes — TTHW meets target (if API)
- [ ] Zero bugs remaining
- [ ] Zero test regressions (full suite green)
- [ ] Test coverage maintained (≥80% unit, ≥70% integration)

---

### SHIP — After Phase 4 passes 100%

```bash
# GSD milestone completion
/gsd-complete-milestone    # Archive ROADMAP.md + REQUIREMENTS.md
                           # Git tag with version
                           # STATE.md updated

# gstack ship
/ship                      # Sync from main
                           # Run full test suite
                           # Push branch + open PR
                           # Auto-invoke /document-release

# Documentation
/document-release          # Update README, CHANGELOG
                           # API docs if applicable
```

---

### Pipeline Summary Table

| Phase | Framework | Role | Input | Output | Runs |
|-------|-----------|------|-------|--------|------|
| **1** | **gstack** | CEO / Eng Manager | Ambiguous ideas, PRD | Locked architecture, reviewed designs | Once per milestone |
| **2** | **GSD** | Project Manager | Locked architecture | Phases, PLAN.md files, <50% context | Once per milestone |
| **3** | **Superpowers** | Senior Engineer | PLAN.md per phase | Tested code (TDD-first), SUMMARY.md | Loops with Phase 4 |
| **4** | **gstack** | QA Lead | Running code | Bug reports, fixes, QA pass/fail | Loops with Phase 3 |
| **Ship** | gstack + GSD | — | 100% QA pass | Tagged release, PR, docs | Once per milestone |

### Phase 3↔4 Loop Guarantee

```
INVARIANT: The loop ALWAYS terminates because:
  1. Each loop iteration fixes bugs found in Phase 4
  2. Fixes use TDD (Phase 3) — new tests prevent regression
  3. Phase 4 re-verifies ALL flows, not just fixed ones
  4. Bug count is monotonically decreasing (fixes + regression tests)
  5. Loop exits when bug count = 0 AND all QA passes
  
CIRCUIT BREAKER: If loop exceeds 5 iterations:
  → Surface to Builder with status report
  → Builder decides: continue, descope, or ship with known issues
```
