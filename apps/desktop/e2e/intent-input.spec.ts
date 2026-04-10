/**
 * E2E tests for the IntentInput screen
 *
 * Tests static UI behavior — no API calls required.
 * The app launches, shows IntentInput, and we verify form interactions.
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
// TC-01: Initial render
// ---------------------------------------------------------------------------

test('TC-01: shows IntentInput screen on launch', async () => {
  const textarea = page.locator('textarea')
  await expect(textarea).toBeVisible()
  await expect(textarea).toHaveAttribute('placeholder', 'Describe what you want to accomplish...')
})

test('TC-02: textarea is auto-focused on load', async () => {
  const textarea = page.locator('textarea')
  await expect(textarea).toBeFocused()
})

test('TC-03: Start button is disabled when textarea is empty', async () => {
  const button = page.locator('button', { hasText: 'Start' })
  await expect(button).toBeVisible()
  await expect(button).toBeDisabled()
})

// ---------------------------------------------------------------------------
// TC-04: Form interaction
// ---------------------------------------------------------------------------

test('TC-04: Start button enables when user types text', async () => {
  const textarea = page.locator('textarea')
  const button = page.locator('button', { hasText: 'Start' })

  await textarea.fill('Build a todo app with React')
  await expect(button).toBeEnabled()
})

test('TC-05: Start button stays disabled for whitespace-only input', async () => {
  const textarea = page.locator('textarea')
  const button = page.locator('button', { hasText: 'Start' })

  await textarea.fill('   ')
  await expect(button).toBeDisabled()
})

test('TC-06: pressing Enter submits the form and transitions away from IntentInput', async () => {
  const textarea = page.locator('textarea')

  await textarea.fill('Build something')
  await textarea.press('Enter')

  // After submit, the app navigates to Dialogue screen (textarea leaves DOM)
  await expect(textarea).not.toBeVisible({ timeout: 5000 })
})

test('TC-07: Shift+Enter does NOT submit (inserts newline)', async () => {
  const textarea = page.locator('textarea')

  await textarea.fill('Line 1')
  await textarea.press('Shift+Enter')

  // Button should still be enabled (not submitted)
  const button = page.locator('button', { hasText: 'Start' })
  await expect(button).toBeEnabled()
})

test('TC-08: clicking Start button submits the form and transitions away from IntentInput', async () => {
  const textarea = page.locator('textarea')
  const button = page.locator('button', { hasText: 'Start' })

  await textarea.fill('Create a REST API')
  await button.click()

  // After submit, the app navigates to Dialogue screen (textarea leaves DOM)
  await expect(textarea).not.toBeVisible({ timeout: 5000 })
})

test('TC-09: textarea respects 4000 character maxLength', async () => {
  const textarea = page.locator('textarea')
  await expect(textarea).toHaveAttribute('maxlength', '4000')
})
