import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { create } from 'zustand'
import { useAuthStore } from '@/store/authStore'
import { getSocketUrl, refreshAccessToken } from '@/lib/api'
import { buildSocketAuth } from '@/lib/authTransport'

const connection = create<{ socket: Socket | null; connected: boolean }>(() => ({
  socket: null, connected: false,
}))
let refreshing = false

export function resetSocket() {
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
  const socket = io(getSocketUrl(), {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: callback => callback(buildSocketAuth()),
  })
  connection.setState({ socket })
  socket.on('connect', () => connection.setState({ connected: true }))
  socket.on('disconnect', () => connection.setState({ connected: false }))
  socket.on('connect_error', async error => {
    connection.setState({ connected: false })
    if (refreshing || !/token|unauthor|认证|令牌/i.test(error.message)) return
    refreshing = true
    try {
      if (await refreshAccessToken()) {
        if (connection.getState().socket === socket) socket.connect()
      } else if (connection.getState().socket === socket) {
        useAuthStore.getState().logout()
        resetSocket()
      }
    } finally {
      refreshing = false
    }
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
