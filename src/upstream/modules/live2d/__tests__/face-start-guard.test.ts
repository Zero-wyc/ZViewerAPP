import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canCommitFaceTrackerStart } from '../core/face-start-guard.ts'

describe('Live2D face tracker async start guard', () => {
  it('rejects a start invalidated by stop or permission revocation', () => {
    assert.equal(canCommitFaceTrackerStart(4, 5, true, false), false)
    assert.equal(canCommitFaceTrackerStart(4, 4, false, false), false)
  })

  it('rejects a late start after unmount', () => {
    assert.equal(canCommitFaceTrackerStart(7, 7, true, true), false)
  })

  it('accepts the current request after the effect remounts', () => {
    assert.equal(canCommitFaceTrackerStart(8, 8, true, false), true)
  })

  it('stops a camera stream that resolves after startup is cancelled', async () => {
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    let signalMediaStarted!: () => void
    let resolveMedia!: (stream: MediaStream) => void
    let stoppedTracks = 0
    const mediaStarted = new Promise<void>((resolve) => { signalMediaStarted = resolve })
    const mediaRequest = new Promise<MediaStream>((resolve) => { resolveMedia = resolve })

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { isSecureContext: true, location: { href: 'http://localhost/', origin: 'http://localhost' } },
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: () => { signalMediaStarted(); return mediaRequest } } },
    })

    try {
      const { FaceTracker } = await import('../core/face-tracker.ts')
      const controller = new AbortController()
      const creating = FaceTracker.create({ signal: controller.signal })
      await mediaStarted
      controller.abort()
      resolveMedia({
        getTracks: () => [{ stop: () => { stoppedTracks += 1 } }],
      } as unknown as MediaStream)

      await assert.rejects(creating, (error: unknown) =>
        error instanceof DOMException && error.name === 'AbortError'
      )
      assert.equal(stoppedTracks, 1)
    } finally {
      if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow)
      else Reflect.deleteProperty(globalThis, 'window')
      if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator)
      else Reflect.deleteProperty(globalThis, 'navigator')
    }
  })
})
