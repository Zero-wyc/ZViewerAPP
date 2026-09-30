import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { nativeVideoSource } from '../src/lib/media.ts';
import { probeMedia } from '../src/lib/mediaDiagnostics.ts';

const credentialFile = process.argv[2];
if (!credentialFile) throw new Error('Usage: node scripts/live-media-check.mjs <external-credentials-file> [room-name]');
const text = readFileSync(credentialFile, 'utf8');
const serverUrl = text.match(/https?:\/\/\S+/)?.[0];
const username = text.match(/账号\s*[:：]\s*(.+)/)?.[1].trim();
const password = text.match(/密码\s*[:：]\s*(.+)/)?.[1].trim();
if (!serverUrl || !username || !password) throw new Error('Credentials file must contain server URL, 账号 and 密码');
// A previous session used a NAS. The current workflow defaults to local-only
// validation; contacting another server now requires an explicit CLI opt-in.
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(serverUrl).hostname) && !process.argv.includes('--allow-remote')) {
  throw new Error('Remote media validation is disabled; use a local test server or explicitly pass --allow-remote');
}
const login = await fetch(serverUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15000) });
const auth = await login.json();
if (!login.ok || !auth.accessToken) throw new Error('Login failed');
const headers = { Authorization: `Bearer ${auth.accessToken}` };
const json = async path => {
  const response = await fetch(serverUrl + path, { headers, signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`API failed (${response.status})`);
  return data;
};
const rooms = (await json('/api/rooms')).rooms;
const room = rooms.find(item => item.name === (process.argv[3] || 'Test 1')) || (rooms.length === 1 ? rooms[0] : null);
if (!room) throw new Error('Test room not found; specify its current name');
const socket = io(serverUrl, { transports: ['websocket'], auth: { token: auth.accessToken }, reconnection: false, timeout: 15000 });
const ack = (event, data) => new Promise((resolve, reject) => socket.timeout(12000).emit(event, data, (error, value) => error || !value?.success ? reject(new Error(`Socket ${event} failed`)) : resolve(value)));
try {
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', () => reject(new Error('Socket connection failed'))); });
  const joined = await ack('request-join', { roomId: room.roomId });
  if (joined.data?.isHost) throw new Error('Test account owns this room; use a separate viewer account');
  const state = (await ack('watch-together-request-state', { roomId: room.roomId })).data?.state;
  console.log(JSON.stringify({ kind: 'room', id: room.roomId, name: room.name, current: state ? { sourceType: state.sourceType, format: state.format, isPlaying: state.isPlaying, currentTime: state.currentTime } : null }));
  const movies = (await json(`/api/rooms/${encodeURIComponent(room.roomId)}/movies`)).movies;
  for (const movie of movies) {
    const source = { sourceUrl: movie.url, sourceType: movie.source || movie.sourceType, format: movie.format, audioUrl: movie.audioUrl };
    const video = nativeVideoSource(source, serverUrl, auth.accessToken);
    {
      const url = new URL(video.uri);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { headers: { ...video.headers, Range: 'bytes=0-9437183' }, signal: controller.signal });
        console.log(JSON.stringify({ kind: 'large-header', title: movie.title, status: response.status, range: response.headers.get('content-range'), length: response.headers.get('content-length') }));
      } finally { controller.abort(); clearTimeout(timeout); }
    }
    const probe = await probeMedia(source, serverUrl, auth.accessToken);
    console.log(JSON.stringify({ kind: 'range', title: movie.title, result: probe }));
    // ffprobe sees only an ephemeral local relay. Credentials stay in memory and
    // never appear in argv, captured stderr, reports or the repository.
    const nonce = '/' + randomUUID();
    const relay = createServer(async (req, res) => {
      if (req.url !== nonce) { res.writeHead(404).end(); return; }
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      try {
        const upstream = await fetch(video.uri, { method: req.method, headers: { ...video.headers, ...(req.headers.range ? { Range: req.headers.range } : {}) }, signal: controller.signal });
        res.writeHead(upstream.status, Object.fromEntries(['content-type', 'content-length', 'content-range', 'accept-ranges'].flatMap(key => upstream.headers.has(key) ? [[key, upstream.headers.get(key)]] : [])));
        if (upstream.body) { const stream = Readable.fromWeb(upstream.body); stream.on('error', () => res.destroy()); stream.pipe(res); }
        else res.end();
      } catch { res.destroy(); }
    });
    await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
    try {
      const result = await new Promise(resolve => {
        const child = spawn('ffprobe', ['-v', 'error', '-rw_timeout', '15000000', '-analyzeduration', '10000000', '-probesize', '10000000', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,profile,pix_fmt,width,height,sample_rate,channels', '-of', 'json', `http://127.0.0.1:${relay.address().port}${nonce}`]);
        let output = ''; const timer = setTimeout(() => child.kill(), 60000);
        child.stdout.on('data', data => { output += data; });
        child.on('error', () => { clearTimeout(timer); resolve({ available: false }); });
        child.on('close', code => { clearTimeout(timer); let data; try { data = JSON.parse(output); } catch {} resolve({ exitCode: code, ...data }); });
      });
      console.log(JSON.stringify({ kind: 'codecs', title: movie.title, result }));
    } finally { relay.closeAllConnections(); await new Promise(resolve => relay.close(resolve)); }
  }
} finally { socket.disconnect(); }
