# Phase 1: Foundation - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the independently testable building blocks: pnpm monorepo with clean builds, both model adapters streaming through a unified interface, all 9 tools executing with correct permission gating, and session state persisting to disk as JSONL. No agent loop, no Plan Contract engine, no CLI/desktop UI.

</domain>

<decisions>
## Implementation Decisions

### Build Tooling
- **D-01:** Use tsup for all package builds. Fast, zero-config for TypeScript, supports ESM+CJS dual output.
- **D-02:** ESM-first module format with CJS fallback where needed (Electron main process requires CJS).
- **D-03:** Vitest for all testing. Workspace-aware config at monorepo root, per-package test configs.

### Model Adapter Interface
- **D-04:** Vercel AI SDK 5 `streamText` is the unified streaming interface. Both Ollama and Anthropic adapters plug into the same API surface. This was validated during research as the missing critical piece.
- **D-05:** Ollama adapter connects via OpenAI-compatible REST at localhost:11434. Must hardcode `num_ctx: 32768` on every chat call (default 2048 kills plans at step 2-3).
- **D-06:** Anthropic adapter connects via `@ai-sdk/anthropic` with API key from `ANTHROPIC_API_KEY` env var.
- **D-07:** Capability detection at connection time. If a model doesn't support tool calling, fail-fast with a clear error rather than silently degrading.
- **D-08:** Model health check returns connection status, model name, and available context window. Used by slot manager to assign models.

### Tool System
- **D-09:** Tool base interface: `name`, `description`, `inputSchema` (Zod v4), `call()`, `checkPermissions()`. All tools implement this interface.
- **D-10:** Permission tiers: ReadOnly, WriteFiles, ExecuteShell, DangerousShell, NetworkAccess. Checked BEFORE tool execution.
- **D-11:** Session-scoped permission grants. Re-granted each session (security-first). DangerousShell requires explicit approval every invocation.
- **D-12:** Permission state is in-memory only, not persisted across sessions.
- **D-13:** BashTool blocks metacharacter injection: `;`, `&&`, `||`, `$(...)`, backticks. 30s default timeout.
- **D-14:** Read-only tools (FileRead, Glob, Grep) batch for concurrent execution. Write tools (FileWrite, Bash) execute serially.
- **D-15:** All file-based tools validate resolved path `startsWith(workspaceRoot)` to prevent path traversal.

### Session & Persistence
- **D-16:** JSONL trace format: flat entries with `ts`, `step`, `tool`, `input`, `output`, `verdict`, `duration_ms`, `execution_id` fields. Matches design doc trace schema.
- **D-17:** Workspace directory: `~/.treis/workspaces/{id}/` with `config.json`, `plan-contracts/`, `traces/`, `sessions/` subdirectories. Matches SESS-03.
- **D-18:** Session state uses mutable store pattern: `setState` callback, shallow comparison, listener Set. Matches SESS-01.
- **D-19:** Conversation history as append-only JSONL at `~/.treis/sessions/{sid}.jsonl`.
- **D-20:** Step-level checkpoint saved after every completed step (enables resume in Phase 2 agent loop).

### Error Handling
- **D-21:** Typed error hierarchy: `ModelConnectionError`, `ModelStreamError`, `ToolExecutionError`, `PermissionDeniedError`, `PathTraversalError`. Typed errors enable retry logic and circuit breaking in Phase 2.
- **D-22:** All errors include context (tool name, input summary, timestamp) for trace logging.

### Claude's Discretion
- Internal package structure within `@treis/core`, `@treis/api-client`, `@treis/tools` — file organization within packages.
- Specific Zod v4 schema patterns for tool input validation.
- ESLint rule selection beyond TypeScript strict defaults.
- Pino logger configuration details for JSONL output.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Design
- `TREIS_ARCHITECTURE_SPEC.md` — Full architecture spec (16 sections, 55 targets, 28 decisions). The "wall" for clean-room implementation.
- `~/.gstack/projects/treis/desirey-unknown-design-20260409-210907.md` — APPROVED design doc with Plan Contract schema, permission model, and failure handling.

### Research
- `.planning/research/STACK.md` — Stack validation with 4 corrections (Electron 35+, Zod v4, Vercel AI SDK 5, Pino)
- `.planning/research/ARCHITECTURE.md` — Component boundaries and build order
- `.planning/research/PITFALLS.md` — 13 pitfalls including critical Ollama context, BashTool RCE, reliability compounding
- `.planning/research/SUMMARY.md` — Executive summary of research findings

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — 55 requirements with REQ-IDs; Phase 1 covers REPO-01..03, MODEL-01..06, TOOL-01..10, SESS-01..05
- `.planning/ROADMAP.md` — Phase structure with success criteria and Harness Methodology

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No existing code to reuse.

### Established Patterns
- None yet — this phase establishes the foundational patterns all subsequent phases build on.

### Integration Points
- Package boundaries: `@treis/core` depends on `@treis/api-client` and `@treis/tools`
- `@treis/api-client` and `@treis/tools` are independent, can be built in parallel
- Build order (from research): tools + api-client parallel → session (in core) → plan contract (Phase 2) → agent loop (Phase 2) → CLI (Phase 3) → Electron (Phase 4)

</code_context>

<specifics>
## Specific Ideas

- Ollama num_ctx MUST be 32768+ on every call. This is non-negotiable — default 2048 is a plan-killer identified in pitfall research.
- BashTool is CVE-class RCE surface. Metacharacter blocking is security-critical, not a nice-to-have.
- Vercel AI SDK 5 is the unifying abstraction that makes both adapters work through the same `streamText` API. Don't build a custom streaming abstraction.
- Clean-room: zero lines from any proprietary source. Architecture spec serves as the wall.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-09*
