import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackSettingsRetryMode, playbackSettingsRetryError, retryCurrentPlaybackSettings } from '../src/lib/playbackSettingsRetry.ts';

test('a failed PUT retry reads another device current values without replaying or claiming the failed patch', async () => {
  let record = { serverProxy: false, playsvideoEnabled: false }; const writes = [];
  const failed = { serverProxy: true };
  const mode = playbackSettingsRetryMode('保存失败：HTTP 403', false);
  assert.equal(mode, 'save-unconfirmed');
  // Another device has intentionally changed both values since the failed PUT.
  record = { serverProxy: false, playsvideoEnabled: true };
  const result = await retryCurrentPlaybackSettings(mode, async patch => {
    if (Object.keys(patch).length) { writes.push(patch); record = { ...record, ...patch }; }
    return record;
  });
  assert.equal(result, 'save-unconfirmed'); assert.notDeepEqual(record, failed);
  assert.deepEqual(record, { serverProxy: false, playsvideoEnabled: true }); assert.deepEqual(writes, []);
});
test('an apply failure retries the latest confirmed settings, preserving a later device change', async () => {
  const mode = playbackSettingsRetryMode('设置已保存，确认或应用失败：媒体准备超时', true);
  assert.equal(mode, 'saved');
  const current = { serverProxy: false }; let applied; let puts = 0;
  await retryCurrentPlaybackSettings(mode, async patch => { if (Object.keys(patch).length) puts++; applied = current; });
  assert.equal(puts, 0); assert.equal(applied.serverProxy, false);
});
test('an empty confirmation failure cannot turn an originally failed save into a saved result', async () => {
  const mode = playbackSettingsRetryMode('保存失败：连接中断', false);
  await assert.rejects(retryCurrentPlaybackSettings(mode, async () => { throw Error('设置已保存，确认或应用失败：GET超时'); }), /GET超时/);
  assert.equal(mode, 'save-unconfirmed');
  assert.equal(playbackSettingsRetryError('设置已保存，确认或应用失败：GET超时'), '读取或应用服务器当前设置失败：GET超时');
  assert.equal(playbackSettingsRetryMode('没有影片播放设置权限', false), 'save-unconfirmed');
});
