import type { BenchmarkFixture } from '../types.js'

export const fixture06: BenchmarkFixture = {
  name: '06-summary-writer',
  domain: 'writing',
  intent: 'Write a summary of what a REST API is in a text file',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write rest-api-summary.txt',
    description: 'Create a text file summarizing what a REST API is, including mention of HTTP methods',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '*.txt' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'rest-api-summary.txt exists',
      'File mentions HTTP methods',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'rest-api-summary.txt', description: 'rest-api-summary.txt file exists' },
    { type: 'file-contains', path: 'rest-api-summary.txt', pattern: 'GET', description: 'rest-api-summary.txt mentions HTTP GET method' },
  ],
}
