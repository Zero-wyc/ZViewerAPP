// Development acceptance fixture. The runner supplies credentials for an isolated local server.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MoviePushPanel } from '../../src/upstream/modules/room/components/MoviePushPanel'
import { useRoomStore } from '../../src/upstream/store/roomStore'
import { useAuthStore } from '../../src/upstream/store/authStore'
import { useThemeStore } from '../../src/upstream/store/themeStore'
import { setCustomApiUrl, setCustomSocketUrl, saveAuthTokens } from '../../src/upstream/lib/api'
import { MobileAppearance } from '../../src/mobile/MobileAppearance'
import '../../src/upstream/index.css'
import '../../src/styles.css'
import '../../src/mobile/mobile.css'
import '../../src/mobile/appearance.css'

const w = window as any
const session = w.__alignmentSession
if (!session) throw new Error('Start the isolated local acceptance runner first')
setCustomApiUrl(session.server)
setCustomSocketUrl(session.server)
saveAuthTokens(session.root.accessToken, session.root.refreshToken)
useAuthStore.setState({user: session.root.user, isAuthenticated: true})
useRoomStore.setState({roomId: session.roomId, mode: 'watch-together', movies: []})
w.__alignment = { store: useRoomStore, theme(dark: boolean) { useThemeStore.setState({mode: dark ? 'dark' : 'light', isDark: dark}) } }
createRoot(document.getElementById('root')!).render(<MobileAppearance global room><main className="mobile-room" style={{padding: '12px', minHeight: '100dvh'}}><MoviePushPanel isHost /></main></MobileAppearance>)
