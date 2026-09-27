import React from 'react'
import { createRoot } from 'react-dom/client'
import { useVideoSource } from '../src/upstream/modules/sync-playback/hooks/useVideoSource'
import { useRoomStore } from '../src/upstream/store/roomStore'
import type { WatchTogetherState } from '../src/upstream/modules/sync-playback/types'

export async function mountNativeHarness(video: HTMLVideoElement, state: WatchTogetherState) {
  useRoomStore.setState({ currentMovieId: 7, movies: [{ id: 7, url: 'https://www.bilibili.com/video/BV1234567890', cid: 123, sourceType: 'bilibili', title: 'fixture' }], watchTogether: state })
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)
  const videoRef = { current: video }, suppress = { current: false }, host = { current: true }
  const api = await new Promise<ReturnType<typeof useVideoSource>>(resolve => {
    const Harness = () => {
      const source = useVideoSource({ videoRef, suppressEventsRef: suppress, isHostRef: host, watchTogether: state })
      React.useEffect(() => resolve(source), [])
      return null
    }
    root.render(React.createElement(Harness))
  })
  return { api, remove() { api.cleanupMedia(); root.unmount(); mount.remove() } }
}
