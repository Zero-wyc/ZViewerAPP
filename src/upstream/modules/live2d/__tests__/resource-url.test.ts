import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  resolveLive2DAssetUrl,
  resolveLive2DModelUrl,
  resolveLive2DServerUrl,
} from '../core/resource-url.ts'

describe('Live2D resource URL resolution', () => {
  it('uses the configured deployment base for public assets', () => {
    assert.equal(
      resolveLive2DAssetUrl(
        '/live2d/core/core.js',
        '/zviewer/',
        'https://client.test/zviewer/assets/live2d.js',
        'https://client.test/zviewer/room/42'
      ),
      'https://client.test/zviewer/live2d/core/core.js'
    )
  })

  it('uses the packaged app root when Vite base is relative', () => {
    assert.equal(
      resolveLive2DAssetUrl(
        '/live2d/face/wasm/',
        './',
        'https://client.test/zviewer/assets/live2d.js',
        'https://client.test/zviewer/room/42'
      ),
      'https://client.test/zviewer/live2d/face/wasm/'
    )
  })

  it('keeps a selected server reverse-proxy path prefix', () => {
    const mapped: string[] = []
    const result = resolveLive2DServerUrl(
      '/uploads/live2d/model/model.model3.json',
      'https://server.test/zviewer',
      (url) => {
        mapped.push(url)
        return url.replace('https://server.test/zviewer', 'http://127.0.0.1:15432/zviewer')
      }
    )
    assert.equal(
      result,
      'http://127.0.0.1:15432/zviewer/uploads/live2d/model/model.model3.json'
    )
    assert.deepEqual(mapped, [
      'https://server.test/zviewer/uploads/live2d/model/model.model3.json',
    ])
  })

  it('routes selected-server absolute model URLs through transport and leaves third parties unchanged', () => {
    const mapSelectedServer = (url: string) => url.replace(
      'https://server.test/zviewer',
      'http://127.0.0.1:15432/zviewer'
    )
    assert.equal(
      resolveLive2DModelUrl(
        'https://server.test/zviewer/uploads/live2d/model/model.model3.json',
        'https://server.test/zviewer',
        mapSelectedServer
      ),
      'http://127.0.0.1:15432/zviewer/uploads/live2d/model/model.model3.json'
    )
    assert.equal(
      resolveLive2DModelUrl(
        'https://cdn.test/model/model3.json',
        'https://server.test/zviewer',
        mapSelectedServer
      ),
      'https://cdn.test/model/model3.json'
    )
  })
})
