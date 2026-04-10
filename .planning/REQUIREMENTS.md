# Requirements: Treis

**Defined:** 2026-04-09
**Core Value:** Plan Contracts -- AI proposes, Builder picks, scope sealed before execution. Multi-step AI plans complete end-to-end with 90%+ success rate.

## v1 Requirements

Requirements for Phase 0 release. Each maps to roadmap phases.

### Monorepo & Build

- [ ] **REPO-01**: pnpm monorepo with @treis/core, @treis/api-client, @treis/tools, apps/cli, apps/desktop
- [ ] **REPO-02**: Shared tsconfig.base.json, ESLint config, Vitest workspace config
- [ ] **REPO-03**: All packages build independently with `pnpm build`

### Model Adapters

- [ ] **MODEL-01**: Ollama adapter connects via OpenAI-compatible REST at localhost:11434
- [ ] **MODEL-02**: Ollama adapter sets num_ctx to 32768+ on every chat call (not user-configurable default)
- [ ] **MODEL-03**: Anthropic adapter connects via @ai-sdk/anthropic with API key from env var
- [ ] **MODEL-04**: Unified streaming interface via Vercel AI SDK 5 (both adapters use same streamText API)
- [ ] **MODEL-05**: Model health check reports connection status, model name, and available context window
- [ ] **MODEL-06**: Slot manager assigns strongest model to Slot A, fastest to Slot B based on manual config

### Tool System

- [ ] **TOOL-01**: Tool base interface with name, description, inputSchema (Zod v4), call(), checkPermissions()
- [ ] **TOOL-02**: FileReadTool reads files within workspace, rejects paths outside workspace root
- [ ] **TOOL-03**: FileWriteTool writes files within workspace, validates resolved path startsWith(workspaceRoot)
- [ ] **TOOL-04**: BashTool executes shell commands with 30s timeout, blocks metacharacter injection (;, &&, ||, $(...), backticks)
- [ ] **TOOL-05**: BashTool permission gate: DangerousShell requires explicit approval every invocation for destructive commands
- [ ] **TOOL-06**: GlobTool finds files by glob pattern within workspace
- [ ] **TOOL-07**: GrepTool searches file content by regex within workspace
- [ ] **TOOL-08**: WebSearchTool performs web searches with NetworkAccess permission gate
- [ ] **TOOL-09**: Permission system with 5 tiers: ReadOnly, WriteFiles, ExecuteShell, DangerousShell, NetworkAccess
- [ ] **TOOL-10**: Read-only tools batch for concurrent execution, write tools execute serially

### Plan Contract Engine

- [ ] **PLAN-01**: Builder states intent in one sentence, AI generates 2-3 clarifying questions
- [ ] **PLAN-02**: AI proposes 3 plan options with tradeoffs (Fast/Balanced/Thorough)
- [ ] **PLAN-03**: Builder picks one option, contract auto-sealed with scope, boundaries, success criteria
- [ ] **PLAN-04**: Sealed contract persisted to ~/.treis/workspaces/{id}/plan-contracts/{cid}.json
- [ ] **PLAN-05**: Typed ScopeEntry for programmatic drift detection: file (glob), tool (name), url (pattern), action (natural language)
- [ ] **PLAN-06**: Scope boundary check runs as pre-hook before every tool execution
- [ ] **PLAN-07**: Violation triggers FATAL interrupt with 3 options: Stop, Amend (re-seal), Continue differently
- [ ] **PLAN-08**: Token budget tracked per contract (default 200K), WARN on exceed

### Agent Loop

- [ ] **AGENT-01**: Explicit state machine with mutable State object (IDLE -> PREPARE -> STREAM -> TOOLS -> EVALUATE -> NEXT/COMPLETE)
- [ ] **AGENT-02**: Per-step streaming from model to consumer (CLI stdout or IPC channel)
- [ ] **AGENT-03**: Tool dispatch respects concurrency partitioning (read-only concurrent, write serial)
- [ ] **AGENT-04**: Retry on FAIL verdict: max 3 retries, exponential backoff (1s/2s/4s), error context injected
- [ ] **AGENT-05**: Model escalation on 3rd failure: local -> cloud if available and Builder confirms
- [ ] **AGENT-06**: Circuit breaker: same tool + identical input 3 consecutive times -> FATAL
- [ ] **AGENT-07**: Loop detector, token budget, and time limit rails active during execution
- [ ] **AGENT-08**: Compaction only fires at step boundaries, never mid-step

### Session & Persistence

- [ ] **SESS-01**: Session state with mutable store pattern (setState callback, shallow comparison, listener Set)
- [ ] **SESS-02**: Conversation history persisted as append-only JSONL at ~/.treis/sessions/{sid}.jsonl
- [ ] **SESS-03**: Workspace layout at ~/.treis/workspaces/{id}/ with config.json, plan-contracts/, traces/, sessions/
- [ ] **SESS-04**: JSONL trace logging: every tool call, verdict, retry, duration_ms with execution_id correlation
- [ ] **SESS-05**: Step-level checkpoint saved after every completed step (enables resume)

### CLI App

- [ ] **CLI-01**: `treis "task"` starts Plan Contract flow in terminal
- [ ] **CLI-02**: Interactive dialogue: AI questions rendered, Builder answers via stdin
- [ ] **CLI-03**: 3 plan options displayed with tradeoffs, Builder picks by number/letter
- [ ] **CLI-04**: Live execution stream shows step counter, current step, tool results
- [ ] **CLI-05**: Contract violation displayed with 3 options in terminal
- [ ] **CLI-06**: Result summary shows success criteria checklist (pass/fail per criterion)

### Desktop App (Electron)

- [ ] **DESK-01**: Electron 35+ shell with React 19 renderer, built with electron-vite
- [ ] **DESK-02**: IPC bridge with 7 named channels (query, stream, tool-progress, tool-result, interrupt, status, model-health)
- [ ] **DESK-03**: Agent loop runs in worker thread, not main process (prevents UI blocking)
- [ ] **DESK-04**: Intent input screen with single text input
- [ ] **DESK-05**: AI dialogue screen with chat-style Q&A
- [ ] **DESK-06**: Plan options screen with 3-card layout (A/B/C)
- [ ] **DESK-07**: Sealed contract screen showing scope, boundaries, criteria with "Begin Execution" button
- [ ] **DESK-08**: Execution stream screen with step counter, tool calls, evaluator verdicts
- [ ] **DESK-09**: Result screen with deliverable summary and success criteria checklist
- [ ] **DESK-10**: DMG packaging via electron-builder for macOS distribution

### Benchmark & Quality

- [ ] **BENCH-01**: 10 reference plans covering diverse domains (code, writing, research, data, mixed)
- [ ] **BENCH-02**: Each plan has expected outcomes (files created, content checks, success criteria)
- [ ] **BENCH-03**: Benchmark runner executes all 10 plans and reports success rate
- [ ] **BENCH-04**: Success rate target: 80%+ on reference plans (stretch: 90%+)
- [ ] **BENCH-05**: Demo GIF capturing Plan Contract flow from intent to completion

## v2 Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Framework Integration (Phase 1)

- **FRMK-01**: Skill loader compatible with all 3 frameworks (union of frontmatter fields)
- **FRMK-02**: gstack integration (Logos layer on Slot A) with browse binary support
- **FRMK-03**: GSD integration (Ethos layer on Slot B) with hook system and .planning/ state
- **FRMK-04**: Superpowers deep integration (1% Rule enforcement, Red Flag detection)
- **FRMK-05**: Hook system compatible with GSD's SessionStart/PreToolUse/PostToolUse
- **FRMK-06**: Version pinning per framework with auto-sync detection

### Memory & Intelligence (Phase 1-2)

- **MEM-01**: KAIROS memory system (daily logs + dream cycle consolidation)
- **MEM-02**: TREIS.md auto-discovery and injection
- **MEM-03**: Golden Principles workspace-level durable rules
- **MEM-04**: Three-agent architecture (Initializer/Executor/Evaluator)
- **MEM-05**: Model-judged violation detection for natural language ScopeEntry

### Platform & API (Phase 3)

- **PLAT-01**: REST API service with CRUD + health endpoints
- **PLAT-02**: BrowserTool wrapping gstack browse binary
- **PLAT-03**: AgentTool wrapping GSD Task() sub-agent pattern
- **PLAT-04**: Cross-platform support (Windows + Linux)
- **PLAT-05**: Code signing + notarization for macOS
- **PLAT-06**: Auto-update via electron-updater

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reimplementing gstack/GSD/Superpowers skills | Treis loads these as-is; composition over reinvention |
| eKlotho integration | Removed from scope entirely per user decision |
| MCP server support in Phase 0 | Table stakes but not P0 blocker; base tools cover benchmark scenarios |
| XState for agent loop state machine | 50KB overhead, overkill for 6-8 state linear flow in P0 |
| OAuth/social login | No user accounts in P0; local-first tool |
| Real-time collaboration | Single-user tool |
| Plugin marketplace | Phase 3+ if community demand exists |
| Mobile app | Desktop-first; macOS only in P0 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REPO-01 | Phase 1 | Pending |
| REPO-02 | Phase 1 | Pending |
| REPO-03 | Phase 1 | Pending |
| MODEL-01 | Phase 1 | Pending |
| MODEL-02 | Phase 1 | Pending |
| MODEL-03 | Phase 1 | Pending |
| MODEL-04 | Phase 1 | Pending |
| MODEL-05 | Phase 1 | Pending |
| MODEL-06 | Phase 1 | Pending |
| TOOL-01 | Phase 2 | Pending |
| TOOL-02 | Phase 2 | Pending |
| TOOL-03 | Phase 2 | Pending |
| TOOL-04 | Phase 2 | Pending |
| TOOL-05 | Phase 2 | Pending |
| TOOL-06 | Phase 2 | Pending |
| TOOL-07 | Phase 2 | Pending |
| TOOL-08 | Phase 2 | Pending |
| TOOL-09 | Phase 2 | Pending |
| TOOL-10 | Phase 2 | Pending |
| PLAN-01 | Phase 3 | Pending |
| PLAN-02 | Phase 3 | Pending |
| PLAN-03 | Phase 3 | Pending |
| PLAN-04 | Phase 3 | Pending |
| PLAN-05 | Phase 3 | Pending |
| PLAN-06 | Phase 3 | Pending |
| PLAN-07 | Phase 3 | Pending |
| PLAN-08 | Phase 3 | Pending |
| AGENT-01 | Phase 3 | Pending |
| AGENT-02 | Phase 3 | Pending |
| AGENT-03 | Phase 3 | Pending |
| AGENT-04 | Phase 3 | Pending |
| AGENT-05 | Phase 3 | Pending |
| AGENT-06 | Phase 3 | Pending |
| AGENT-07 | Phase 3 | Pending |
| AGENT-08 | Phase 3 | Pending |
| SESS-01 | Phase 2 | Pending |
| SESS-02 | Phase 2 | Pending |
| SESS-03 | Phase 2 | Pending |
| SESS-04 | Phase 2 | Pending |
| SESS-05 | Phase 2 | Pending |
| CLI-01 | Phase 4 | Pending |
| CLI-02 | Phase 4 | Pending |
| CLI-03 | Phase 4 | Pending |
| CLI-04 | Phase 4 | Pending |
| CLI-05 | Phase 4 | Pending |
| CLI-06 | Phase 4 | Pending |
| DESK-01 | Phase 5 | Pending |
| DESK-02 | Phase 5 | Pending |
| DESK-03 | Phase 5 | Pending |
| DESK-04 | Phase 5 | Pending |
| DESK-05 | Phase 5 | Pending |
| DESK-06 | Phase 5 | Pending |
| DESK-07 | Phase 5 | Pending |
| DESK-08 | Phase 5 | Pending |
| DESK-09 | Phase 5 | Pending |
| DESK-10 | Phase 5 | Pending |
| BENCH-01 | Phase 4 | Pending |
| BENCH-02 | Phase 4 | Pending |
| BENCH-03 | Phase 4 | Pending |
| BENCH-04 | Phase 4 | Pending |
| BENCH-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 55 total
- Mapped to phases: 55
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after initialization*
