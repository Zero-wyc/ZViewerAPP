import http from 'node:http'
import fs from 'node:fs'
import { Server } from 'socket.io'

const rooms = [
  { roomId: 'watch', name: '周末放映室', mode: 'watch-together' },
  { roomId: 'screen', name: '桌面共享', mode: 'screen-share', shareMethod: 'webrtc' },
  { roomId: 'music', name: '一起听音乐', mode: 'listen-together' },
  { roomId: 'locked', name: '密码房间', mode: 'watch-together', hasPassword: true },
  { roomId: 'approval', name: '审批房间', mode: 'watch-together', requireApproval: true },
  { roomId: 'push', name: 'OBS 共享', mode: 'screen-share', shareMethod: 'stream-push', streamKey: 'fixture' },
].map(room => ({ viewerCount: 2, maxViewers: 10, sharerOnline: true, ...room }))
const user = { id: 11, username: 'mobile-test', role: 'admin' }
const moviesByRoom = new Map()
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/sender') {
    res.setHeader('Content-Type', 'text/html')
    res.end(fs.readFileSync(new URL('./sender.html', import.meta.url)))
    return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  let body = {}
  try { body = JSON.parse(raw || '{}') } catch {}
  let result = { success: true }
  if (url.pathname === '/test/event') {
    if (body.event === 'movie-list') moviesByRoom.set(body.roomId, body.data.movies)
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.roomId !== body.roomId) continue
      if (body.event === 'drop-transport') socket.conn.close()
      else socket.emit(body.event, body.data)
    }
  } else if (url.pathname === '/test/state') {
    result = { sockets: [...io.sockets.sockets.values()].filter(s => !s.data.sender).map(s => ({ roomId: s.data.roomId, token: s.handshake.auth.token, voice: !!s.data.voice, voiceFrames: s.data.voiceFrames || 0 })), requests: mediaRequests }
  } else if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/guest' || url.pathname === '/api/auth/refresh') {
    result = { success: true, user: url.pathname.endsWith('guest') ? { ...user, role: 'guest' } : user, accessToken: 'fixture-access', refreshToken: 'fixture-refresh' }
  } else if (url.pathname === '/api/auth/me') result = { success: true, user }
  else if (url.pathname === '/api/auth/public-settings') result = { success: true, settings: { roomCreationMode: 'all-users', playsvideoEnabled: false } }
  else if (url.pathname === '/api/rooms') result = { success: true, rooms }
  else if (/\/movies$/.test(url.pathname)) result = { success: true, movies: moviesByRoom.get(url.pathname.split('/')[3]) || [] }
  else if (/\/tracks$/.test(url.pathname)) result = { success: true, tracks: [] }
  else if (/\/meta$/.test(url.pathname)) result = { success: true, meta: { blockKeywords: [], deletedLog: [], realtimeLog: [] } }
  else if (url.pathname === '/api/music/login/status') result = { success: true, data: { profile: null } }
  else if (url.pathname.startsWith('/api/music/')) result = { success: true, code: 200, data: [], playlists: [], result: { songs: [], songCount: 0 } }
  else if (url.pathname === '/api/test-media/480.mp4' || url.pathname === '/api/test-media/720.mp4') {
    res.setHeader('Content-Type', 'video/mp4')
    res.end(fs.readFileSync(new URL(`./fixtures/bilibili/video-${url.pathname.endsWith('480.mp4') ? '480' : '720'}.mp4`, import.meta.url)))
    return
  }
  else if (url.pathname.startsWith('/api/stream/') || url.pathname.startsWith('/live/')) {
    mediaRequests.push(req.url)
    res.writeHead(404)
    res.end()
    return
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(result))
})
const io = new Server(server, { cors: { origin: true, credentials: true } })
const mediaRequests = []
let sender
io.on('connection', socket => {
  const leaveVoice = () => {
    if (!socket.data.voice) return
    socket.to(`voice:${socket.data.roomId}`).emit('voice-user-left', { socketId: socket.id })
    socket.leave(`voice:${socket.data.roomId}`)
    socket.data.voice = false
  }
  socket.on('voice-join', ({ roomId, username }, ack) => {
    if (roomId !== socket.data.roomId) { ack({ success: false, message: '请先加入房间' }); return }
    const members = [...io.sockets.sockets.values()]
      .filter(peer => peer.id !== socket.id && peer.data.roomId === roomId && peer.data.voice)
      .map(peer => ({ socketId: peer.id, userId: user.id, username: peer.data.voiceUsername }))
    socket.data.voice = true
    socket.data.voiceUsername = username
    socket.join(`voice:${roomId}`)
    ack({ success: true, members })
    socket.to(`voice:${roomId}`).emit('voice-user-joined', { socketId: socket.id, userId: user.id, username })
  })
  socket.on('voice-leave', leaveVoice)
  socket.on('disconnecting', leaveVoice)
  for (const event of ['voice-audio-data', 'voice-codec-config']) {
    socket.on(event, payload => {
      if (!socket.data.voice || payload.roomId !== socket.data.roomId) return
      if (event === 'voice-audio-data') socket.data.voiceFrames = (socket.data.voiceFrames || 0) + 1
      socket.to(`voice:${socket.data.roomId}`).emit(event, { ...payload, from: socket.id })
    })
  }
  socket.on('test-sender', ack => { sender = socket; socket.data.sender = true; ack?.() })
  socket.on('create-room', (data, ack) => {
    const room = { ...rooms[0], ...data, roomId: `created-${Date.now()}` }
    rooms.push(room)
    ack({ success: true, data: room })
  })
  socket.on('register-host', ({ roomId }, ack) => {
    const room = rooms.find(r => r.roomId === roomId)
    socket.data.roomId = roomId
    socket.join(roomId)
    ack({ success: !!room, data: room })
  })
  socket.on('request-join', ({ roomId, password }, ack) => {
    const room = rooms.find(r => r.roomId === roomId)
    if (!room) { ack({ success: false, message: '房间不存在' }); return }
    if (room.hasPassword && password !== '1234') { ack({ success: false, message: '密码错误' }); return }
    socket.data.roomId = roomId
    socket.join(roomId)
    if (room.requireApproval) { ack({ success: true, message: '等待分享端确认', data: room }); return }
    socket.emit('join-approved', room)
    ack({ success: true, message: '已加入房间', data: room })
  })
  socket.on('comment-history', (_data, ack) => ack({ success: true, comments: [] }))
  socket.on('send-comment', (data, ack) => {
    io.to(socket.data.roomId).emit('new-comment', { ...data, id: Date.now(), username: user.username, createdAt: new Date().toISOString() })
    ack({ success: true })
  })
  socket.on('watch-together-request-state', (_data, ack) => ack?.({ success: true, data: null }))
  socket.on('play-movie', ({ roomId, movieId }, ack) => {
    if (socket.data.roomId !== roomId) { ack?.({ success: false, message: '不在该房间中' }); return }
    io.to(roomId).emit('current-movie', { movieId })
    ack?.({ success: true })
  })
  socket.on('update-room-mode', ({ roomId, mode }, ack) => {
    const room = rooms.find(r => r.roomId === roomId)
    room.mode = mode
    io.to(roomId).emit('room-mode-changed', { roomId, mode })
    ack({ success: true, data: { mode } })
  })
  socket.on('viewer-ready', () => sender?.emit('viewer-ready', { viewerSocketId: socket.id }))
  for (const event of ['signal-offer', 'signal-answer', 'signal-ice-candidate']) {
    socket.on(event, ({ to, data }) => io.to(to).emit(event, { from: socket.id, data }))
  }
  socket.onAny((event, ...args) => {
    const handled = ['voice-join', 'voice-leave', 'voice-audio-data', 'voice-codec-config', 'test-sender', 'create-room', 'register-host', 'request-join', 'comment-history', 'send-comment', 'watch-together-request-state', 'play-movie', 'update-room-mode', 'viewer-ready', 'signal-offer', 'signal-answer', 'signal-ice-candidate']
    if (handled.includes(event)) return
    const ack = args.at(-1)
    if (typeof ack === 'function') ack({ success: true, queue: [], syncState: null, data: { agents: [] }, agents: [] })
  })
})
server.listen(3347, '127.0.0.1', () => console.log('Fixture backend on 3347'))
