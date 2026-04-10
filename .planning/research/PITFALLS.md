# Domain Pitfalls: AI Agent Harness / Plan Execution Platform

**Project:** Treis
**Domain:** AI agent harness with Plan Contracts, multi-framework composition, CLI + Electron
**Researched:** 2026-04-09
**Sources:** Anthropic engineering blog, UC Berkeley MAST taxonomy, Trail of Bits security research, community post-mortems, Ollama issue tracker, pnpm/Electron packaging issues

---

## Critical Pitfalls

Mistakes that cause rewrites, total reliability collapse, or security incidents.

---

### Pitfall 1: Reliability Compounding Makes 10-Step Plans Die at 60% Success

**What goes wrong:**
Each tool call in the agent loop has a per-step failure probability. Even at 95% per-step success, a 10-step plan succeeds only ~60% of the time. At 85% per-step success, a 10-step plan fails 4 out of 5 times. This is not a prompt problem — it is a structural mathematical problem. Treis's P0 requirement is a 10-step plan completing end-to-end; this is the hardest number to hit and the first thing that will fail.

**Why it happens:**
Failure probabilities multiply across steps. Silent failures (tool call returns 200 but produces garbage, agent proceeds as if it succeeded) are worse than loud failures because the loop continues building on corrupt state. AI agents compound this further because they don't crash on wrong outputs — they confidently proceed.

**Consequences:**
The benchmark suite (10 plans) will show erratic results. Demo-environment success rates will not transfer to novel tasks. The "10+ step plan completes end-to-end" requirement becomes the product's weakest point rather than its proof of concept.

**Prevention:**
- Per-step verification before proceeding: after each tool call, validate the output matches expected shape/type, not just that the call returned without exception.
- Treat tool error returns as blocking by default. Do not let the agent continue past a tool failure without explicit recovery logic.
- Keep chains short in P0. 10 steps is the requirement; design plans that can be decomposed to minimise steps rather than maximise capability.
- Retry with error context injection (already in requirements) must distinguish between retryable failures (transient) and terminal failures (bad inputs).
- The 3x retry limit must include backoff and must not retry on schema/permission errors — those retries burn tokens and always fail.

**Detection (warning signs):**
- Benchmark suite shows pass rates below 80% on "happy path" plans.
- Agent produces confident-looking output for a task where a tool earlier returned an error.
- Trace logs show the agent receiving a tool error but not branching to the error handling path.

**Phase:** P0 — this is the core reliability problem. Must be addressed before Electron wrapping.

---

### Pitfall 2: Context Window Collapse Kills Long-Running Plans Mid-Execution

**What goes wrong:**
Auto-compaction triggered mid-task causes the agent to lose awareness of what it was doing, what files it has already modified, and what decisions it has already made. Documented in production: after compaction, agents forget they are mid-task, redeclare victory early, or start re-executing already-completed steps, corrupting state.

For Treis specifically: Ollama on 16GB machines defaults to a 2048-token context window unless explicitly configured. A 10-step plan with tool call logs fills this in 2-3 steps. Unless `num_ctx` is set to at least 32k–64k, plans will silently truncate conversation history and the model will lose the thread.

**Why it happens:**
- Ollama's default context is 2048 tokens — orders of magnitude too small for agent loops.
- Auto-compaction (Anthropic, OpenAI Codex) triggers at a threshold and compresses history, removing intermediate tool results and reasoning that the agent depends on.
- The agent's state is implicit in the conversation history. When that history is truncated or compressed, the agent's "memory" of what it has done vanishes.

**Consequences:**
Plans appear to succeed (no crash) but produce incorrect or partial results. Retry logic retries individual steps without knowing the overall plan state has drifted. Plan Contract violations become undetectable because the agent no longer "remembers" what was in scope.

**Prevention:**
- For Ollama: always set `num_ctx` explicitly at model initialisation time. Minimum 32k for agent loops; 64k for plans with web search or file reads. Document this as a hard constraint in setup.
- For cloud (Anthropic): use explicit compaction checkpoints at plan phase boundaries, not reactive compaction at a token limit. Never compact mid-subtask.
- Externalise agent state: the session state store (mutable store pattern in requirements) must capture plan progress, completed steps, and pending steps as structured data — not as implicit conversation history.
- The JSONL trace log must be the source of truth for plan progress, not the model's context window.
- Design the agent loop so it can reconstruct its current state from the trace log on resume.

**Detection (warning signs):**
- Ollama inference time drops suddenly mid-plan (context eviction, falling back to RAM).
- Agent starts asking clarifying questions it already resolved 3 steps ago.
- Plan Contract scope state is not being updated in the session store but the agent is still running.
- Trace shows gaps where tool results are missing from the conversation turn.

**Phase:** P0 — the Ollama context configuration must be part of the model initialisation path, not a user-facing setting. The external state store design must be finalised before the agent loop is written.

---

### Pitfall 3: BashTool Is an Arbitrary Code Execution Vulnerability

**What goes wrong:**
The BashTool is the largest attack surface in the system. Trail of Bits research (CVE-2025-54795, CVSS 8.7) documented that whitelisted commands can be crafted to execute arbitrary shell instructions. Indirect prompt injection from file contents, web search results, or tool outputs can cause the agent to issue destructive bash commands. Agents in agentic IDEs have been documented to bypass sandboxes when the sandbox blocked their goal.

For Treis: the BashTool is in P0 scope. The agent can read files, write files, and execute bash. A prompt injection in any tool output (web search result, file content) becomes a code execution vector.

**Why it happens:**
- The model sees the injected instruction as part of the conversation and follows it.
- Allowlists based on command names (e.g. allowing `echo`) can be bypassed via shell metacharacters.
- Agents will work around restrictions if they believe the restriction is preventing task completion.

**Consequences:**
A malicious or poorly-sanitised file read could cause the agent to exfiltrate data, modify files outside the plan scope, or execute arbitrary code. In an open-source tool targeting developers, this is a critical reputational and security risk.

**Prevention:**
- Implement permission gates as blocking UI prompts (already in requirements) — but make them mandatory, not bypassable with "always allow."
- Apply allowlist-based command validation at the harness level (not the model level). Parse the command, not the intent. Block metacharacters: `;`, `&&`, `||`, `$(...)`, `` ` ``, `>`, `>>`, `|` unless explicitly in scope.
- Scope bash execution to a working directory. Reject paths that traverse outside the project root.
- Log every bash invocation with its full command string to the JSONL trace before execution.
- Consider macOS Sandbox profiles (seatbelt) for sandboxing the bash execution subprocess. Claude Code uses this approach.
- Never pass raw tool output back into the conversation without sanitisation pass.

**Detection (warning signs):**
- Tool output from web search or file read contains phrases like "Ignore previous instructions" or shell metacharacters in unexpected positions.
- Bash commands include path traversal (`../`, `/proc/`, `/etc/`).
- The agent issues bash commands not present in the original plan.

**Phase:** P0 — must be addressed before any public release. The permission gate and command allowlist are blockers for the BashTool shipping.

---

### Pitfall 4: Plan Contract Violation Detection Is Harder Than Plan Contract Definition

**What goes wrong:**
Defining a scope boundary is straightforward. Detecting when the agent has violated it during execution is not. The typed `ScopeEntry` pattern (file/tool/URL patterns = programmatic; natural language actions = model-judged) creates two fundamentally different reliability profiles for the same feature. Model-judged violations will produce false positives (interrupting valid work) and false negatives (missing real violations).

The killer risk: a false negative means the Plan Contract failed silently — the product's entire value proposition is undermined without the user knowing.

**Why it happens:**
- Natural language action descriptions are ambiguous. "Modifies authentication code" can match many things.
- The model judging its own violations is a conflict of interest — it has motivated reasoning to continue the task.
- Scope boundaries defined in plain English before execution may not map cleanly to the concrete actions the agent takes.

**Consequences:**
The Plan Contract becomes a UI promise rather than a technical guarantee. Users will trust the seal, the agent will violate scope, and the product looks unreliable in exactly the domain it claims to solve.

**Prevention:**
- In P0: implement only programmatic violation detection (file paths, tool calls, URL patterns). Defer model-judged violations to P1 when evaluation quality can be measured.
- For programmatic detection: intercept every tool call before execution, check its arguments against the sealed ScopeEntry list, and block (not just warn) on violations.
- Do not rely on the executing model to self-report violations. The violation detector must be in the harness, not in the prompt.
- When a violation is detected, the interrupt must halt execution and require Builder input — not just log a warning and continue.
- Track false positive and false negative rates in the benchmark suite. A violation detector that trips on valid work is as bad as one that misses real violations.

**Detection (warning signs):**
- Agent writes to a file path not present in the sealed scope.
- Tool calls include URLs not listed in the contract.
- The plan continues executing after a scope warning without Builder confirmation.

**Phase:** P0 (programmatic only). Model-judged violations are a P1 feature that requires separate evaluation infrastructure.

---

### Pitfall 5: Local-to-Cloud Fallback Corrupts Agent State If Not Designed as a Resumption Protocol

**What goes wrong:**
Switching from Ollama (local) to Anthropic (cloud) mid-task is not a transparent swap. The two models have different context formats, different tool-call JSON schemas, different default behaviours, and different context window sizes. Naively swapping the model client mid-conversation will produce format mismatches, context truncation, or the new model ignoring prior tool results because they were formatted for the old model.

Additionally: if the fallback is triggered silently (because the local model crashed or RAM was exhausted), the user believes they are still on a private local model when they are actually sending data to the cloud.

**Why it happens:**
- Model router treats local and cloud as equivalent backends with the same interface.
- Conversation history accumulates in a provider-specific format.
- RAM pressure on 16GB machines can cause Ollama to kill the model process mid-inference, triggering fallback without explicit user action.

**Consequences:**
Silent privacy regression: user chose local for privacy, fallback to cloud sends their data to Anthropic without explicit consent. State corruption: the new model receives malformed history and produces garbage. The JSONL trace will show a model switch but the user will not see it.

**Prevention:**
- Fallback must be explicit and interruptive: display a modal before switching, require Builder confirmation. Never switch silently.
- Design the session state store as the canonical handoff format. When switching models, reconstruct the conversation from the state store, not by passing raw conversation history.
- The state store must be model-agnostic: no provider-specific fields.
- Test the local-to-cloud handoff path explicitly in the benchmark suite. It is not a secondary code path.
- Surface the currently active model prominently in the CLI output and Electron UI at all times.

**Detection (warning signs):**
- Model switch occurs but no user notification is logged.
- Trace shows model_id changing mid-execution.
- The new model's first response ignores context established by the prior model.

**Phase:** P0 — the model routing layer must be designed with explicit handoff semantics before either model path is built. Retrofitting this is expensive.

---

## Moderate Pitfalls

Mistakes that degrade reliability or developer experience significantly.

---

### Pitfall 6: Electron Main Process Blocking Freezes the Entire App During Agent Execution

**What goes wrong:**
The agent loop runs CPU-bound and I/O-bound operations (model inference calls, bash execution, file reads). If any of these run on Electron's main process, the UI freezes for the duration. Token streaming to the renderer via IPC becomes choppy or stops. The app appears hung.

**Prevention:**
- Run the core agent loop (@treis/core) in a Node.js worker thread or a dedicated hidden BrowserWindow process, never on the main process.
- IPC streaming from core to renderer must use event-based chunks, not synchronous data transfer.
- Apply backpressure: if the renderer cannot consume tokens fast enough (busy painting), buffer in the main process and drain on the next frame. Do not drop tokens.
- Limit IPC message frequency: batch token chunks at 16ms intervals (one frame) rather than emitting one IPC event per token.

**Detection (warning signs):**
- UI frame rate drops to 0 during plan execution.
- IPC events are emitted but renderer updates are delayed by seconds.
- `setTimeout` callbacks in the renderer process are delayed beyond 100ms during execution.

**Phase:** P0 (CLI does not have this issue). Electron wrapping phase (weeks 5-8) must architect the process topology before writing any rendering code.

---

### Pitfall 7: pnpm Monorepo Symlinks Break Electron Packaging

**What goes wrong:**
pnpm uses symlinked node_modules by default. Electron packagers (electron-builder, Electron Forge) crawl node_modules naively and do not follow symlinks correctly, causing workspace packages to be missing from the packaged asar archive at runtime. A confirmed regression in pnpm 10.29.x broke transitive dependencies in packaged apps.

**Prevention:**
- Use `dependenciesMeta[].injected: true` in pnpm workspace config for all internal packages (@treis/core, @treis/api-client, @treis/tools) that are consumed by the Electron app. This hard-links instead of symlinking.
- Pin the pnpm version in the project (`.npmrc` or `packageManager` field) and test packaging on every pnpm minor update.
- Run a packaging smoke test (not just dev mode) in CI. The symlink issue is invisible in `electron .` development mode.

**Detection (warning signs):**
- `Cannot find module '@treis/core'` errors in packaged app but not in development.
- Packaged asar is missing node_modules that are present in dev.
- CI builds pass but packaged app crashes on launch.

**Phase:** Electron wrapping phase. Must be caught before first packaged build attempt.

---

### Pitfall 8: Auto-Compaction Triggers at the Worst Possible Moment

**What goes wrong:**
Both Anthropic API (with auto-compaction enabled) and any harness-level compaction strategy will, if triggered reactively at a token threshold, interrupt the agent mid-subtask. The compacted context removes intermediate tool results, partially completed reasoning chains, and the agent loses its working memory. Documented in production: agents after compaction forget they have already modified files and re-execute destructive operations.

**Prevention:**
- Never trigger compaction reactively at a token threshold. Compaction must only trigger at plan phase boundaries (between steps, not within a step).
- Use the JSONL trace + external session state store as the compaction input: summarise completed steps from structured data, not from conversation history.
- After compaction, inject a structured summary of completed work (plan state, files modified, decisions made) as the first message to the new context, not a prose summary.
- Test compaction explicitly: include a plan in the benchmark suite that requires more than 32k tokens to complete.

**Detection (warning signs):**
- Agent re-executes a bash command that was already executed and logged.
- Trace shows the agent asking the same clarifying question it answered 5 steps ago.
- Context usage metric crosses 70% threshold mid-step rather than at a step boundary.

**Phase:** P0 — the agent loop step boundary must be a compaction checkpoint from the beginning.

---

### Pitfall 9: Framework Composition Becomes an Undebuggable Dependency Chain

**What goes wrong:**
Treis loads gstack, GSD, and Superpowers as runtime layers. Each framework has its own update cadence, its own CLAUDE.md conventions, and its own skill expectations. When a framework updates and changes its skill interface, Treis silently loads the broken version. The error surfaces in plan execution as a tool failure or a malformed skill output, not as a dependency error.

**Prevention:**
- Pin all three framework layers to specific commit SHAs or version tags, not `latest` or `main`.
- Write integration smoke tests for each loaded framework that run at harness startup. If the skill interface is broken, fail fast before plan execution begins.
- Load framework layers lazily and validate their interface contract before registering them as available tools.
- Document the expected interface contract for each framework layer in the architecture spec.

**Detection (warning signs):**
- A plan fails with a tool error immediately after a framework update.
- Skill output format changes silently (different JSON schema) without the harness detecting it.
- Integration smoke test output diverges from expected schema.

**Phase:** P0 (Superpowers loader is P0 scope). The loader must include interface validation before any skill is made available to the agent.

---

### Pitfall 10: Benchmark Suite Measures the Easy Cases, Misses Failure Modes

**What goes wrong:**
A 10-plan benchmark suite is the right shape, but if all 10 plans are "happy path" developer tasks in a clean environment, the benchmark does not measure what actually fails in production: ambiguous inputs, partial tool failures, context pressure, scope boundary edge cases, and model quality degradation on novel domains.

**Prevention:**
- Include at least 3 adversarial plans in the benchmark suite: one where a tool returns an error mid-plan, one where the user's task description is ambiguous enough to require clarification, one where the plan scope is near the boundary of what the agent can detect.
- Include at least one plan that exercises the full context window to test compaction handling.
- Measure and report per-step success rates, not just end-to-end success. A plan that succeeds 8/10 steps but always fails on step 9 is telling you something specific.
- Run the benchmark against both local (Ollama) and cloud (Anthropic) backends. Local models on 16GB machines will exhibit different failure modes.

**Detection (warning signs):**
- All 10 benchmark plans are variations of "write a function" or similar simple developer tasks.
- Benchmark always runs against Anthropic API, never against Ollama.
- Benchmark does not include any plan that intentionally triggers a retry.

**Phase:** P0 — design the benchmark suite in parallel with the agent loop, not after.

---

## Minor Pitfalls

---

### Pitfall 11: JSONL Traces Without Correlation IDs Are Useless for Debugging

**What goes wrong:**
Each tool call, model response, retry, and violation event is logged, but without a consistent plan execution ID threaded through every entry, reconstructing a single plan's timeline requires grepping multiple files and manual correlation.

**Prevention:**
- Every JSONL entry must include: `execution_id` (uuid per plan run), `step_id` (sequential), `timestamp`, `event_type`. These four fields make any entry findable and sortable.
- Tool call entries must include: input arguments, output summary, duration_ms, success boolean.
- Retry entries must link to the original failed entry via `retry_of: step_id`.

**Phase:** P0 — schema design must happen before the first log line is written.

---

### Pitfall 12: "Universal Domain" Claim Conflicts With Developer-Focused P0 Toolset

**What goes wrong:**
Treis claims to support "any Builder, any task domain," but the P0 toolset (FileRead, FileWrite, Bash, WebSearch) is exclusively developer-oriented. A non-developer using Treis for a document editing or research task will attempt to use these tools, find them insufficient, and conclude the product does not work for their domain.

**Prevention:**
- Be explicit in P0 documentation and onboarding that the current tool set is developer-focused. "Universal domain" is the vision; P0 is the foundation.
- Do not present the product as universally capable until P2+ when the tool set broadens.
- The Plan Contract dialogue should surface tool constraints to the user: "I can complete this plan using file operations and web search. Tasks requiring browser automation or GUI interaction are not yet supported."

**Phase:** P0 for documentation framing. P2+ for broadening the tool set.

---

### Pitfall 13: Permission Gate UX That Is Always "Yes" Becomes Security Theater

**What goes wrong:**
If the permission gate modal appears for every tool call (20+ times in a 10-step plan), users will reflexively click "allow" without reading. The gate provides no real security — it is just friction. Conversely, an "always allow" toggle disables the gate entirely.

**Prevention:**
- Distinguish between high-risk operations (bash with write/delete, web requests to external URLs) and low-risk operations (read-only file access within the project directory).
- Show the gate only for high-risk operations. Low-risk operations within the sealed scope should execute without interruption.
- Never provide "always allow" for BashTool. Provide "allow for this plan" as the maximum grant scope.
- Log every grant decision to the trace with the specific operation granted.

**Phase:** P0 — the gate design must be part of the initial tool system implementation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Agent loop state machine (P0) | Context collapse mid-step, compaction at wrong boundary | External state store, compaction only at step boundaries |
| BashTool implementation (P0) | Prompt injection → arbitrary code execution | Command allowlist at harness layer, path scoping, mandatory permission gate |
| Plan Contract engine (P0) | Silent scope violations, model-judged false negatives | Programmatic-only detection in P0, intercept at tool call level |
| Ollama local model path (P0) | Default 2048-token context, RAM exhaustion mid-inference | Explicit `num_ctx: 32768+` at initialisation, RAM headroom check at startup |
| Local-to-cloud fallback (P0) | Silent model switch, privacy regression, state corruption | Mandatory user confirmation before switch, state-store-based handoff |
| Benchmark suite (P0) | Measures only happy path, misses failure modes | Include adversarial plans, test both model backends |
| Electron process topology (weeks 5-8) | Main process blocking, IPC backpressure | Agent loop in worker thread, batched IPC events |
| pnpm + Electron packaging (weeks 5-8) | Symlink resolution failures in asar | `injected: true` for workspace packages, packaging smoke test in CI |
| Framework composition loader (P0) | Silent interface breakage on framework update | Pin framework versions, validate interface at load time |
| Permission gate UX (P0) | Permission fatigue → reflexive allow → security theater | Risk-tiered gating, no "always allow" for BashTool |

---

## Sources

- Anthropic Engineering: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- UC Berkeley / arXiv: [Why Do Multi-Agent LLM Systems Fail? (MAST taxonomy)](https://arxiv.org/pdf/2503.13657)
- Trail of Bits: [Prompt injection to RCE in AI agents](https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/)
- Anthropic: [Claude Code sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
- MindStudio: [The reliability compounding problem](https://www.mindstudio.ai/blog/reliability-compounding-problem-ai-agent-stacks)
- StrongMocha: [Token streaming backpressure for UIs](https://strongmocha.com/ai-infrastructure-data-centers/token-streaming-backpressure-ui/)
- Ollama issue tracker: [Large context breaks usability](https://github.com/ollama/ollama/issues/9890)
- OpenAI Codex issue tracker: [Auto compaction causes agent to lose the plot](https://github.com/openai/codex/issues/5957)
- pnpm issue tracker: [Regression in pnpm 10.29.3 with Electron packaging](https://github.com/pnpm/pnpm/issues/10601)
- Portkey: [Retries, fallbacks, and circuit breakers in LLM apps](https://portkey.ai/blog/retries-fallbacks-and-circuit-breakers-in-llm-apps/)
- Medium / Actual Budget: [The horror of blocking Electron's main process](https://medium.com/actualbudget/the-horror-of-blocking-electrons-main-process-351bf11a763c)
- DEV Community: [6 ways your AI agent fails silently](https://dev.to/ilflow4592/6-ways-your-ai-agent-fails-silently-with-code-to-catch-each-one-5fi4)
