import type { BenchmarkFixture } from '../types.js'

export const fixture09: BenchmarkFixture = {
  name: '09-data-transformer',
  domain: 'data',
  intent: 'Create a Python script that converts a list of names to uppercase',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write transform.py',
    description: 'Create a Python script that converts a list of names to uppercase using the upper() method',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '*.py' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'transform.py exists',
      'transform.py uses upper()',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'transform.py', description: 'transform.py file exists' },
    { type: 'file-contains', path: 'transform.py', pattern: 'upper', description: 'transform.py uses upper()' },
  ],
}
