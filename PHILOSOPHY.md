# Philosophy

## Why Treis exists

AI coding assistants are impressive in demos. In practice, they start tasks they cannot finish, change scope mid-execution without warning, and leave the user holding a half-built codebase with no clear path forward.

The failure mode is not intelligence — it is **commitment**. The agent never agreed to anything specific. There is no boundary, no definition of done, no moment where the plan was locked and the consequences of violation became visible.

Treis exists to solve that. Not by making AI smarter. By making it **accountable**.

---

## The Plan Contract

Before any execution begins, the user and the AI negotiate a contract:

1. **Intent** — the user describes what they want
2. **Clarification** — the AI asks targeted questions to eliminate ambiguity
3. **Options** — the AI proposes three approaches (Fast / Balanced / Thorough), each with explicit scope, success criteria, and estimated steps
4. **Seal** — the user picks one; scope is locked

Once sealed, the contract is immutable. The agent executes within it. If execution would require going outside the agreed scope, execution stops and a **Violation** is surfaced — not silently worked around.

This is the only interrupt. There are no mid-task check-ins, no progress confirmations, no "are you sure?" dialogs. The contract handles all of that upfront.

---

## Design decisions that follow from this

**No autonomous scope expansion.** The agent cannot decide the contract needs to be bigger. It can propose an amendment — the user decides.

**Violations are first-class, not exceptions.** A violation is not an error. It is a signal that the world differed from the contract. The user decides: amend, continue, or stop.

**Local-first, cloud-optional.** Ollama runs locally. The API key is never required. Plan Contracts should work on a plane with no internet.

**Universal domain.** The tool system is not code-specific. Any task a file system and a shell can accomplish is in scope. The default tools are developer-oriented because developers are the first users — not because the platform is code-only.

**Open source, MIT.** Execution infrastructure should be a commodity. The value is in the contracts, the discipline, and the workflows built on top.

---

## What Treis is not

- Not an agent framework. It is an execution harness for humans who want reliable AI plans.
- Not a replacement for human judgment. The user seals the contract. The user resolves violations. The AI executes within the agreed boundary.
- Not cloud-dependent. Every feature should work locally with an open-weight model.

---

## The name

*Treis* (τρεῖς) is the Greek word for three — the number of options presented before any plan is sealed. A nod to the negotiation at the heart of the system.
