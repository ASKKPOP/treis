import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

let instance: ReturnType<typeof createInterface> | null = null

export function createCliInterface(): ReturnType<typeof createInterface> {
  if (!instance) {
    instance = createInterface({ input: stdin, output: stdout })
  }
  return instance
}
