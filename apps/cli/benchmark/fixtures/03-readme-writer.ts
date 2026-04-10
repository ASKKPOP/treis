import type { BenchmarkFixture } from '../types.js'

export const fixture03: BenchmarkFixture = {
  name: '03-readme-writer',
  domain: 'writing',
  intent: 'Write a README.md for a calculator library',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write README.md',
    description: 'Create a README.md file with installation instructions for a calculator library',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: 'README.md' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'README.md exists',
      'README.md contains installation instructions',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'README.md', description: 'README.md file exists' },
    { type: 'file-contains', path: 'README.md', pattern: 'install', description: 'README.md contains installation instructions' },
  ],
}
