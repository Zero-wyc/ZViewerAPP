import type { Socket } from 'socket.io-client'

// Repeated next-button requests wait for the same server confirmation.
const pending = new WeakMap<object, Map<string, Promise<void>>>()
export function requestPlaylistMovie(
  socket: Pick<Socket, 'connected' | 'timeout'>,
  roomId: string,
  movieId: number,
  isHost: boolean,
  stillCurrent: () => boolean,
): Promise<void> {
  if (!stillCurrent()) return Promise.resolve()
  const rooms = pending.get(socket) ?? new Map<string, Promise<void>>()
  pending.set(socket, rooms)
  const previous = rooms.get(roomId)
  if (previous) return previous
  const task = new Promise<void>((resolve, reject) => {
    const emitPlay = (retried = false) => {
      if (!stillCurrent()) { resolve(); return }
      if (!socket.connected) { reject(new Error('未连接房间')); return }
      socket.timeout(8000).emit('play-movie', { roomId, movieId },
        (error: Error | null, ack?: { success?: boolean; message?: string }) => {
          if (!stillCurrent()) { resolve(); return }
          if (isHost && !retried && !error && ack?.message === '影片不存在') {
            socket.timeout(8000).emit('register-host', { roomId },
              (registerError: Error | null, registerAck?: { success?: boolean }) => {
                if (!stillCurrent()) { resolve(); return }
                if (registerError || !registerAck?.success) {
                  reject(new Error('片单同步失败，请重新进入房间')); return
                }
                emitPlay(true)
              })
          } else if (error || !ack?.success) {
            reject(new Error(ack?.message || '切换影片失败，请重试'))
          } else resolve()
        })
    }
    emitPlay()
  })
  rooms.set(roomId, task)
  const clear = () => { if (rooms.get(roomId) === task) rooms.delete(roomId) }
  void task.then(clear, clear)
  return task
}
