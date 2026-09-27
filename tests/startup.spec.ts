import { test, expect } from '@playwright/test'

for (const width of [320, 390, 768]) {
  test(`startup renders before the app module at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    let resume!: () => void
    const paused = new Promise<void>(resolve => { resume = resolve })
    await page.route('**/src/main.tsx', async route => {
      await paused
      await route.continue()
    })
    try {
      await page.goto('/', { waitUntil: 'commit' })
      await expect(page.locator('#startup')).toBeVisible()
      await expect(page.getByRole('status')).toHaveText('正在加载')
      await expect.poll(() => page.locator('#startup img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/startup-${width}.png` })
    } finally {
      resume()
    }
    await expect(page.getByLabel('服务端地址', { exact: true })).toBeVisible()
    await expect(page.locator('#startup')).toHaveCount(0)
  })
}

test('startup shows retry after a module load failure and recovers', async ({ page }) => {
  await page.route('**/src/main.tsx', route => route.abort())
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('加载未完成，请重试')
  await page.unroute('**/src/main.tsx')
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByLabel('服务端地址', { exact: true })).toBeVisible()
  await expect(page.locator('#startup')).toHaveCount(0)
})

test('startup offers retry when the app module stalls', async ({ page }) => {
  await page.clock.install()
  let resume!: () => void
  const paused = new Promise<void>(resolve => { resume = resolve })
  await page.route('**/src/main.tsx', async route => {
    await paused
    await route.continue()
  })
  try {
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('#startup')).toBeVisible()
    await page.clock.fastForward(16000)
    await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible()
  } finally {
    resume()
  }
  await expect(page.getByLabel('服务端地址', { exact: true })).toBeVisible()
})
