import { test, expect, Page } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_DIR = '/home/admin/project/mindforge/frontend/e2e/screenshots'

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')

  const usernameInput = page.locator('input[placeholder*="用户名"], input[name="username"], input[type="text"]').first()
  const passwordInput = page.locator('input[placeholder*="密码"], input[name="password"], input[type="password"]').first()

  await usernameInput.fill('testuser_e2e')
  await passwordInput.fill('testpass123')

  const loginBtn = page.locator('button:has-text("登录"), button[type="submit"]').first()
  await loginBtn.click()

  await page.waitForURL(/\/(home|raw|pre-raw|explore)?$/, { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

test.describe('PDF Text Selection Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('text selection in PDF is visible and annotation popover appears', async ({ page }) => {
    // Step 1: Navigate to /raw
    await page.goto(`${BASE_URL}/raw`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // Step 2: Click first PDF row
    const fileRows = page.locator('table tbody tr, .text-body').first()
    await expect(fileRows).toBeVisible({ timeout: 10000 })
    await fileRows.click()
    await page.waitForTimeout(1500)

    // Step 3: Click "阅读"
    const readBtn = page.locator('button:has-text("阅读")').first()
    await expect(readBtn).toBeVisible({ timeout: 10000 })
    await readBtn.click()

    await page.waitForURL(/\/reader\//, { timeout: 15000 })
    await page.waitForTimeout(4000)

    // Step 4: Verify PDF rendered
    const pdfPage = page.locator('.pdf-page').first()
    await expect(pdfPage).toBeVisible({ timeout: 15000 })

    const textLayer = pdfPage.locator('.textLayer')
    await expect(textLayer).toBeVisible({ timeout: 15000 })

    const textSpans = textLayer.locator('span')
    await expect(textSpans.first()).toBeVisible({ timeout: 15000 })

    const spanCount = await textSpans.count()
    console.log(`TextLayer span count: ${spanCount}`)
    expect(spanCount).toBeGreaterThan(0)

    // Find title spans by looking for text that includes "PlanGuard" or "Defending"
    // The title is the most visually obvious place to verify selection highlighting
    let startSpan = textSpans.filter({ hasText: /PlanGuard/ }).first()
    let endSpan = textSpans.filter({ hasText: /Defending/ }).first()

    let startIdx = -1
    let endIdx = -1

    if (await startSpan.count() === 0 || await endSpan.count() === 0) {
      // Fallback: use spans around the title area
      startSpan = textSpans.nth(Math.min(3, spanCount - 1))
      endSpan = textSpans.nth(Math.min(12, spanCount - 1))
      startIdx = 3
      endIdx = 12
    } else {
      // Resolve indices for logging
      for (let i = 0; i < spanCount; i++) {
        const txt = await textSpans.nth(i).textContent()
        if (txt && txt.includes('PlanGuard') && startIdx === -1) startIdx = i
        if (txt && txt.includes('Defending')) endIdx = i
      }
    }

    console.log(`Selecting from span ${startIdx} to span ${endIdx}`)

    const startBox = await startSpan.boundingBox()
    const endBox = await endSpan.boundingBox()

    if (!startBox || !endBox) {
      throw new Error('Could not get bounding boxes of PDF text spans')
    }

    // Define the clip region for before/after comparison
    const clipX = Math.max(0, Math.min(startBox.x, endBox.x) - 60)
    const clipY = Math.max(0, Math.min(startBox.y, endBox.y) - 40)
    const clipWidth = Math.min(Math.abs(Math.max(startBox.x + startBox.width, endBox.x + endBox.width) - clipX) + 120, 1300)
    const clipHeight = Math.min(Math.abs(Math.max(startBox.y + startBox.height, endBox.y + endBox.height) - clipY) + 80, 500)
    const clip = { x: clipX, y: clipY, width: clipWidth, height: clipHeight }

    // Screenshot before selection (same region)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/focus-01-before-selection.png`, clip })

    // Step 5: Click and drag to select text
    await page.mouse.move(startBox.x + 2, startBox.y + startBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(endBox.x + endBox.width - 2, endBox.y + endBox.height / 2, { steps: 15 })
    await page.mouse.up()
    await page.waitForTimeout(800)

    // Step 6: Take a focused screenshot of the selected area
    await page.screenshot({ path: `${SCREENSHOT_DIR}/focus-02-selection-closeup.png`, clip })

    // Step 7: Verify annotation popover appears
    const popover = page.locator('.annotation-popover')
    const popoverVisible = await popover.isVisible().catch(() => false)
    console.log('Annotation popover visible after drag:', popoverVisible)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/focus-03-with-popover.png`, fullPage: true })

    expect(popoverVisible, 'Annotation popover should appear after text selection').toBe(true)

    // Step 8: Create annotation
    const textarea = popover.locator('textarea')
    await textarea.fill('E2E selection visibility test annotation.')
    await page.waitForTimeout(300)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/focus-04-annotation-typed.png`, fullPage: true })

    const submitBtn = popover.locator('button:has-text("添加批注")')
    await submitBtn.click()
    await page.waitForTimeout(2000)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/focus-05-annotation-created.png`, fullPage: true })

    // Step 9: Verify annotation appears in panel
    const annotationPanel = page.locator('.w-80')
    await expect(annotationPanel).toBeVisible()

    const panelText = await annotationPanel.textContent()
    const hasAnnotationText = panelText?.includes('E2E selection visibility test annotation.') || false
    console.log('Annotation text found in panel:', hasAnnotationText)

    const highlight = pdfPage.locator('.annotation-highlight').first()
    const hasHighlight = await highlight.isVisible().catch(() => false)
    console.log('Annotation highlight visible:', hasHighlight)

    expect(hasAnnotationText || hasHighlight, 'Annotation should be created and visible').toBe(true)
  })
})
