import type { BenchmarkFixture } from '../types.js'

export const fixture07: BenchmarkFixture = {
  name: '07-config-generator',
  domain: 'mixed',
  intent: 'Create a .gitignore file for a Node.js project',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write .gitignore',
    description: 'Create a .gitignore file with common Node.js ignore patterns including node_modules',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '.gitignore' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      '.gitignore exists',
      '.gitignore contains node_modules',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: '.gitignore', description: '.gitignore file exists' },
    { type: 'file-contains', path: '.gitignore', pattern: 'node_modules', description: '.gitignore contains node_modules' },
  ],
}
