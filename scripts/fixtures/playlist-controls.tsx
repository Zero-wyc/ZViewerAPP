// Real control bar, next-movie hook and permissions. Server acknowledgements and
// broadcasts are explicit isolated data; no production room or audible media.
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PlayerControlBar } from '../../src/upstream/modules/room/watch-together/PlayerControlBar'
import { useNextPlaylistMovie } from '../../src/upstream/modules/room/watch-together/useNextPlaylistMovie'
import { useRoomStore } from '../../src/upstream/store/roomStore'
import { useAuthStore } from '../../src/upstream/store/authStore'
import { MobileAppearance } from '../../src/mobile/MobileAppearance'
import { useThemeStore } from '../../src/upstream/store/themeStore'
import '../../src/upstream/index.css'
import '../../src/styles.css'
import '../../src/mobile/mobile.css'
import '../../src/mobile/appearance.css'
import '../../src/upstream/modules/art-player/art-overrides.css'

const w = window as any
const savedStorage = new Map(['zcontrol-auth-storage', 'zcontrol-theme-storage'].map(key => [key, localStorage.getItem(key)]))
const originalRoot = document.getElementById('root'), display = originalRoot?.style.display
if (originalRoot) originalRoot.style.display = 'none'
const container = document.createElement('div'); container.id = 'playlist-controls-fixture'
container.style.cssText = 'position:fixed;inset:0;overflow:auto'; document.body.append(container)
const movies = [1, 3, 7].map(id => ({ id, title: `测试影片 ${id}`, sourceType: 'mp4', url: '', createdAt: '' }))
const calls: any[] = [], waiting: any[] = []
const socket = { connected: true, timeout() { return this }, emit(event: string, payload: any, complete: any) {
  calls.push({ event, payload }); waiting.push({ event, payload, complete })
} }
useAuthStore.setState({ user: { id: '1', username: 'isolated-ui', role: 'user' } })
useRoomStore.setState({ roomId: 'playlist-fixture', mode: 'watch-together', movies, currentMovieId: 1, moderators: [],
  watchTogether: { ...useRoomStore.getState().watchTogether, isPreview: false } })
let renderRole: (value: string) => void
const root = createRoot(container)
w.__playlistFixture = { socket, calls, waiting, store: useRoomStore,
  reply(success = true) { const item = waiting.shift(); if (!item) throw Error('No pending request')
    item.complete(null, { success, message: success ? undefined : '切换失败测试' })
    // Model the authoritative server broadcast separately from the acknowledgement.
    if (success && item.event === 'play-movie') useRoomStore.setState({ currentMovieId: item.payload.movieId })
  },
  role(value: string) { renderRole(value); useRoomStore.setState({ moderators: value === 'manager' ? [1] : [] }) },
  theme(dark: boolean) { useThemeStore.setState({ mode: dark ? 'dark' : 'light', isDark: dark }) },
  unmount() { root.unmount(); container.remove(); if (originalRoot) originalRoot.style.display = display || ''
    for (const [key, value] of savedStorage) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
  },
}
function Fixture() {
  const [role, setRole] = useState('host'), [full, setFull] = useState(false)
  renderRole = setRole
  const video = useRef<HTMLVideoElement>(null)
  const current = useRoomStore(state => state.currentMovieId)
  const next = useNextPlaylistMovie('playlist-fixture', role === 'host')
  useEffect(() => { if (video.current) video.current.muted = true }, [])
  return <MobileAppearance global room><main className="mobile-room">
    <header className="mobile-room-header">下一部界面验收 · 当前影片 {current}</header>
    <div className={`zart-stage ${full ? 'zart-web-fullscreen' : ''}`} style={{ height: full ? '100dvh' : 'min(65dvh,560px)', position: 'relative', background: '#101418' }}>
      <video ref={video} muted playsInline style={{ width: '100%', height: '100%' }} />
      <PlayerControlBar isHost={role === 'host'} videoRef={video} watchTogether={{ duration: 1500, currentTime: 0 } as any}
        isPlaying={false} onNextMovie={next.visible ? next.playNext : undefined} nextMovieAvailable={next.available} nextMoviePending={next.pending}
        isWebFullscreen={full} onToggleWebFullscreen={() => setFull(value => !value)}
        danmakuEnabled onToggleDanmaku={() => {}} onSendDanmaku={() => {}} onSync={() => {}} onReload={() => {}}
        settingsOpen={false} onToggleSettings={() => {}} controlBarVisible />
    </div>
  </main></MobileAppearance>
}
root.render(<Fixture />)
