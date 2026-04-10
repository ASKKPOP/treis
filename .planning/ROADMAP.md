# Roadmap: Treis

## Overview

Treis ships in 4 coarse phases that follow the dependency order dictated by the build: Foundation first (monorepo, model adapters, tool system, session persistence), then the Core Engine (Plan Contract + Agent loop), then the CLI Surface that proves the engine end-to-end, and finally the Desktop Surface (Electron) that wraps the proven CLI engine with a visual interface. By phase 3 the core thesis is testable. Phase 4 completes the v1 product.

## Harness Methodology

Every phase follows the Treis Development Pipeline — no exceptions:

```
┌─────────────────────────────────────────────────────────┐
│  FOR EACH PHASE:                                        │
│                                                         │
│  1. PLAN (gstack/GSD)                                   │
│     /gsd-discuss-phase N → gather context, lock decisions│
│     /gsd-plan-phase N   → tasks, deps, waves, criteria  │
│                                                         │
│  2. EXECUTE (Superpowers — Senior Eng)                   │
│     /gsd-execute-phase N                                │
│     Superpowers 7-phase pipeline per plan:               │
│       brainstorm → plan → tdd-start → implement →       │
│       review → verify → ship                            │
│     1% Rule: if skill MIGHT apply, it MUST be invoked   │
│     TDD MANDATORY: tests written BEFORE implementation  │
│                                                         │
│  3. QA (gstack — QA Lead)                               │
│     /qa        → real browser testing (Playwright)      │
│     /review    → staff engineer code review              │
│     /design-review → visual audit (if UI phase)         │
│                                                         │
│  4. LOOP 2↔3 until 100% QA pass                         │
│     Bugs found? → TDD fix (test first!) → re-verify    │
│     Circuit breaker: 5 iterations → surface to Builder  │
│                                                         │
│  5. SHIP                                                │
│     /gsd-complete-milestone → archive, tag, STATE.md    │
│     /ship → sync, test suite, push, PR                  │
└─────────────────────────────────────────────────────────┘
```

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Monorepo, model adapters, tool system, and session persistence — everything the engine depends on
- [ ] **Phase 2: Engine** - Plan Contract engine and Agent loop — the core intelligence that makes plans complete
- [ ] **Phase 3: CLI** - Terminal interface and benchmark suite — proves the engine works end-to-end
- [ ] **Phase 4: Desktop** - Electron app wraps the proven engine with a visual Plan Contract flow

## Phase Details

### Phase 1: Foundation
**Goal**: The building blocks exist and are independently testable — monorepo builds cleanly, both model adapters stream tokens, all 9 tools execute with correct permission gating, and session state persists to disk
**Depends on**: Nothing (first phase)
**Requirements**: REPO-01, REPO-02, REPO-03, MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, TOOL-08, TOOL-09, TOOL-10, SESS-01, SESS-02, SESS-03, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. `pnpm build` succeeds across all packages from a clean checkout with no errors
  2. Running a chat call against Ollama (local) and Anthropic (cloud) both stream tokens through the same unified interface
  3. Each tool (FileRead, FileWrite, Bash, Glob, Grep, WebSearch) executes its happy path and rejects out-of-workspace paths or blocked commands
  4. A DangerousShell command requires explicit approval before executing; a NetworkAccess call respects the NetworkAccess gate
  5. Session state writes to ~/.treis/sessions/{sid}.jsonl and a JSONL trace entry appears after every tool call
**Plans:** 5 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold with pnpm workspace, TypeScript, ESLint, Vitest, and typed error hierarchy
- [x] 01-02-PLAN.md — Model adapters (Ollama + Anthropic) with unified streamText, health checks, and slot manager
- [x] 01-03-PLAN.md — Tool system foundation: types, permissions, executor, and read-only tools (FileRead, Glob, Grep)
- [x] 01-04-PLAN.md — Write/dangerous tools: FileWrite, BashTool (metacharacter blocking), WebSearch
- [x] 01-05-PLAN.md — Session persistence: state store, workspace bootstrap, JSONL traces, checkpoints

### Phase 2: Engine
**Goal**: The Plan Contract engine and Agent loop run correctly — a Builder can go from intent to sealed contract, the loop executes steps with retries and circuit breaking, and scope violations interrupt execution
**Depends on**: Phase 1
**Requirements**: PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05, PLAN-06, PLAN-07, PLAN-08, AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-07, AGENT-08
**Success Criteria** (what must be TRUE):
  1. Given a one-sentence intent, the AI returns 2-3 clarifying questions, then 3 plan options with tradeoffs; Builder picks one and a sealed contract JSON appears in ~/.treis/workspaces/{id}/plan-contracts/
  2. The agent state machine transitions through IDLE -> PREPARE -> STREAM -> TOOLS -> EVALUATE -> NEXT/COMPLETE without skipping states
  3. A failing step retries up to 3 times with error context injected; on 3rd failure the system offers local->cloud escalation
  4. The same tool called with identical input 3 consecutive times triggers a FATAL circuit-breaker interrupt
  5. A tool call that would violate the sealed scope boundary triggers a FATAL interrupt with Stop/Amend/Continue options
**Plans:** 1/5 plans executed

Plans:
- [x] 02-01-PLAN.md — Plan Contract schema (Zod v4) + scope checker (micromatch) + dependency install
- [ ] 02-02-PLAN.md — Plan Contract engine (generateObject dialogue: clarify + propose + seal)
- [ ] 02-03-PLAN.md — Agent loop types, state machine, circuit breaker, retry handler
- [ ] 02-04-PLAN.md — Agent executor (streaming loop, tool dispatch, scope pre-hook, retry + escalation)
- [ ] 02-05-PLAN.md — Integration: barrel exports, build verification, full test suite gate

### Phase 3: CLI
**Goal**: A developer can run `treis "task"` in a terminal and complete a full Plan Contract flow end-to-end; the benchmark suite measures success rate against 10 reference plans
**Depends on**: Phase 2
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, BENCH-01, BENCH-02, BENCH-03, BENCH-04
**Success Criteria** (what must be TRUE):
  1. `treis "task"` starts an interactive terminal session: AI questions appear, Builder types answers via stdin, 3 plan options display, Builder picks by number, live execution stream shows step counter and tool results
  2. A contract violation in the CLI displays the 3 options (Stop / Amend / Continue) and responds correctly to Builder input
  3. The result screen shows a success criteria checklist with pass/fail per criterion
  4. The benchmark runner executes all 10 reference plans and reports a measured success rate; the rate meets or exceeds 80%
**Plans**: TBD
**UI hint**: yes

### Phase 4: Desktop
**Goal**: The Electron app delivers the full Plan Contract flow visually — intent input through result screen — with IPC streaming from the core engine, and a DMG ships for macOS distribution
**Depends on**: Phase 3
**Requirements**: DESK-01, DESK-02, DESK-03, DESK-04, DESK-05, DESK-06, DESK-07, DESK-08, DESK-09, DESK-10, BENCH-05
**Success Criteria** (what must be TRUE):
  1. The Electron app opens and presents an intent input screen; completing the Plan Contract flow moves through intent -> dialogue -> options -> sealed contract -> execution stream -> result without the UI blocking
  2. IPC streaming delivers tokens and tool-progress events to the renderer in real time; the agent loop runs in a worker thread, not the main process
  3. The sealed contract screen shows scope, boundaries, and success criteria before the Builder clicks "Begin Execution"
  4. A DMG built via electron-builder installs and launches on macOS (Apple Silicon and Intel)
  5. A demo GIF capturing the complete Plan Contract flow from intent to result exists and is committed to the repo
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete ✓ | 2026-04-10 |
| 2. Engine | 1/5 | In Progress|  |
| 3. CLI | 0/TBD | Not started | - |
| 4. Desktop | 0/TBD | Not started | - |
