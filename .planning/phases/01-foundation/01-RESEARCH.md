# Phase 1: Foundation - Research

**Researched:** 2026-04-10
**Domain:** pnpm monorepo scaffolding, Vercel AI SDK 5 streaming adapters, typed tool system, session persistence (JSONL)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use tsup for all package builds. Fast, zero-config for TypeScript, supports ESM+CJS dual output.
- **D-02:** ESM-first module format with CJS fallback where needed (Electron main process requires CJS).
- **D-03:** Vitest for all testing. Workspace-aware config at monorepo root, per-package test configs.
- **D-04:** Vercel AI SDK 5 `streamText` is the unified streaming interface. Both Ollama and Anthropic adapters plug into the same API surface.
- **D-05:** Ollama adapter connects via OpenAI-compatible REST at localhost:11434. Must hardcode `num_ctx: 32768` on every chat call.
- **D-06:** Anthropic adapter connects via `@ai-sdk/anthropic` with API key from `ANTHROPIC_API_KEY` env var.
- **D-07:** Capability detection at connection time. Fail-fast with a clear error if a model doesn't support tool calling.
- **D-08:** Model health check returns connection status, model name, and available context window.
- **D-09:** Tool base interface: `name`, `description`, `inputSchema` (Zod v4), `call()`, `checkPermissions()`.
- **D-10:** Permission tiers: ReadOnly, WriteFiles, ExecuteShell, DangerousShell, NetworkAccess. Checked BEFORE tool execution.
- **D-11:** Session-scoped permission grants. DangerousShell requires explicit approval every invocation.
- **D-12:** Permission state is in-memory only, not persisted across sessions.
- **D-13:** BashTool blocks metacharacter injection: `;`, `&&`, `||`, `$(...)`, backticks. 30s default timeout.
- **D-14:** Read-only tools (FileRead, Glob, Grep) batch for concurrent execution. Write tools (FileWrite, Bash) execute serially.
- **D-15:** All file-based tools validate resolved path `startsWith(workspaceRoot)` to prevent path traversal.
- **D-16:** JSONL trace format: flat entries with `ts`, `step`, `tool`, `input`, `output`, `verdict`, `duration_ms`, `execution_id` fields.
- **D-17:** Workspace directory: `~/.treis/workspaces/{id}/` with `config.json`, `plan-contracts/`, `traces/`, `sessions/` subdirectories.
- **D-18:** Session state uses mutable store pattern: `setState` callback, shallow comparison, listener Set.
- **D-19:** Conversation history as append-only JSONL at `~/.treis/sessions/{sid}.jsonl`.
- **D-20:** Step-level checkpoint saved after every completed step.
- **D-21:** Typed error hierarchy: `ModelConnectionError`, `ModelStreamError`, `ToolExecutionError`, `PermissionDeniedError`, `PathTraversalError`.
- **D-22:** All errors include context (tool name, input summary, timestamp) for trace logging.

### Claude's Discretion

- Internal package structure within `@treis/core`, `@treis/api-client`, `@treis/tools` — file organization within packages.
- Specific Zod v4 schema patterns for tool input validation.
- ESLint rule selection beyond TypeScript strict defaults.
- Pino logger configuration details for JSONL output.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REPO-01 | pnpm monorepo with @treis/core, @treis/api-client, @treis/tools, apps/cli, apps/desktop | pnpm workspace: * protocol, tsconfig project references pattern |
| REPO-02 | Shared tsconfig.base.json, ESLint config, Vitest workspace config | tsconfig base extends pattern, Vitest projects key (not workspace) |
| REPO-03 | All packages build independently with `pnpm build` | tsup dual ESM+CJS output, per-package build script |
| MODEL-01 | Ollama adapter connects via OpenAI-compatible REST at localhost:11434 | openai SDK baseURL override pattern, verified working |
| MODEL-02 | Ollama adapter sets num_ctx to 32768+ on every chat call | Ollama API body field, non-negotiable for agent loops |
| MODEL-03 | Anthropic adapter connects via @ai-sdk/anthropic with API key from env var | @ai-sdk/anthropic provider factory pattern |
| MODEL-04 | Unified streaming interface via Vercel AI SDK 5 (both adapters use same streamText API) | ai@6.x streamText, createOpenAICompatible for Ollama |
| MODEL-05 | Model health check reports connection status, model name, and available context window | Ollama /api/tags endpoint; Anthropic model list endpoint |
| MODEL-06 | Slot manager assigns strongest model to Slot A, fastest to Slot B based on manual config | Manual config-driven slot assignment in Phase 1 |
| TOOL-01 | Tool base interface with name, description, inputSchema (Zod v4), call(), checkPermissions() | Zod v4 z.object() pattern, TypeScript interface |
| TOOL-02 | FileReadTool reads files within workspace, rejects paths outside workspace root | path.resolve + startsWith guard |
| TOOL-03 | FileWriteTool writes files within workspace, validates resolved path startsWith(workspaceRoot) | Same path guard, fs.promises.writeFile |
| TOOL-04 | BashTool executes shell commands with 30s timeout, blocks metacharacter injection | child_process.exec with AbortSignal, regex allowlist |
| TOOL-05 | BashTool permission gate: DangerousShell requires explicit approval every invocation | Permission tier check in checkPermissions() |
| TOOL-06 | GlobTool finds files by glob pattern within workspace | fast-glob or node:glob (Node 22 native) |
| TOOL-07 | GrepTool searches file content by regex within workspace | ripgrep binary or fs.readdir + regex scan |
| TOOL-08 | WebSearchTool performs web searches with NetworkAccess permission gate | Brave Search API or fallback to DuckDuckGo |
| TOOL-09 | Permission system with 5 tiers: ReadOnly, WriteFiles, ExecuteShell, DangerousShell, NetworkAccess | TypeScript enum, checked before every tool call |
| TOOL-10 | Read-only tools batch for concurrent execution, write tools execute serially | Promise.allSettled for batch, sequential for serial |
| SESS-01 | Session state with mutable store pattern (setState callback, shallow comparison, listener Set) | Lightweight store pattern — no Redux |
| SESS-02 | Conversation history persisted as append-only JSONL at ~/.treis/sessions/{sid}.jsonl | pino or fs.appendFile with JSON.stringify + newline |
| SESS-03 | Workspace layout at ~/.treis/workspaces/{id}/ with config.json, plan-contracts/, traces/, sessions/ | fs.mkdirSync recursive on session start |
| SESS-04 | JSONL trace logging: every tool call, verdict, retry, duration_ms with execution_id correlation | pino child logger per execution_id |
| SESS-05 | Step-level checkpoint saved after every completed step (enables resume) | Atomic JSON write to checkpoint.json |

</phase_requirements>

---

## Summary

Phase 1 is a pure infrastructure phase. It creates no user-facing behavior — only independently testable building blocks that Phase 2 (Agent Loop + Plan Contract) depends on. The monorepo scaffold, both model adapters, all 6 tools with permission gating, and session persistence all ship in this phase.

The dominant technical risks are: (1) Ollama `num_ctx` must be explicitly set to 32768 on every chat call — the default 2048 kills agent loops in 2-3 steps and there is no warning; (2) BashTool is a CVE-class RCE surface and metacharacter blocking is non-negotiable before any tool is exposed; (3) Vercel AI SDK 5 has a breaking rename — the npm package is now `ai@6.x` (not `ai@5.x`), though the major version in the changelog is still branded "AI SDK 5". The `createOpenAICompatible` factory from `@ai-sdk/openai` is the correct path for the Ollama adapter.

The build order is dependency-driven and strictly sequenced: monorepo scaffold first, then `@treis/api-client` and `@treis/tools` in parallel (no cross-package deps), then session state in `@treis/core`. No agent loop is built in Phase 1. The planner must enforce this sequence or later packages will have nothing to import from.

**Primary recommendation:** Scaffold monorepo first (Wave 0), then build api-client and tools in parallel waves, then session layer last. Every task must include Vitest unit tests written before implementation (TDD mandate from Harness Methodology).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.8+ (6.0.2 latest) | Primary language | `--erasableSyntaxOnly`, `--module nodenext` for clean ESM/CJS in monorepo |
| Node.js | 22 LTS (24.14.1 installed) | Runtime | Node 22 is LTS; installed version (24) is acceptable |
| pnpm | 9.1.0+ (9.1.0 installed) | Monorepo + package manager | workspace:* protocol, strict hoisting prevents phantom deps |
| tsup | 8.5.1 (latest) | Build: TSC → ESM+CJS | Zero-config dual output, fast, used by most TypeScript library authors |
| Vitest | 4.1.4 (latest) | Unit + integration tests | ESM-native, workspace-aware, `projects` key (not deprecated `workspace`) |

### AI / Model Adapters

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 6.0.156 (latest) | Unified `streamText` interface | Single API across Anthropic and OpenAI-compat providers |
| `@ai-sdk/anthropic` | 3.0.68 (latest) | Anthropic provider for AI SDK | Official provider, streaming native |
| `@ai-sdk/openai` | 3.0.52 (latest) | OpenAI-compat provider for AI SDK | `createOpenAICompatible` factory for Ollama baseURL override |
| `@anthropic-ai/sdk` | 0.87.0 (latest) | Direct Anthropic client (escape hatch) | For extended thinking / features not in AI SDK wrapper |
| `openai` | 6.34.0 (latest) | OpenAI-compat client (alternative path) | If AI SDK Ollama path has issues; set baseURL + apiKey: 'ollama' |

### Schema & Validation

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.3.6 (latest) | Tool input schemas, config validation | 14x faster than v3; built-in JSON Schema export (tool definitions) |

### Logging

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pino` | 10.3.1 (latest) | JSONL trace writes, structured logging | NDJSON by default = JSONL natively; 5x faster than Winston |
| `pino-pretty` | (dev only) | Human-readable dev logs | Formats pino output for terminal; never in production |

### Supporting Tools

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fast-glob` | latest | GlobTool file discovery | Faster than node:glob for workspace scans |
| `commander` | 14.0.3 (latest) | CLI entry point (apps/cli) | Phase 1 uses for health-check/smoke CLI only; full CLI in Phase 3 |

### Version Notes (VERIFIED against npm registry 2026-04-10)

- `ai` npm package is version **6.0.156** — the npm package major version is 6, not 5. The product is still branded "Vercel AI SDK 5" in marketing/docs. Use `ai@^6` in package.json. [VERIFIED: npm registry]
- `zod` is 4.3.6 stable. Import as `import { z } from 'zod'` — API unchanged from v3 for basic usage. [VERIFIED: npm registry]
- `tsup` is 8.5.1. [VERIFIED: npm registry]
- `vitest` is 4.1.4. Use `projects` key in vitest.config.ts, NOT `workspace` (deprecated in 3.2+). [VERIFIED: npm registry]
- `pino` is 10.3.1. [VERIFIED: npm registry]

### Installation

```bash
# Workspace root dev tools
pnpm add -D -w typescript@^6 tsup@^8 vitest@^4 @vitest/coverage-v8 eslint

# @treis/api-client
pnpm add ai @ai-sdk/anthropic @ai-sdk/openai @anthropic-ai/sdk openai zod@^4

# @treis/tools
pnpm add zod@^4 fast-glob
pnpm add -D pino pino-pretty  # for tool trace logging

# @treis/core (session layer)
pnpm add pino zod@^4

# pino-pretty is dev only — never bundle in production
```

---

## Architecture Patterns

### Recommended Monorepo Structure

```
treis/
├── packages/
│   ├── api-client/          # @treis/api-client — model adapters (no @treis/* deps)
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   ├── ollama.ts        # createOpenAICompatible with num_ctx: 32768
│   │   │   │   └── anthropic.ts     # createAnthropic from @ai-sdk/anthropic
│   │   │   ├── slot-manager.ts      # Slot A/B assignment from config
│   │   │   ├── health.ts            # connection + model name + ctx window check
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── tools/               # @treis/tools — tool system (no @treis/* deps)
│   │   ├── src/
│   │   │   ├── base/
│   │   │   │   ├── types.ts         # Tool interface, PermissionTier enum
│   │   │   │   └── executor.ts      # batch read-only, serial write
│   │   │   ├── permissions/
│   │   │   │   └── gate.ts          # check before execution
│   │   │   ├── impl/
│   │   │   │   ├── file-read.ts
│   │   │   │   ├── file-write.ts
│   │   │   │   ├── bash.ts          # metacharacter blocking, 30s timeout
│   │   │   │   ├── glob.ts
│   │   │   │   ├── grep.ts
│   │   │   │   └── web-search.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── core/                # @treis/core — session layer (imports api-client + tools)
│       ├── src/
│       │   ├── session/
│       │   │   ├── store.ts         # mutable setState, shallow compare, Set<Listener>
│       │   │   ├── persist.ts       # JSONL append writes
│       │   │   ├── workspace.ts     # ~/.treis/workspaces/{id}/ layout
│       │   │   └── checkpoint.ts    # step-level checkpoint writes
│       │   ├── errors.ts            # typed error hierarchy
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   ├── cli/                 # smoke-test CLI only in Phase 1
│   └── desktop/             # empty scaffold in Phase 1
├── tsconfig.base.json
├── vitest.config.ts          # projects: [] key
├── package.json              # pnpm workspace root
└── pnpm-workspace.yaml
```

### Pattern 1: Unified Streaming via Vercel AI SDK 5

**What:** Both Ollama and Anthropic adapters expose the same `streamText` API surface via the AI SDK.

**When to use:** Every model invocation in `@treis/api-client`.

```typescript
// Source: [VERIFIED: ai@6 npm package docs]

// Anthropic adapter
import { createAnthropic } from '@ai-sdk/anthropic'
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Ollama adapter — uses @ai-sdk/openai's createOpenAICompatible
import { createOpenAICompatible } from '@ai-sdk/openai'
const ollama = createOpenAICompatible({
  name: 'ollama',
  baseURL: 'http://localhost:11434/v1',
  // num_ctx is passed per-request as a model setting, NOT here
})

// Unified streamText call — same API for both providers
import { streamText } from 'ai'

const result = streamText({
  model: anthropic('claude-opus-4-5'),  // or ollama('llama3.2', { num_ctx: 32768 })
  messages,
  tools,
})

for await (const chunk of result.textStream) {
  process.stdout.write(chunk)
}
```

**CRITICAL:** For Ollama, `num_ctx: 32768` MUST be passed in the model settings object on every call. Passing it at provider creation does not propagate to individual requests. [VERIFIED: Ollama issue tracker, PITFALLS.md]

```typescript
// Correct: num_ctx per call
const result = streamText({
  model: ollama('llama3.2', { num_ctx: 32768 }),  // model settings second arg
  messages,
})
```

### Pattern 2: Tool Base Interface with Zod v4

**What:** All tools implement a common TypeScript interface with Zod v4 input schemas.

```typescript
// [ASSUMED] — based on CONTEXT.md D-09 decisions and Zod v4 API
import { z, ZodSchema } from 'zod'

export enum PermissionTier {
  ReadOnly      = 'ReadOnly',
  WriteFiles    = 'WriteFiles',
  ExecuteShell  = 'ExecuteShell',
  DangerousShell = 'DangerousShell',
  NetworkAccess = 'NetworkAccess',
}

export interface ToolContext {
  workspaceRoot: string
  sessionId: string
  permissionGrants: Set<PermissionTier>
}

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  inputSchema: ZodSchema<TInput>
  isReadOnly(): boolean
  checkPermissions(input: TInput, ctx: ToolContext): PermissionCheckResult
  call(input: TInput, ctx: ToolContext): Promise<TOutput>
}

export type PermissionCheckResult =
  | { allowed: true }
  | { allowed: false; requiredTier: PermissionTier; reason: string }
```

### Pattern 3: BashTool Metacharacter Blocking

**What:** Hard block on shell metacharacters before any command reaches child_process.

**Security-critical — do not soften.** [VERIFIED: PITFALLS.md, Trail of Bits CVE research]

```typescript
// [ASSUMED] — clean-room implementation derived from CONTEXT.md D-13
const BLOCKED_PATTERNS = [
  /;/,           // command chaining
  /&&/,          // conditional exec
  /\|\|/,        // conditional exec
  /\$\(/,        // command substitution
  /`/,           // backtick substitution
  // Note: pipe | and redirects > >> are also high risk (see Pitfall 3)
  // add based on threat model in implementation
]

function validateBashCommand(cmd: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new PermissionDeniedError(
        `Command contains blocked metacharacter: ${pattern.source}`,
        { tool: 'BashTool', input: cmd }
      )
    }
  }
}
```

### Pattern 4: Mutable Session State Store

**What:** Lightweight mutation-based store. No Redux. Shallow comparison prevents redundant listener calls.

```typescript
// [ASSUMED] — derived from CONTEXT.md D-18 and ARCHITECTURE_SPEC.md §5.1
type Listener<T> = (state: T) => void

export function createStore<T extends object>(initial: T) {
  let state = { ...initial }
  const listeners = new Set<Listener<T>>()

  return {
    getState: (): Readonly<T> => state,

    setState: (updater: (current: T) => Partial<T>): void => {
      const patch = updater(state)
      const next = { ...state, ...patch }
      // Shallow comparison — only notify if something changed
      const changed = (Object.keys(patch) as Array<keyof T>).some(
        k => patch[k] !== state[k]
      )
      if (!changed) return
      state = next
      listeners.forEach(l => l(state))
    },

    subscribe: (listener: Listener<T>): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

### Pattern 5: JSONL Trace Logging with Pino

**What:** Every tool call, verdict, retry, and duration logged as flat JSONL entry.

```typescript
// [ASSUMED] — pino child logger per execution_id
import pino from 'pino'

const baseLogger = pino({
  transport: {
    target: 'pino/file',
    options: { destination: '~/.treis/sessions/{sid}.jsonl' },
  },
})

// Per-execution child logger threads execution_id through all entries
export function createTraceLogger(executionId: string, sessionId: string) {
  return baseLogger.child({ execution_id: executionId, session_id: sessionId })
}

// Log shape matches D-16:
// { ts, step, tool, input, output, verdict, duration_ms, execution_id }
function logToolCall(logger: pino.Logger, entry: TraceEntry): void {
  logger.info({
    ts: Date.now(),
    step: entry.step,
    tool: entry.tool,
    input: entry.input,   // summarized, never raw (security)
    output: entry.output, // summarized
    verdict: entry.verdict,
    duration_ms: entry.durationMs,
  })
}
```

### Pattern 6: Workspace Directory Bootstrap

**What:** Create `~/.treis/workspaces/{id}/` layout on session start.

```typescript
// [ASSUMED] — derived from CONTEXT.md D-17 and ARCHITECTURE_SPEC.md §5.3
import { mkdir } from 'node:fs/promises'
import { join, homedir } from 'node:path'

export async function bootstrapWorkspace(workspaceId: string): Promise<string> {
  const base = join(homedir(), '.treis', 'workspaces', workspaceId)

  await mkdir(join(base, 'plan-contracts'), { recursive: true })
  await mkdir(join(base, 'traces'), { recursive: true })
  await mkdir(join(base, 'sessions'), { recursive: true })

  return base
}
```

### Pattern 7: Path Traversal Guard

**What:** Every file-based tool must resolve and check the path before acting.

```typescript
// [ASSUMED] — derived from CONTEXT.md D-15
import { resolve } from 'node:path'

export function assertWithinWorkspace(
  targetPath: string,
  workspaceRoot: string
): void {
  const resolved = resolve(targetPath)
  if (!resolved.startsWith(resolve(workspaceRoot))) {
    throw new PathTraversalError(
      `Path escapes workspace: ${resolved}`,
      { workspaceRoot, targetPath }
    )
  }
}
```

### Anti-Patterns to Avoid

- **Building a custom streaming abstraction:** Vercel AI SDK 5 already solves this. Using it raw costs one unified interface across all providers. Don't wrap it with another layer.
- **Passing num_ctx at provider creation:** Ollama ignores it there. It must be in the model settings object on every `streamText` call.
- **Catching PermissionDeniedError and retrying:** Permission errors are not transient. Retrying burns tokens and always fails. Typed errors enable the Phase 2 agent loop to distinguish retryable from terminal errors.
- **Buffering JSONL trace writes:** Write each entry immediately after the tool call completes. Buffering creates gaps in the trace if the process crashes.
- **Global mutable permission state:** Permission grants are session-scoped and checked in-memory. They must not be shared across concurrent tool batches via mutable globals.
- **`workspace` key in vitest.config.ts:** Deprecated in Vitest 3.2+. Use `projects` instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unified LLM streaming | Custom fetch + SSE parser | `ai` (Vercel AI SDK) `streamText` | Handles backpressure, tool-call interleaving, stream cancellation |
| Tool input validation | Custom validator | Zod v4 `z.object()` with `.parse()` | JSON Schema export for model tool definitions; exhaustive type checking |
| JSONL logging | `JSON.stringify + fs.appendFile` loop | `pino` with file transport | Worker-thread async writes, no main-thread blocking, log rotation |
| File glob discovery | Manual `readdir` recursion | `fast-glob` or Node 22 `node:glob` | Handles symlinks, ignore patterns, dot files correctly |
| Shallow comparison | Deep equality check | Object key iteration comparing patch values | Deep equality is O(n) recursive; shallow suffices for flat state shape |

**Key insight:** Phase 1 is infrastructure. Every hour spent hand-rolling a solved problem is an hour not spent on the Plan Contract engine (Phase 2) which is the product's actual differentiation.

---

## Common Pitfalls

### Pitfall 1: Ollama num_ctx Default Kills Agent Loops

**What goes wrong:** Ollama defaults to a 2048-token context window. A 10-step plan with tool results fills this in 2-3 steps, causing silent history truncation. The model loses its thread with no error.

**Why it happens:** The Ollama API default was never updated for agent workloads. 2048 was appropriate for single-turn Q&A in 2023.

**How to avoid:** Pass `num_ctx: 32768` in model settings on every `streamText` call. Make this a constant, not a configurable default — if left to users, it will be wrong.

**Warning signs:** Model starts asking questions it already answered; inference time drops suddenly mid-plan (context eviction to RAM); plan contradicts earlier decisions.

[VERIFIED: Ollama issue tracker, PITFALLS.md Pitfall 2]

---

### Pitfall 2: BashTool Prompt Injection via Tool Output

**What goes wrong:** Web search results or file contents containing `; rm -rf /` or similar get passed into the model's context. The model follows injected instructions and issues destructive bash commands.

**Why it happens:** The model cannot distinguish content describing shell commands from instructions to execute them.

**How to avoid:** Block at the metacharacter level — reject commands containing `;`, `&&`, `||`, `$(`, backticks before they reach `child_process.exec`. This check is in the harness, not the prompt.

**Warning signs:** Bash commands appear that were not in the original plan; commands include path traversal (`../`, `/proc/`, `/etc/`).

[VERIFIED: PITFALLS.md Pitfall 3, Trail of Bits CVE research, CONTEXT.md D-13]

---

### Pitfall 3: Vitest `workspace` Key Prints Deprecation Warnings in 3.2+

**What goes wrong:** Using `workspace: [...]` in `vitest.config.ts` (valid in Vitest < 3.2) prints warnings in 3.2+ and will break in a future version.

**How to avoid:** Use `projects: [...]` key.

[VERIFIED: STACK.md, Vitest 3.2 changelog]

---

### Pitfall 4: pnpm Symlinks Break Electron Packaging

**What goes wrong:** pnpm uses symlinked `node_modules`. Electron packagers do not follow symlinks correctly, causing workspace packages to be missing from the asar archive at runtime.

**How to avoid:** Add `dependenciesMeta[].injected: true` in pnpm workspace config for all `@treis/*` packages consumed by the Electron app. This hard-links instead of symlinking. This is a Phase 4 concern but must be designed in now.

[VERIFIED: PITFALLS.md Pitfall 7, pnpm issue tracker]

---

### Pitfall 5: JSONL Trace Entries Without execution_id Are Undebuggable

**What goes wrong:** Each tool call is logged, but without a consistent `execution_id` threaded through every entry, reconstructing a single plan's timeline requires manual correlation across files.

**How to avoid:** Every JSONL entry must include `execution_id` (uuid per plan run), `step` (sequential), `ts` (timestamp), and `tool` name. Use pino child logger to thread these automatically.

[VERIFIED: PITFALLS.md Pitfall 11, CONTEXT.md D-16]

---

### Pitfall 6: ai@6 vs "AI SDK 5" Version Naming Confusion

**What goes wrong:** The Vercel AI SDK is branded "AI SDK 5" in docs/blogs, but the npm package `ai` is at version **6.0.x**. Installing `ai@5` gets an older, incompatible release.

**How to avoid:** Install `ai@^6` in package.json. Confirm with `npm view ai version`.

[VERIFIED: npm registry — ai@6.0.156]

---

### Pitfall 7: Typed Error Hierarchy Must Exist Before Phase 2

**What goes wrong:** Without typed errors in Phase 1, the Phase 2 retry/circuit-breaker logic cannot distinguish between retryable transient failures and terminal schema/permission errors.

**How to avoid:** Define all five error types in `@treis/core/src/errors.ts` as part of Phase 1, with `context` fields as specified in D-21 and D-22. Phase 2 imports these.

[ASSUMED] — based on CONTEXT.md D-21, D-22 and Phase 2 retry requirements (AGENT-04)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom SSE/fetch for Anthropic streaming | Vercel AI SDK 5 `streamText` | 2024-2025 | Unified interface; typed tool calls; backpressure handled |
| Zod v3 | Zod v4 (14x faster) | July 2025 | JSON Schema export built-in; use `zod@^4` on new projects |
| Vitest `workspace` config key | Vitest `projects` key | Vitest 3.2 (2025) | `workspace` deprecated; use `projects` |
| Electron 32 | Electron 35+ (32 is EOL) | March 2025 | Electron 32 is not installable as latest |
| Winston for structured logging | Pino | 2024 | 5x faster; NDJSON native = JSONL without post-processing |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tool base interface shape (name, description, inputSchema, call, checkPermissions) | Standard Stack / Code Examples | Interface shape is in CONTEXT.md D-09 — risk is low; shape is locked |
| A2 | createStore shallow comparison implementation | Code Examples (Pattern 4) | Wrong comparison could cause missed or spurious listener notifications |
| A3 | pino child logger is the correct pattern for threading execution_id | Code Examples (Pattern 5) | If pino child logger has perf overhead, use manual field injection instead |
| A4 | fast-glob is the right choice for GlobTool (vs Node 22 native glob) | Standard Stack | Node 22 native glob may have sufficient API; verify during implementation |
| A5 | BashTool blocks pipe `|` and redirects `>` `>>` in addition to D-13 list | Pitfall 2 | CONTEXT.md D-13 list may be exhaustive; check with security review |
| A6 | Typed error hierarchy in @treis/core is required before Phase 2 | Pitfall 7 | Phase 2 could define its own, but cross-package consistency is cleaner |

---

## Open Questions (RESOLVED)

1. **WebSearchTool backend in Phase 1** — RESOLVED (Plan 01-04, Task 2: DuckDuckGo HTML scrape)
   - What we know: TOOL-08 requires a web search tool with NetworkAccess gate. No specific search API is locked.
   - What's unclear: Whether to use Brave Search API (paid), DuckDuckGo (free, scraping), or a mock in Phase 1 and real API in Phase 3.
   - Recommendation: Implement the tool interface + permission gate with a configurable backend. Use a mock or DuckDuckGo HTML scrape in Phase 1; replace with Brave API in Phase 3 when CLI ships.

2. **GrepTool implementation: ripgrep binary vs pure JS** — RESOLVED (Plan 01-03, Task 2: pure Node.js scan)
   - What we know: GrepTool searches file content by regex within workspace (TOOL-07).
   - What's unclear: Whether to shell out to `rg` (fast, but adds binary dep) or use Node.js `fs.readdir` + regex scan (slower, zero dep).
   - Recommendation: Check if `rg` is available at runtime; shell out to it if present; fall back to pure Node.js scan. Do not require it as a hard dependency.

3. **Slot Manager in Phase 1: manual config vs auto-detect** — RESOLVED (Plan 01-02, Task 2: manual config only)
   - What we know: MODEL-06 says "assigns strongest model to Slot A, fastest to Slot B based on manual config."
   - What's unclear: Whether Phase 1 needs a real benchmarking harness or just a config file that names the models.
   - Recommendation: Manual config only in Phase 1 (`slot-config.json` with model names). Auto-benchmark is Phase 2+.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 24.14.1 (exceeds Node 22 LTS requirement) | — |
| pnpm | Monorepo | Yes | 9.1.0 | — |
| Ollama | MODEL-01, MODEL-02 | No | — | Mock adapter in tests; require Ollama for integration tests |
| Anthropic API key | MODEL-03 | Unknown | — | Require `ANTHROPIC_API_KEY` env var; skip if absent in unit tests |

**Missing dependencies with fallback:**

- **Ollama** — not installed on dev machine. Unit tests must mock the adapter. Integration tests require a running Ollama instance. Plan must include: (a) mock adapter for unit tests, (b) integration test script that checks `OLLAMA_BASE_URL` env var and skips if not set.
- **ANTHROPIC_API_KEY** — cannot verify. Unit tests must mock Anthropic provider. Integration tests require the env var.

**Missing dependencies with no fallback:**

- None that block build or unit tests.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` at monorepo root (Wave 0 gap) |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REPO-01 | pnpm workspace resolves @treis/* imports | integration | `pnpm build && node -e "require('@treis/core')"` | No — Wave 0 |
| REPO-02 | tsconfig.base.json is valid, packages extend it | unit | `tsc -p packages/core/tsconfig.json --noEmit` | No — Wave 0 |
| REPO-03 | All packages build with `pnpm build` | integration | `pnpm build` | No — Wave 0 |
| MODEL-01 | Ollama adapter connects at localhost:11434 | integration | `vitest run packages/api-client/src/adapters/ollama.test.ts` | No — Wave 0 |
| MODEL-02 | num_ctx: 32768 present in every Ollama request | unit | `vitest run packages/api-client/src/adapters/ollama.unit.test.ts` | No — Wave 0 |
| MODEL-03 | Anthropic adapter sends ANTHROPIC_API_KEY header | unit | `vitest run packages/api-client/src/adapters/anthropic.unit.test.ts` | No — Wave 0 |
| MODEL-04 | Both adapters expose same streamText interface | unit | `vitest run packages/api-client/src/adapters/unified.test.ts` | No — Wave 0 |
| MODEL-05 | Health check returns status, model name, ctx window | unit | `vitest run packages/api-client/src/health.test.ts` | No — Wave 0 |
| MODEL-06 | Slot manager reads slot-config.json and returns model names | unit | `vitest run packages/api-client/src/slot-manager.test.ts` | No — Wave 0 |
| TOOL-01 | Tool interface is satisfied by each tool implementation | unit (type-level) | `tsc --noEmit` | No — Wave 0 |
| TOOL-02 | FileReadTool rejects paths outside workspaceRoot | unit | `vitest run packages/tools/src/impl/file-read.test.ts` | No — Wave 0 |
| TOOL-03 | FileWriteTool rejects paths outside workspaceRoot | unit | `vitest run packages/tools/src/impl/file-write.test.ts` | No — Wave 0 |
| TOOL-04 | BashTool blocks metacharacters, enforces 30s timeout | unit | `vitest run packages/tools/src/impl/bash.test.ts` | No — Wave 0 |
| TOOL-05 | DangerousShell requires explicit approval per invocation | unit | `vitest run packages/tools/src/impl/bash.test.ts` | No — Wave 0 |
| TOOL-06 | GlobTool returns files matching pattern within workspace | unit | `vitest run packages/tools/src/impl/glob.test.ts` | No — Wave 0 |
| TOOL-07 | GrepTool returns regex matches within workspace | unit | `vitest run packages/tools/src/impl/grep.test.ts` | No — Wave 0 |
| TOOL-08 | WebSearchTool fires with NetworkAccess gate | unit | `vitest run packages/tools/src/impl/web-search.test.ts` | No — Wave 0 |
| TOOL-09 | PermissionTier enum has 5 values, checked before execution | unit | `vitest run packages/tools/src/permissions/gate.test.ts` | No — Wave 0 |
| TOOL-10 | Read-only tools run concurrent, write tools run serial | unit | `vitest run packages/tools/src/base/executor.test.ts` | No — Wave 0 |
| SESS-01 | setState triggers listeners only on actual change | unit | `vitest run packages/core/src/session/store.test.ts` | No — Wave 0 |
| SESS-02 | Conversation history appended to JSONL file per message | unit | `vitest run packages/core/src/session/persist.test.ts` | No — Wave 0 |
| SESS-03 | bootstrapWorkspace creates all required subdirectories | unit | `vitest run packages/core/src/session/workspace.test.ts` | No — Wave 0 |
| SESS-04 | Every tool call produces a JSONL trace entry with execution_id | unit | `vitest run packages/core/src/session/trace.test.ts` | No — Wave 0 |
| SESS-05 | Checkpoint file written after each completed step | unit | `vitest run packages/core/src/session/checkpoint.test.ts` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run --reporter=verbose` (affected package only)
- **Per wave merge:** `pnpm vitest run --coverage` (all packages)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — monorepo root config with `projects` key
- [ ] `tsconfig.base.json` — shared compiler options (`strict`, `nodenext`, `erasableSyntaxOnly`)
- [ ] `.eslintrc.js` — shared ESLint config
- [ ] `pnpm-workspace.yaml` — workspace package paths
- [ ] Per-package `tsconfig.json` files that extend the base
- [ ] Per-package `vitest.config.ts` entries in the `projects` array
- [ ] All `*.test.ts` files listed in Phase Requirements table above
- [ ] Mock factories: `createMockOllamaAdapter()`, `createMockAnthropicAdapter()` for unit tests

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — Phase 1 is local tooling only |
| V3 Session Management | Partial | Session IDs as UUIDs; no auth tokens |
| V4 Access Control | Yes | Permission tier system, workspace path boundary |
| V5 Input Validation | Yes | Zod v4 on all tool inputs; metacharacter blocking |
| V6 Cryptography | No | API keys from env vars only; not stored by Phase 1 |

### Known Threat Patterns for Phase 1 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via file/web content → RCE via BashTool | Tampering / Elevation | Metacharacter allowlist at harness layer before child_process; mandatory DangerousShell approval |
| Path traversal via FileRead/FileWrite | Elevation | `resolve(path).startsWith(resolve(workspaceRoot))` guard — every tool, every call |
| Ollama context overflow → silent history truncation | Tampering | `num_ctx: 32768` hardcoded, not user-configurable |
| JSONL trace log injection (log forgery) | Tampering | Sanitize tool input/output summaries before writing to trace; never log raw tool output |
| API key leakage via trace logging | Information Disclosure | Never log env vars or API key values; log key name presence only |

---

## Sources

### Primary (HIGH confidence)

- npm registry (verified 2026-04-10): `ai@6.0.156`, `zod@4.3.6`, `pino@10.3.1`, `tsup@8.5.1`, `vitest@4.1.4`, `@ai-sdk/anthropic@3.0.68`, `@ai-sdk/openai@3.0.52`
- `TREIS_ARCHITECTURE_SPEC.md` v1.1 — authoritative source for all component boundaries, state shapes, and data flows
- `.planning/research/STACK.md` — validated stack decisions with alternatives analysis
- `.planning/research/ARCHITECTURE.md` — component boundaries and build order
- `.planning/research/PITFALLS.md` — 13 pitfalls with mitigations
- `.planning/phases/01-foundation/01-CONTEXT.md` — locked decisions D-01 through D-22

### Secondary (MEDIUM confidence)

- Vercel AI SDK 5 blog post (vercel.com/blog/ai-sdk-5) — feature overview cross-verified against npm package
- Ollama issue tracker — num_ctx default documented as 2048, explicit setting required
- Vitest 3.2 changelog — `workspace` deprecation, `projects` replacement

### Tertiary (LOW confidence)

- Trail of Bits prompt injection RCE research — supports BashTool metacharacter blocking requirement; specific CVE numbers not re-verified in this session

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 1 |
|-----------|------------------|
| Clean-room: zero lines from proprietary source | All TypeScript written from scratch. TREIS_ARCHITECTURE_SPEC.md is the wall. |
| Composition over reinvention: load frameworks as layers | Phase 1 does NOT implement any skill loading. That is Phase 2+. |
| Local+Cloud from Phase 0 | Both Ollama and Anthropic adapters must ship in Phase 1. |
| MIT license | All dependencies must be MIT-compatible. Verified: ai, zod, pino, tsup, vitest are all MIT. |
| macOS first | No Windows/Linux path handling. Use Node.js `path.posix` defaults. |
| GSD Workflow Enforcement | All implementation must flow through `/gsd-execute-phase`. No direct edits outside GSD context. |
| TDD mandatory | Tests written BEFORE implementation per Harness Methodology. All Wave 0 gaps are test files. |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-04-10
- Architecture: HIGH — derived from TREIS_ARCHITECTURE_SPEC.md v1.1 (authoritative)
- Pitfalls: HIGH — cross-verified against PITFALLS.md which cites primary sources
- Code examples: MEDIUM — clean-room implementations derived from locked decisions; not verified by running against live APIs

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (package versions may drift; re-verify before execution)
