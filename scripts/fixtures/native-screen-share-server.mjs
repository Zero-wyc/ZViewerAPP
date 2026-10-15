// Loopback-only fake REST/signaling backend for native-emulator UI validation.
// Watch-together mode needs .ui-validation/native-test.mp4 (a generated H.264
// test pattern). Screen-share mode uses native-webrtc-loopback.js through CDP.
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createReadStream, statSync } from 'node:fs'
const user = { id: 999, username: 'emulator-test', role: process.env.ZVIEWER_FIXTURE_ROLE === 'root' ? 'root' : 'guest' }
const room = { roomId: 'native-fixture', name: 'WebRTC 模拟器测试', mode: 'screen-share', shareMethod: 'webrtc', hasPassword: false, requireApproval: false, viewerCount: 1 }
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/fixture/mode/watch') { room.mode = 'watch-together'; res.end('{}'); return }
  if (req.url === '/fixture/mode/screen') { room.mode = 'screen-share'; res.end('{}'); return }
  if (req.url === '/fixture.mp4' || req.url?.startsWith('/api/stream/proxy?')) {
    const file = '.ui-validation/native-test.mp4', size = statSync(file).size
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '')
    const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
    res.setHeader('Content-Type', 'video/mp4'); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Content-Length', end - start + 1)
    if (range) { res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}` }) }
    if (req.method === 'HEAD') res.end()
    else createReadStream(file, { start, end }).pipe(res)
    return
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  let body = { success: true }
  if (req.url?.includes('/api/auth/')) body = { success: true, user, accessToken: 'local-emulator-fixture', refreshToken: '', settings: { roomCreationMode: 'all-users', guestEnabled: true } }
  else if (req.url === '/api/rooms') body = { success: true, rooms: [room] }
  else if (req.url?.includes('/danmaku')) body = { success: true, tracks: [], data: [], meta: {} }
  else if (req.url?.endsWith('/movies')) body = { success: true, movies: [] }
  else body = { success: true, data: [], comments: [], viewers: [], ...room }
  res.end(JSON.stringify(body))
})
const io = new Server(server, { cors: { origin: true, credentials: true } })
io.on('connection', socket => {
  socket.onAny((event, ...args) => {
    const ack = args.at(-1)
    if (typeof ack === 'function') ack({ success: true, message: '已加入房间', data: room })
    if (event === 'request-join') {
      socket.emit('join-approved', room)
      socket.emit('viewer-joined', { viewerSocketId: socket.id, userId: 999, username: 'emulator-test', role: 'guest' })
    }
    if (event === 'request-current-movie' && room.mode === 'watch-together') {
      socket.emit('preview-source', { source: { url: 'http://127.0.0.1:4190/fixture.mp4', title: 'Native menu test', sourceType: 'url', format: 'mp4', videoCodec: 'avc1', duration: 60 } })
    }
  })
})
server.listen(4190, '127.0.0.1', () => console.log('Native fixture backend: http://127.0.0.1:4190'))
