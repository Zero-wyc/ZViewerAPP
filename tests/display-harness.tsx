import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PlayerControlBar } from '../src/upstream/modules/room/watch-together/PlayerControlBar'
import { SettingsPanel } from '../src/upstream/components/VideoPlayer/SettingsPanel'
import { DEFAULT_DANMAKU_STYLE } from '../src/upstream/store/danmakuStore'
import { useSubtitles } from '../src/upstream/hooks/useSubtitles'
import { ScreenOrientationButton } from '../src/mobile/PlayerDisplayControls'
import '../src/upstream/index.css'
import '../src/styles.css'
import '../src/mobile/mobile.css'

function Harness() {
  const video = useRef<HTMLVideoElement>(null)
  const [full, setFull] = useState(false)
  const [settings, setSettings] = useState(false)
  const subtitles = useSubtitles({ roomId: 'display-test', isHost: true })
  return <main className="mobile-room" data-subtitle-font-size={subtitles.subtitleFontSize}>
    <header className="mobile-room-header">
      <div className="mobile-room-title"><strong>Test room</strong></div>
      <ScreenOrientationButton className="icon-button mobile-orientation-button" />
    </header>
    <div className="mobile-player">
      <div className="zart-stage" style={full ? { position: 'fixed', inset: 0, background: '#111417', zIndex: 500 } : { position: 'relative', width: '100%', height: '100%' }}>
        <video ref={video} style={{ width: '100%', height: '100%' }} />
        {settings && <div style={{ position: 'absolute', right: 8, bottom: 92 }}><SettingsPanel isHost
          subtitleFontSize={subtitles.subtitleFontSize}
          subtitleEnabled={subtitles.subtitleEnabled}
          onToggleSubtitles={subtitles.setEnabled}
          onChangeSubtitleFontSize={subtitles.setFontSize}
          danmakuStyle={DEFAULT_DANMAKU_STYLE} /></div>}
        <PlayerControlBar isHost videoRef={video} watchTogether={{ duration: 1422, currentTime: 624 } as never}
          isPlaying={false} isWebFullscreen={full} onToggleWebFullscreen={() => setFull(v => !v)}
          danmakuEnabled onToggleDanmaku={() => {}} onSendDanmaku={() => {}} onSync={() => {}}
          onReload={() => {}} settingsOpen={settings} onToggleSettings={() => setSettings(v => !v)}
          controlBarVisible />
      </div>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
