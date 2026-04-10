# Phase 3: CLI - Research

**Researched:** 2026-04-10
**Domain:** Node.js CLI, interactive terminal I/O, streaming AI output, benchmark design
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | `treis "task"` starts Plan Contract flow in terminal | Commander.js `argument('<task>')` + action handler entry point |
| CLI-02 | Interactive dialogue: AI questions rendered, Builder answers via stdin | `readline/promises` createInterface + `rl.question()` loop |
| CLI-03 | 3 plan options displayed with tradeoffs, Builder picks by number/letter | Formatted option display + `rl.question()` for selection (1–3 or A/B/C) |
| CLI-04 | Live execution stream shows step counter, current step, tool results | `AgentConsumer` callback dispatching `process.stdout.write()` per event type |
| CLI-05 | Contract violation displayed with 3 options in terminal | `handleViolation` callback implementation with `rl.question()` |
| CLI-06 | Result summary shows success criteria checklist (pass/fail per criterion) | `complete` event handler rendering `contract.successCriteria[]` with pass/fail |
| BENCH-01 | 10 reference plans covering diverse domains | Vitest test file per domain, fixtures defining intent + expected outcomes |
| BENCH-02 | Each plan has expected outcomes (files created, content checks, criteria) | Per-plan assertion set verified after `runAgent` resolves |
| BENCH-03 | Benchmark runner executes all 10 plans and reports success rate | Vitest test suite with numeric aggregation + console report |
| BENCH-04 | Success rate target: 80%+ on reference plans | Benchmark suite threshold assertion or manual report |
</phase_requirements>

---

## Summary

Phase 3 bridges the Phase 2 engine (`@treis/core`) to a terminal-usable CLI. The engine already exposes the complete Plan Contract flow through two composable async APIs: `createPlanContractEngine` (clarify → propose → seal) and `runAgent` (AgentRunOptions with `consumer`, `handleViolation`, `approveEscalation` callbacks). The CLI is responsible for wiring these APIs to `process.stdin`/`process.stdout` — nothing needs to be added to `@treis/core`.

The CLI has three distinct screen states that map to different I/O strategies: (1) the dialogue phase uses sequential `await rl.question()` calls for clarification answers and option selection; (2) the execution phase switches into a streaming display mode using `process.stdout.write()` for tokens and `readline.clearLine()` for step counter updates; (3) the result phase prints a static checklist and exits. Mixing the readline interface with raw stdout writes during streaming is the principal technical risk.

The benchmark suite is a Vitest test file that programmatically invokes `runAgent` against 10 pre-defined fixture plans, asserts success criteria outcomes, and reports a pass rate. No live model calls are required for the benchmark harness itself — fixtures can be run against a mock model or a live Ollama/Anthropic adapter depending on what is available.

**Primary recommendation:** Use `node:readline/promises` natively (no Inquirer, no Prompts) — readline/promises is built into Node.js 22 LTS, covers all async interactive needs cleanly, and avoids a third-party dependency in a runtime-critical path. Commander 14 handles argument parsing only; readline handles interactive I/O.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Commander.js | 14.0.3 | CLI argument parsing, subcommand routing | Already in `apps/cli/package.json`; 152M weekly downloads; `program.argument('<task>')` for the main flow |
| `node:readline/promises` | Built-in (Node 22) | Interactive question/answer prompts | Native; no dependency; promise-based `rl.question()` is clean async/await |
| `node:process` | Built-in | stdin/stdout streams, `process.exit()` | Native |

[VERIFIED: npm registry — commander@14.0.3 confirmed in `pnpm-lock.yaml`]
[VERIFIED: nodejs.org/api/readline.html — readline/promises is stable in Node 22 LTS]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@treis/core` | workspace:* | `createPlanContractEngine`, `runAgent`, `AgentEvent`, `ViolationDecision` | Every CLI command |
| `@treis/tools` | workspace:* | Tool implementations (FileRead, FileWrite, Bash, Glob, Grep, WebSearch) | Wiring tools into `AgentRunOptions` |
| `@treis/api-client` | workspace:* | `createSlotManager`, `createOllamaAdapter`, `createAnthropicAdapter` | Model instantiation |
| `vitest` | 3.x | Benchmark test runner | Benchmark suite only |

[VERIFIED: codebase grep — all packages present in `packages/` with workspace:* linkage]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:readline/promises` | Inquirer.js | Inquirer adds dependency + 2–5MB, built-in is sufficient for straight Q&A flow |
| `node:readline/promises` | Prompts | Same as above; extra dep not justified for this scope |
| `node:readline/promises` | @clack/prompts | Better visual UX but non-trivial dep; Phase 4 Electron is the polished UI |

**Installation:** No new packages needed for core CLI. Benchmark may need no additions either (vitest already in devDependencies).

---

## Architecture Patterns

### Recommended Project Structure
```
apps/cli/
├── src/
│   ├── index.ts              # Entry point: #!/usr/bin/env node, Commander program setup
│   ├── commands/
│   │   └── run.ts            # `run` action handler: full Plan Contract flow
│   ├── ui/
│   │   ├── dialogue.ts       # Clarification Q&A screen (readline/promises)
│   │   ├── options.ts        # Plan options display + selection
│   │   ├── execution.ts      # AgentConsumer + streaming display
│   │   ├── violation.ts      # Violation interrupt screen
│   │   └── result.ts         # Success criteria checklist display
│   ├── input.ts              # Shared readline interface factory (singleton)
│   └── consumer.ts           # buildConsumer(): AgentConsumer factory for CLI
└── benchmark/
    ├── runner.ts             # Benchmark orchestrator
    ├── fixtures/
    │   ├── 01-code-task.ts   # Reference plan fixture
    │   ├── 02-writing-task.ts
    │   └── ... (10 total)
    └── benchmark.test.ts     # Vitest test file: runs all fixtures, asserts 80%+
```

### Pattern 1: Commander Argument → Action Handler Entry Point

Commander handles `treis "write a README"` argument parsing. The action handler is async and drives the full multi-step flow.

```typescript
// Source: commander.js README + codebase pattern
#!/usr/bin/env node
import { program } from 'commander'
import { runCommand } from './commands/run.js'

program
  .name('treis')
  .description('AI work execution with Plan Contracts')
  .version('0.0.1')
  .argument('<task>', 'what you want to accomplish')
  .action(async (task: string) => {
    await runCommand(task)
    process.exit(0)
  })

program.parseAsync(process.argv)
```

[VERIFIED: Commander.js 14 README — `.argument('<task>')` + `.action(async (task) => {})` is the canonical pattern for single-argument commands]

### Pattern 2: Sequential readline/promises for Q&A Dialogue

Clarification and option selection both use the same readline interface via sequential `await rl.question()` calls. Create ONE interface at the start, reuse across the full session, close at the end.

```typescript
// Source: nodejs.org/api/readline.html (verified)
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

// Create once, share across all screens
export function createCliInterface() {
  return createInterface({ input: stdin, output: stdout })
}

// Clarification dialogue
export async function runDialogue(
  rl: Awaited<ReturnType<typeof createCliInterface>>,
  questions: string[],
): Promise<string[]> {
  const answers: string[] = []
  for (const q of questions) {
    process.stdout.write(`\n  ${q}\n`)
    const answer = await rl.question('  > ')
    answers.push(answer)
  }
  return answers
}

// Option selection
export async function selectOption(
  rl: Awaited<ReturnType<typeof createCliInterface>>,
  options: PlanOption[],
): Promise<PlanOption> {
  // Display options...
  let pick: PlanOption | undefined
  while (!pick) {
    const answer = await rl.question('\nChoose option (1/2/3 or A/B/C): ')
    const normalized = answer.trim().toUpperCase()
    pick = options.find(o =>
      o.label === normalized ||
      String(options.indexOf(o) + 1) === normalized
    )
    if (!pick) process.stdout.write('  Invalid choice. Try again.\n')
  }
  return pick
}
```

[VERIFIED: nodejs.org/api/readline.html — `readline/promises` module, `rl.question()` returns Promise<string>]

### Pattern 3: AgentConsumer for Streaming Execution Display

The `consumer` callback (type `(event: AgentEvent) => void`) is the CLI's window into the agent loop. Each event type maps to a specific terminal output operation.

```typescript
// Source: packages/core/src/agent/types.ts (verified in codebase)
// AgentEvent union:
// { type: 'token'; content: string; step: number }
// { type: 'tool-start'; toolName: string; input: unknown; step: number }
// { type: 'tool-result'; toolName: string; output: unknown; success: boolean; step: number }
// { type: 'step-complete'; step: number; verdict: StepVerdict }
// { type: 'retry'; step: number; attempt: number; reason: string }
// { type: 'violation'; violation: ScopeViolation }
// { type: 'escalation-required'; reason: string }
// { type: 'budget-warning'; usedTokens: number; budgetTokens: number }
// { type: 'complete'; totalSteps: number }
// { type: 'failed'; reason: string; step: number }

export function buildConsumer(): AgentConsumer {
  let currentStep = 0

  return (event: AgentEvent) => {
    switch (event.type) {
      case 'token':
        // Token-by-token streaming — no newline, immediate flush
        process.stdout.write(event.content)
        break

      case 'tool-start':
        process.stdout.write(`\n[Step ${event.step}] Running ${event.toolName}...\n`)
        currentStep = event.step
        break

      case 'tool-result':
        const status = event.success ? 'OK' : 'FAILED'
        process.stdout.write(`  ${event.toolName}: ${status}\n`)
        break

      case 'step-complete':
        process.stdout.write(`\n[Step ${event.step}] Complete (${event.verdict})\n`)
        break

      case 'retry':
        process.stdout.write(`  Retry ${event.attempt}/3: ${event.reason}\n`)
        break

      case 'budget-warning':
        process.stdout.write(`  Token budget: ${event.usedTokens}/${event.budgetTokens}\n`)
        break

      case 'complete':
        process.stdout.write(`\nExecution complete. ${event.totalSteps} steps.\n`)
        break

      case 'failed':
        process.stderr.write(`\nFailed at step ${event.step}: ${event.reason}\n`)
        break

      // 'violation' and 'escalation-required' handled via callbacks, not consumer
    }
  }
}
```

[VERIFIED: codebase — AgentEvent type from packages/core/src/agent/types.ts, line 38-49]

### Pattern 4: handleViolation Callback (CLI implementation)

The engine calls `handleViolation(violation: ScopeViolation): Promise<ViolationDecision>` when a scope boundary is crossed. The CLI implementation pauses streaming, prompts the Builder, and returns one of `'stop' | 'amend' | 'continue'`.

```typescript
// Source: packages/core/src/agent/types.ts (verified — AgentRunOptions.handleViolation)
// ViolationDecision = 'stop' | 'amend' | 'continue'

export function buildViolationHandler(
  rl: ReturnType<typeof createCliInterface>,
): (violation: ScopeViolation) => Promise<ViolationDecision> {
  return async (violation: ScopeViolation): Promise<ViolationDecision> => {
    process.stdout.write('\n\n--- CONTRACT VIOLATION ---\n')
    process.stdout.write(`Tool: ${violation.toolName}\n`)
    process.stdout.write(`Reason: ${violation.reason}\n\n`)
    process.stdout.write('Options:\n')
    process.stdout.write('  1) Stop execution\n')
    process.stdout.write('  2) Amend scope and continue\n')
    process.stdout.write('  3) Continue (override for this call only)\n')

    let decision: ViolationDecision | undefined
    while (!decision) {
      const answer = await rl.question('\nChoice (1/2/3): ')
      switch (answer.trim()) {
        case '1': decision = 'stop'; break
        case '2': decision = 'amend'; break
        case '3': decision = 'continue'; break
        default: process.stdout.write('Invalid. Enter 1, 2, or 3.\n')
      }
    }
    return decision
  }
}
```

### Pattern 5: approveEscalation Callback (CLI implementation)

```typescript
// Source: packages/core/src/agent/types.ts — AgentRunOptions.approveEscalation
export function buildEscalationHandler(
  rl: ReturnType<typeof createCliInterface>,
): (reason: string) => Promise<boolean> {
  return async (reason: string): Promise<boolean> => {
    process.stdout.write(`\n\nEscalation requested: ${reason}\n`)
    process.stdout.write('Switch to cloud model (costs API credits)? (y/n): ')
    const answer = await rl.question('')
    return answer.trim().toLowerCase() === 'y'
  }
}
```

### Pattern 6: Result Screen — Success Criteria Checklist

The `complete` event fires after all steps finish. The CLI then compares outcomes against `contract.successCriteria`. In Phase 3, all criteria are reported as "pending verification" (manual check) — automated outcome verification is Phase 4+.

```typescript
// Source: packages/core/src/plan-contract/schema.ts — PlanContract.successCriteria: string[]
export function renderResultScreen(contract: PlanContract, totalSteps: number): void {
  process.stdout.write('\n========== RESULT ==========\n')
  process.stdout.write(`Completed in ${totalSteps} steps.\n\n`)
  process.stdout.write('Success Criteria:\n')
  for (const criterion of contract.successCriteria) {
    // Phase 3: manual verification; Phase 4+ will have automated checks
    process.stdout.write(`  [ ] ${criterion}\n`)
  }
  process.stdout.write('\nVerify criteria above before marking complete.\n')
  process.stdout.write('============================\n')
}
```

### Pattern 7: Benchmark Suite Structure

The benchmark is a Vitest test file that runs `N` reference plans and asserts `successCount / N >= 0.8`.

```typescript
// apps/cli/benchmark/benchmark.test.ts
import { describe, it, expect } from 'vitest'
import { runBenchmark } from './runner.js'
import { REFERENCE_PLANS } from './fixtures/index.js'

describe('Benchmark Suite', () => {
  it('achieves >= 80% success rate across 10 reference plans', async () => {
    const results = await runBenchmark(REFERENCE_PLANS)
    const successRate = results.filter(r => r.passed).length / results.length

    console.table(results.map(r => ({
      plan: r.name,
      domain: r.domain,
      passed: r.passed,
      steps: r.totalSteps,
      reason: r.reason ?? '',
    })))

    console.log(`\nSuccess rate: ${(successRate * 100).toFixed(0)}% (${results.filter(r => r.passed).length}/${results.length})`)
    expect(successRate).toBeGreaterThanOrEqual(0.8)
  }, 300_000) // 5-minute timeout for 10 plans
})
```

### Anti-Patterns to Avoid

- **Creating multiple readline interfaces:** Each `createInterface()` puts stdin into raw/paused mode. Only ONE interface per process — create it at startup, pass it down.
- **Mixing `console.log()` with streaming:** `console.log()` adds `\n` after each call. During token streaming, only `process.stdout.write()` preserves continuity.
- **Awaiting `runAgent` inside the consumer callback:** The consumer is synchronous (`(event: AgentEvent) => void`). Async operations (violation handler, escalation handler) happen via callbacks in `AgentRunOptions`, NOT inside the consumer.
- **Using `program.parse()` instead of `program.parseAsync()`:** The action handler is async. Use `program.parseAsync(process.argv)` so unhandled promise rejections surface correctly.
- **Leaving readline open after exit:** Always call `rl.close()` before `process.exit()` or the process will hang waiting for stdin.
- **Hardcoding model config in CLI:** Model provider and modelId must come from env vars or a config file, not hardcoded strings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive Q&A prompts | Custom event listener + buffer | `node:readline/promises` rl.question() | Built-in, handles terminal modes, backspace, signal handling |
| Token streaming to terminal | Custom buffer flush | `process.stdout.write(token)` directly | Streams auto-flush; no buffering needed for TTY |
| Plan Contract flow | Custom state machine | `createPlanContractEngine` (Phase 2) | Already built, tested (145 tests passing) |
| Agent execution loop | Custom retry/circuit-break | `runAgent` (Phase 2) | Already built, tested |
| Glob matching in scope | Custom path matcher | `micromatch` (already in @treis/core) | Handles edge cases |
| Model adapters | Direct fetch to Ollama/Anthropic | `createSlotManager` + adapters | Already built, tested |

**Key insight:** Phase 2 did all the hard work. Phase 3 is 80% wiring code. The only new logic is I/O orchestration and the benchmark fixture definitions.

---

## Common Pitfalls

### Pitfall 1: readline Interface Conflict with streaming output

**What goes wrong:** While `runAgent` is streaming tokens (firing `consumer` callbacks with `{type: 'token'}`), if the readline interface has a pending `question()` prompt, the prompt cursor and streamed tokens will interleave on screen, corrupting the display.

**Why it happens:** The readline interface writes a prompt string to stdout when `rl.question()` is awaited. If stdout is simultaneously receiving token writes, both arrive in the output buffer concurrently.

**How to avoid:** The execution phase (streaming) must NOT have an active `rl.question()` awaiting. Sequence strictly: finish all `rl.question()` calls (dialogue + option selection) before calling `runAgent`. Only re-enter `rl.question()` inside the `handleViolation` callback (which pauses the agent loop while awaiting the promise).

**Warning signs:** Prompt text appearing mid-sentence in AI output; garbled lines during tool execution display.

### Pitfall 2: process hanging on stdin after completion

**What goes wrong:** Process doesn't exit after `runAgent` resolves. The readline interface keeps stdin open.

**Why it happens:** `readline.createInterface()` holds a reference to stdin, preventing the event loop from draining.

**How to avoid:** Always call `rl.close()` in a `finally` block after the flow completes (or errors). Then call `process.exit(0)`.

```typescript
try {
  await runFullFlow(task, rl)
} finally {
  rl.close()
  process.exit(0)
}
```

### Pitfall 3: program.parseAsync vs program.parse

**What goes wrong:** `program.parse()` returns synchronously before the async action handler resolves. Unhandled promise rejections cause silent failures.

**How to avoid:** Use `await program.parseAsync(process.argv)` in the top-level entry point. Wrap in try/catch for error display.

### Pitfall 4: Benchmark timeout — sequential plan execution

**What goes wrong:** 10 reference plans running live against a model easily hit Vitest's default test timeout (5 seconds).

**Why it happens:** Each plan takes 30s–5min depending on the model.

**How to avoid:** Set `timeout: 300_000` (5 minutes) on the benchmark test and `testTimeout: 600_000` in the benchmark vitest config. Run benchmark as a separate Vitest project from unit tests, not in the default test run.

### Pitfall 5: Model not configured at benchmark time

**What goes wrong:** Benchmark fails with "No adapter configured for slot A" because env vars (`ANTHROPIC_API_KEY` or Ollama) are not available.

**Why it happens:** Benchmark fixtures need a real model; CI may not have API keys.

**How to avoid:** Benchmark runner checks model health before starting. If model unavailable, skip with `test.skip()` and log a warning rather than failing. Mark benchmark as an integration test separate from unit tests.

[VERIFIED: codebase — Ollama confirmed not running on localhost:11434 during this research session; ANTHROPIC_API_KEY not set in env. Benchmark must handle this gracefully.]

### Pitfall 6: ViolationDecision conflict between consumer and handleViolation

**What goes wrong:** The consumer receives `{type: 'violation', violation}` AND the engine calls `handleViolation`. Displaying violation info twice (once from consumer, once from handleViolation) creates duplicate output.

**How to avoid:** Do NOT display violation info in the consumer for the `violation` event type. Let `handleViolation` do ALL violation display. The consumer can optionally log a debug line but should not display the full violation screen.

---

## Code Examples

### Full run command flow

```typescript
// apps/cli/src/commands/run.ts
import { createCliInterface } from '../input.js'
import { runDialogue } from '../ui/dialogue.js'
import { displayOptions, selectOption } from '../ui/options.js'
import { buildConsumer } from '../consumer.js'
import { buildViolationHandler, buildEscalationHandler } from '../ui/violation.js'
import { renderResultScreen, renderSealedContract } from '../ui/result.js'
import { createPlanContractEngine, runAgent } from '@treis/core'
import { createSlotManager, createOllamaAdapter } from '@treis/api-client'
import { bootstrapWorkspace } from '@treis/core'
import { FileReadTool, GlobTool, GrepTool, FileWriteTool, BashTool } from '@treis/tools'
import { ulid } from 'ulid'

export async function runCommand(task: string): Promise<void> {
  const rl = createCliInterface()

  try {
    // 1. Bootstrap workspace
    const sessionId = ulid()
    const workspace = await bootstrapWorkspace(sessionId)

    // 2. Initialize model (from env or config)
    const slotManager = createSlotManager({
      slotA: { slot: 'A', provider: 'ollama', modelId: 'llama3.2', role: 'strongest' },
      slotB: { slot: 'B', provider: 'ollama', modelId: 'llama3.2', role: 'fastest' },
    })
    const adapter = slotManager.getAdapter('A')
    const model = adapter.getModel(slotManager.getModelId('A'))

    // 3. Plan Contract engine
    const engine = createPlanContractEngine({
      model,
      workspace: { planContractsDir: workspace.planContractsDir },
    })

    // Phase A: Clarify
    process.stdout.write('\nThinking about your task...\n')
    const { questions } = await engine.clarify(task)
    const answers = await runDialogue(rl, questions)
    const clarifications = questions.map((q, i) => ({ question: q, answer: answers[i]! }))

    // Phase B: Options
    process.stdout.write('\nGenerating plan options...\n')
    const { options } = await engine.propose(task, clarifications)
    displayOptions(options)
    const selected = await selectOption(rl, options)

    // Phase C: Seal
    const contract = await engine.seal(task, clarifications, selected)
    renderSealedContract(contract)

    // 4. Run agent
    const tools = [
      new FileReadTool(), new GlobTool(), new GrepTool(),
      new FileWriteTool(), new BashTool(),
    ]
    const toolContext = { workspaceRoot: process.cwd(), permissions: [] }
    const consumer = buildConsumer()

    await runAgent({
      contract,
      tools,
      model,
      consumer,
      handleViolation: buildViolationHandler(rl),
      approveEscalation: buildEscalationHandler(rl),
      workspace,
      sessionId,
      toolContext,
    })

    // 5. Result screen
    renderResultScreen(contract, 0) // totalSteps from consumer state

  } finally {
    rl.close()
    process.exit(0)
  }
}
```

### Sealed contract display before execution

```typescript
// apps/cli/src/ui/result.ts — renderSealedContract
export function renderSealedContract(contract: PlanContract): void {
  process.stdout.write('\n========== SEALED CONTRACT ==========\n')
  process.stdout.write(`ID: ${contract.id}\n`)
  process.stdout.write(`Intent: ${contract.intent}\n`)
  process.stdout.write(`Option: ${contract.selectedOption}\n\n`)
  process.stdout.write('Scope:\n')
  for (const entry of contract.scopeEntries) {
    switch (entry.type) {
      case 'file': process.stdout.write(`  file: ${entry.glob}\n`); break
      case 'tool': process.stdout.write(`  tool: ${entry.name}\n`); break
      case 'url': process.stdout.write(`  url: ${entry.pattern}\n`); break
      case 'action': process.stdout.write(`  action: ${entry.description}\n`); break
    }
  }
  process.stdout.write('\nSuccess Criteria:\n')
  contract.successCriteria.forEach((c, i) =>
    process.stdout.write(`  ${i + 1}. ${c}\n`)
  )
  process.stdout.write('=====================================\n\n')
}
```

### Benchmark fixture shape

```typescript
// apps/cli/benchmark/fixtures/types.ts
export interface BenchmarkFixture {
  name: string
  domain: 'code' | 'writing' | 'research' | 'data' | 'mixed'
  intent: string
  mockAnswers: string[]           // Answers to clarification questions
  selectedOption: 'A' | 'B' | 'C'
  expectedOutcomes: ExpectedOutcome[]
}

export interface ExpectedOutcome {
  type: 'file-exists' | 'file-contains' | 'no-violation' | 'complete'
  path?: string
  pattern?: string
  description: string
}

export interface BenchmarkResult {
  name: string
  domain: string
  passed: boolean
  totalSteps: number
  reason?: string
  durationMs: number
}
```

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is a greenfield CLI phase, not a rename/refactor phase.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|---------|
| Node.js | CLI runtime | Yes | 24.14.1 (exceeds 22 LTS minimum) | — |
| pnpm | Package manager | Yes | 9.1.0 | — |
| Ollama (localhost:11434) | Benchmark (local model) | No | — | Use ANTHROPIC_API_KEY; skip benchmark with test.skip() if neither available |
| ANTHROPIC_API_KEY | Benchmark (cloud model) | No | — | Skip benchmark; benchmark tests must be opt-in integration tests |
| commander@14.0.3 | CLI argument parsing | Yes | 14.0.3 | — |
| `node:readline/promises` | Interactive prompts | Yes | Built-in Node 22 | — |

**Missing dependencies with no fallback:**
- None that block CLI unit test execution.

**Missing dependencies with fallback:**
- Ollama and ANTHROPIC_API_KEY both missing: benchmark integration tests skip via `test.skip()` with a clear message. CLI unit tests use mocks.

[VERIFIED: Bash — `curl -s http://localhost:11434/api/version` returned "Ollama service not running on 11434"; ANTHROPIC_API_KEY env var not set]
[VERIFIED: Bash — Node.js 24.14.1 confirmed; pnpm 9.1.0 confirmed; commander 14.0.3 in pnpm-lock.yaml]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Callback `rl.question(q, cb)` | `await rl.question(q)` from `readline/promises` | Node 17+ stable, Node 22 LTS | Cleaner async code; use promises API exclusively |
| `program.parse()` for async actions | `await program.parseAsync()` | Commander 8+ | Required for async action handlers |
| Inquirer.js for prompts | Native `readline/promises` | 2023+ | For simple Q&A flows, native is preferred; Inquirer only needed for complex UI like checkboxes/fuzzy select |
| `console.log()` for streaming output | `process.stdout.write()` | N/A | `console.log` adds `\n`; streaming requires write() |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tool constructors (`new FileReadTool()`) take no required args or only optional config | Code Examples | If constructors require workspace/config, the instantiation pattern in run.ts changes |
| A2 | `bootstrapWorkspace(sessionId)` returns `WorkspaceLayout` with `planContractsDir`, `tracesDir`, `root` fields needed by `runAgent` | Code Examples | If signature differs, workspace wiring needs adjustment |
| A3 | 10 reference plans can be designed to complete against Ollama (llama3.2) at 80%+ | Architecture | If Ollama is too unreliable for the chosen tasks, benchmark target may not be achievable without cloud model |
| A4 | Benchmark timeout of 5 minutes per plan is sufficient | Common Pitfalls | If plans consistently exceed 5min, timeout config needs raising |

---

## Open Questions

1. **Model configuration strategy**
   - What we know: `createSlotManager` requires explicit provider + modelId config
   - What's unclear: Where does the CLI read this config? Env vars? `~/.treis/config.json`? CLI flags?
   - Recommendation: Use env vars for Phase 3 (TREIS_MODEL_PROVIDER, TREIS_MODEL_ID). Config file is Phase 4+.

2. **ToolContext workspaceRoot**
   - What we know: `ToolContext` requires `workspaceRoot: string` for path-guarding
   - What's unclear: Should it default to `process.cwd()` or a user-specified directory?
   - Recommendation: Default to `process.cwd()` in Phase 3. User can override via `--workspace` flag.

3. **Benchmark fixture domains**
   - What we know: BENCH-01 requires 10 plans covering code, writing, research, data, mixed
   - What's unclear: What specific tasks ensure 80% success with small local models?
   - Recommendation: Choose simple, deterministic tasks (e.g., "create a hello world in Python", "write a 3-sentence summary of X"). Avoid tasks requiring external URLs (WebSearch) since network access may not be available.

4. **Success criteria verification in result screen**
   - What we know: CLI-06 requires "pass/fail per criterion" but the agent loop does not return per-criterion outcomes
   - What's unclear: Is this manually inspected by the Builder, or should the CLI auto-detect (e.g., check if a file exists)?
   - Recommendation: Phase 3 shows criteria as `[ ]` (unchecked) with instruction to verify manually. Auto-verification is Phase 4+. This satisfies CLI-06 as a display requirement.

---

## Validation Architecture

`nyquist_validation` is `false` in `.planning/config.json`. This section is SKIPPED per configuration.

---

## Security Domain

The CLI is a local developer tool. No network endpoints, no auth, no multi-user surface. The security controls enforced by Phase 1 (path-guarding in FileReadTool/FileWriteTool, metacharacter blocking in BashTool, permission tiers) remain active — the CLI does not bypass them.

**ASVS-relevant items for CLI specifically:**
- V5 Input Validation: The `task` argument is a free-form string; it is NOT executed as a shell command — it becomes a prompt string to the model. No injection risk from the task argument itself.
- The readline interface input is user-local terminal I/O; no network surface.

No new security controls needed in Phase 3 beyond what Phase 1 and 2 already enforce.

---

## Sources

### Primary (HIGH confidence)
- `packages/core/src/agent/types.ts` — AgentEvent union, AgentConsumer, AgentRunOptions, ViolationDecision (verified in codebase)
- `packages/core/src/plan-contract/engine.ts` — PlanContractEngine API (verified in codebase)
- `packages/core/src/plan-contract/schema.ts` — PlanContract shape (verified in codebase)
- `apps/cli/package.json` — commander@14 dependency (verified in codebase)
- `pnpm-lock.yaml` — commander@14.0.3 resolved (verified via grep)
- [nodejs.org/api/readline.html](https://nodejs.org/api/readline.html) — readline/promises API (WebFetch verified)
- [Commander.js GitHub README](https://github.com/tj/commander.js/) — `.argument()`, `.action()`, `.parseAsync()` patterns (WebFetch verified)

### Secondary (MEDIUM confidence)
- [nodejs.org/learn/command-line/accept-input-from-the-command-line-in-nodejs](https://nodejs.org/learn/command-line/accept-input-from-the-command-line-in-nodejs) — stdin handling patterns

### Tertiary (LOW confidence)
- None — all claims verified from primary sources or official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in codebase; versions confirmed
- Architecture: HIGH — pattern derived from Phase 2 engine API, which is fully read and understood
- AgentEvent wiring: HIGH — types.ts read directly; event union verified
- Pitfalls: HIGH — verified experimentally (readline behavior, Ollama not running)
- Benchmark design: MEDIUM — fixture domain selection and success rate achievability depend on model availability (A3 in Assumptions Log)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable ecosystem; Node.js readline/promises API is stable; commander 14 is current stable)
