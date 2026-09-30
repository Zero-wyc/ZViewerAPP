// Synthetic packets exercise the existing server relay, never a microphone or
// remote NAS. Actual Opus encoding/capture is a separate native device check.
const { io } = require('socket.io-client');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const base = 'http://127.0.0.1:7333'; const sockets = []; const checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(10000).emit(event, payload, (error, result) => error || !result?.success ? reject(new Error(`${event} failed`)) : resolve(result)));
const next = (socket, event) => new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`${event} timeout`)); }, 10000); const listener = data => { clearTimeout(timer); resolve(data); }; socket.once(event, listener); });
async function connect(token) { const socket = io(base, { transports: ['websocket'], auth: { token }, forceNew: true, reconnection: false }); sockets.push(socket); await new Promise((resolve, reject) => socket.once('connect', resolve).once('connect_error', reject)); return socket; }
async function auth(endpoint, body) { return (await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
(async () => {
  let roomId, headers;
  try {
    const root = await auth('/api/auth/login', { username: 'root', password: 'root' }); const guest = await auth('/api/auth/guest', {});
    headers = { Authorization: `Bearer ${root.accessToken}`, 'Content-Type': 'application/json' };
    const host = await connect(root.accessToken); const viewer = await connect(guest.accessToken);
    const room = await ack(host, 'create-room', { name: 'iOS isolated protocol acceptance', mode: 'watch-together', requireApproval: false, maxViewers: 10 }); roomId = room.data.roomId;
    await ack(host, 'register-host', { roomId }); await ack(viewer, 'request-join', { roomId }); checks.push('host + admitted guest');
    const h = await ack(host, 'voice-join', { roomId }); const v = await ack(viewer, 'voice-join', { roomId }); assert(v.members.some(member => member.socketId === host.id)); checks.push('voice join uses primary member identity');
    const hm = await connect(root.accessToken); const vm = await connect(guest.accessToken);
    await assert.rejects(ack(vm, 'voice-media-init', { roomId, token: 'invalid' })); checks.push('unissued media token rejected');
    await ack(hm, 'voice-media-init', { roomId, token: h.mediaToken }); await ack(vm, 'voice-media-init', { roomId, token: v.mediaToken });
    const packet = new Uint8Array([0xf8, 0xff, 0xfe]); const frame = next(vm, 'voice-media-data'); hm.emit('voice-media-data', { data: packet.buffer, encoded: true, sampleRate: 48000, mediaTs: 20000, timestamp: Date.now() }); const received = await frame;
    assert.equal(received.from, host.id); assert.equal(received.encoded, true); assert.deepEqual([...received.data], [...packet]); checks.push('binary Opus relay preserves bytes/time/primary id');
    const pcm = next(hm, 'voice-media-data'); const bytes = new Float32Array([0, 0.25, -0.25]); vm.emit('voice-media-data', { data: bytes.buffer, encoded: false, sampleRate: 44100, mediaTs: 10000, timestamp: Date.now() }); const legacy = await pcm; assert.equal(legacy.sampleRate, 44100); assert.equal(legacy.encoded, false); checks.push('legacy PCM relay');
    const config = next(viewer, 'voice-codec-config'); host.emit('voice-codec-config', { roomId, description: new Uint8Array(19).buffer }); assert.equal((await config).from, host.id); checks.push('codec config uses existing main connection event');
    await ack(host, 'voice-mute', { roomId, socketId: viewer.id, muted: true }); let leaked = 0; const count = () => leaked++; hm.on('voice-media-data', count); vm.emit('voice-media-data', { data: packet.buffer, encoded: true, timestamp: Date.now() }); await wait(350); hm.off('voice-media-data', count); assert.equal(leaked, 0); checks.push('server-enforced mute drops media');
    await ack(host, 'voice-mute', { roomId, socketId: viewer.id, muted: false }); const restored = next(hm, 'voice-media-data'); vm.emit('voice-media-data', { data: packet.buffer, encoded: true, timestamp: Date.now() }); await restored; checks.push('unmute resumes media');
    vm.disconnect(); const renewed = await connect(guest.accessToken); await ack(renewed, 'voice-media-init', { roomId, token: v.mediaToken }); checks.push('media reconnect rebinds existing token');
    const kicked = next(viewer, 'voice-kicked'); await ack(host, 'voice-kick', { roomId, socketId: viewer.id }); await kicked; await assert.rejects(ack(renewed, 'voice-media-init', { roomId, token: v.mediaToken })); checks.push('kick invalidates relay token');
    const subtitle = { roomId, enabled: true, activeIndex: 0, tracks: [{ label: 'Local test', cues: [{ start: 1, end: 3, text: 'Test' }] }], fontSize: 20, offset: 0 };
    const forwarded = next(viewer, 'subtitle-update'); await ack(host, 'subtitle-update', subtitle); assert.deepEqual((await forwarded).tracks, subtitle.tracks); await assert.rejects(ack(viewer, 'subtitle-update', subtitle)); checks.push('subtitle sync and host permission');
    const cached = next(viewer, 'subtitle-update'); viewer.emit('subtitle-request', { roomId }); assert.deepEqual((await cached).tracks, subtitle.tracks); checks.push('late subtitle state request');
    const trackPath = `${base}/api/rooms/${roomId}/danmaku-tracks`; const track = { trackId: 'ios-test', label: 'Protocol fixture', source: 'ios-import', items: [{ id: '1', content: 'Test', time: 2 }], offset: 0, hidden: false };
    const broadcast = next(viewer, 'danmaku-tracks-updated'); let result = await fetch(trackPath, { method: 'POST', headers, body: JSON.stringify(track) }); assert.equal(result.status, 201); assert((await broadcast).tracks.some(item => item.trackId === track.trackId)); checks.push('danmaku import persists and broadcasts');
    result = await fetch(`${trackPath}/ios-test/offset`, { method: 'PUT', headers, body: JSON.stringify({ offset: 1.5 }) }); assert.equal(result.status, 200); checks.push('danmaku offset update');
    result = await fetch(trackPath, { method: 'POST', headers, body: JSON.stringify({ ...track, hidden: true }) }); assert.equal(result.status, 201); result = await fetch(`${trackPath}/ios-test`, { method: 'DELETE', headers }); assert.equal(result.status, 200); checks.push('danmaku hide/delete');
    host.emit('voice-leave', { roomId }); await wait(100); checks.push('voice leave');
  } finally { sockets.forEach(socket => socket.disconnect()); if (roomId && headers) await fetch(`${base}/api/rooms/${roomId}`, { method: 'DELETE', headers }); fs.writeFileSync(path.resolve(__dirname, '../../../local-ios-validation/ios-protocol-results.json'), JSON.stringify({ scope: 'unmodified isolated local v4.2.0 with synthetic packets; not device audio acceptance', checks }, null, 2)); }
  console.log(JSON.stringify({ passed: checks.length }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
