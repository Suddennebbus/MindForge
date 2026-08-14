import { test, expect, Page } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_DIR = '/home/admin/project/mindforge/frontend/e2e/screenshots'

async function login(page: Page) {
  const logs: string[] = []
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`
    logs.push(text)
    console.log(text)
  })
  page.on('pageerror', err => {
    const text = `[PAGE ERROR] ${err.message}`
    logs.push(text)
    console.log(text)
  })

  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')

  const usernameInput = page.locator('input[placeholder*="用户名"], input[name="username"], input[type="text"]').first()
  const passwordInput = page.locator('input[placeholder*="密码"], input[name="password"], input[type="password"]').first()

  await usernameInput.fill('testuser_e2e')
  await passwordInput.fill('testpass123')

  const loginBtn = page.locator('button:has-text("登录"), button[type="submit"]').first()

  // Capture login API call
  const loginResponsePromise = page.waitForResponse(resp => resp.url().includes('/auth/login'), { timeout: 10000 })
  await loginBtn.click()
  const loginResp = await loginResponsePromise.catch(e => null)
  if (loginResp) {
    console.log('Login response status:', loginResp.status())
    try {
      console.log('Login response body:', await loginResp.json())
    } catch {}
  }

  await page.waitForURL(/\/(home|raw|pre-raw|explore)?$/, { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/explore-debug-01-login.png`, fullPage: true })
  return logs
}

test('Debug Explore module - click explore button and monitor network', async ({ page }) => {
  const logs = await login(page)

  // Step 1: Navigate to /explore
  await page.goto(`${BASE_URL}/explore`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/explore-debug-02-page.png`, fullPage: true })

  // Step 2: Find input and button
  const input = page.locator('input[placeholder*="研究方向"], input[type="text"]').first()
  const button = page.locator('button:has-text("探索"), button:has-text("分析中")').first()

  await expect(input).toBeVisible({ timeout: 10000 })
  await expect(button).toBeVisible({ timeout: 10000 })

  // Step 3: Type in input
  await input.fill('machine learning applications in healthcare')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/explore-debug-03-filled.png`, fullPage: true })

  // Step 4: Click explore and monitor request
  const requestPromise = page.waitForRequest(req => req.url().includes('/ai/explore'), { timeout: 10000 })
  const responsePromise = page.waitForResponse(resp => resp.url().includes('/ai/explore'), { timeout: 60000 })

  await button.click()

  // Check loading state immediately
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/explore-debug-04-clicked.png`, fullPage: true })

  let requestCaptured = false
  let responseCaptured = false
  let requestDetails: any = null
  let responseDetails: any = null

  try {
    const req = await requestPromise
    requestCaptured = true
    requestDetails = {
      url: req.url(),
      method: req.method(),
      headers: req.headers(),
      postData: req.postData(),
    }
    console.log('REQUEST captured:', JSON.stringify(requestDetails, null, 2))
  } catch (e: any) {
    console.log('REQUEST NOT captured:', e.message)
  }

  try {
    const resp = await responsePromise
    responseCaptured = true
    responseDetails = {
      status: resp.status(),
      statusText: resp.statusText(),
      headers: resp.headers(),
    }
    let body: any = null
    try {
      body = await resp.json()
    } catch {
      body = await resp.text()
    }
    responseDetails.body = body
    console.log('RESPONSE captured:', JSON.stringify(responseDetails, null, 2))
  } catch (e: any) {
    console.log('RESPONSE NOT captured:', e.message)
  }

  // Wait for UI to settle
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SCREENSHOT_DIR}/explore-debug-05-result.png`, fullPage: true })

  // Check button state after
  const buttonText = await button.textContent()
  console.log('Button text after click:', buttonText)

  // Final report
  console.log('=== FINAL REPORT ===')
  console.log('Request fired:', requestCaptured)
  console.log('Response received:', responseCaptured)
  console.log('Button text:', buttonText)
  console.log('Console logs:', logs)

  // Soft assertions for debugging
  expect(requestCaptured, 'Expected /ai/explore request to fire').toBe(true)
})
