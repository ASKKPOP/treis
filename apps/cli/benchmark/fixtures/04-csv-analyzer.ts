import type { BenchmarkFixture } from '../types.js'

export const fixture04: BenchmarkFixture = {
  name: '04-csv-analyzer',
  domain: 'data',
  intent: 'Create a Python script that reads a CSV and prints column names',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write analyze.py',
    description: 'Create a Python script that imports the csv module and prints column names from a CSV file',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '*.py' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'analyze.py exists',
      'analyze.py reads CSV',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'analyze.py', description: 'analyze.py file exists' },
    { type: 'file-contains', path: 'analyze.py', pattern: 'csv', description: 'analyze.py references csv' },
  ],
}
