import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { create } from 'zustand'
import { useAuthStore } from '@/store/authStore'
import { getSocketUrl, refreshAccessToken, hasExpiredSession, cancelAuthRefresh } from '@/lib/api'
import { buildSocketAuth } from '@/lib/authTransport'
import { dispatchRoomMediaTeardown } from '@/lib/mediaTeardown'
import { clearAuthTokens } from '@/lib/authTransport'
import { createSocketRecovery } from './socketRecovery'

const connection = create<{ socket: Socket | null; connected: boolean; recoveryError: string }>(() => ({
  socket: null, connected: false, recoveryError: '',
}))
let recovery: ReturnType<typeof createSocketRecovery> | null = null

export function resetSocket() {
  cancelAuthRefresh()
  recovery?.cancel()
  recovery = null
  dispatchRoomMediaTeardown(true)
  const socket = connection.getState().socket
  socket?.removeAllListeners()
  socket?.disconnect()
  connection.setState({ socket: null, connected: false, recoveryError: '' })
}

export function reconnectSocket() {
  void recovery?.retry()
}

function ensureSocket() {
  if (connection.getState().socket) return
  const base = new URL(getSocketUrl())
  const socket = io(base.origin, {
    path: base.pathname.replace(/\/$/, '') + '/socket.io',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: callback => callback(buildSocketAuth()),
  })
  connection.setState({ socket })
  const server = getSocketUrl()
  const user = useAuthStore.getState().user
  const session = createSocketRecovery({
    refresh: refreshAccessToken,
    current: () => connection.getState().socket === socket && getSocketUrl() === server && !!user && useAuthStore.getState().user?.id === user.id && useAuthStore.getState().user?.role === user.role,
    expired: hasExpiredSession,
    connect: () => { if (!socket.connected) socket.connect() },
    reject: () => { clearAuthTokens(); useAuthStore.getState().logout(); resetSocket() },
    status: recoveryError => connection.setState({ recoveryError }),
  })
  recovery = session
  socket.on('connect', () => {
    session.connected()
    connection.setState({ connected: true })
  })
  socket.on('disconnect', reason => {
    connection.setState({ connected: false })
    if (reason === 'io server disconnect') {
      // A new server disconnect starts a new bounded cycle; connect_error within
      // that cycle must not start an endless refresh/connect loop.
      void session.disconnected()
    } else if (reason === 'io client disconnect') session.cancel()
  })
  socket.on('connect_error', error => {
    connection.setState({ connected: false })
    if (/token|unauthor|认证|令牌/i.test(error.message)) void session.recover()
  })
  socket.connect()
}

export function useSocket() {
  const ready = useAuthStore(s => s.autoLoginStatus === 'done' && !!s.user)
  const state = connection()
  useEffect(() => {
    if (ready) ensureSocket()
  }, [ready])
  return state
}
