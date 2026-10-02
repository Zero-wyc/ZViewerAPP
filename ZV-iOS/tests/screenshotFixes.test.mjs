import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { biliSelection } from '../src/lib/biliSelection.ts';
import { moviePlayback, canonicalSelection } from '../src/lib/sources.ts';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { MusicSyncReceipt } from '../src/lib/musicSyncReceipt.ts';
import { VlcPlayer } from '../src/lib/vlcPlayer.ts';

test('both reported clipboard shares restore an existing room film and retain p/cid', () => {
  for (const text of ['【！？叶枫大豪宅？！】 https://www.bilibili.com/video/BV1H9am6WEbs?vd_source=abc', '【终末地风格 HUD】 https://www.bilibili.com/video/BV1xU6ZfEPV?vd_source=abc&p=2&cid=202']) {
    const selection = biliSelection(text);
    assert.match(selection.url, /^https:\/\/www.bilibili.com\/video\//);
    assert.equal(new URL(selection.url).searchParams.get('vd_source'), 'abc');
    const movie = { id: 1, title: 'clipboard movie', source: 'bilibili', url: text, cid: 101 };
    const room = new RoomPlayback(); room.current(1); room.list([movie]);
    room.state({ sourceUrl: 'http://127.0.0.1:9000/proxy', sourceType: 'bilibili', currentTime: 23, isPlaying: true });
    assert.equal(new URL(room.value().sourceUrl).searchParams.get('cid'), '101');
    assert.equal(room.value().currentTime, 23);
    assert.equal(canonicalSelection({ title: 'clipboard', source: 'bilibili', url: text }, 'https://server.example', 'token').url, selection.url);
    assert.equal(moviePlayback({ ...movie, cid: undefined }).sourceUrl, selection.url);
  }
});

test('Bilibili normalization accepts short links and BV ids but retains URL validation', () => {
  assert.equal(biliSelection('  BV1H9am6WEbs  ').url, 'https://www.bilibili.com/video/BV1H9am6WEbs');
  assert.equal(biliSelection('标题 https://b23.tv/abc123。').url, 'https://b23.tv/abc123');
  for (const value of ['标题 https://bilibili.com.attacker.test/video/BV1', 'https://user:pass@www.bilibili.com/video/BV1', '标题 javascript:alert(1)', 'https://www.bilibili.com/video/BV1?p=0', 'https://www.bilibili.com/video/BV1?cid=-1']) assert.throws(() => biliSelection(value), /B站/);
});

test('music receipt waits for readiness, ignores heartbeat/control and acknowledges a new track or connection once', () => {
  const gate = new MusicSyncReceipt(); gate.observe('room:connection-1:ncm:1');
  assert.equal(gate.take('room:connection-1:ncm:1', false), false);
  assert.equal(gate.take('room:connection-1:ncm:1', true), true);
  for (let heartbeat = 0; heartbeat < 30; heartbeat++) { gate.observe('room:connection-1:ncm:1'); assert.equal(gate.take('room:connection-1:ncm:1', true), false); }
  gate.observe('room:connection-1:ncm:2');
  assert.equal(gate.take('room:connection-1:ncm:1', true), false);
  assert.equal(gate.take('room:connection-1:ncm:2', true), true);
  gate.observe(''); assert.equal(gate.take('', true), false);
  gate.observe('room:connection-2:ncm:2'); assert.equal(gate.take('room:connection-2:ncm:2', true), true);
});

test('VLC initial selected IDs and local changes notify UI without choosing missing defaults', async () => {
  const snapshots = []; const player = new VlcPlayer(value => snapshots.push(value), true);
  const changes = []; player.addListener('settingsChange', value => changes.push(value));
  const source = { uri: 'https://cdn.example/movie.mkv', identity: 'movie', options: [], headers: {}, slaves: [], serverApi: false, contentType: 'progressive' };
  await player.replaceAsync(source); const id = snapshots.at(-1).id;
  player.tracks(id, { audio: [{ id: 0, name: 'Japanese', selected: true }], video: [], subtitle: [{ id: -1, name: 'off', selected: false }, { id: 0, name: '简日', selected: false }, { id: 1, name: '繁日', selected: true }] });
  assert.deepEqual(player.mediaSettings.tracks, {});
  assert.deepEqual(player.selectedTracks, { audio: 0, subtitle: 1 });
  player.configure({ tracks: { subtitle: 0 } }); assert.equal(player.selectedTracks.subtitle, 0); assert.equal(changes.at(-1).tracks.subtitle, 0);
  player.configure({ tracks: { subtitle: -1 } }); assert.equal(player.selectedTracks.subtitle, -1);
  await player.replaceAsync({ ...source, uri: 'https://cdn.example/next.mkv' });
  assert.equal(player.selectedTracks.subtitle, undefined); assert.equal(changes.at(-1).subtitleDelay, 0);
});
