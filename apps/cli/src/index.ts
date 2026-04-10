import { config as loadEnv } from 'dotenv'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { program } from 'commander'
import { runCommand } from './commands/run.js'

// Load root .env (two levels up from apps/cli/)
const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '../../../.env'), override: false })

program
  .name('treis')
  .description('AI work execution with Plan Contracts')
  .version('0.0.1')
  .argument('<task>', 'what you want to accomplish')
  .action(async (task: string) => {
    await runCommand(task)
  })

await program.parseAsync(process.argv)
