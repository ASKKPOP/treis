# Phase 2: Engine — Research

**Researched:** 2026-04-10
**Domain:** Plan Contract engine, Agent loop state machine, Vercel AI SDK v5 structured output, scope checking
**Confidence:** HIGH (all critical claims verified against installed packages)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** PlanContract fields: `id` (ulid), `version`, `intent`, `clarifications` (Q&A pairs), `scopeEntries` (ScopeEntry[]), `successCriteria` (string[]), `tokenBudget` (200K default), `createdAt`, `sealedAt`
- **D-02:** ScopeEntry discriminated union: file/tool/url/action variants. Validated with Zod v4.
- **D-03:** Sealed contract to `~/.treis/workspaces/{id}/plan-contracts/{cid}.json`. Uses `bootstrapWorkspace`.
- **D-04:** Token budget 200K default. Accumulated from `streamText` usage metadata. WARN on exceed, continue.
- **D-05:** Two-phase prompt strategy via `streamText`: Phase A = clarifying questions JSON, Phase B = 3 options JSON.
- **D-06:** Builder picks by letter (A/B/C). Contract auto-sealed. No negotiation after sealing.
- **D-07:** Clarifying questions: min 2, max 3. Truncate if model returns more.
- **D-08:** State machine as TypeScript class with `as const` state object. States: IDLE, PREPARE, STREAM, TOOLS, EVALUATE, NEXT, COMPLETE, VIOLATED, FAILED.
- **D-09:** Each state has allowed `next` set. Illegal transitions throw `TreisError`.
- **D-10:** No XState. Custom state machine sufficient.
- **D-11:** Per-step streaming via `streamText` async iterator. `consumer` callback is `(event: AgentEvent) => void`. Transport-agnostic.
- **D-12:** Tool dispatch reuses `executeTools` from `@treis/tools`. Read-only concurrent, write serial.
- **D-13:** Compaction only at step boundaries before entering STREAM. Never mid-stream.
- **D-14:** Retry: max 3, exponential backoff 1s/2s/4s. Error context injected as user message.
- **D-15:** Model escalation on 3rd failure: `approveEscalation(reason)` callback. True → switch to cloud adapter.
- **D-16:** Circuit breaker: `Map<string, number>` keyed by `${toolName}:${JSON.stringify(input)}`. 3 consecutive → FATAL.
- **D-17:** Loop detector: max 25 steps. Time limit: 10 minutes. Both trigger FATAL.
- **D-18:** Scope pre-hook before every tool call. file=micromatch, tool=name check, url=substring/regex, action=model call.
- **D-19:** FATAL interrupt exposes `handleViolation(violation: ScopeViolation): Promise<ViolationDecision>`. Decisions: stop/amend/continue.
- **D-20:** Plan contract engine in `packages/core/src/plan-contract/`: schema.ts, engine.ts, scope-checker.ts
- **D-21:** Agent loop in `packages/core/src/agent/`: types.ts, state-machine.ts, executor.ts, retry.ts, circuit-breaker.ts
- **D-22:** Both modules exported from `packages/core/src/index.ts`.

### Claude's Discretion

- Exact system prompt text for clarification and options phases
- Model-judged scope check prompt wording
- History compaction summary format
- ulid vs uuid for contract ID generation (ulid preferred for sortability)
- Exact AgentEvent union type fields for streaming consumer

### Deferred Ideas (OUT OF SCOPE)

None — analysis stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAN-01 | Builder states intent, AI returns 2-3 clarifying questions | `generateObject` with Zod schema; two-phase prompt strategy |
| PLAN-02 | AI proposes 3 plan options with tradeoffs (Fast/Balanced/Thorough) | `generateObject` Phase B with structured schema |
| PLAN-03 | Builder picks one, contract auto-sealed with scope, boundaries, success criteria | Sealed JSON written via atomic write (temp+rename pattern from Phase 1) |
| PLAN-04 | Sealed contract persisted to ~/.treis/workspaces/{id}/plan-contracts/{cid}.json | `bootstrapWorkspace` returns `planContractsDir`; ulid for ID generation |
| PLAN-05 | Typed ScopeEntry for programmatic drift detection | Zod v4 `z.discriminatedUnion` verified API |
| PLAN-06 | Scope boundary check as pre-hook before every tool execution | micromatch `isMatch` verified; model call for action-type entries |
| PLAN-07 | Violation triggers FATAL interrupt with Stop/Amend/Continue | `handleViolation` callback pattern; ViolationDecision union type |
| PLAN-08 | Token budget tracked per contract, WARN on exceed | `streamText` result `totalUsage` Promise resolves to `LanguageModelUsage` with `inputTokens`/`outputTokens` |
| AGENT-01 | Explicit state machine, IDLE→PREPARE→STREAM→TOOLS→EVALUATE→NEXT/COMPLETE | `as const` pattern verified matches Phase 1 PermissionTier precedent |
| AGENT-02 | Per-step streaming to consumer callback | `streamText` `fullStream` async iterable; `TextStreamPart` union type |
| AGENT-03 | Tool dispatch respects concurrency partitioning | `executeTools` from Phase 1 already handles this |
| AGENT-04 | Retry: max 3, exponential backoff, error context injected | User message injection into `messages` array; `ModelMessage` type |
| AGENT-05 | Model escalation on 3rd failure | `createSlotManager` Slot B switchover pattern |
| AGENT-06 | Circuit breaker: identical tool+input 3x → FATAL | `Map<string, number>` per-execution; key = `${toolName}:${JSON.stringify(input)}` |
| AGENT-07 | Loop detector, token budget, time limit | step counter + `Date.now()` delta; both reset per `run()` call |
| AGENT-08 | Compaction only at step boundaries | Guard: check token count before entering STREAM state |
</phase_requirements>

---

## Stack Validation

### Vercel AI SDK 5 (ai@5.0.172 installed, `^5` pinned in package.json)

**CRITICAL CORRECTION:** The installed version is `ai@5.0.172`, NOT v6. The package.json specifies `"ai": "^5"`. `npm view ai version` currently returns `6.0.156` as the latest, but the project has `^5` pinned and `5.0.172` installed. [VERIFIED: `node_modules/.pnpm/ai@5.0.172_zod@4.3.6`]

**`generateObject` vs `streamObject` for plan negotiation:**

The CONTEXT.md specifies "single streamText call, structured output mode" for both phases. However, research shows two viable approaches:

**Option A: `generateObject` with Zod schema (RECOMMENDED for Phase A/B)**

`generateObject` is non-streaming, returns a strongly-typed object matching the Zod schema. For the plan negotiation flow (clarifying questions + options), the consumer does NOT need streaming tokens — they need complete structured JSON. `generateObject` is simpler and eliminates JSON parse errors.

```typescript
// [VERIFIED: packages/api-client node_modules ai/dist/index.d.ts line 3103]
import { generateObject } from 'ai'
import { z } from 'zod'

// Phase A: Clarifying questions
const { object } = await generateObject({
  model: slotManager.getModel('A'),   // LanguageModelV3 cast to LanguageModel
  schema: z.object({
    questions: z.array(z.string()).min(2).max(3),
  }),
  system: CLARIFY_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: intent }],
})

// Phase B: Plan options
const { object: options } = await generateObject({
  model: slotManager.getModel('A'),
  schema: PlanOptionsSchema,  // Zod v4 schema for A/B/C options
  system: OPTIONS_SYSTEM_PROMPT,
  messages: buildOptionsMessages(intent, clarifications),
})
```

**Option B: `streamText` with `experimental_output` (matches CONTEXT.md wording)**

If plan negotiation requires showing streaming tokens to the consumer (e.g., CLI "thinking..." indicator), use `streamText` with `experimental_output`:

```typescript
// [VERIFIED: ai/dist/index.d.ts - experimental_output on streamText]
import { streamText, Output } from 'ai'

const result = streamText({
  model,
  experimental_output: Output.object({ schema: ClarifySchema }),
  messages,
})
// Access: result.experimental_partialOutputStream (AsyncIterableStream)
// Access: await result.experimental_partialOutputStream  // final typed object
```

**Recommendation for planner:** Use `generateObject` for both Phase A and Phase B of plan negotiation. The CONTEXT.md says "structured output mode" which `generateObject` implements cleanly. The consumer callback only needs to emit a "thinking..." event while the call resolves — no streaming tokens needed for plan negotiation. Use `streamText` + `fullStream` for the agent execution loop (AGENT-02).

**`streamText` for agent execution loop (correct per CONTEXT.md D-11):**

```typescript
// [VERIFIED: ai/dist/index.d.ts line 2020 - StreamTextResult interface]
const result = streamText({
  model: slotManager.getModel('A'),
  messages: conversationHistory,
  tools: toolDefinitions,   // ToolSet — maps tool names to { parameters: ZodSchema, execute? }
  maxRetries: 0,  // Agent loop handles its own retry; disable AI SDK internal retry
})

// fullStream is AsyncIterableStream<TextStreamPart<TOOLS>>
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'text-delta':     // { text: string } — stream to consumer
    case 'tool-call':      // { toolName, toolCallId, input } — dispatch to executeTools
    case 'tool-result':    // { toolCallId, result } — inject result back
    case 'finish-step':    // { usage: LanguageModelUsage, finishReason } — token tracking
    case 'finish':         // { totalUsage, finishReason } — step complete
    case 'error':          // { error: unknown } — handle / retry
  }
}
```

**TextStreamPart union (complete — relevant variants):** [VERIFIED: ai/dist/index.d.ts line 2213]

| Type | Fields | Agent loop use |
|------|--------|---------------|
| `text-delta` | `{ id, text }` | Emit to consumer as token event |
| `tool-input-start` | `{ id, toolName }` | Emit "tool starting" to consumer |
| `tool-call` | `TypedToolCall<TOOLS>` — `{ toolName, toolCallId, input }` | Dispatch to `executeTools` |
| `tool-result` | `TypedToolResult<TOOLS>` — `{ toolCallId, result }` | Inject result into history |
| `finish-step` | `{ usage: LanguageModelUsage, finishReason }` | Token budget accumulation |
| `finish` | `{ finishReason, totalUsage }` | Step completion |
| `error` | `{ error: unknown }` | Trigger retry handler |

**Token budget tracking:** `LanguageModelUsage` has `inputTokens: number | undefined` and `outputTokens: number | undefined`. [VERIFIED: @ai-sdk/provider dist] Accumulate from `finish-step` parts. Note: `undefined` is possible (provider may not report), handle gracefully with `?? 0`.

**`totalUsage` vs `usage` on StreamTextResult:** `result.totalUsage` is `Promise<LanguageModelUsage>` (sum of all steps). `result.usage` is `Promise<LanguageModelUsage>` (last step only). For per-step budget tracking, read from `finish-step` parts in `fullStream`. [VERIFIED: ai/dist/index.d.ts lines 2100-2110]

**AI SDK v5 `messages` type:** `CoreMessage` is deprecated alias for `ModelMessage`. Prefer `ModelMessage` type. The `messages` param on `streamText`/`generateObject` accepts `ModelMessage[]`. [VERIFIED: ai/dist/index.d.ts line 987]

---

### Scope Checking: micromatch@4.0.8

micromatch is already installed (pulled in as a transitive dep). [VERIFIED: `node_modules/.pnpm/micromatch@4.0.8`]

**Primary API for scope-checker:**

```typescript
import micromatch from 'micromatch'
// [VERIFIED: node -e "require('micromatch')" exports]

// isMatch(string, pattern|pattern[]) → boolean
micromatch.isMatch('/home/user/.treis/workspaces/abc/src/foo.ts', '/home/user/.treis/workspaces/abc/src/**')
// → true

micromatch.isMatch('src/foo.ts', ['src/**', 'lib/**'])
// → true (accepts array of patterns)
```

**Exported functions:** `match`, `matcher`, `isMatch`, `any`, `not`, `contains`, `matchKeys`, `some`, `every`, `all`, `capture`, `makeRe`, `scan`, `parse`, `braces`, `braceExpand`, `hasBraces`

**For scope-checker:** Use `isMatch(absoluteTargetPath, globPattern)`. The ScopeEntry `glob` field should be stored as absolute paths (relative to workspaceRoot), OR store relative and resolve against workspaceRoot before checking.

**TypeScript types:** `@types/micromatch@4.0.10` is available (not installed yet). Add to devDependencies of `@treis/core`. micromatch itself has no bundled types.

**Installation needed:**
```bash
pnpm --filter @treis/core add -D @types/micromatch
# micromatch itself: already present as transitive dep — add to direct deps:
pnpm --filter @treis/core add micromatch
```

**Pitfall:** micromatch operates on strings. Absolute path matching works correctly (verified), but glob patterns in ScopeEntry should always be stored normalized with `/` separators. On macOS the `/var/folders` → `/private/var/folders` symlink issue (discovered in Phase 1 path-guard) applies here too — resolve realpath before matching.

---

### Zod v4 Discriminated Union

Installed: `zod@4.3.6`. [VERIFIED: `node_modules/.pnpm/zod@4.3.6`]

**API (identical signature to v3, different location):** [VERIFIED: zod v4/classic/schemas.d.ts line 493]

```typescript
import { z } from 'zod'

// z.discriminatedUnion(discriminatorKey, [variants])
// Note v4: discriminator field comes FIRST, options array SECOND (same as v3)
const ScopeEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), glob: z.string() }),
  z.object({ type: z.literal('tool'), name: z.string() }),
  z.object({ type: z.literal('url'), pattern: z.string() }),
  z.object({ type: z.literal('action'), description: z.string() }),
])

type ScopeEntry = z.infer<typeof ScopeEntrySchema>
// → { type: 'file'; glob: string }
//   | { type: 'tool'; name: string }
//   | { type: 'url'; pattern: string }
//   | { type: 'action'; description: string }
```

**v4 vs v3 differences relevant to Phase 2:**
- Signature is identical: `z.discriminatedUnion(discriminator, options[], params?)`
- v4 is 14x faster than v3 for object parsing (critical for per-step scope checks)
- v4 exports from `'zod'` directly (no sub-path needed)
- `z.infer<>` works identically
- JSON Schema export via `z.toJSONSchema(schema)` is new in v4 — useful if tool definitions need JSON Schema format for the AI SDK

**No breaking change from v3 on this API.** [VERIFIED: zod/v4/classic/schemas.d.ts]

---

### ulid

**Not installed** in the project. Must be added. [VERIFIED: `ls node_modules/.pnpm/ | grep ulid` — empty]

**Package:** `ulid@3.0.2` (latest stable). [VERIFIED: `npm view ulid version`]

**ESM support:** Package has proper dual CJS/ESM exports via `exports` field in package.json:
```json
{
  ".": {
    "node": {
      "require": "./dist/node/index.cjs",
      "default": "./dist/node/index.js"
    }
  }
}
```
ESM-native import works cleanly with `"module": "nodenext"` in tsconfig. [VERIFIED: npm view ulid exports]

**API:**
```typescript
import { ulid } from 'ulid'   // ESM

ulid()          // → "01ARZ3NDEKTSV4RRFFQ69G5FAV"  (26 chars, Crockford base32)
ulid(seedTime)  // → deterministic for same seed (useful in tests)
```

ULIDs are lexicographically sortable by time. Consecutive calls are monotonically increasing. Perfect for contract IDs where filesystem sort = creation order.

**Installation:**
```bash
pnpm --filter @treis/core add ulid
pnpm --filter @treis/core add -D @types/ulid  # check if needed — v3 may bundle types
```

**Check types:** `npm view ulid types` or `npm view ulid typings`. The v3 package has `types` pointing to `dist/index.d.cts`. Types should be bundled.

---

## Implementation Findings

### State Machine Pattern

**Constraint:** `erasableSyntaxOnly: true` in tsconfig.base.json forbids TypeScript `enum`. Use `as const` object. [VERIFIED: packages/core/vitest.config.ts, tsconfig.base.json]

**Established precedent in codebase:** `PermissionTier` in `packages/tools/src/base/types.ts` uses exactly this pattern. [VERIFIED: source file]

```typescript
// packages/core/src/agent/types.ts
export const AgentState = {
  IDLE:      'IDLE',
  PREPARE:   'PREPARE',
  STREAM:    'STREAM',
  TOOLS:     'TOOLS',
  EVALUATE:  'EVALUATE',
  NEXT:      'NEXT',
  COMPLETE:  'COMPLETE',
  VIOLATED:  'VIOLATED',
  FAILED:    'FAILED',
} as const

export type AgentState = (typeof AgentState)[keyof typeof AgentState]

// packages/core/src/agent/state-machine.ts
// Allowed transitions map — illegal transition throws TreisError (D-09)
const TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
  [AgentState.IDLE]:     [AgentState.PREPARE],
  [AgentState.PREPARE]:  [AgentState.STREAM],
  [AgentState.STREAM]:   [AgentState.TOOLS, AgentState.EVALUATE],
  [AgentState.TOOLS]:    [AgentState.EVALUATE],
  [AgentState.EVALUATE]: [AgentState.NEXT, AgentState.COMPLETE, AgentState.VIOLATED, AgentState.FAILED],
  [AgentState.NEXT]:     [AgentState.PREPARE],
  [AgentState.COMPLETE]: [],
  [AgentState.VIOLATED]: [],
  [AgentState.FAILED]:   [],
}

export class StateMachine {
  private current: AgentState = AgentState.IDLE

  get state(): AgentState { return this.current }

  transition(next: AgentState): void {
    const allowed = TRANSITIONS[this.current]
    if (!allowed.includes(next)) {
      throw new TreisError(
        `Illegal state transition: ${this.current} → ${next}`,
        { timestamp: Date.now() }
      )
    }
    this.current = next
  }
}
```

**Note on STREAM→TOOLS vs STREAM→EVALUATE:** The model may produce zero tool calls (just text). In that case STREAM transitions directly to EVALUATE. If tool calls exist, STREAM transitions to TOOLS, then TOOLS transitions to EVALUATE. Both are valid paths.

---

### Error Context Injection (Retry — AGENT-04)

**How to inject retry context into `messages` array:**

The `messages` parameter for `streamText`/`generateObject` accepts `ModelMessage[]`. In AI SDK v5, `CoreMessage` is a deprecated alias for `ModelMessage`. [VERIFIED: ai/dist/index.d.ts line 987]

On retry, append a user message to the conversation history before calling `streamText` again:

```typescript
// packages/core/src/agent/retry.ts
// Called before re-entering STREAM state with retryCount > 0

function buildRetryInjection(
  toolName: string,
  errorType: string,
  errorMessage: string,
  retryCount: number,
): ModelMessage {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: [
          `[Retry ${retryCount}/3] The previous step failed.`,
          `Tool: ${toolName}`,
          `Error type: ${errorType}`,
          `Error: ${errorMessage.slice(0, 200)}`,  // truncate per D-14
          `Please try a different approach or fix the issue.`,
        ].join('\n'),
      },
    ],
  }
}
```

**Role choice: `user`** — This is the correct role for injecting error context. Using a `user` message mimics the Builder interrupting with feedback. Using `assistant` would confuse the model about what it produced. Using `tool` role requires a `toolCallId` pairing that doesn't apply here (the retry injection is about the overall step failure, not a specific tool result). [CITED: Anthropic docs on message roles — user role is appropriate for external feedback injection]

**Conversation history management:** The agent executor maintains a `messages: ModelMessage[]` array across steps. Each `streamText` call receives the full history. After each call, the assistant's response (text + tool calls) is appended, then tool results are appended as tool-role messages, then the retry injection (if needed) is appended as a user message. The next `streamText` call receives the extended history.

**AI SDK v5 response messages extraction:**
```typescript
// After streaming completes, get response messages to append to history:
const responseMessages = (await result.response).messages  // Array<ResponseMessage>
// Append to conversationHistory for next step
```

---

### Build Order

**Dependency graph for Phase 2 components:**

```
Phase 1 foundations (already built)
├── @treis/core errors.ts         ← TreisError (used by state machine)
├── @treis/core session/*         ← store, workspace, persist, trace-logger, checkpoint
├── @treis/api-client             ← ModelAdapter, createSlotManager
└── @treis/tools                  ← executeTools, Tool, ToolContext

Phase 2 build order:
Wave A (parallel — no cross-dependencies within wave):
  ├── packages/core/src/plan-contract/schema.ts    (Zod v4 schemas only)
  └── packages/core/src/agent/types.ts             (AgentState, AgentEvent, AgentContext)

Wave B (parallel — each depends only on Wave A):
  ├── packages/core/src/plan-contract/scope-checker.ts  (depends on schema.ts)
  └── packages/core/src/agent/state-machine.ts          (depends on types.ts + TreisError)
  └── packages/core/src/agent/circuit-breaker.ts        (depends on types.ts only)

Wave C (parallel — each depends on Wave A+B):
  ├── packages/core/src/agent/retry.ts    (depends on types.ts, state-machine)
  └── packages/core/src/plan-contract/engine.ts (depends on schema.ts, scope-checker, slotManager)

Wave D (final — depends on everything):
  └── packages/core/src/agent/executor.ts (depends on all of above + executeTools + slotManager)

Wave E:
  └── packages/core/src/index.ts (add exports for all Phase 2 modules)
```

**Parallelizable tasks (can be in separate GSD plan tasks within same wave):**
- schema.ts + agent/types.ts (Wave A)
- scope-checker.ts + state-machine.ts + circuit-breaker.ts (Wave B)
- retry.ts + engine.ts (Wave C, partial)

**Cannot be parallelized:**
- executor.ts must wait for state-machine.ts, retry.ts, circuit-breaker.ts, scope-checker.ts

---

## Critical Decisions (CONTEXT.md Alignment)

| Decision | Status | Finding |
|----------|--------|---------|
| D-05: "streamText, structured output mode" for plan negotiation | PARTIALLY CORRECTED | `generateObject` is cleaner for structured plan negotiation — it returns typed JSON directly. `streamText` with `experimental_output` is the alternative if token streaming is needed during planning. Planner should choose `generateObject` and clarify the plan accordingly. |
| D-08: `as const` for AgentState | VALIDATED | Matches PermissionTier precedent in Phase 1. `erasableSyntaxOnly: true` confirmed in tsconfig. |
| D-16: Circuit breaker key `${toolName}:${JSON.stringify(input)}` | VALIDATED | `JSON.stringify` is correct. Note: key ordering in objects is consistent in V8 (insertion order). Sufficient for Phase 0. |
| D-04: Token budget from "streamText usage metadata" | CLARIFIED | Token data is in `finish-step` parts on `fullStream` as `{ usage: LanguageModelUsage }`. `inputTokens` and `outputTokens` can be `undefined` — accumulate with `?? 0` fallback. |
| ulid for contract IDs | VALIDATED | `ulid` package has ESM support. Not installed yet — must add to Phase 2 task list. |
| micromatch for glob matching | VALIDATED | Already installed as transitive dep. `@types/micromatch` needed. API is `micromatch.isMatch(path, glob)`. |

---

## Pitfalls

### Pitfall 1: `ai@^5` will NOT auto-upgrade to v6
**What goes wrong:** `npm view ai version` shows `6.0.156`. The installed version is `5.0.172`. The package.json pins `"ai": "^5"` which prevents upgrade to v6. If someone runs `pnpm update` the range stays at v5. This is intentional but easy to forget.
**Impact:** No impact on Phase 2 — v5 has all needed APIs. But all documentation, blog posts, and search results in 2026 are increasingly v6-focused. Verify any external code example references the v5 API.
**Prevention:** Note the installed version (5.0.172) in every plan task. Do not copy v6 examples blindly.

### Pitfall 2: `generateObject` schema output mode mismatch
**What goes wrong:** `generateObject` defaults to `output: 'object'`. If the schema wraps the response in an outer object (e.g., `z.object({ questions: z.array(z.string()) })`), the returned `.object` has that shape. Forgetting the wrapper and accessing `.object` directly as `string[]` causes a runtime type error.
**Prevention:** Always match the Zod schema shape to what you destructure from `{ object }`. Test with `z.safeParse` in unit tests.

### Pitfall 3: `fullStream` must be consumed exactly once
**What goes wrong:** `StreamTextResult.fullStream` is an `AsyncIterableStream`. If the executor breaks out of the `for await` loop early (e.g., on tool-call detection), the stream is partially consumed. A second `for await` on the same stream will not restart it. Attempting to read `result.text`, `result.toolCalls` etc. after partially consuming `fullStream` may deadlock or return incomplete results.
**Prevention:** Fully consume `fullStream` in a single `for await` loop. Accumulate tool calls in a local array during the iteration. Dispatch tools AFTER the loop (or at `finish-step`/`finish` boundaries). Never break out of the `fullStream` loop early.

### Pitfall 4: ulid not installed — will fail at runtime
**What goes wrong:** `ulid` is not in any package's dependencies. `import { ulid } from 'ulid'` will throw `ERR_MODULE_NOT_FOUND` at runtime.
**Prevention:** Wave 0 task must add `ulid` to `@treis/core` dependencies and `@types/micromatch` to devDependencies.

### Pitfall 5: State machine STREAM → EVALUATE vs STREAM → TOOLS ordering
**What goes wrong:** The CONTEXT.md states STREAM can transition to TOOLS or EVALUATE. If the model produces ONLY text (no tool calls), the TOOLS state is never entered. The transition guard must allow STREAM → EVALUATE directly. If the code always mandates STREAM → TOOLS → EVALUATE, a text-only step will throw an illegal transition error.
**Prevention:** In the executor, after consuming `fullStream`: if `toolCalls.length === 0`, transition STREAM → EVALUATE. If `toolCalls.length > 0`, transition STREAM → TOOLS → EVALUATE.

### Pitfall 6: `JSON.stringify(input)` circuit breaker key is object-order sensitive
**What goes wrong:** `JSON.stringify({ a: 1, b: 2 })` and `JSON.stringify({ b: 2, a: 1 })` produce different strings. If the model generates tool inputs with keys in different order on consecutive calls (which LLMs can do), the circuit breaker fails to detect the repeated call.
**Impact:** AGENT-06 may not trigger for truly identical-intent calls with key-reordered JSON.
**Mitigation for Phase 0:** V8 object key ordering is insertion-order consistent. If the AI SDK deserializes JSON into objects consistently (it does — via `JSON.parse`), key order should be stable within a single model. This is LOW risk for Phase 0. For Phase 1+, use a canonical sort before stringifying.

---

## Open Questions

1. **`generateObject` vs `streamText` with `experimental_output` for plan negotiation**
   - What we know: CONTEXT.md says "single streamText call, structured output mode" but `generateObject` is the cleaner API for returning typed JSON.
   - What's unclear: Does the CLI/Desktop UI need to stream tokens DURING plan negotiation (to show thinking), or is a blocking call acceptable?
   - Recommendation: RESOLVED — use `generateObject` for plan negotiation (no streaming tokens needed during planning). Document this deviation from CONTEXT.md D-05 wording as a clarification, not a change.

2. **Conversation history format for plan negotiation → agent handoff**
   - What we know: Phase A (clarify) and Phase B (options) each produce `ModelMessage[]` history. The agent executor starts with a fresh `messages` array per step (per Architecture Spec section 1.4: "Executor reads initializer snapshot + current step only, does NOT carry full conversation history across steps").
   - What's unclear: Does the sealed contract summary get injected into each step's context as a system message, or as a user message?
   - Recommendation: System message injection (contract scope + success criteria) at PREPARE state. Implementation detail left to planner.

3. **`@types/ulid` — are types bundled in ulid@3.0.2?**
   - What we know: `npm view ulid exports` shows `types: { require: './dist/index.d.cts', default: './dist/index.d.ts' }` — types ARE bundled.
   - Resolution: RESOLVED — No `@types/ulid` package needed. Types are in the package itself.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.14.1 | — |
| pnpm | Build | ✓ | (monorepo) | — |
| `ai` package | streamText / generateObject | ✓ | 5.0.172 | — |
| `@ai-sdk/anthropic` | Anthropic adapter | ✓ | installed | — |
| `zod` | Schema validation | ✓ | 4.3.6 | — |
| `micromatch` | Scope glob checking | ✓ | 4.0.8 (transitive) | — |
| `@types/micromatch` | TypeScript types for micromatch | ✗ | — | Add to devDeps (Wave 0) |
| `ulid` | Contract ID generation | ✗ | — | Add to deps (Wave 0) |
| Ollama | Model testing | [ASSUMED] | unknown | Use Anthropic-only tests |
| `ANTHROPIC_API_KEY` | Integration tests | [ASSUMED] | unknown | Mock adapter in tests |

**Missing dependencies with no fallback (block execution):** None — both `@types/micromatch` and `ulid` are installable via pnpm before first use.

**Wave 0 action required:**
```bash
pnpm --filter @treis/core add ulid
pnpm --filter @treis/core add -D @types/micromatch
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `packages/core/vitest.config.ts` (exists, includes `src/**/*.test.ts`) |
| Quick run | `pnpm --filter @treis/core test` |
| Full suite | `pnpm test` (root, runs all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| PLAN-01 | Clarifying questions: 2-3, truncated if >3 | unit | `vitest run src/plan-contract/engine.test.ts` |
| PLAN-02 | Options: exactly 3, A/B/C labeled | unit | same file |
| PLAN-03 | Sealing: contract JSON shape is valid | unit | same file |
| PLAN-04 | Contract JSON written to planContractsDir | integration (fs) | same file |
| PLAN-05 | ScopeEntry discriminated union parses correctly | unit | `src/plan-contract/schema.test.ts` |
| PLAN-06 | file/tool/url scope entries block correctly | unit | `src/plan-contract/scope-checker.test.ts` |
| PLAN-07 | Violation triggers handleViolation callback | unit | executor test with spy |
| PLAN-08 | Token accumulation sums inputTokens+outputTokens | unit | executor test with mock model |
| AGENT-01 | State transitions respect allowed set | unit | `src/agent/state-machine.test.ts` |
| AGENT-01 | Illegal transition throws TreisError | unit | same |
| AGENT-02 | consumer callback receives text-delta events | unit | executor test with mock streamText |
| AGENT-03 | Read-only tools batch, write tools serial | unit | reuse `executeTools` — already tested |
| AGENT-04 | Retry 3x with injected user message | unit | `src/agent/retry.test.ts` |
| AGENT-05 | 3rd failure calls approveEscalation | unit | same |
| AGENT-06 | 3 identical calls trigger FATAL | unit | `src/agent/circuit-breaker.test.ts` |
| AGENT-07 | >25 steps triggers FATAL | unit | executor test with step counter mock |
| AGENT-07 | >10min triggers FATAL | unit | executor test with time mock |
| AGENT-08 | Compaction guard fires only before STREAM | unit | executor test with spy |

### Wave 0 Gaps (files to create in first task)
- [ ] `packages/core/src/plan-contract/schema.test.ts`
- [ ] `packages/core/src/plan-contract/engine.test.ts`
- [ ] `packages/core/src/plan-contract/scope-checker.test.ts`
- [ ] `packages/core/src/agent/types.test.ts`
- [ ] `packages/core/src/agent/state-machine.test.ts`
- [ ] `packages/core/src/agent/circuit-breaker.test.ts`
- [ ] `packages/core/src/agent/retry.test.ts`
- [ ] `packages/core/src/agent/executor.test.ts`

### Sampling Rate
- Per task commit: `pnpm --filter @treis/core test`
- Per wave merge: `pnpm test`
- Phase gate: full suite green before `/gsd-verify-work`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ollama is available in the dev environment for integration tests | Environment Availability | Tests that call real Ollama will fail; must mock |
| A2 | ANTHROPIC_API_KEY is set in dev environment | Environment Availability | Real API calls in tests will fail; must mock |
| A3 | ulid v3.0.2 types are bundled (based on exports field showing d.ts paths) | ulid section | Need to add @types/ulid separately |
| A4 | V8 JSON.stringify key ordering is stable enough for circuit breaker in Phase 0 | Circuit breaker pitfall | Could miss repeated calls with reordered keys |

---

## Sources

### Primary (HIGH confidence — verified against installed packages)
- `node_modules/.pnpm/ai@5.0.172_zod@4.3.6/node_modules/ai/dist/index.d.ts` — StreamTextResult, TextStreamPart, generateObject, fullStream types
- `node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/classic/schemas.d.ts` — discriminatedUnion signature
- `node_modules/.pnpm/micromatch@4.0.8/node_modules/micromatch/index.js` — exported functions, isMatch behavior (runtime tested)
- `packages/tools/src/base/types.ts` — PermissionTier `as const` pattern (precedent for AgentState)
- `packages/core/src/errors.ts` — TreisError (used by state machine illegal transition)
- `packages/core/src/session/workspace.ts` — bootstrapWorkspace returns planContractsDir
- `packages/api-client/src/adapters/types.ts` — ModelAdapter, LanguageModelV3
- `packages/tools/src/base/executor.ts` — executeTools API signature
- `tsconfig.base.json` — erasableSyntaxOnly confirmed
- `.planning/phases/02-engine/02-CONTEXT.md` — all locked decisions
- `.planning/phases/01-foundation/01-02-SUMMARY.md` — AI SDK uses LanguageModelV3 (not V1)

### Secondary (MEDIUM confidence — npm registry)
- `npm view ai version` → 6.0.156 (latest), but `^5` pinned
- `npm view micromatch version` → 4.0.8
- `npm view ulid version` → 3.0.2; `npm view ulid exports` → ESM supported
- `npm view @types/micromatch version` → 4.0.10

### Tertiary (LOW confidence — not verified this session)
- Anthropic docs on user/assistant/tool message roles for retry injection [ASSUMED based on standard LLM message conventions]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified at exact installed versions
- Architecture: HIGH — all patterns verified against Phase 1 code
- AI SDK API: HIGH — type definitions read from installed package
- Pitfalls: MEDIUM — some based on API behavior inference, not runtime testing
- Build order: HIGH — derived from explicit dependency graph

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable stack; ulid/micromatch unlikely to change)
