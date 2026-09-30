import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseLyrics, roomTime, trackTimeline, upperBound } from '../src/lib/timeline.ts';
import { parseResolvedMedia } from '../src/lib/resolvers.ts';
import { canonicalSelection } from '../src/lib/sources.ts';
test('lyrics preserve repeated timestamps, sort lines and ignore metadata', () => {
  const lyrics = parseLyrics('[ar:artist]\n[00:10.5][00:30.00]重复\n[00:02.10]开始\n[00:09]');
  assert.deepEqual(lyrics.map(line => line.time), [2.1, 10.5, 30]); assert.equal(upperBound(lyrics, 10.5), 2); assert.equal(upperBound(lyrics, 0), 0);
});
test('danmaku timeline offsets hidden tracks and rejects invalid times', () => {
  const items = trackTimeline([{ trackId: 'a', label: 'a', offset: -1, items: [{ id: '1', time: 2, content: 'one' }, { id: '2', time: NaN, content: 'bad' }] }, { trackId: 'b', label: 'b', hidden: true, items: [{ id: '1', time: 1, content: 'hidden' }] }]);
  assert.deepEqual(items.map(item => [item.id, item.time]), [['a:1', 1]]);
});
test('room clock compensates short transport delay and bounds stale/future timestamps', () => {
  assert.equal(roomTime(10, true, 1000, 2500), 11.5); assert.equal(roomTime(10, false, 1000, 2500), 10); assert.equal(roomTime(10, true, 9000, 2500), 10); assert.equal(roomTime(10, true, 1000, 99000), 15);
});
test('streamed Bili resolver reads the terminal result and rejects terminal failure', () => {
  assert.equal(parseResolvedMedia('{"status":"progress"}\n{"success":true,"videoUrl":"/api/stream/proxy?v=1","audioUrl":"/api/stream/proxy?a=1"}\n').audioUrl, '/api/stream/proxy?a=1');
  assert.throws(() => parseResolvedMedia('{"status":"progress"}\n{"success":false,"message":"private diagnostic"}'), /解析失败/);
  assert.throws(() => parseResolvedMedia('{"success":true}'), /没有返回/);
});
test('movie additions remove owned media credentials while preserving external signed URLs', () => {
  const value = canonicalSelection({ title: 'split', source: 'bilibili', url: 'https://s.example/p/api/proxy?token=old&rangeMode=avplayer&path=x', audioUrl: 'https://cdn.example/audio?token=cdn-signature' }, 'https://s.example/p', 'private-session');
  assert.equal(value.url, '/api/proxy?path=x'); assert.equal(value.audioUrl, 'https://cdn.example/audio?token=cdn-signature'); assert.doesNotMatch(JSON.stringify(value), /private-session|rangeMode|token=old/);
});
