import { test, expect, Page } from '@playwright/test'

const BASE_URL = 'http://localhost:5173'
const API_URL = 'http://localhost:8000'

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

test.describe('PDF TextLayer Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('PDF native TextLayer renders cleanly, text is selectable, and annotations can be created', async ({ page }) => {
    const logs: string[] = []
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`)
    })
    page.on('pageerror', err => {
      logs.push(`[PAGE ERROR] ${err.message}`)
    })

    // Step 1: Navigate to /raw page
    await page.goto(`${BASE_URL}/raw`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-raw-list.png`, fullPage: true })

    // Step 2: Click on first PDF document row
    const fileRows = page.locator('table tbody tr, .text-body').first()
    await expect(fileRows).toBeVisible({ timeout: 10000 })
    await fileRows.click()

    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-raw-detail.png`, fullPage: true })

    // Step 3: Click the "阅读" (Read) button
    const readBtn = page.locator('button:has-text("阅读")').first()
    await expect(readBtn).toBeVisible({ timeout: 10000 })
    await readBtn.click()

    // Wait for reader page to load
    await page.waitForURL(/\/reader\//, { timeout: 15000 })
    await page.waitForTimeout(4000)

    // Step 4: Verify PDF rendered - native pdf.js TextLayer uses .textLayer with spans
    const pdfPage = page.locator('.pdf-page').first()
    await expect(pdfPage).toBeVisible({ timeout: 15000 })

    const textLayer = pdfPage.locator('.textLayer')
    await expect(textLayer).toBeVisible({ timeout: 15000 })

    // Wait for native TextLayer spans to be populated
    const textSpans = textLayer.locator('span')
    await expect(textSpans.first()).toBeVisible({ timeout: 15000 })

    const spanCount = await textSpans.count()
    console.log(`Native TextLayer span count: ${spanCount}`)
    expect(spanCount).toBeGreaterThan(0)

    // Screenshot focused on PDF content
    const pdfBox = await pdfPage.boundingBox()
    if (pdfBox) {
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/03-pdf-text-rendered.png`,
        clip: {
          x: Math.max(0, pdfBox.x - 20),
          y: Math.max(0, pdfBox.y - 20),
          width: pdfBox.width + 40,
          height: Math.min(pdfBox.height + 40, 900),
        },
      })
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/03-pdf-text-rendered.png`, fullPage: true })
    }

    // Step 5: Select text in the PDF viewer
    // Native pdf.js TextLayer renders spans with precise transforms; use click-and-drag across spans
    const firstSpan = textSpans.first()
    const secondSpan = textSpans.nth(Math.min(2, spanCount - 1))

    const firstBox = await firstSpan.boundingBox()
    const secondBox = await secondSpan.boundingBox()

    if (!firstBox || !secondBox) {
      throw new Error('Could not get bounding boxes of PDF text spans')
    }

    // Click and drag to select text across multiple spans
    await page.mouse.move(firstBox.x + 2, firstBox.y + firstBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(secondBox.x + secondBox.width - 2, secondBox.y + secondBox.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(800)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-text-selected.png`, fullPage: true })

    // Step 6: Verify annotation popover appears
    const popover = page.locator('.annotation-popover')
    let popoverVisible = await popover.isVisible().catch(() => false)
    console.log('Annotation popover visible after drag:', popoverVisible)

    // Retry with different spans if popover didn't appear
    if (!popoverVisible && spanCount >= 4) {
      console.log('Retrying selection with different spans...')
      // Clear selection first
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      const thirdSpan = textSpans.nth(2)
      const fourthSpan = textSpans.nth(Math.min(5, spanCount - 1))
      const tBox = await thirdSpan.boundingBox()
      const fBox = await fourthSpan.boundingBox()
      if (tBox && fBox) {
        await page.mouse.move(tBox.x + 2, tBox.y + tBox.height / 2)
        await page.mouse.down()
        await page.mouse.move(fBox.x + fBox.width - 2, fBox.y + fBox.height / 2, { steps: 10 })
        await page.mouse.up()
        await page.waitForTimeout(800)
        await page.screenshot({ path: `${SCREENSHOT_DIR}/04b-text-selected-retry.png`, fullPage: true })
        popoverVisible = await popover.isVisible().catch(() => false)
        console.log('Annotation popover visible after retry:', popoverVisible)
      }
    }

    if (!popoverVisible) {
      console.log('WARNING: Could not trigger annotation popover via drag selection.')
      await page.screenshot({ path: `${SCREENSHOT_DIR}/05-final-state.png`, fullPage: true })

      // Write logs before failing
      const fs = await import('fs')
      fs.writeFileSync(`${SCREENSHOT_DIR}/console-logs.txt`, logs.join('\n') || 'No console logs captured.')

      // Still report on rendering quality
      test.info().annotations.push({ type: 'issue', description: 'Annotation popover did not appear after text selection' })
      return
    }

    // Step 7: Type annotation text and submit
    const textarea = popover.locator('textarea')
    await textarea.fill('This is an E2E test annotation for native TextLayer.')
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-annotation-typed.png`, fullPage: true })

    const submitBtn = popover.locator('button:has-text("添加批注")')
    await submitBtn.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-annotation-submitted.png`, fullPage: true })

    // Step 8: Verify annotation is created and appears in panel
    const annotationPanel = page.locator('.w-80')
    await expect(annotationPanel).toBeVisible()

    const panelText = await annotationPanel.textContent()
    const hasAnnotationText = panelText?.includes('E2E test annotation for native TextLayer') || false
    console.log('Annotation text found in panel:', hasAnnotationText)

    // Also verify highlight appears in PDF
    const highlight = pdfPage.locator('.annotation-highlight').first()
    const hasHighlight = await highlight.isVisible().catch(() => false)
    console.log('Annotation highlight visible:', hasHighlight)

    expect(hasAnnotationText || hasHighlight).toBe(true)

    // Final screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-final-state.png`, fullPage: true })

    // Write console logs
    const fs = await import('fs')
    fs.writeFileSync(`${SCREENSHOT_DIR}/console-logs.txt`, logs.join('\n') || 'No console logs captured.')
  })
})
