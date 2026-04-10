# Treis

<p align="center">
<a href="https://github.com/ASKKPOP/treis">ASKKPOP/treis</a>
·
<a href="./PARITY.md">Parity</a>
·
<a href="./PHILOSOPHY.md">Philosophy</a>
·
<a href="./.planning/ROADMAP.md">Roadmap</a>
·
<a href="./.env.example">Config</a>
</p>

Treis is an open-source AI work execution platform built around **Plan Contracts** — scope-sealed agreements between the user and the AI that prevent silent scope creep and make multi-step plans actually complete.

> [!IMPORTANT]
> Set up your environment first: copy `.env.example` to `.env` and fill in your provider and API key. Run `pnpm --filter @treis/desktop dev` to launch the app. See [Config](./.env.example) for all supported providers.

## How it works

```
You describe a task
       ↓
AI asks 2–3 clarifying questions
       ↓
AI proposes 3 contract options  (Fast / Balanced / Thorough)
       ↓
You pick one → scope is sealed, success criteria locked
       ↓
Agent executes — tool calls and tokens stream live
       ↓
Result: pass/fail against the criteria you agreed to
```

If the agent needs to go outside the sealed scope, a **Violation Modal** surfaces. You decide: amend the contract, continue anyway, or stop. No silent scope creep.

## Repository shape

- **`packages/core/`** — Plan Contract engine, agent loop, state machine, session persistence
- **`packages/api-client/`** — Anthropic, OpenAI, Gemini, Mistral, Grok, Ollama adapters
- **`packages/tools/`** — Tool registry, permission gating, FileRead/Write, Bash, Glob, Grep
- **`packages/errors/`** — Typed error hierarchy
- **`apps/cli/`** — `treis run` terminal interface
- **`apps/desktop/`** — Electron app with full Plan Contract UI
- **`PARITY.md`** — feature implementation status
- **`PHILOSOPHY.md`** — why this project exists and how it is designed
- **`.planning/ROADMAP.md`** — phase breakdown and active work

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/ASKKPOP/treis
cd treis
pnpm install

# 2. Configure your AI provider
cp .env.example .env
# edit .env — set TREIS_MODEL_PROVIDER and your API key

# 3. Launch the desktop app
pnpm --filter @treis/desktop dev

# 4. Or use the CLI
pnpm --filter @treis/cli dev "build a todo app"
```

> [!NOTE]
> **No API key?** Set `TREIS_MODEL_PROVIDER=ollama` and install [Ollama](https://ollama.com) locally. Run `ollama pull llama3.2` and no API key is needed.

## Supported providers

| Provider | `TREIS_MODEL_PROVIDER` | Key env var |
|----------|----------------------|-------------|
| Ollama (local) | `ollama` | — |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Google Gemini | `gemini` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Mistral | `mistral` | `MISTRAL_API_KEY` |
| Grok (xAI) | `grok` | `XAI_API_KEY` |

## Release schedule

| Version | Target | What ships |
|---------|--------|-----------|
| **v0.1** | May 2025 | Plan Contract flow end-to-end (Phases 1–4). Desktop + CLI. All 6 providers. |
| **v0.2** | Jun 2025 | Settings UI, session resume, violation amendment persistence, WebFetch tool |
| **v0.3** | Jul 2025 | Benchmark suite, performance dashboard, context window optimization |
| **v0.4** | Aug 2025 | Plugin API — custom tools and providers without forking |
| **v1.0** | Q4 2025 | Stable contract schema, signed macOS DMG, public plugin registry |

Releases are cut from `main`. No release branches — `main` is always the current stable.

## Documentation map

- [`.env.example`](./.env.example) — all environment variables with descriptions
- [`PARITY.md`](./PARITY.md) — what is and isn't implemented
- [`PHILOSOPHY.md`](./PHILOSOPHY.md) — design intent and constraints
- [`.planning/ROADMAP.md`](./.planning/ROADMAP.md) — phase-level roadmap

## Ownership disclaimer

This repository is not affiliated with, endorsed by, or maintained by Anthropic, OpenAI, Google, Mistral, or xAI.
