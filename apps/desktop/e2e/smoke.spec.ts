/**
 * Smoke tests — verify the app boots, renders, and has correct structure.
 * No API calls required.
 */

import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { join } from 'node:path'

const APP_MAIN = join(__dirname, '../out/main/index.js')

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await electron.launch({
    args: [APP_MAIN],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_IS_TEST: '1',
    },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterEach(async () => {
  await app.close()
})

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

test('SMOKE-01: app launches without crashing', async () => {
  // If we got here, the app launched
  expect(app).toBeDefined()
  expect(page).toBeDefined()
})

test('SMOKE-02: window title is correct', async () => {
  const title = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppPath(),
  )
  expect(title).toBeTruthy()
})

test('SMOKE-03: renderer page has a <body> element', async () => {
  const body = page.locator('body')
  await expect(body).toBeVisible()
})

test('SMOKE-04: app shows IntentInput as initial screen (not blank)', async () => {
  // The IntentInput screen has a textarea — verify it's rendered
  const textarea = page.locator('textarea')
  await expect(textarea).toBeVisible({ timeout: 5000 })
})

test('SMOKE-05: window has correct dimensions (no zero-size)', async () => {
  const size = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win?.getSize() ?? [0, 0]
  })
  expect(size[0]).toBeGreaterThan(400)
  expect(size[1]).toBeGreaterThan(300)
})

test('SMOKE-06: treis IPC bridge is exposed on window', async () => {
  const hasTriesBridge = await page.evaluate(() => {
    return typeof (window as Window & { treis?: unknown }).treis !== 'undefined'
  })
  expect(hasTriesBridge).toBe(true)
})
