import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ConversationEntry {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface SessionPersister {
  append(entry: ConversationEntry): Promise<void>
  readonly filePath: string
}

export function createSessionPersister(
  sessionsDir: string,
  sessionId: string
): SessionPersister {
  const filePath = join(sessionsDir, `${sessionId}.jsonl`)

  return {
    filePath,
    async append(entry: ConversationEntry): Promise<void> {
      const line = JSON.stringify(entry) + '\n'
      await appendFile(filePath, line, 'utf-8')
    },
  }
}
