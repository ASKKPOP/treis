export { PermissionTier } from './base/types.js'
export type { Tool, ToolContext, ToolResult, PermissionCheckResult } from './base/types.js'

export { executeTools } from './base/executor.js'
export type { ToolCall, ExecutionResult } from './base/executor.js'

export { checkPermission } from './permissions/gate.js'

export { assertWithinWorkspace } from './utils/path-guard.js'

export { FileReadTool } from './impl/file-read.js'
export { GlobTool } from './impl/glob.js'
export { GrepTool, type GrepMatch } from './impl/grep.js'
