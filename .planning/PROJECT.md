# Treis

## What This Is

Treis is an open-source AI-powered universal work execution platform that makes 20-step AI plans actually complete end-to-end. It composes three proven open-source frameworks (gstack, GSD, Superpowers) as runtime layers rather than reinventing skill systems, and introduces Plan Contracts to seal scope before execution begins. Ships as both a CLI and an Electron desktop app.

## Core Value

Plan Contracts: AI proposes options, Builder picks one, scope is sealed with boundaries and success criteria before any execution begins. The only interrupt is a genuine contract violation. This is the thing that makes multi-step AI plans reliable.

## Requirements

### Validated

(None yet -- ship to validate)

### Active

- [ ] CLI: `treis "task description"` completes a 10+ step plan end-to-end
- [ ] Electron: visual plan contract flow (input -> dialogue -> options -> seal -> execute -> result)
- [ ] Plan Contract engine: AI asks 2-3 clarifying questions, proposes 3 options, Builder picks, scope sealed
- [ ] Contract violation detection triggers on scope boundary breach
- [ ] Retry policy: failed steps retry up to 3x with error context injection
- [ ] Both local (Ollama) and cloud (Anthropic) model support from Phase 0
- [ ] Agent loop with explicit state machine transitions
- [ ] Tool system: FileRead, FileWrite, Bash, WebSearch with permission gates
- [ ] Skill loader loads Superpowers framework and enforces 1% Rule during execution
- [ ] JSONL trace logging for every plan execution (tool calls, verdicts, retries)
- [ ] IPC bridge streaming tokens from core to Electron renderer
- [ ] Session state management with mutable store pattern
- [ ] 10-plan benchmark suite with measured success rate
- [ ] Demo GIF ready for README and Show HN

### Out of Scope

- Reimplementing gstack/GSD/Superpowers skills -- Treis loads these as-is, builds the harness around them
- GSD and gstack framework integration adapters -- Phase 1, only Superpowers loader in Phase 0
- Three-agent architecture (Init/Exec/Eval) -- Phase 2, Phase 0 uses single agent loop
- KAIROS memory system -- Phase 1
- Browser automation tool (Playwright) -- Phase 3, leverages gstack browse
- REST API service -- Phase 3
- Windows/Linux support -- Phase 3, macOS first
- Code signing and notarization -- Phase 2
- Auto-update system -- Phase 2
- eKlotho integration -- removed from scope entirely

## Context

- **Architecture:** pnpm monorepo with 4 packages (@treis/core, @treis/api-client, @treis/tools) + 2 apps (cli, desktop)
- **Stack:** TypeScript, Node.js, Electron 32+, React 19, Vite, Vitest, pnpm workspaces
- **Three-Layer Model:** Logos (gstack/decision), Ethos (GSD/stability), Pathos (Superpowers/execution) -- loaded as runtime layers
- **Model Routing:** Local models use RAM-managed slots (A=Primary, B=Background). Cloud APIs use cost/speed-optimized routing tiers.
- **Clean-room:** All TypeScript written from scratch. Zero lines from any proprietary source. Architecture spec serves as the "wall."
- **Prior art analyzed:** Logic patterns from public open-source frameworks and publicly observable behavior. Legal: clean-room process.
- **Design doc:** APPROVED (8/10) at `~/.gstack/projects/treis/desirey-unknown-design-20260409-210907.md`
- **Architecture spec:** v1.1 at `TREIS_ARCHITECTURE_SPEC.md` (16 sections, 55 targets, 28 decisions)
- **Eng review:** Completed. 6 gaps identified, 78% readiness. Proceed with adjustments.

## Constraints

- **License:** MIT open source, community-driven
- **Platform:** macOS first (Apple Silicon + Intel universal binary)
- **Timeline:** 6-8 weeks for Phase 0
- **Clean-room:** Zero lines from proprietary source code. Legal requirement.
- **Composition:** Load existing frameworks as layers, do NOT reimplement their skill packs
- **Local+Cloud:** Both Ollama (local) and Anthropic API (cloud) from Phase 0
- **Universal domain:** Not code-only. Any Builder, any task domain. (Though Phase 0 tools are developer-focused)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Composition over reinvention | Loading three proven frameworks > building custom skills | -- Pending |
| Plan Contract as killer feature | Sealing scope before execution differentiates from every other harness | -- Pending |
| Both local + cloud from Phase 0 | Local for privacy, cloud for reliability. User chooses tradeoff. | -- Pending |
| 6-8 weeks for Phase 0 | Extended from 4 weeks. Harness IS the product; buggy harness defeats thesis. | -- Pending |
| CLI first, then Electron | CLI proves Plan Contract works (weeks 1-5). Electron wraps proven engine (weeks 5-8). | -- Pending |
| Vitest for testing | Fast, ESM-native, workspace-aware. Aligns with Vite in Electron app. | -- Pending |
| Single agent loop in P0 | Three-agent architecture is Phase 2. Keep P0 simple: one model, one loop. | -- Pending |
| Typed ScopeEntry for drift detection | Programmatic checking for file/tool/URL patterns. Model-judged for natural language actions. | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-09 after initialization*
