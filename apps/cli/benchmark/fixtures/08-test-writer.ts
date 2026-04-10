import type { BenchmarkFixture } from '../types.js'

export const fixture08: BenchmarkFixture = {
  name: '08-test-writer',
  domain: 'code',
  intent: 'Write a simple JavaScript test file that tests an add function',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write add.test.js',
    description: 'Create a JavaScript test file that tests an add function using assert or expect',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '*.test.js' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'add.test.js exists',
      'add.test.js contains assert or expect',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'add.test.js', description: 'add.test.js file exists' },
    { type: 'file-contains', path: 'add.test.js', pattern: 'assert|expect', description: 'add.test.js uses assert or expect' },
  ],
}
