import { expect, test } from '@playwright/test'

for (const bits of [16, 24]) {
  test(`remuxed ${bits}-bit FLAC is accepted and played by Chromium MSE`, async ({ page }) => {
    await page.goto('/tests/display-harness.html')
    const result = await page.evaluate(async bits => {
      const modulePath = '/tests/flac-remux.mjs'
      const { remuxFlac } = await import(/* @vite-ignore */ modulePath)
      const response = await fetch(`/tests/fixtures/flac-${bits}.flac`)
      const bytes = await remuxFlac(await response.arrayBuffer())
      const mime = 'audio/mp4; codecs="flac"'
      if (!MediaSource.isTypeSupported(mime)) return 'FLAC MSE unsupported'
      return new Promise<string | null>(resolve => {
        const audio = document.createElement('audio')
        const mediaSource = new MediaSource()
        const url = URL.createObjectURL(mediaSource)
        let finished = false
        const finish = (error: string | null) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
          URL.revokeObjectURL(url)
          resolve(error)
        }
        const timer = setTimeout(() => finish(audio.error?.message ?? 'Playback timed out'), 8000)
        audio.addEventListener('error', () => finish(audio.error?.message ?? 'Media error'))
        audio.addEventListener('timeupdate', () => {
          if (audio.currentTime > 0.1) finish(null)
        })
        mediaSource.addEventListener('sourceopen', () => {
          try {
            const buffer = mediaSource.addSourceBuffer(mime)
            buffer.addEventListener('updateend', () => {
              if (!finished && mediaSource.readyState === 'open') mediaSource.endOfStream()
            }, { once: true })
            buffer.appendBuffer(bytes)
            void audio.play().catch(error => finish(String(error)))
          } catch (error) {
            finish(String(error))
          }
        }, { once: true })
        audio.src = url
      })
    }, bits)
    expect(result).toBeNull()
  })
}
