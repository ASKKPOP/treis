# Feature Landscape: AI Agent Harness Platforms

**Domain:** AI agent harness / plan execution platform
**Researched:** 2026-04-09
**Confidence:** HIGH (multiple authoritative sources, cross-verified)

---

## Table Stakes

Features users expect from any serious agent harness. Missing = product feels unfinished or unreliable. Every significant competitor has these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language task input | Entry point for all work | Low | CLI and/or GUI; every harness has this |
| Multi-step autonomous plan execution | Core promise of the category | High | Agent loop with self-directed steps; Claude Code, Cline, Aider all do this |
| Tool system (file read/write, shell, web) | Agents need environment access to be useful | Medium | Permission gates expected; YOLO mode is a known escape hatch |
| Per-tool permission gates | User control over what agent can touch | Medium | Cline pioneered per-action approval; now expected everywhere |
| Retry on failure with error context | Plans fail; recovery is essential | Medium | Exponential backoff, error injection into context; 3x retry is de facto standard |
| JSONL / append-only trace logging | Debugging + auditability | Low | Claude Code established this pattern; now expected for production use |
| Session state persistence | Crash-safe, resumable sessions | Medium | Append-only write = crash-safe; required for long-running tasks |
| Context compaction / window management | Long tasks exhaust context | Medium | Auto-compaction when approaching limit; without this long plans fail |
| Model provider flexibility (BYOM or dual local+cloud) | Privacy, cost, reliability tradeoffs | Medium | Cline, Continue, Aider all offer BYOM; Claude Code is the locked-vendor outlier |
| MCP (Model Context Protocol) support | Standard tool/data integration layer | Medium | MCP won the integration layer war in 2025; 75+ connectors; not having it is a gap |
| Observability / action tracing | Know what the agent did and why | Medium | Langfuse, OpenTelemetry patterns; required for debugging multi-step failures |
| Explicit state machine / agent loop | Predictable execution phases | High | Implicit loops fail silently; explicit transitions are production-grade |
| Input/output guardrails | Prevent prompt injection, PII leakage | Medium | Deterministic checks before/after LLM; now expected in any serious harness |
| Error recovery with rollback | Plan failures without recovery = trust death | High | Git-checkpoint pattern; save state before destructive steps |

---

## Differentiators

Features that set a product apart. Not expected by default, but valued when discovered. Treis should lead here.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Plan Contracts (sealed scope)** | Only interrupt on genuine scope breach; eliminates approval fatigue from per-step confirmations | High | Treis's core thesis. No competitor does pre-committed bounded execution. Closest is Cline's Plan mode, but that still approves per-action in Act mode. |
| Clarifying dialogue before execution | Forces scope alignment before the agent moves; catches misunderstandings early | Medium | 2-3 questions + 3 options pattern; prevents "started wrong, finished wrong" |
| Options proposal (not single plan) | Builder agency over approach; buy-in before execution | Medium | 3 options with tradeoffs; rare in competitors today |
| Scope violation detection (programmatic + model-judged) | Automated drift detection as first-class feature | High | File/tool/URL pattern matching + LLM judgment for natural language actions; nobody has both |
| Framework composition (Superpowers/GSD/gstack as runtime layers) | Load proven skill sets rather than reinventing | High | Treis-specific; universal domain coverage without rebuilding everything |
| Universal domain (not code-only) | Any Builder, any task, not just developers | High | Category defining if executed; competitors are all code-first |
| Three-agent architecture (Init/Exec/Eval) | Separation of concerns for reliability at scale | High | Phase 2 differentiator; OpenHarness does multi-agent but without Treis's scope model |
| Local model support from day one (Ollama) | Privacy, zero cost, offline capability | Medium | Most harnesses add local support late or not at all; positioning choice |
| Electron desktop app with visual contract flow | GUI makes contract ritual legible and trustworthy | High | CLI proves it; Electron wraps and amplifies it; most harnesses are IDE extensions |
| 1% Rule enforcement during execution | Constraint layer during runtime prevents skill abuse | Medium | Superpowers-specific; enforced at skill invocation not just config |
| Cost/speed model routing tiers | Optimize spend per task complexity automatically | High | Use cheap model for simple steps, expensive for reasoning; few harnesses do this explicitly |
| Benchmark suite as public artifact | Show HN / open-source credibility signal | Low | 10-plan benchmark with measured success rate; rare for early-stage projects |

---

## Anti-Features

Features to deliberately NOT build in Phase 0. These either belong to a later phase, actively harm the product thesis, or are solved by the composed frameworks.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Per-step approval by default | Creates approval fatigue; users rubber-stamp at scale; undermines the entire Plan Contract thesis | Seal scope upfront; only interrupt on contract violation |
| Reimplementing skill packs (gstack/GSD/Superpowers) | Massive scope; already solved; clean-room obligation irrelevant here since they're open source | Load as runtime layers; compose, don't reinvent |
| Three-agent architecture in Phase 0 | Adds orchestration complexity before the single-agent loop is proven | Single agent loop in P0; promote to three-agent in Phase 2 |
| KAIROS memory system | Long-term memory requires the single-session loop to be reliable first | Phase 1 concern; in-session state management covers P0 needs |
| Browser automation (Playwright) | Heavy dependency; not needed for most P0 tasks | Phase 3; gstack browse handles browser tasks in composed mode |
| REST API service | Premature productization; adds surface area before core is stable | Phase 3 after CLI and desktop are proven |
| Windows/Linux support | Platform proliferation before macOS is solid | Phase 3; macOS-first is the right call |
| GUI plan editor / drag-drop workflow builder | Archon already built this; not Treis's differentiator | Visual flow is the Electron app's contract ritual, not a general workflow editor |
| Multi-tenant / SaaS mode | Requires auth, billing, isolation before product-market fit | Community open-source first; enterprise features after traction |
| Fine-tuning / training pipelines | Out of scope for a harness; belongs to model layer | Collect trajectory data (JSONL traces) as a future asset; don't build training infra now |
| Excessive observability UI | Langfuse / Phoenix exist; building custom dashboards wastes cycles | Emit JSONL traces in standard format; let existing tools consume them |

---

## Feature Dependencies

```
Natural language input
  → Clarifying dialogue (2-3 questions)
    → Options proposal (3 options with tradeoffs)
      → Plan Contract sealing (scope + boundaries + success criteria)
        → Agent loop execution (state machine transitions)
          → Tool dispatch (file, shell, web) with permission gates
            → Scope violation detection (on each tool call)
              → Contract violation interrupt (if violation detected)
              → Retry with error context injection (if step fails, up to 3x)
          → JSONL trace logging (every tool call, verdict, retry)
        → Session state persistence (crash-safe, resumable)
        → Context compaction (auto, near window limit)
      → Success/failure verdict against success criteria

Model provider selection (local Ollama OR cloud Anthropic)
  → Model routing tiers (cost/speed optimization per step)
  → RAM slot management for local models (A=Primary, B=Background)

Electron desktop app
  → IPC bridge (token streaming from core to renderer)
  → Visual contract flow (input → dialogue → options → seal → execute → result)
  (depends on: CLI proving the Plan Contract engine works first)

MCP support
  → Extended tool ecosystem (anything MCP-compatible)
  (can layer on top of base tool system; not a Phase 0 blocker)

Skill loader (Superpowers framework)
  → 1% Rule enforcement during execution
  (requires base agent loop to be working first)
```

---

## MVP Recommendation

For Phase 0, prioritize features that prove the core thesis and generate the benchmark artifact:

**Must ship in Phase 0:**
1. Clarifying dialogue + options proposal (the ritual that makes Plan Contracts legible)
2. Plan Contract sealing with explicit scope/boundaries/success criteria
3. Scope violation detection (programmatic: file/tool/URL patterns)
4. Agent loop with explicit state machine transitions
5. Tool system: FileRead, FileWrite, Bash, WebSearch with permission gates
6. Retry policy: 3x with error context injection
7. JSONL trace logging for all executions
8. Session state persistence (append-only, crash-safe)
9. Local (Ollama) + cloud (Anthropic) model support
10. 10-plan benchmark suite with measured success rate

**Defer from Phase 0:**
- Contract violation interrupt on natural language actions (model-judged): Phase 1 — programmatic detection covers most cases
- MCP support: Phase 1 — base tool system covers P0 scope
- Electron app: Phase 1 (weeks 5-8) — CLI proves engine first
- IPC bridge + visual contract flow: Phase 1 alongside Electron
- KAIROS memory: Phase 1
- Three-agent architecture: Phase 2
- Browser automation: Phase 3
- REST API: Phase 3

---

## Competitive Positioning Summary

| Capability | Claude Code | Cline | Aider | Plandex (defunct) | OpenHarness | **Treis** |
|------------|-------------|-------|-------|-------------------|-------------|-----------|
| Plan-before-execute | Yes (auto) | Plan mode | No | Yes | No | **Yes (sealed)** |
| Scope sealing | No | No | No | No | No | **Yes (P0)** |
| Scope violation detection | No | No | No | No | No | **Yes (P0)** |
| Options proposal | No | No | No | No | No | **Yes (P0)** |
| Local model support | Via Ollama compat | Yes | Yes | No | Yes | **Yes (P0)** |
| Per-step approval | Yes (default) | Yes (default) | No | No | No | **No (contract seals this)** |
| Skill framework composition | No | No | No | No | No | **Yes (Superpowers)** |
| Universal domain | Code-only | Code-only | Code-only | Code-only | Code-only | **Yes (goal)** |
| JSONL trace logging | Yes | No | No | Yes | No | **Yes (P0)** |
| Desktop app | No | VS Code ext | No | No | No | **Yes (Phase 1)** |
| Open source | Yes | Yes | Yes | Was | Yes | **Yes** |

Plandex wound down October 2025. It was the closest prior art to sealed-scope plan execution.

---

## Sources

- philschmid.de: "The importance of Agent Harness in 2026" (HIGH confidence — current, practitioner source)
- martinfowler.com: "Harness engineering for coding agent users" — Birgitta Böckeler (HIGH confidence — authoritative)
- dev.to: "Building a Production-Ready AI Agent Harness" (MEDIUM confidence — practitioner blog, verified against other sources)
- github.com/cline/cline: Cline feature set (HIGH confidence — primary source)
- github.com/plandex-ai/plandex: Plandex feature set, wind-down notice (HIGH confidence — primary source)
- artificialanalysis.ai: Coding agents comparison (MEDIUM confidence — comparative analysis)
- aimultiple.com: "Agentic CLI Tools Compared: Claude Code vs Cline vs Aider" (MEDIUM confidence)
- milvus.io: "How Claude Code Manages Local Storage" — JSONL pattern analysis (HIGH confidence)
- aakashgupta.medium.com: "2025 Was Agents. 2026 Is Agent Harnesses" (MEDIUM confidence — industry analysis)
- dev.to/htekdev: "Agent Harnesses: Why 2026 Isn't About More Agents" (MEDIUM confidence)
- permit.io: "Human-in-the-Loop for AI Agents" — approval fatigue analysis (MEDIUM confidence)
- github.com/HKUDS/OpenHarness: OpenHarness feature set (HIGH confidence — primary source)
- github.com/coleam00/Archon: Archon feature set (HIGH confidence — primary source)
