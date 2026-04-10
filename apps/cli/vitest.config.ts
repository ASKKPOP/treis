import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'benchmark',
          include: ['benchmark/**/*.test.ts'],
          testTimeout: 600_000,
        },
      },
    ],
  },
})
