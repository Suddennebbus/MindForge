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

test.describe('PDF Annotation Popover Positioning', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('popover appears near selected text in middle/bottom area, accepts input, and creates annotation', async ({ page }) => {
    const logs: string[] = []
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`)
    })
    page.on('pageerror', err => {
      logs.push(`[PAGE ERROR] ${err.message}`)
    })

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

    // Step 5: Find spans in the middle/bottom area of the first PDF page.
    const pdfBox = await pdfPage.boundingBox()
    if (!pdfBox) throw new Error('Could not get PDF page bounding box')

    const midY = pdfBox.y + pdfBox.height * 0.50

    interface SpanInfo { idx: number; box: { x: number; y: number; width: number; height: number }; text: string }
    const spanInfos: SpanInfo[] = []
    for (let i = 0; i < spanCount; i++) {
      const span = textSpans.nth(i)
      const box = await span.boundingBox()
      const text = await span.textContent() || ''
      if (box && box.width > 0 && box.height > 0) {
        spanInfos.push({ idx: i, box, text: text.trim() })
      }
    }

    // Pick start span in middle area and a nearby end span (a few indices later)
    const startInfo = spanInfos.find(s => s.box.y >= midY && s.text.length > 3)
    const startIndexInInfos = startInfo ? spanInfos.indexOf(startInfo) : -1
    let endInfo = startIndexInInfos >= 0 ? spanInfos[Math.min(startIndexInInfos + 2, spanInfos.length - 1)] : undefined

    if (!startInfo || !endInfo) {
      throw new Error('Could not find suitable start/end spans in middle/bottom area')
    }

    console.log(`Selecting from span ${startInfo.idx} to span ${endInfo.idx}`)

    const startSpan = textSpans.nth(startInfo.idx)
    const endSpan = textSpans.nth(endInfo.idx)

    // Screenshot before selection
    await page.screenshot({ path: `${SCREENSHOT_DIR}/pos-01-before-selection.png`, fullPage: true })

    // Step 6: Scroll the document so the target spans are in the viewport,
    // then use real click-and-drag to select text.
    const scrollContainer = page.locator('.flex-1.overflow-auto.relative').first()
    await scrollContainer.evaluate((el) => {
      const startSpanEl = document.querySelector('.pdf-page .textLayer span:nth-child(55)') as HTMLElement | null
      if (startSpanEl) {
        const containerRect = el.getBoundingClientRect()
        const spanRect = startSpanEl.getBoundingClientRect()
        el.scrollTop = el.scrollTop + spanRect.top - containerRect.top - 120
      }
    })
    await page.waitForTimeout(500)

    const startBoxFinal = await startSpan.boundingBox()
    const endBoxFinal = await endSpan.boundingBox()
    if (!startBoxFinal || !endBoxFinal) {
      throw new Error('Could not get bounding boxes after scroll')
    }

    // Capture the selection rect used by the app for positioning
    await page.evaluate(() => {
      ;(window as any).__lastSelectionRect = null
      document.addEventListener('mouseup', () => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        ;(window as any).__lastSelectionRect = {
          top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        }
      }, { capture: true, once: true })
    })

    await page.mouse.move(startBoxFinal.x + 2, startBoxFinal.y + startBoxFinal.height / 2)
    await page.mouse.down()
    await page.mouse.move(endBoxFinal.x + Math.min(80, endBoxFinal.width - 4), endBoxFinal.y + endBoxFinal.height / 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(800)

    const lastSelectionRect = await page.evaluate(() => (window as any).__lastSelectionRect)
    console.log('Last selection rect:', lastSelectionRect)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/pos-02-text-selected.png`, fullPage: true })

    // Step 7: Verify annotation popover appears
    const popover = page.locator('.annotation-popover')
    const popoverVisible = await popover.isVisible().catch(() => false)
    console.log('Annotation popover visible after drag:', popoverVisible)

    expect(popoverVisible, 'Annotation popover should appear after text selection').toBe(true)

    const popoverBox = await popover.boundingBox()
    console.log('Popover position:', popoverBox)

    // The popover should be positioned near the bottom of the selection, not at the top of the page.
    // selection.rect.bottom is used with +8px offset in the app.
    if (popoverBox && lastSelectionRect) {
      const expectedTopApprox = lastSelectionRect.bottom + 8
      const actualTop = popoverBox.y
      const delta = Math.abs(actualTop - expectedTopApprox)
      console.log(`Expected popover top approx: ${expectedTopApprox}px, actual: ${actualTop}px, delta: ${delta}px`)
      expect(delta, `Popover should appear near selection bottom (delta=${delta}px)`).toBeLessThan(100)
    }

    // Step 8: Type annotation text
    const textarea = popover.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.click()
    await textarea.fill('Popover positioning test annotation from middle/bottom area.')
    await page.waitForTimeout(300)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/pos-03-text-typed.png`, fullPage: true })

    // Step 9: Submit annotation
    const submitBtn = popover.locator('button:has-text("添加批注")')
    await submitBtn.click()
    await page.waitForTimeout(2000)

    await page.screenshot({ path: `${SCREENSHOT_DIR}/pos-04-annotation-submitted.png`, fullPage: true })

    // Step 10: Verify annotation appears in right panel
    const annotationPanel = page.locator('.w-80')
    await expect(annotationPanel).toBeVisible()

    const panelText = await annotationPanel.textContent()
    const hasAnnotationText = panelText?.includes('Popover positioning test annotation from middle/bottom area.') || false
    console.log('Annotation text found in panel:', hasAnnotationText)

    const highlight = pdfPage.locator('.annotation-highlight').first()
    const hasHighlight = await highlight.isVisible().catch(() => false)
    console.log('Annotation highlight visible:', hasHighlight)

    expect(hasAnnotationText || hasHighlight, 'Annotation should be created and visible').toBe(true)

    // Final screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/pos-05-final-state.png`, fullPage: true })

    // Write console logs
    const fs = await import('fs')
    fs.writeFileSync(`${SCREENSHOT_DIR}/console-logs-pos.txt`, logs.join('\n') || 'No console logs captured.')
  })
})
