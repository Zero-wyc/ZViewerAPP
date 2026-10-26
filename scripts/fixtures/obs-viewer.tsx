// Local integration fixture; credentials are injected from an isolated backend by the test driver.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { saveAuthTokens, setCustomApiUrl } from '@/lib/api'
import StreamPushViewer from '@/modules/screen-sharing/components/StreamPushViewer'
import '../../src/upstream/index.css'
import '../../src/styles.css'
import '../../src/mobile/mobile.css'
import '../../src/mobile/appearance.css'

const fixture = (window as unknown as { obsFixture: { base: string; roomId: string; accessToken: string; refreshToken: string } }).obsFixture
if (!fixture) throw new Error('Inject an isolated obsFixture before loading this integration fixture')
setCustomApiUrl(fixture.base)
saveAuthTokens(fixture.accessToken, fixture.refreshToken)
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ height: '85vh', position: 'relative' }}>
      <StreamPushViewer roomId={fixture.roomId} streamStatus="live" playerOnly />
    </div>
  </React.StrictMode>,
)
