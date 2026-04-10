# Parity

Current implementation status across the Treis feature surface. Updated each release.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented and tested |
| 🔶 | Partial — works but incomplete |
| ❌ | Not yet implemented |
| 🚫 | Out of scope for current milestone |

---

## Plan Contract Engine

| Feature | Status | Notes |
|---------|--------|-------|
| Intent capture | ✅ | Free-text input, 4000 char limit |
| Clarification dialogue | ✅ | 2–3 questions, streaming tokens |
| Plan options (A/B/C) | ✅ | Fast / Balanced / Thorough archetypes |
| Contract sealing | ✅ | Immutable after selection, written to disk |
| Scope entries | ✅ | File globs, tool names, URLs, actions |
| Success criteria | ✅ | Measurable, checked at result screen |
| Contract persistence | ✅ | JSONL on disk, survives restart |
| Contract amendment | 🔶 | Backend wired; UI flow incomplete |

---

## Agent Loop

| Feature | Status | Notes |
|---------|--------|-------|
| streamText execution | ✅ | Vercel AI SDK 6, all providers |
| Tool call dispatch | ✅ | FileRead, FileWrite, Glob, Grep, Bash |
| Step retries | ✅ | Exponential backoff, circuit breaker |
| Token budget tracking | ✅ | Warning at 80%, hard stop at 100% |
| Scope violation detection | ✅ | Per-call scope check against contract |
| Violation interrupt | ✅ | Worker thread blocked, modal surfaced |
| Violation: stop | ✅ | |
| Violation: amend | 🔶 | IPC wired; contract update not persisted |
| Violation: continue | ✅ | Worker resumes |
| Escalation approval | ❌ | Auto-declined in Phase 4 |

---

## Tool System

| Tool | Status | Permission tier |
|------|--------|----------------|
| FileRead | ✅ | ReadOnly |
| Glob | ✅ | ReadOnly |
| Grep | ✅ | ReadOnly |
| FileWrite | ✅ | WriteFiles |
| Bash | ✅ | ExecuteShell |
| WebSearch | 🔶 | NetworkAccess — stub implementation |
| WebFetch | ❌ | NetworkAccess |

---

## Providers

| Provider | Status | Env var |
|----------|--------|---------|
| Ollama (local) | ✅ | — (no key needed) |
| Anthropic | ✅ | `ANTHROPIC_API_KEY` |
| OpenAI | ✅ | `OPENAI_API_KEY` |
| Google Gemini | ✅ | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Mistral | ✅ | `MISTRAL_API_KEY` |
| Grok (xAI) | ✅ | `XAI_API_KEY` |

---

## CLI (`apps/cli`)

| Feature | Status | Notes |
|---------|--------|-------|
| `treis run <task>` | ✅ | Streams execution to terminal |
| Execution stream display | ✅ | Tool calls, tokens, verdict badges |
| Result screen | ✅ | Pass/fail criteria list |
| `.env` loading | ✅ | Reads from repo root |
| Benchmark suite | 🔶 | 10 fixtures defined; runner incomplete |

---

## Desktop (`apps/desktop`)

| Feature | Status | Notes |
|---------|--------|-------|
| IntentInput screen | ✅ | Centered textarea, auto-focus |
| Dialogue screen | ✅ | Streaming Q&A, error state |
| PlanOptions screen | ✅ | A/B/C keyboard selection |
| SealedContract screen | ✅ | Scope + criteria review |
| ExecutionStream screen | ✅ | 60/40 split, live tool + token stream |
| Result screen | ✅ | Pass/fail criteria, Start New Task |
| ViolationModal | ✅ | Escape blocked, focus trap |
| macOS DMG packaging | ✅ | Universal binary (Apple Silicon + Intel) |
| `.env` loading | ✅ | Reads from repo root |
| Settings UI | ❌ | Planned Phase 5 |

---

## Session & Persistence

| Feature | Status | Notes |
|---------|--------|-------|
| Session state (JSONL) | ✅ | `~/.treis/sessions/{id}.jsonl` |
| Workspace bootstrap | ✅ | Temp dir per session |
| Checkpoints | ✅ | Written after each step |
| Session resume | ❌ | Planned Phase 5 |
