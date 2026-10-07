import { applyServerPolicy, selectServer, connectionUrl, readServerPolicy, saveServerPolicy, revokeServerConnection } from './platform/serverConnection'
import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe2,
  LockKeyhole,
  LogIn,
  MonitorPlay,
  Music2,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { apiFetch, clearAuthTokens, getAccessToken, getRefreshToken, resetSessionExpired, saveAuthTokens, setCustomApiUrl, setCustomSocketUrl } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useSocket, resetSocket } from '@/hooks/useSocket'
import { useSystemSettingsStore } from '@/store/systemSettingsStore'
import { normalizeServerUrl } from './mobile/serverUrl'
import { useNativeBack } from './mobile/useNativeBack'
import { BilibiliAccount } from './mobile/BilibiliAccount'
import { MobileAppearance } from './mobile/MobileAppearance'
import { startEmbeddedProxy } from './platform/bilibiliProxy'
import { isGlobalAppearanceRuntime } from './platform/runtime'

const MobileRoom = lazy(() => import('./mobile/MobileRoom'))

type LoginMode = 'account' | 'guest'
type Screen = 'connect' | 'rooms'
type RoomMode = 'watch-together' | 'listen-together'

interface AuthUser {
  id: number
  username: string
  role: 'root' | 'admin' | 'user' | 'guest'
}

interface AuthResponse {
  success: boolean
  message?: string
  accessToken?: string
  refreshToken?: string
  user?: AuthUser
}

interface Room {
  roomId: string
  name: string
  viewerCount: number
  maxViewers: number
  hasPassword: boolean
  requireApproval: boolean
  sharerOnline: boolean
  mode?: string
}

interface Session {
  serverUrl: string
  accessToken: string
  refreshToken: string
  user: AuthUser
}

interface PublicSettings {
  roomCreationMode: 'admin-only' | 'all-users'
}

const SERVER_KEY = 'zviewer-mobile-server'
const SESSION_KEY = 'zviewer-mobile-session'

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function statusMessage(error: unknown): string {
  if (error instanceof TypeError) return '无法连接服务器，请检查地址、网络或跨域设置'
  if (error instanceof Error) return error.message
  return '发生未知错误'
}

export default function App() {
  useEffect(() => { void startEmbeddedProxy() }, [])
  const navigate = useNavigate()
  const location = useLocation()
  const { socket, connected } = useSocket()
  const authUser = useAuthStore(s => s.user)
  const previousSession = useMemo(readSession, [])
  const [screen, setScreen] = useState<Screen>(previousSession ? 'rooms' : 'connect')
  const [serverUrl, setServerUrl] = useState(
    previousSession?.serverUrl || localStorage.getItem(SERVER_KEY) || '',
  )
  const [addressMode, setAddressMode] = useState<'auto' | 'custom'>('auto')
  const [allowUntrusted, setAllowUntrusted] = useState(readServerPolicy(serverUrl))
  const [selectedAddress, setSelectedAddress] = useState('')
  const connectionAttempt = useRef<AbortController | null>(null)
  const [mode, setMode] = useState<LoginMode>('account')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [session, setSession] = useState<Session | null>(previousSession)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(false)
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [openingRoom, setOpeningRoom] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(Boolean(previousSession))
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({ roomCreationMode: 'admin-only' })
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomPassword, setRoomPassword] = useState('')
  const [maxViewers, setMaxViewers] = useState(10)
  const [requireApproval, setRequireApproval] = useState(false)
  const [roomMode, setRoomMode] = useState<RoomMode>('watch-together')
  const [error, setError] = useState('')
  const restoreStarted = useRef(false)
  const activeRoomId = location.pathname.startsWith('/room/') ? decodeURIComponent(location.pathname.slice(6)) : null
  useNativeBack(() => {
    if (activeRoomId) {
      window.dispatchEvent(new Event('mobile-room-back'))
    } else if (createOpen) setCreateOpen(false)
    else if (screen === 'rooms') navigate('/')
  }, Boolean(activeRoomId || createOpen))

  useEffect(() => {
    if (!activeRoomId) {
      setOpeningRoom(null)
      if (session && !restoring) socket?.connect()
      if (session && !restoring) void loadRooms()
    }
  }, [activeRoomId, socket])

  useEffect(() => {
    if (!restoring && session && !authUser) {
      localStorage.removeItem(SESSION_KEY)
      clearAuthTokens()
      setSession(null)
      setScreen('connect')
      navigate('/', { replace: true })
      setError('登录状态已过期，请重新登录')
    }
  }, [authUser, restoring])

  const canCreateRoom = Boolean(
    session &&
      session.user.role !== 'guest' &&
      (session.user.role === 'root' ||
        session.user.role === 'admin' ||
        publicSettings.roomCreationMode === 'all-users'),
  )

  const request = async (path: string, init: RequestInit = {}, activeSession = session) => {
    const activeServer = activeSession?.serverUrl || normalizeServerUrl(serverUrl)
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')
    return apiFetch(`${activeServer}${path}`, {
      ...init,
      headers: Object.fromEntries(headers.entries()),
    })
  }

  const loadRooms = async (activeSession = session) => {
    if (!activeSession) return
    setRoomsLoading(true)
    setError('')
    try {
      const response = await request('/api/rooms', {}, activeSession)
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        rooms?: Room[]
      }
      if (!response.ok || !data.success) throw new Error(data.message || `获取房间失败 (${response.status})`)
      setRooms(Array.isArray(data.rooms) ? data.rooms : [])
    } catch (requestError) {
      setError(statusMessage(requestError))
    } finally {
      setRoomsLoading(false)
    }
  }

  const loadPublicSettings = async (activeSession = session) => {
    if (!activeSession) return
    try {
      const response = await request('/api/auth/public-settings', {}, activeSession)
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean
        settings?: Partial<PublicSettings>
      }
      if (response.ok && data.success && data.settings?.roomCreationMode) {
        setPublicSettings({ roomCreationMode: data.settings.roomCreationMode })
      }
    } catch {
      // 房间列表仍可使用；创建时服务端会再次执行最终权限校验。
    }
  }

  const persistSession = (nextSession: Session) => {
    setCustomApiUrl(nextSession.serverUrl)
    setCustomSocketUrl(nextSession.serverUrl)
    saveAuthTokens(nextSession.accessToken, nextSession.refreshToken)
    resetSessionExpired()
    useAuthStore.getState().login({ ...nextSession.user, id: String(nextSession.user.id) })
    useAuthStore.getState().markAuthResolved()
    useSystemSettingsStore.getState().invalidate()
    void useSystemSettingsStore.getState().fetchSettings()
    localStorage.setItem(SERVER_KEY, nextSession.serverUrl)
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
    setServerUrl(nextSession.serverUrl)
    setSession(nextSession)
  }

  const verifyOrRefreshSession = async (storedSession: Session): Promise<Session> => {
    await applyServerPolicy(storedSession.serverUrl, readServerPolicy(storedSession.serverUrl))
    let activeSession = storedSession
    setCustomApiUrl(storedSession.serverUrl)
    setCustomSocketUrl(storedSession.serverUrl)
    saveAuthTokens(getAccessToken() || storedSession.accessToken, getRefreshToken() || storedSession.refreshToken)
    let response = await request('/api/auth/me', {}, activeSession)

    if ((response.status === 401 || response.status === 403) && activeSession.refreshToken) {
      const refreshResponse = await fetch(connectionUrl(`${activeSession.serverUrl}/api/auth/refresh`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: activeSession.refreshToken }),
      })
      const refreshData = (await refreshResponse.json().catch(() => ({}))) as AuthResponse
      if (!refreshResponse.ok || !refreshData.success || !refreshData.accessToken) {
        throw new Error(refreshData.message || '登录状态已过期，请重新登录')
      }
      activeSession = { ...activeSession, accessToken: refreshData.accessToken }
      response = await request('/api/auth/me', {}, activeSession)
    }

    const data = (await response.json().catch(() => ({}))) as AuthResponse
    if (!response.ok || !data.success || !data.user) {
      throw new Error(data.message || '登录状态已过期，请重新登录')
    }
    return { ...activeSession, accessToken: getAccessToken(), refreshToken: getRefreshToken(), user: data.user }
  }

  useEffect(() => {
    if (restoreStarted.current) return
    restoreStarted.current = true
    if (!previousSession) {
      setRestoring(false)
      return
    }

    void (async () => {
      try {
        const restoredSession = await verifyOrRefreshSession(previousSession)
        persistSession(restoredSession)
        setScreen('rooms')
        await Promise.all([loadRooms(restoredSession), loadPublicSettings(restoredSession)])
      } catch (restoreError) {
        if (restoreError instanceof TypeError) {
          persistSession(previousSession)
          setScreen('rooms')
          setError('已保留上次的服务器设置，但当前无法连接服务器')
        } else {
          localStorage.removeItem(SESSION_KEY)
          setSession(null)
          setScreen('connect')
          setError(statusMessage(restoreError))
        }
      } finally {
        setRestoring(false)
      }
    })()
  }, [])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    const attempt = new AbortController()
    connectionAttempt.current?.abort()
    connectionAttempt.current = attempt
    try {
      resetSocket()
      const normalizedServer = await selectServer(serverUrl, addressMode, allowUntrusted, attempt.signal)
      attempt.signal.throwIfAborted()
      if (selectedAddress !== normalizedServer) { setSelectedAddress(normalizedServer); return }
      setSelectedAddress(normalizedServer)
      saveServerPolicy(normalizedServer, allowUntrusted && normalizedServer.startsWith('https:'))
      resetSocket()
      clearAuthTokens()
      setCustomApiUrl(normalizedServer)
      setCustomSocketUrl(normalizedServer)
      resetSessionExpired()
      if (!normalizedServer) throw new Error('请输入服务端地址')
      if (mode === 'account' && (!username.trim() || !password)) {
        throw new Error('请输入用户名和密码')
      }

      const endpoint = mode === 'guest' ? '/api/auth/guest' : '/api/auth/login'
      const response = await fetch(connectionUrl(`${normalizedServer}${endpoint}`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: mode === 'guest' ? '{}' : JSON.stringify({ username: username.trim(), password }),
        signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(15000)]),
      })
      const data = (await response.json().catch(() => ({}))) as AuthResponse
      if (!response.ok || !data.success || !data.user || !data.accessToken) {
        throw new Error(data.message || `登录失败 (${response.status})`)
      }

      attempt.signal.throwIfAborted()
      const nextSession: Session = {
        serverUrl: normalizedServer,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || '',
        user: data.user,
      }
      persistSession(nextSession)
      setPassword('')
      setScreen('rooms')
      await Promise.all([loadRooms(nextSession), loadPublicSettings(nextSession)])
    } catch (requestError) {
      setError(statusMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  const handleOpenRoom = async (room: Room) => {
    if (!session) return
    setOpeningRoom(room.roomId)
    setError('')
    try {
      navigate(`/room/${encodeURIComponent(room.roomId)}`, { state: { name: room.name, hasPassword: room.hasPassword } })
    } catch (openError) {
      setError(statusMessage(openError))
      setOpeningRoom(null)
    }
  }

  const handleCreateRoom = async (event: FormEvent) => {
    event.preventDefault()
    if (!session || !canCreateRoom) return
    if (!Number.isFinite(maxViewers) || maxViewers < 1 || maxViewers > 100) {
      setError('房间人数必须在 1 到 100 之间')
      return
    }

    setCreating(true)
    setError('')
    try {
      const response = await new Promise<{
        success: boolean
        data?: { roomId: string; mode?: RoomMode }
        message?: string
      }>((resolve, reject) => {
        if (!socket?.connected) { reject(new Error('正在连接服务器，请稍后重试')); return }
          socket.timeout(15000).emit(
            'create-room',
            {
              name: roomName.trim() || undefined,
              password: roomPassword.trim() || undefined,
              maxViewers,
              requireApproval,
              mode: roomMode,
            },
            (timeoutError: Error | null, ack: {
              success: boolean
              data?: { roomId: string; mode?: RoomMode }
              message?: string
            }) => {
              if (timeoutError) { reject(new Error('创建房间超时，请刷新列表确认结果')); return }
              resolve(ack)
            },
          )
      })

      const roomId = response.data?.roomId
      if (!response.success || !roomId) throw new Error(response.message || '创建房间失败')

      setCreateOpen(false)
      setRoomName('')
      setRoomPassword('')
      setRequireApproval(false)
      setOpeningRoom(roomId)
      navigate(`/room/${encodeURIComponent(roomId)}`, { state: { asHost: true, name: roomName.trim() } })
    } catch (createError) {
      setError(statusMessage(createError))
      setOpeningRoom(null)
    } finally {
      setCreating(false)
    }
  }

  const resetConnection = () => {
    connectionAttempt.current?.abort()
    if (session) void revokeServerConnection(session.serverUrl)
    useSystemSettingsStore.getState().invalidate()
    resetSocket()
    clearAuthTokens()
    useAuthStore.getState().logout()
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
    setRooms([])
    setError('')
    setSelectedAddress('')
    setScreen('connect')
    navigate('/', { replace: true })
  }

  const globalAppearance = isGlobalAppearanceRuntime()
  const roomContent = activeRoomId && session && !restoring ? (
    <Suspense fallback={<main className="mobile-loading"><RefreshCw className="spin" /><span>正在打开房间</span></main>}>
      <MobileRoom key={`${session.serverUrl}:${activeRoomId}`} roomId={activeRoomId}
        onLeave={() => navigate('/', { replace: true })} />
    </Suspense>
  ) : null
  if (roomContent && !globalAppearance) return roomContent

  return (
    <MobileAppearance global={globalAppearance} room={!!roomContent}>
      {roomContent || <>
      <header className="brand-bar">
        <BilibiliAccount />
        <div className="brand-mark">Z</div>
        <div>
          <div className="brand-name">ZViewer</div>
          <div className="brand-subtitle">移动端</div>
        </div>
        <div className="connection-pill">
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {restoring ? '连接中' : connected ? '已连接' : '未连接'}{session && readServerPolicy(session.serverUrl) ? ' · 证书例外' : ''}
        </div>
      </header>

      {screen === 'connect' ? (
        <section className="connect-view">
          <div className="intro-copy">
            <h1>连接服务器</h1>
          </div>

          <form className="login-panel" onSubmit={handleLogin}>
            <label className="field-label" htmlFor="server-url">服务端地址</label>
            <div className="input-shell">
              <Server size={19} />
              <input
                id="server-url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="例如 192.168.1.10:3333"
                value={serverUrl}
                disabled={loading}
                onChange={(event) => { connectionAttempt.current?.abort(); setServerUrl(event.target.value); setSelectedAddress(''); setAllowUntrusted(readServerPolicy(event.target.value)) }}
              />
            </div>

            <label className="field-label" htmlFor="address-mode">连接模式</label>
            <select id="address-mode" value={addressMode} disabled={loading} onChange={event => { setAddressMode(event.target.value as 'auto' | 'custom'); setSelectedAddress('') }}>
              <option value="auto">自动（优先 HTTPS）</option><option value="custom">自定义完整地址</option>
            </select>
            <label className="field-label"><input type="checkbox" checked={allowUntrusted} disabled={loading} onChange={event => { setAllowUntrusted(event.target.checked); setSelectedAddress('') }} /> 允许此服务器使用不受信任的证书</label>
            {allowUntrusted && <p className="field-label">仅为当前服务器启用证书例外；独立语音服务器仍验证证书。</p>}
            {selectedAddress && <p className="field-label">连接地址：{selectedAddress}</p>}
            <div className="mode-switch" role="tablist" aria-label="登录方式">
              <button
                type="button"
                className={mode === 'account' ? 'active' : ''}
                onClick={() => setMode('account')}
              >
                <UserRound size={17} />账号登录
              </button>
              <button
                type="button"
                className={mode === 'guest' ? 'active' : ''}
                onClick={() => setMode('guest')}
              >
                <Globe2 size={17} />游客进入
              </button>
            </div>

            {mode === 'account' ? (
              <div className="credential-fields">
                <label className="field-label" htmlFor="username">用户名</label>
                <div className="input-shell">
                  <UserRound size={19} />
                  <input
                    id="username"
                    autoCapitalize="none"
                    autoComplete="username"
                    placeholder="用户名"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <label className="field-label" htmlFor="password">密码</label>
                <div className="input-shell">
                  <LockKeyhole size={19} />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="密码"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="guest-note">
                <ShieldCheck size={22} />
                <div>
                  <strong>以 guest 身份进入</strong>
                  <span>可以浏览和加入房间，部分管理功能不可用。</span>
                </div>
              </div>
            )}

            {error && <div className="error-banner">{error}</div>}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? <RefreshCw className="spin" size={19} /> : <LogIn size={19} />}
              {loading ? '正在连接' : !selectedAddress ? '检测服务器地址' : mode === 'guest' ? '游客登录' : '登录并选择房间'}
              {!loading && <ArrowRight size={19} />}
            </button>
            {loading && <button type="button" className="field-label" onClick={() => connectionAttempt.current?.abort()}>取消连接</button>}
          </form>

          <div className="security-note">
            <ShieldCheck size={16} />推荐使用 HTTPS 服务地址；局域网测试可使用 HTTP。
          </div>
        </section>
      ) : (
        <section className="rooms-view">
          <div className="rooms-toolbar">
            <button className="icon-button back-button" type="button" onClick={resetConnection} aria-label="更换服务器">
              <ArrowLeft size={21} />
            </button>
            <div className="server-summary">
              <span>{session?.user.username}</span>
              <small>{session?.serverUrl}</small>
              {session && readServerPolicy(session.serverUrl) && <button type="button" className="text-xs" onClick={() => { saveServerPolicy(session.serverUrl, false); setAllowUntrusted(false); setSelectedAddress(''); resetConnection() }}>证书例外已启用 · 撤销并断开</button>}
            </div>
            <button
              className="icon-button refresh-button"
              type="button"
              onClick={() => void loadRooms()}
              disabled={roomsLoading}
              aria-label="刷新房间"
            >
              <RefreshCw className={roomsLoading ? 'spin' : ''} size={20} />
            </button>
          </div>

          <div className="rooms-heading">
            <div>
              <span className="eyebrow">在线放映室</span>
              <h1>选择房间</h1>
            </div>
            <div className="rooms-heading-actions">
              {session?.user.role !== 'guest' && (
                <button
                  className="create-room-button"
                  type="button"
                  disabled={!canCreateRoom}
                  onClick={() => setCreateOpen(true)}
                  title={canCreateRoom ? '创建房间' : '服务器当前仅允许管理员创建房间'}
                >
                  <Plus size={18} />
                  创建
                </button>
              )}
              <span className="room-count">{rooms.length}</span>
            </div>
          </div>

          {session?.user.role !== 'guest' && !canCreateRoom && (
            <div className="permission-note">服务器当前仅允许管理员创建房间，请在后台开启“所有用户”权限。</div>
          )}

          {error && <div className="error-banner room-error">{error}</div>}

          <div className="room-list">
            {roomsLoading && rooms.length === 0 ? (
              <div className="empty-state"><RefreshCw className="spin" size={28} /><span>正在获取房间</span></div>
            ) : rooms.length === 0 ? (
              <div className="empty-state"><UsersRound size={30} /><strong>当前没有开放房间</strong><span>稍后刷新，或由管理员创建房间。</span></div>
            ) : (
              rooms.map((room) => (
                <button
                  className="room-row"
                  key={room.roomId}
                  type="button"
                  onClick={() => void handleOpenRoom(room)}
                  disabled={openingRoom !== null}
                >
                  <div className={`room-status ${room.sharerOnline ? 'online' : ''}`}>
                    {room.sharerOnline ? <CheckCircle2 size={20} /> : <UsersRound size={20} />}
                  </div>
                  <div className="room-copy">
                    <div className="room-title-line">
                      <strong>{room.name || `房间 ${room.roomId}`}</strong>
                      {room.hasPassword && <LockKeyhole size={14} />}
                    </div>
                    <div className="room-meta">
                      <span>{room.mode === 'screen-share' ? '屏幕共享' : room.mode === 'listen-together' ? '一起听' : '同步观影'}</span>
                      <span>{room.viewerCount}/{room.maxViewers} 人</span>
                      {room.requireApproval && <span>需批准</span>}
                    </div>
                  </div>
                  {openingRoom === room.roomId ? <RefreshCw className="spin" size={20} /> : <ArrowRight size={20} />}
                </button>
              ))
            )}
          </div>

          {createOpen && (
            <div className="sheet-backdrop" role="presentation" onClick={() => !creating && setCreateOpen(false)}>
              <form className="create-sheet" onSubmit={handleCreateRoom} onClick={(event) => event.stopPropagation()}>
                <div className="sheet-header">
                  <div>
                    <span className="eyebrow">新的放映室</span>
                    <h2>创建房间</h2>
                  </div>
                  <button className="icon-button" type="button" disabled={creating} onClick={() => setCreateOpen(false)} aria-label="关闭">
                    <X size={21} />
                  </button>
                </div>

                <label className="field-label" htmlFor="room-name">房间名称</label>
                <div className="input-shell compact-input">
                  <UsersRound size={18} />
                  <input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="留空将自动生成" maxLength={80} />
                </div>

                <span className="field-label mode-label">房间模式</span>
                <div className="room-mode-grid">
                  <button type="button" className={roomMode === 'watch-together' ? 'active' : ''} onClick={() => setRoomMode('watch-together')}>
                    <MonitorPlay size={20} /><span>同步观影</span>
                  </button>
                  <button type="button" className={roomMode === 'listen-together' ? 'active' : ''} onClick={() => setRoomMode('listen-together')}>
                    <Music2 size={20} /><span>一起听</span>
                  </button>
                </div>

                <div className="create-form-grid">
                  <div>
                    <label className="field-label" htmlFor="room-password">房间密码</label>
                    <div className="input-shell compact-input">
                      <LockKeyhole size={18} />
                      <input id="room-password" type="password" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="可选" />
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="max-viewers">人数上限</label>
                    <div className="input-shell compact-input">
                      <UsersRound size={18} />
                      <input id="max-viewers" type="number" min="1" max="100" value={maxViewers} onChange={(event) => setMaxViewers(Number(event.target.value))} />
                    </div>
                  </div>
                </div>

                <label className="approval-row">
                  <span><strong>入房需要批准</strong><small>观众加入前由房主确认</small></span>
                  <input type="checkbox" checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} />
                  <span className="switch-track" aria-hidden="true"><span /></span>
                </label>

                <button className="primary-button sheet-submit" type="submit" disabled={creating || !connected}>
                  {creating ? <RefreshCw className="spin" size={19} /> : <Plus size={19} />}
                  {creating ? '正在创建' : '创建并进入房间'}
                  {!creating && <ArrowRight size={19} />}
                </button>
              </form>
            </div>
          )}
        </section>
      )}
      </>}
    </MobileAppearance>
  )
}
