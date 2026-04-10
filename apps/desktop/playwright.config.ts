import { defineConfig } from '@playwright/test'
import { join } from 'node:path'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    // Electron app path — built output
    executablePath: join(__dirname, '../../node_modules/.bin/electron'),
  },
})
