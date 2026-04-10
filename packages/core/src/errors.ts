/**
 * Re-exports all error types from @treis/errors.
 * This module is kept for backward compatibility — imports from @treis/core still work.
 */
export {
  ErrorContext,
  TreisError,
  ModelConnectionError,
  ModelStreamError,
  ToolExecutionError,
  PermissionDeniedError,
  PathTraversalError,
} from '@treis/errors'
