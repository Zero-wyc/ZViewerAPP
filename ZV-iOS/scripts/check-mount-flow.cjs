const http = require('node:http'); const assert = require('node:assert/strict'); const { io } = require('socket.io-client'); const fs = require('node:fs'); const path = require('node:path');
const base = 'http://127.0.0.1:7333'; const mountBase = 'http://127.0.0.1:7340'; const media = Buffer.alloc(20480, 3); media.write('ftypisom', 4); const checks = [];
// A synthetic DAV server exercises metadata and Range, without touching NAS.
const fixture = http.createServer((req, res) => {
  if (req.method === 'PROPFIND') {
    const file = req.url !== '/'; const response = (href, folder) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:displayname>${folder ? 'Fixture' : 'sample.mp4'}</d:displayname><d:resourcetype>${folder ? '<d:collection/>' : ''}</d:resourcetype><d:getcontentlength>${folder ? 0 : media.length}</d:getcontentlength><d:getcontenttype>${folder ? 'httpd/unix-directory' : 'video/mp4'}</d:getcontenttype><d:getlastmodified>Wed, 30 Sep 2026 00:00:00 GMT</d:getlastmodified><d:getetag>fixture-etag</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
    res.writeHead(207, { 'Content-Type': 'application/xml' }); res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${file ? response('/sample.mp4', false) : response('/', true) + response('/sample.mp4', false)}</d:multistatus>`); return;
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || ''); const start = match ? Number(match[1]) : 0; const end = match && match[2] ? Math.min(media.length - 1, Number(match[2])) : media.length - 1;
  if (start >= media.length) { res.writeHead(416, { 'Content-Range': `bytes */${media.length}` }); res.end(); return; }
  res.writeHead(match ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}) }); res.end(req.method === 'HEAD' ? undefined : media.subarray(start, end + 1));
});
const ack = (socket, event, data) => new Promise((resolve, reject) => socket.timeout(10000).emit(event, data, (failure, result) => failure || !result?.success ? reject(new Error(`${event} failed`)) : resolve(result)));
(async () => {
  let socket, headers, mountId, roomId;
  await new Promise(resolve => fixture.listen(7340, '127.0.0.1', resolve));
  try {
    const auth = async (route, body) => (await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    const user = await auth('/api/auth/login', { username: 'root', password: 'root' }); headers = { Authorization: `Bearer ${user.accessToken}`, 'Content-Type': 'application/json' };
    socket = io(base, { transports: ['websocket'], auth: { token: user.accessToken }, forceNew: true, reconnection: false }); await new Promise((resolve, reject) => socket.once('connect', resolve).once('connect_error', reject));
    const payload = { name: 'Isolated iOS DAV fixture', serverUrl: mountBase, path: '/', username: 'fixture', password: 'local-only', directLink: false };
    let result = await fetch(base + '/api/webdav/mounts/test', { method: 'POST', headers, body: JSON.stringify(payload) }); assert.equal(result.status, 200); checks.push('DAV connection test');
    result = await fetch(base + '/api/webdav/mounts', { method: 'POST', headers, body: JSON.stringify(payload) }); assert.equal(result.status, 201); mountId = (await result.json()).mount.id; checks.push('mount create');
    const query = new URLSearchParams({ mountId: String(mountId), path: '/sample.mp4' }); const resolved = await (await fetch(`${base}/api/webdav/resolve?${query}`, { headers })).json(); assert(resolved.videoUrl); checks.push('file resolve');
    roomId = (await ack(socket, 'create-room', { name: 'Isolated iOS mount check', mode: 'watch-together', requireApproval: false, maxViewers: 10 })).data.roomId; await ack(socket, 'register-host', { roomId });
    result = await fetch(`${base}/api/rooms/${roomId}/movies`, { method: 'POST', headers, body: JSON.stringify({ title: 'Fixture', url: resolved.videoUrl, source: 'webdav', serverUrl: mountBase, path: '/sample.mp4', directLink: false, format: resolved.format }) }); assert.equal(result.status, 201); const movie = (await result.json()).movie; assert.equal(movie.serverUrl, mountBase); assert.equal(movie.path, '/sample.mp4'); assert.match(movie.url, /stream\?movieId=/); checks.push('movie preserves mount metadata and gets movieId stream');
    const guest = await auth('/api/auth/guest', {}); await ack(await new Promise((resolve, reject) => { const connection = io(base, { transports: ['websocket'], auth: { token: guest.accessToken }, reconnection: false }); connection.once('connect', () => resolve(connection)).once('connect_error', reject); setTimeout(() => connection.disconnect(), 10000).unref(); }), 'request-join', { roomId });
    result = await fetch(base + movie.url, { headers: { Authorization: `Bearer ${guest.accessToken}`, Range: 'bytes=0-15' } }); assert.equal(result.status, 206); assert.equal((await result.arrayBuffer()).byteLength, 16); assert.equal(result.headers.get('content-range'), `bytes 0-15/${media.length}`); checks.push('admitted guest Range reads owner mount by movieId');
    result = await fetch(`${base}/api/webdav/mounts/${mountId}`, { method: 'PUT', headers, body: JSON.stringify({ ...payload, name: 'Updated isolated fixture', password: undefined }) }); assert.equal(result.status, 200); checks.push('mount edit with password retained');
    result = await fetch(`${base}/api/webdav/mounts/${mountId}`, { method: 'DELETE', headers }); assert.equal(result.status, 200); mountId = null; checks.push('mount delete');
  } finally { socket?.disconnect(); if (roomId) await fetch(`${base}/api/rooms/${roomId}`, { method: 'DELETE', headers }); if (mountId) await fetch(`${base}/api/webdav/mounts/${mountId}`, { method: 'DELETE', headers }); await new Promise(resolve => fixture.close(resolve)); fs.writeFileSync(path.resolve(__dirname, '../../../local-ios-validation/ios-mount-results.json'), JSON.stringify({ scope: 'synthetic local DAV + unmodified v4.2.0; not remote NAS/media decode acceptance', checks }, null, 2)); }
  console.log(JSON.stringify({ passed: checks.length }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
