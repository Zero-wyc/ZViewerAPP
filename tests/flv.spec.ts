import { test, expect } from '@playwright/test'

test('FLV stream attaches, plays frames and releases the player', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { flvEngine } = await import('/src/upstream/modules/player/engines/flv-engine.ts')
    const video = document.createElement('video')
    video.muted = true
    document.body.append(video)
    const attached = await flvEngine.attach(video, {
      url: 'http://127.0.0.1:3347/api/test-media/480.flv', format: 'flv',
    })
    await video.play()
    await new Promise<void>((resolve, reject) => {
      if (video.currentTime > 0.1) { resolve(); return }
      const timeout = window.setTimeout(() => reject(new Error('FLV frame timeout')), 4000)
      video.addEventListener('timeupdate', () => {
        if (video.currentTime <= 0.1) return
        clearTimeout(timeout)
        resolve()
      })
    })
    const dimensions = [video.videoWidth, video.videoHeight]
    const time = video.currentTime
    attached.cleanup()
    video.remove()
    return { dimensions, time }
  })
  expect(result.dimensions).toEqual([854, 480])
  expect(result.time).toBeGreaterThan(0.1)
})
