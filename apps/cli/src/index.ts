import { program } from 'commander'
import { runCommand } from './commands/run.js'

program
  .name('treis')
  .description('AI work execution with Plan Contracts')
  .version('0.0.1')
  .argument('<task>', 'what you want to accomplish')
  .action(async (task: string) => {
    await runCommand(task)
  })

await program.parseAsync(process.argv)
