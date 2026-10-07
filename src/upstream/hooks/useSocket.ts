import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { create } from 'zustand'
import { useAuthStore } from '@/store/authStore'
import { getSocketUrl, refreshAccessToken, hasExpiredSession } from '@/lib/api'
import { buildSocketAuth } from '@/lib/authTransport'
import { dispatchRoomMediaTeardown } from '@/lib/mediaTeardown'

const connection = create<{ socket: Socket | null; connected: boolean }>(() => ({
  socket: null, connected: false,
}))
let refreshTask: Promise<void> | null = null
function handleAuthError(error: Error) {
  if (!/token|unauthor|认证|令牌/i.test(error.message)) return
  if (!refreshTask) {
    const main = connection.getState().socket
    refreshTask = (async () => {
      try {
        const refreshed = await refreshAccessToken()
        // A server switch/logout invalidates this refresh attempt.
        if (connection.getState().socket !== main) return
        if (refreshed) {
          if (main && !main.connected) main.connect()
        } else if (hasExpiredSession()) {
          useAuthStore.getState().logout()
          resetSocket()
        }
      } catch {
        // Network failures keep the session; Socket.IO retries the handshake.
      } finally {
        refreshTask = null
      }
    })()
  }
}

export function resetSocket() {
  dispatchRoomMediaTeardown(true)
  const socket = connection.getState().socket
  socket?.removeAllListeners()
  socket?.disconnect()
  connection.setState({ socket: null, connected: false })
}

export function reconnectSocket() {
  const socket = connection.getState().socket
  socket?.disconnect()
  socket?.connect()
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
  socket.on('connect', () => connection.setState({ connected: true }))
  socket.on('disconnect', () => connection.setState({ connected: false }))
  socket.on('connect_error', error => {
    connection.setState({ connected: false })
    handleAuthError(error)
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
