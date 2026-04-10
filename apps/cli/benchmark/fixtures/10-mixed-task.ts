import type { BenchmarkFixture } from '../types.js'

export const fixture10: BenchmarkFixture = {
  name: '10-mixed-task',
  domain: 'mixed',
  intent: 'Create a package.json for a new npm project called my-lib',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write package.json',
    description: 'Create a package.json file for an npm project with name my-lib',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: 'package.json' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'package.json exists',
      'package.json contains my-lib',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'package.json', description: 'package.json file exists' },
    { type: 'file-contains', path: 'package.json', pattern: 'my-lib', description: 'package.json contains my-lib' },
  ],
}
