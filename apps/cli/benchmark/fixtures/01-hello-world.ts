import type { BenchmarkFixture } from '../types.js'

export const fixture01: BenchmarkFixture = {
  name: '01-hello-world',
  domain: 'code',
  intent: 'Create a Python hello world script',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write hello.py',
    description: 'Create a single Python file that prints Hello, World!',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '*.py' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'A file named hello.py exists',
      'hello.py contains a print statement',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'hello.py', description: 'hello.py file exists' },
    { type: 'file-contains', path: 'hello.py', pattern: 'print', description: 'hello.py contains a print statement' },
  ],
}
