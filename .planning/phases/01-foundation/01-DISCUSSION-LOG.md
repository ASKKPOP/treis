# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 01-foundation
**Mode:** --auto (all decisions auto-selected)
**Areas discussed:** Build tooling, Model adapter interface, Tool permission UX, Session conventions, Error handling strategy

---

## Build Tooling

| Option | Description | Selected |
|--------|-------------|----------|
| tsup | Fast, zero-config, ESM+CJS dual output | ✓ |
| tsc | Standard TypeScript compiler, slower, no bundling | |
| esbuild | Fastest, but less TypeScript feature support | |

**User's choice:** [auto] tsup (recommended default)
**Notes:** tsup handles ESM+CJS dual output cleanly for the monorepo. esbuild lacks some TS features. tsc is slower with no bundling.

| Option | Description | Selected |
|--------|-------------|----------|
| ESM-first with CJS fallback | Modern, Electron main needs CJS | ✓ |
| CJS-only | Simple but outdated | |
| ESM-only | Electron main process compatibility issues | |

**User's choice:** [auto] ESM-first with CJS fallback (recommended default)

---

## Model Adapter Interface

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel AI SDK 5 streamText | Unified interface, both adapters plug in | ✓ |
| Custom streaming abstraction | More control, more code to maintain | |
| Direct SDK calls per provider | Simplest, but no unified interface | |

**User's choice:** [auto] Vercel AI SDK 5 streamText (recommended default)
**Notes:** Research validated this as the missing critical piece. Both @ai-sdk/openai (for Ollama) and @ai-sdk/anthropic use the same streamText API.

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-fast with clear error | Capability detection at connection | ✓ |
| Silent degradation | Falls back to text-only mode | |
| Warning + continue | Logs warning but proceeds | |

**User's choice:** [auto] Fail-fast with clear error (recommended default)

---

## Tool Permission UX

| Option | Description | Selected |
|--------|-------------|----------|
| Session-scoped grants, per-invocation DangerousShell | Security-first, matches arch spec | ✓ |
| Persistent grants saved to config | Convenient but security risk | |
| Per-invocation for all write tools | Secure but friction-heavy | |

**User's choice:** [auto] Session-scoped grants (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory only | Re-grant each session, security-first | ✓ |
| Persisted to session file | Carries across restarts | |

**User's choice:** [auto] In-memory only (recommended default)

---

## Session Conventions

| Option | Description | Selected |
|--------|-------------|----------|
| Flat JSONL entries | ts, step, tool, input, output, verdict, duration_ms, execution_id | ✓ |
| Nested JSON per step | Groups tool calls under step objects | |
| SQLite | Queryable but heavier dependency | |

**User's choice:** [auto] Flat JSONL entries (recommended default)
**Notes:** Matches design doc trace format exactly.

| Option | Description | Selected |
|--------|-------------|----------|
| ~/.treis/workspaces/{id}/ | config.json, plan-contracts/, traces/, sessions/ | ✓ |
| XDG-compliant dirs | Splits config/data/cache across XDG paths | |

**User's choice:** [auto] ~/.treis/workspaces/{id}/ (recommended default)
**Notes:** Matches SESS-03 requirement exactly.

---

## Error Handling Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Typed error hierarchy | ModelConnectionError, ToolExecutionError, etc. | ✓ |
| Generic Error + code property | Simpler but less type-safe | |
| Result<T, E> pattern | Functional, no throw | |

**User's choice:** [auto] Typed error hierarchy (recommended default)
**Notes:** Typed errors enable retry logic and circuit breaking in Phase 2 agent loop.

---

## Claude's Discretion

- Internal file organization within packages
- Zod v4 schema patterns for tool input validation
- ESLint rule selection
- Pino logger configuration

## Deferred Ideas

None — discussion stayed within phase scope.
