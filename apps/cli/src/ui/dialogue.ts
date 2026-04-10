import type { Interface as ReadlineInterface } from 'node:readline/promises'

export async function runDialogue(
  rl: ReadlineInterface,
  questions: string[],
): Promise<string[]> {
  const answers: string[] = []
  for (const q of questions) {
    process.stdout.write(`\n  ${q}\n`)
    const answer = await rl.question('  > ')
    answers.push(answer)
  }
  return answers
}
