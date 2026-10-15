// Isolated UI acceptance data. No account, server, microphone or audible output.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MusicAppShell } from '../../src/upstream/modules/music/components/MusicAppShell'
import { MusicQueuePopup } from '../../src/upstream/modules/music/components/MusicQueuePopup'
import { MusicPlayerContext } from '../../src/upstream/modules/music/hooks/useMusicPlayer'
import { useToolbarScrollable } from '../../src/upstream/modules/music/hooks/useToolbarScrollable'
import { useMusicStore } from '../../src/upstream/modules/music/store'
import '../../src/upstream/index.css'
import '../../src/styles.css'
import '../../src/mobile/mobile.css'
import '../../src/mobile/appearance.css'

const testWindow = window as any
const originalRoot = document.getElementById('root')
const originalDisplay = originalRoot?.style.display
if (originalRoot) originalRoot.style.display = 'none'
const container = document.createElement('div')
container.id = 'music-queue-fixture'
container.style.cssText = 'position:fixed;inset:0;background:#d9e8fa;overflow:hidden'
document.body.append(container)

// A muted WAV supplies a real media clock while components open and close.
const samples = 48000 * 12
const wav = new ArrayBuffer(44 + samples * 2), data = new DataView(wav)
const text = (offset: number, value: string) => [...value].forEach((c, i) => data.setUint8(offset + i, c.charCodeAt(0)))
text(0, 'RIFF'); data.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVE')
text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true)
data.setUint32(24, 48000, true); data.setUint32(28, 96000, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true)
text(36, 'data'); data.setUint32(40, samples * 2, true)
const mediaUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
const audio = new Audio(mediaUrl)
audio.muted = true; audio.loop = true
const song = { id: 1, songId: -1, name: '静音界面验收', artist: '本地测试', durationMs: 12000, order: 0 }
const noop = () => {}
const player = {
  currentSong: song, isPlaying: true, playMode: 'order', canControl: true,
  hostOffline: false, syncNotice: null, syncNoticeKind: 'info', volume: 1,
  getAudio: () => audio, togglePlay: noop, next: noop, prev: noop, seek: noop,
  requestControl: noop, approveControl: noop, rejectControl: noop, setSyncNotice: noop,
  setPlayMode: noop, setVolume: noop, playSong: noop, addBiliRecommendations: async () => {},
} as any
useMusicStore.setState({ page: 'home', queue: [song], currentKey: 'ncm:-1', isPlaying: true })

function ToolbarRepro() {
  const { toolbarRef, scrollable } = useToolbarScrollable()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(5)
  testWindow.__queueToolbar = { scrollable, setCount }
  return <div style={{ position: 'absolute', left: 100, top: 100, height: 450, width: 200 }}>
    <div ref={toolbarRef} id="measured-toolbar" style={{ position: 'absolute', bottom: 10, right: -50, width: 50, maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: 24, overflowY: scrollable ? 'auto' : undefined }}>
      {Array.from({ length: count }, (_, i) => <button key={i} style={{ height: 24, flexShrink: 0 }}>Icon</button>)}
      <div style={{ position: 'relative' }}><button id="queue-toggle" onClick={() => setOpen(!open)} style={{ height: 24 }}>Queue</button>
        {open && <MusicQueuePopup socket={null} isHost canManage={false} placement={scrollable ? 'sheet' : 'side'} />}
      </div>
      <button style={{ height: 24, flexShrink: 0 }}>End</button>
    </div>
  </div>
}
function Fixture() {
  const [mode, setMode] = useState('shell')
  testWindow.__queueMode = setMode
  return <MusicPlayerContext.Provider value={player}><BrowserRouter>
    {mode === 'toolbar' ? <ToolbarRepro /> : <MusicAppShell socket={null} roomId="isolated-music-queue" isHost canManage voiceManagedExternally />}
  </BrowserRouter></MusicPlayerContext.Provider>
}
const root = createRoot(container)
root.render(<Fixture />)
testWindow.__queueFixture = {
  audio, store: useMusicStore,
  start: () => audio.play(),
  unmount() {
    root.unmount(); audio.pause(); audio.src = ''; URL.revokeObjectURL(mediaUrl)
    useMusicStore.getState().reset(); container.remove()
    if (originalRoot) originalRoot.style.display = originalDisplay || ''
  },
}
