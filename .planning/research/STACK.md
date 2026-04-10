# Technology Stack

**Project:** Treis — AI Agent Harness Platform
**Researched:** 2026-04-09
**Research mode:** Validation + gap analysis of pre-decided stack

---

## Verdict: Chosen Stack is Sound

The pre-decided stack is well-chosen for this problem. No major reversals needed. Key findings: Electron version target is outdated (32 is EOL—use 35+), Zod should be v4 not v3, and two missing pieces matter for this specific project (a unified LLM streaming adapter and a structured logger).

---

## Recommended Stack

### Runtime and Language

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| TypeScript | 5.8+ | Primary language | TS 5.8 adds `--erasableSyntaxOnly`, better ESM/CJS interop under `--module nodenext`, faster monorepo incremental builds | HIGH |
| Node.js | 22 LTS | Runtime | Required by Anthropic SDK (Node 20+). Node 22 aligns with TS 5.8's `--module nodenext` assumptions. Node 20 is acceptable but 22 is current LTS | HIGH |
| pnpm | 10+ | Package manager + monorepo | Strict `node_modules` prevents phantom deps. `workspace:*` protocol is correct for cross-package references. pnpm is the right call for a 4-package + 2-app structure | HIGH |

### Desktop App

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Electron | 35+ (current stable) | Desktop shell | Electron 32 is EOL (EOL: 2025-03-10). Electron 35 is current stable as of research date. Use `^35` in package.json. Electron Forge or electron-builder for packaging | HIGH |
| electron-vite | 3+ | Build tool for Electron | Purpose-built: handles main/renderer/preload split with single config, HMR in renderer, hot reload in main. Far better DX than raw Vite. Pairs with React | HIGH |
| React | 19.x | Renderer UI | React 19.2 (Oct 2025) is stable. Community boilerplates confirm React 19 + Electron + electron-vite work together. No blocking issues found | HIGH |
| electron-builder | 25+ | macOS packaging | More stars, more downloads than Electron Forge. Better for fine-grained macOS DMG/universal binary control. Electron Forge is acceptable alternative if you want opinionated defaults | MEDIUM |

### CLI

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| commander.js | 12+ | CLI argument parsing | 152M weekly downloads vs Yargs' 80M. 18ms startup (vs Yargs 20ms). Smallest bundle (61KB). Built-in TypeScript types. For a CLI that must start fast and has clear subcommands (`treis run`, `treis plan`, etc.), commander is the right call | HIGH |

### AI Model Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `@anthropic-ai/sdk` | 0.85+ | Anthropic (cloud) direct client | Official SDK, MIT, 0.85.0 as of research date. Use this for direct Anthropic API calls when Vercel AI SDK is insufficient (extended thinking, long context specifics) | HIGH |
| `openai` | 4.103+ | OpenAI-compatible REST client | Version 4.103.0 as of research date. This is the correct library for Ollama's OpenAI-compatible endpoint at `http://localhost:11434/v1`. Just set `baseURL` and `apiKey: 'ollama'` | HIGH |
| Vercel AI SDK (`ai`) | 5.x | Unified streaming + tool-call abstraction | **MISSING FROM CHOSEN STACK — critical addition.** AI SDK 5 provides: unified `streamText`/`generateText` over any provider, typed tool definitions, agent loop control (`maxSteps`, approval callbacks), and structured streaming IPC-friendly output. Supports both `@ai-sdk/anthropic` and Ollama via community provider. This is the standard abstraction layer in 2025/2026 TypeScript AI stacks | HIGH |
| `@ai-sdk/anthropic` | latest | AI SDK Anthropic provider | Pairs with `ai` package. Handles streaming natively | HIGH |

**On Ollama + OpenAI SDK:** The pattern of pointing the OpenAI SDK at `http://localhost:11434/v1` is well-documented and works. For the Vercel AI SDK approach, use `@ai-sdk/openai` with a custom `baseURL` to hit Ollama's endpoint. Both approaches are valid; the Vercel AI SDK path gives you the unified interface across cloud/local without forking your agent loop code.

### Schema Validation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Zod | 4.x | Plan Contract schema, tool input validation, config | **Upgrade from v3.** Zod 4.0.0 released July 2025, current stable 4.3.6+. 14x faster string parsing, 7x array, 6.5x object vs v3. Built-in JSON Schema export (useful for tool definitions sent to models). `@zod/mini` available if bundle size matters in renderer. Zod 4 is the correct version for a new project in 2026 | HIGH |

### Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vitest | 3.2+ | Unit + integration tests | Note: Vitest 3.2 deprecated `workspace` config in favor of `projects`. Use `projects` key in `vitest.config.ts`. No native Electron process test support—use Vitest for core package unit tests (agent loop, Plan Contract engine, tool system) where Electron is mocked | HIGH |
| Playwright | 1.50+ | Electron E2E tests | Playwright has experimental Electron support via `electron.launch()`. This is the correct tool for end-to-end Electron app testing. Vitest handles unit/integration; Playwright handles E2E. Do NOT use Vitest browser mode for Electron | MEDIUM |

### Logging

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| `pino` | 9+ | Structured JSONL execution traces | **MISSING FROM CHOSEN STACK — add this.** Pino writes NDJSON (newline-delimited JSON = JSONL) by default. 5x faster than Winston. Worker threads minimize blocking. For an agent harness that requires JSONL trace logging for every plan execution (tool calls, verdicts, retries), Pino is the correct choice. Winston is acceptable but slower and heavier | HIGH |

### IPC (Electron token streaming)

No third-party library needed. Use Electron's built-in `ipcMain.handle` / `ipcRenderer.invoke` for request/response and `ipcMain.emit` / `ipcRenderer.on` for streaming events. Pattern: main process calls `webContents.send('token', chunk)` on each stream chunk; renderer registers `ipcRenderer.on('token', handler)` via preload. This is the standard pattern—no library needed, confirmed by electron-ipc-stream (unmaintained) being the only alternative.

### State Machine (Agent Loop)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom enum-based state machine | N/A | Agent loop state transitions | **Do NOT reach for XState.** XState is powerful but adds ~50KB and significant complexity for what Treis needs: a linear state machine with ~6-8 states (IDLE → CLARIFYING → CONTRACT_PROPOSED → SEALED → EXECUTING → DONE/VIOLATED). A TypeScript enum + `switch` in a class is sufficient, fully testable, and zero-dependency. XState becomes appropriate in Phase 2+ if the three-agent architecture makes state complexity genuinely hard to reason about | HIGH |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| LLM abstraction | Vercel AI SDK 5 | LangChain.js | LangChain.js is heavier, more opinionated, worse for custom agent loops. Vercel AI SDK is lighter, better streaming primitives, actively maintained |
| LLM abstraction | Vercel AI SDK 5 | Mastra | Mastra is a full agent platform; Treis IS building the platform, so using Mastra would mean using a competitor's core |
| LLM abstraction | Vercel AI SDK 5 | OpenAI Agents SDK JS | OpenAI-centric. Treis needs Anthropic + Ollama from day one |
| Logging | pino | winston | Winston is 5x slower, heavier, no worker-thread optimization. Pino's NDJSON output is JSONL natively |
| Logging | pino | custom | Reinventing log serialization for JSONL traces is waste. pino has log rotation, transports, child loggers |
| Desktop packaging | electron-builder | Electron Forge | Forge is simpler but less control over macOS DMG layout, universal binary config, and entitlements needed for local model access |
| Desktop packaging | electron-builder | electron-vite-react | electron-vite is the BUILD tool; electron-builder is the PACKAGER. Both are needed, they compose |
| State machine | Custom enum | XState | XState is over-engineered for Phase 0. Add only if three-agent architecture materializes in Phase 2 |
| Schema | Zod 4 | Zod 3 | Zod 4 is the current version. No reason to start with v3 on a greenfield project. v4 is faster and has JSON Schema export |
| Electron version | 35+ | 32 | Electron 32 is EOL. Not installable as latest. Specify `^35` or `latest` |
| Testing | Playwright (E2E) | Vitest browser mode | Vitest does not support Electron processes. Playwright has experimental Electron support |

---

## Installation

```bash
# Core runtime
pnpm add typescript@^5.8 -D -w

# AI model integration
pnpm add ai @ai-sdk/anthropic openai @anthropic-ai/sdk

# Vercel AI SDK Ollama support (via OpenAI-compatible adapter)
# Use openai package with baseURL: 'http://localhost:11434/v1'

# Schema validation
pnpm add zod@^4

# CLI
pnpm add commander

# Logging
pnpm add pino
pnpm add pino-pretty -D  # dev formatting only

# Desktop (in apps/desktop)
pnpm add electron@^35 -D
pnpm add electron-builder -D
pnpm add electron-vite -D

# Testing
pnpm add vitest@^3.2 @vitest/coverage-v8 -D -w
pnpm add playwright@^1.50 -D  # E2E only

# React (in apps/desktop)
pnpm add react@^19 react-dom@^19
pnpm add @types/react @types/react-dom -D
```

---

## Monorepo Structure Notes

The 4-package + 2-app structure in the PROJECT.md is correct. Two TypeScript config notes:

1. Use TypeScript project references (`references` in `tsconfig.json`) alongside pnpm workspaces. Workspaces handle linking; project references handle incremental type-checking.
2. Use `"moduleResolution": "bundler"` for packages consumed by Vite/electron-vite. Use `"moduleResolution": "nodenext"` for pure Node.js packages (`@treis/core`, `cli` app).
3. Vitest 3.2: use `projects` key, not `workspace`. The `workspace` key prints deprecation warnings.

---

## Sources

- Electron releases: [electronjs.org/docs/latest/tutorial/electron-timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) | [endoflife.date/electron](https://endoflife.date/electron)
- electron-vite: [electron-vite.org](https://electron-vite.org)
- Anthropic SDK: [npmjs.com/@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) — v0.85.0
- OpenAI SDK: [github.com/openai/openai-node releases v4.103.0](https://github.com/openai/openai-node/releases/tag/v4.103.0)
- Ollama OpenAI compat: [docs.ollama.com/api/openai-compatibility](https://docs.ollama.com/api/openai-compatibility)
- Vercel AI SDK 5: [vercel.com/blog/ai-sdk-5](https://vercel.com/blog/ai-sdk-5)
- Zod v4: [zod.dev/v4](https://zod.dev/v4) — stable 4.3.6+ (July 2025)
- Vitest 3.2 + workspace deprecation: [vitest.dev/blog/vitest-3-2](https://vitest.dev/blog/vitest-3-2.html)
- Pino vs Winston: [dash0.com/guides/nodejs-logging-libraries](https://www.dash0.com/guides/nodejs-logging-libraries)
- commander.js download stats: [pkgpulse.com/compare/commander-vs-yargs](https://www.pkgpulse.com/compare/commander-vs-yargs)
- TypeScript 5.8: [devblogs.microsoft.com/typescript/announcing-typescript-5-8](https://devblogs.microsoft.com/typescript/announcing-typescript-5-8/)
- XState agent: [github.com/statelyai/agent](https://github.com/statelyai/agent)
- electron-builder vs Forge: [electronforge.io/core-concepts/why-electron-forge](https://www.electronforge.io/core-concepts/why-electron-forge)
