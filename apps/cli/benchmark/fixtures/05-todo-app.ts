import type { BenchmarkFixture } from '../types.js'

export const fixture05: BenchmarkFixture = {
  name: '05-todo-app',
  domain: 'code',
  intent: 'Create a simple todo list in a single HTML file',
  planOption: {
    label: 'A',
    archetype: 'Fast',
    title: 'Write todo.html',
    description: 'Create a single HTML file with a form element for adding todo items',
    tradeoffs: 'Minimal scope, fastest completion',
    estimatedSteps: 1,
    scopeEntries: [
      { type: 'file', glob: '*.html' },
      { type: 'tool', name: 'file-write' },
    ],
    successCriteria: [
      'todo.html exists',
      'todo.html has a form element',
    ],
  },
  expectedOutcomes: [
    { type: 'file-exists', path: 'todo.html', description: 'todo.html file exists' },
    { type: 'file-contains', path: 'todo.html', pattern: '<form', description: 'todo.html has a form element' },
  ],
}
