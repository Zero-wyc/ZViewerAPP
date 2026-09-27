import { test, expect } from '@playwright/test'

for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1280, 800]]) {
  test(`player display controls ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/tests/display-harness.html')
    const full = page.getByRole('button', { name: '全屏', exact: true })
    await expect(full).toHaveCount(1)
    await expect(page.getByRole('button', { name: /网页全屏/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /切换横屏|切换竖屏/ })).toHaveCount(1)
    await expect(page.locator('.mobile-room-header').getByRole('button', { name: /切换横屏|切换竖屏/ })).toBeVisible()
    await expect(page.locator('.player-display-controls').getByRole('button', { name: /切换横屏|切换竖屏/ })).toHaveCount(0)
    const layout = await page.locator('.player-controls-row .player-tool').evaluateAll(buttons =>
      buttons.filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')
        .map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right } }))
    for (const rect of layout) {
      expect(rect.width).toBeGreaterThanOrEqual(40)
      expect(rect.height).toBeGreaterThanOrEqual(40)
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.right).toBeLessThanOrEqual(width)
    }
    for (let a = 0; a < layout.length; a++) for (let b = a + 1; b < layout.length; b++) {
      const one = layout[a], two = layout[b]
      expect(one.right <= two.x + 1 || two.right <= one.x + 1 ||
        one.y + one.height <= two.y + 1 || two.y + two.height <= one.y + 1).toBeTruthy()
    }
    await full.click()
    await expect(page.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible()
    await expect(page.locator('.player-display-controls').getByRole('button', { name: /切换横屏|切换竖屏/ })).toBeVisible()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const panel = page.locator('.player-settings-panel')
    await expect(panel).toBeVisible()
    const bounds = await panel.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height)
    await page.screenshot({ path: `test-results/display-${width}x${height}.png` })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '退出全屏', exact: true }).click()
    await expect(full).toBeVisible()
  })
}

for (const [width, height, size] of [[390, 844, 12], [844, 390, 12], [768, 1024, 15]]) {
  test(`subtitle default and manual override ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/tests/display-harness.html')
    const root = page.locator('.mobile-room')
    await expect(root).toHaveAttribute('data-subtitle-font-size', String(size))
    await page.getByRole('button', { name: '全屏', exact: true }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '字幕', exact: true }).click()
    await page.getByRole('checkbox').focus()
    await page.getByRole('checkbox').press('Space')
    await page.getByRole('button', { name: '高级设置', exact: true }).click()
    const fontSize = page.locator('input[type="range"][min="12"][max="50"]')
    await expect(fontSize).toHaveValue(String(size))
    await fontSize.focus()
    for (let value = size; value < 18; value++) await fontSize.press('ArrowRight')
    await expect(root).toHaveAttribute('data-subtitle-font-size', '18')
    await page.setViewportSize({ width: height, height: width })
    await expect(root).toHaveAttribute('data-subtitle-font-size', '18')
  })
}
