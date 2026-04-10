# Treis

An open-source AI-powered work execution platform that makes multi-step AI plans actually complete end-to-end.

Treis introduces **Plan Contracts** — a scope-sealing mechanism where the AI proposes options, you pick one, and boundaries + success criteria are locked before any execution begins. The only interrupt is a genuine contract violation.

> Currently macOS-first. Both Ollama (local) and Anthropic API (cloud) supported from day one.

---

## How it works

```
You describe a task
       ↓
AI asks clarifying questions
       ↓
AI proposes 3 contract options (scope + success criteria)
       ↓
You pick one → scope is sealed
       ↓
Execution streams live (tool calls, tokens, verdicts)
       ↓
Result: pass/fail against the criteria you agreed to
```

If the agent hits something outside the sealed scope, a **Violation Modal** surfaces — you decide: amend the contract or abort. No silent scope creep.

---

## Packages

```
treis/
├── packages/
│   ├── core/          # Agent loop, Plan Contract engine, state machine
│   ├── api-client/    # Anthropic + Ollama providers (Vercel AI SDK 5)
│   └── tools/         # Tool registry, built-in developer tools
└── apps/
    ├── cli/           # treis run — terminal execution stream
    └── desktop/       # Electron app — full Plan Contract UI
```

---

## Quick start

**Prerequisites:** Node.js 22+, pnpm 10+

```bash
git clone https://github.com/ASKKPOP/treis.git
cd treis
pnpm install
```

**CLI**

```bash
# Set your API key (or use Ollama — no key needed)
export ANTHROPIC_API_KEY=sk-...

pnpm --filter @treis/cli run dev
```

**Desktop app**

```bash
pnpm --filter @treis/desktop run dev
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.8 |
| Runtime | Node.js 22 LTS |
| AI abstraction | Vercel AI SDK 5 + `@ai-sdk/anthropic` |
| Local models | Ollama (OpenAI-compatible endpoint) |
| Schema | Zod 4 |
| CLI | commander.js 12 |
| Desktop | Electron 35 + electron-vite 5 + React 19 |
| UI | Tailwind 4 |
| Logging | pino 9 (JSONL traces) |
| Testing | Vitest 3 (unit) + Playwright (E2E) |
| Packaging | electron-builder 26 (universal macOS binary) |

---

## Development

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 0 — Foundation | Done | Monorepo setup, core packages, config |
| 1 — Core | Done | Agent loop, Plan Contract engine, tool system |
| 2 — Providers | Done | API client, Anthropic + Ollama integration |
| 3 — CLI | Done | `treis run`, execution stream, result screen |
| 4 — Desktop | In progress | Electron app, full Plan Contract UI |

---

## License

MIT — see [LICENSE](./LICENSE)
