import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

// Check recorded local evidence; this command performs no network requests.
const file = process.argv[2] || new URL('../../docs/releases/ios-1.2.1-2-vlc-results.json', import.meta.url);
const { desktop, web } = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(desktop.error, undefined);
assert.equal(web.error, undefined);
for (const name of ['S01E01.mkv', 'S01E04.mp4']) {
  const playing = desktop.continuous[name];
  assert.equal(playing.state, 3);
  assert.ok(playing.time >= 595 && playing.decodedVideo > 0 && playing.decodedAudio > 0);
  for (const seek of desktop.seeks) {
    assert.equal(seek.values[name].state, 3);
    assert.ok(Math.abs(seek.values[name].time - seek.target - 6) < 3);
  }
  for (const phase of ['pause', 'stop']) {
    assert.equal(desktop[phase].after[name].relayBytes, desktop[phase].before[name].relayBytes);
    assert.equal(desktop[phase].after[name].relayRequests, desktop[phase].before[name].relayRequests);
  }
  assert.ok(desktop.resumed[name].time > desktop.pause.after[name].time + 4);
}
assert.ok(desktop.requests.every(request => request.status === 206 && Number(request.contentLength) <= 8388608));
assert.ok(web.requests.every(request => request.status === 206 && Number(request.contentLength) <= 8388608));
assert.ok(web.checkpoints[1].currentTime >= 115 && !web.checkpoints[1].paused);
assert.equal(web.checkpoints[2].bytes, web.checkpoints[3].bytes);
assert.equal(web.checkpoints[2].requests, web.checkpoints[3].requests);
assert.equal(web.afterLeave.bytes, web.afterLeave.bytesAtLeave);
assert.equal(web.afterLeave.requests, web.afterLeave.requestsAtLeave);
console.log('Local desktop VLC and unchanged web playback evidence checks passed (not iOS device acceptance).');
