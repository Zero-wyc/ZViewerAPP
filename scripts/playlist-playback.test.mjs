import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'
const { requestPlaylistMovie } = loadTs('src/upstream/modules/room/watch-together/playlistPlayback.ts')
function connection() {
  const calls = []
  const socket = { connected: true, timeout() { return this }, emit(event, payload, complete) { calls.push({ event, payload, complete }) } }
  return { socket, calls }
}
test('next requests await server acknowledgement; repeated clicks send one request', async () => {
  const { socket, calls } = connection()
  const first = requestPlaylistMovie(socket, 'r', 3, true, () => true)
  const second = requestPlaylistMovie(socket, 'r', 3, true, () => true)
  assert.equal(first, second); assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.movieId, 3)
  calls[0].complete(null, { success: true }); await first
  const next = requestPlaylistMovie(socket, 'r', 7, true, () => true)
  assert.equal(calls.length, 2); calls[1].complete(null, { success: true }); await next
})
test('missing host playlist re-registers once and retries the requested movie', async () => {
  const { socket, calls } = connection()
  const task = requestPlaylistMovie(socket, 'r', 3, true, () => true)
  calls[0].complete(null, { success: false, message: '影片不存在' })
  assert.equal(calls[1].event, 'register-host'); calls[1].complete(null, { success: true })
  assert.equal(calls[2].event, 'play-movie'); calls[2].complete(null, { success: true }); await task
  assert.equal(calls.length, 3)
})
test('room managers do not register themselves as the host', async () => {
  const { socket, calls } = connection()
  const task = requestPlaylistMovie(socket, 'r', 3, false, () => true)
  calls[0].complete(null, { success: false, message: '影片不存在' })
  await assert.rejects(task, /影片不存在/); assert.equal(calls.length, 1)
})
test('leaving, changing movie, or losing permission cancels a delayed retry', async () => {
  const { socket, calls } = connection(); let current = true
  const task = requestPlaylistMovie(socket, 'r', 3, true, () => current)
  calls[0].complete(null, { success: false, message: '影片不存在' }); current = false
  calls[1].complete(null, { success: true }); await task
  assert.equal(calls.length, 2)
  await requestPlaylistMovie(socket, 'r', 9, true, () => false); assert.equal(calls.length, 2)
})
test('offline, timeout and server denial fail clearly and release the request gate', async () => {
  const { socket, calls } = connection(); socket.connected = false
  await assert.rejects(requestPlaylistMovie(socket, 'r', 3, true, () => true), /未连接/)
  assert.equal(calls.length, 0); socket.connected = true
  const task = requestPlaylistMovie(socket, 'r', 3, true, () => true)
  calls[0].complete(new Error('timeout')); await assert.rejects(task, /切换影片失败/)
  const retry = requestPlaylistMovie(socket, 'r', 3, true, () => true)
  calls[1].complete(null, { success: false, message: '没有权限' }); await assert.rejects(retry, /没有权限/)
})
