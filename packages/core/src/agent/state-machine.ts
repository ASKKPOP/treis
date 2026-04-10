import { TreisError } from '../errors.js'
import { AgentState } from './types.js'

// ---------------------------------------------------------------------------
// Transition table (D-08, AGENT-01)
// Maps each state to the set of states it may legally transition to.
// Terminal states (COMPLETE, VIOLATED, FAILED) have empty arrays.
// ---------------------------------------------------------------------------
export const TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
  [AgentState.IDLE]: [AgentState.PREPARE],
  [AgentState.PREPARE]: [AgentState.STREAM],
  // STREAM can go to TOOLS (tool calls present) OR directly to EVALUATE (text-only step)
  [AgentState.STREAM]: [AgentState.TOOLS, AgentState.EVALUATE],
  [AgentState.TOOLS]: [AgentState.EVALUATE],
  [AgentState.EVALUATE]: [
    AgentState.NEXT,
    AgentState.COMPLETE,
    AgentState.VIOLATED,
    AgentState.FAILED,
  ],
  [AgentState.NEXT]: [AgentState.PREPARE],
  // Terminal states — no allowed transitions (T-02-09: prevents infinite loops)
  [AgentState.COMPLETE]: [],
  [AgentState.VIOLATED]: [],
  [AgentState.FAILED]: [],
}

// ---------------------------------------------------------------------------
// StateMachine class (AGENT-01, T-02-12)
// Guards all state transitions. Illegal transitions throw TreisError so the
// agent executor can distinguish programming errors from runtime failures.
// ---------------------------------------------------------------------------
export class StateMachine {
  private current: AgentState = AgentState.IDLE

  get state(): AgentState {
    return this.current
  }

  /**
   * Advance to the next state.
   * Throws TreisError if the transition is not allowed from the current state.
   */
  transition(next: AgentState): void {
    const allowed = TRANSITIONS[this.current]
    if (!allowed.includes(next)) {
      throw new TreisError(
        `Illegal state transition: ${this.current} -> ${next}`,
        { timestamp: Date.now() }
      )
    }
    this.current = next
  }

  /**
   * Reset the machine back to IDLE.
   * Used between contract executions or after terminal state handling.
   */
  reset(): void {
    this.current = AgentState.IDLE
  }
}
