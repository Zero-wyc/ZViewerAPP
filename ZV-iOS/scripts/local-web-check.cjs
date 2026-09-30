// Actual unchanged web client, isolated local DB/server, disposable headless Chrome.
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const dependency = createRequire(path.resolve(__dirname, '../../../ZViewer-source-code/package.json'));
const { chromium } = dependency('playwright');
const { io } = dependency('socket.io-client');
const base = 'http://127.0.0.1:7336';
const backend = 'http://127.0.0.1:7333';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext();
  const login = await (await context.request.post(base + '/api/auth/login', { data: { username: 'root', password: 'root' } })).json();
  if (!login.accessToken) throw new Error('Local login failed');
  const localAuth = { Authorization: 'Bearer ' + login.accessToken };
  await context.addCookies([{ name: 'access_token', value: login.accessToken, url: base, httpOnly: true, sameSite: 'Lax' }]);
  const socket = io(backend, { transports: ['websocket'], auth: { token: login.accessToken }, reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', () => reject(new Error('Local socket failed'))); });
  const ack = (event, payload) => new Promise((resolve, reject) => socket.timeout(10000).emit(event, payload, (error, data) => error || !data?.success ? reject(new Error(event + ' failed')) : resolve(data)));
  const room = (await ack('create-room', { name: 'Local web throughput validation', mode: 'watch-together', requireApproval: false })).data.roomId;
  const rootData = await (await context.request.get(base + '/api/server-files/roots', { headers: localAuth })).json();
  if (!rootData.roots) throw new Error('Local roots status: ' + rootData.message);
  const roots = rootData.roots;
  const root = roots.find(item => item.absPath.replaceAll('\\', '/').toLowerCase() === 'c:/users/fredq/videos');
  const mediaPath = root.key + ':/S01E04.mp4';
  const added = await (await context.request.post(base + `/api/rooms/${room}/movies`, { headers: localAuth, data: { title: 'S01E04.mp4', source: 'server-files', url: '/api/server-files/proxy?path=' + encodeURIComponent(mediaPath), path: mediaPath, format: 'mp4' } })).json();
  if (!added.success) throw new Error('Local movie setup failed');
  socket.disconnect();
  const page = await context.newPage();
  await page.addInitScript(id => sessionStorage.setItem('zcontrol-host-room', id), room);
  const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
  const requests = new Map(); let bytes = 0;
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.url.includes('/api/server-files/proxy')) requests.set(event.requestId, { range: event.request.headers.Range || event.request.headers.range || null, bytes: 0, started: Date.now() });
  });
  cdp.on('Network.responseReceived', event => {
    const record = requests.get(event.requestId);
    if (record) Object.assign(record, { status: event.response.status, contentRange: event.response.headers['Content-Range'] || event.response.headers['content-range'], contentLength: event.response.headers['Content-Length'] || event.response.headers['content-length'] });
  });
  cdp.on('Network.dataReceived', event => { const record = requests.get(event.requestId); if (record) { record.bytes += event.dataLength; bytes += event.dataLength; } });
  const report = { scope: 'actual unchanged web client / Chrome / local server', checkpoints: [] };
  try {
    await page.goto(base + '/room/' + room);
    await page.locator('button[title="播放"]:visible').first().click({ timeout: 20000 });
    const video = page.locator('video').first();
    await video.waitFor();
    await video.evaluate(element => { element.muted = true; return element.play(); });
    const checkpoint = async phase => {
      const value = await video.evaluate(element => ({ currentTime: element.currentTime, duration: element.duration, paused: element.paused, readyState: element.readyState, error: element.error?.code, buffered: Array.from({ length: element.buffered.length }, (_, index) => [element.buffered.start(index), element.buffered.end(index)]) }));
      const point = { phase, ...value, requests: requests.size, bytes };
      report.checkpoints.push(point); console.log(JSON.stringify(point));
    };
    for (let step = 0; step < 2; step++) { await sleep(60000); await checkpoint('playing-' + (step+1)*60); }
    await video.evaluate(element => element.pause());
    await sleep(5000); await checkpoint('pause-settled');
    await sleep(15000); await checkpoint('pause-after-15s');
    await page.goto(base + '/rooms');
    const exitedBytes = bytes; const exitedRequests = requests.size;
    await sleep(10000); report.afterLeave = { bytesAtLeave: exitedBytes, bytes, requestsAtLeave: exitedRequests, requests: requests.size };
  } catch (error) {
    report.error = error.message.replace(/https?:\/\/\S+/g, '[url]');
    report.pageText = (await page.locator('body').innerText()).slice(-2500);
  } finally {
    report.requests = [...requests.values()];
    fs.writeFileSync(path.resolve(__dirname, '../../../local-ios-validation/web-results.json'), JSON.stringify(report, null, 2));
    await browser.close(); console.log(JSON.stringify({ complete: true, error: report.error }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
