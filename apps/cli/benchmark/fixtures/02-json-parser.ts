import type { BenchmarkFixture } from '../types.js'

export const fixture02: BenchmarkFixture = {
  name: '02-json-parser',
  domain: 'code',
  intent: 'Create a Node.js script that reads and pretty-prints a JSON file',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write parse-json.js',
    description: 'Create a single JavaScript file that uses JSON.parse to read and pretty-print JSON data',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '*.js' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'A file named parse-json.js exists',
      'parse-json.js uses JSON.parse',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'parse-json.js', description: 'parse-json.js file exists' },
    { type: 'file-contains', path: 'parse-json.js', pattern: 'JSON.parse', description: 'parse-json.js uses JSON.parse' },
  ],
}
