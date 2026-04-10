/**
 * Error context included in all Treis errors per D-22.
 * Provides structured data for trace logging.
 */
export interface ErrorContext {
  tool?: string
  input?: string
  timestamp: number
  [key: string]: unknown
}

/**
 * Base error class for all Treis errors per D-21.
 * All errors include context with at least a timestamp.
 */
export class TreisError extends Error {
  readonly context: ErrorContext

  constructor(message: string, context?: Partial<ErrorContext>) {
    super(message)
    this.name = this.constructor.name
    this.context = { timestamp: Date.now(), ...context }
    // Restore prototype chain for instanceof checks across transpilation boundaries
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Thrown when the model connection fails (network, auth, service unavailable).
 */
export class ModelConnectionError extends TreisError {
  constructor(message: string, context?: Partial<ErrorContext>) {
    super(message, context)
  }
}

/**
 * Thrown when model token streaming is interrupted or corrupted.
 */
export class ModelStreamError extends TreisError {
  constructor(message: string, context?: Partial<ErrorContext>) {
    super(message, context)
  }
}

/**
 * Thrown when a tool invocation fails. Requires tool name in context per D-22.
 */
export class ToolExecutionError extends TreisError {
  constructor(message: string, context: Partial<ErrorContext> & { tool: string }) {
    super(message, context)
  }
}

/**
 * Thrown when a tool call requires a higher permission tier than granted.
 * Includes requiredTier so the agent loop can surface the right prompt.
 */
export class PermissionDeniedError extends TreisError {
  readonly requiredTier: string

  constructor(message: string, context: Partial<ErrorContext> & { requiredTier: string }) {
    super(message, context)
    this.requiredTier = context.requiredTier
  }
}

/**
 * Thrown when a resolved file path falls outside the workspace root per D-15.
 * Includes workspaceRoot and targetPath for audit logging.
 */
export class PathTraversalError extends TreisError {
  constructor(
    message: string,
    context: Partial<ErrorContext> & { workspaceRoot: string; targetPath: string }
  ) {
    super(message, context)
  }
}
