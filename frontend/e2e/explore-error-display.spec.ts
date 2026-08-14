import { test, expect, Page } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_DIR = '/home/admin/project/mindforge/frontend/e2e/screenshots'

async function loginAsEditor(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')

  await page.locator('input[type="text"]').first().fill('testuser_e2e')
  await page.locator('input[type="password"]').first().fill('testpass123')

  const loginResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/auth/login'),
    { timeout: 10000 }
  )
  await page.locator('button[type="submit"]').first().click()
  await loginResponsePromise

  await page.waitForURL(/\/(home|raw|pre-raw|explore)?$/, { timeout: 10000 }).catch(() => {})
}

test('Explore module displays error message when /ai/explore fails', async ({ page }) => {
  const consoleLogs: string[] = []
  const pageErrors: string[] = []

  page.on('console', (msg) => {
    const text = `[${msg.type()}] ${msg.text()}`
    consoleLogs.push(text)
    console.log(text)
  })

  page.on('pageerror', (err) => {
    const text = `[PAGE ERROR] ${err.message}`
    pageErrors.push(text)
    console.log(text)
  })

  // Step 1: Log in as editor
  await loginAsEditor(page)

  // Step 2: Navigate to /explore
  await page.goto(`${BASE_URL}/explore`)
  await page.waitForLoadState('networkidle')

  const input = page.locator('input[placeholder*="研究方向"]').first()
  const button = page.locator('button:has-text("探索")').first()

  await expect(input).toBeVisible({ timeout: 10000 })
  await expect(button).toBeVisible({ timeout: 10000 })

  // Step 3: Type in input
  await input.fill('machine learning applications in healthcare')

  // Step 4: Click explore and wait for response
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/ai/explore'),
    { timeout: 30000 }
  )
  await button.click()

  const response = await responsePromise
  expect(response.status()).toBeGreaterThanOrEqual(400)

  // Step 5: Wait for error message to be rendered
  const errorCard = page.locator('div').filter({ hasText: /No default LLM config|default LLM/ }).first()
  await expect(errorCard).toBeVisible({ timeout: 10000 })

  // Step 6: Take screenshot
  const screenshotPath = `${SCREENSHOT_DIR}/explore-error-display.png`
  await page.screenshot({ path: screenshotPath, fullPage: true })

  // Report
  const errorText = await errorCard.textContent()
  console.log('=== EXPLORE ERROR DISPLAY REPORT ===')
  console.log('Error visible:', !!errorText)
  console.log('Error message:', errorText?.trim())
  console.log('Response status:', response.status())
  console.log('Page errors:', pageErrors.length > 0 ? pageErrors : 'None')
  console.log('Console logs count:', consoleLogs.length)
  console.log('Screenshot path:', screenshotPath)

  expect(pageErrors).toHaveLength(0)
})
