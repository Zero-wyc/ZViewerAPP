import test from 'node:test';
import assert from 'node:assert/strict';
import { opusHeader, usableVoiceFrame, voiceBytes } from '../src/lib/voiceProtocol.ts';
import { importDanmaku } from '../src/lib/danmakuImport.ts';
import { parseSubtitle, detectFormat } from '../src/lib/subtitleParser.ts';
import { activeCues, cleanSubtitlePayload, emptySubtitles, subtitleText } from '../src/lib/subtitleSync.ts';
import { biliSelection } from '../src/lib/biliSelection.ts';
test('Bili selection preserves explicit cid/page without allowing arbitrary hosts or invalid parameters', () => {
  assert.deepEqual(biliSelection('https://www.bilibili.com/video/BV1234567890?cid=123&p=3'), { url: 'https://www.bilibili.com/video/BV1234567890?cid=123&p=3', cid: 123, page: 3 });
  assert.equal(biliSelection('BV1234567890').page, 1); assert.throws(() => biliSelection('https://evilbilibili.com/video/BV1234567890')); assert.throws(() => biliSelection('https://www.bilibili.com/video/BV1234567890?p=-1'));
});
test('voice packets retain OpusHead channel/rate and reject stale, malformed and oversized frames', () => {
  const head = opusHeader(); assert.equal(new TextDecoder().decode(head.slice(0, 8)), 'OpusHead'); assert.equal(head[9], 1); assert.equal(new DataView(head.buffer).getUint32(12, true), 48000);
  assert.equal(voiceBytes(new ArrayBuffer(23041)), null); assert.equal(voiceBytes('arbitrary'), null);
  assert.equal(usableVoiceFrame({ encoded: true, timestamp: 10000 }, new Uint8Array(4000), 10000), true);
  assert.equal(usableVoiceFrame({ encoded: true, timestamp: 10000 }, new Uint8Array(4001), 10000), false);
  assert.equal(usableVoiceFrame({ encoded: true, timestamp: 1 }, new Uint8Array(10), 20000), false);
  assert.equal(usableVoiceFrame({ encoded: false, timestamp: 1, sampleRate: 44100 }, new Uint8Array(3), 1), false);
});
test('danmaku XML/JSON import preserves clock/color and rejects invalid records', () => {
  const result = importDanmaku('<i><d p="1.25,1,25,16711680,0,0,0,1">A &amp; B</d></i>'); assert.equal(result[0].time, 1.25); assert.equal(result[0].content, 'A & B'); assert.equal(result[0].color, 16711680);
  assert.throws(() => importDanmaku('{}')); assert.throws(() => importDanmaku('[{"time":-1,"content":"bad"}]'));
});
test('existing subtitle parser preserves SRT/VTT/ASS timing without a DOM', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,500\n<b>Hello</b>\n'; const cues = parseSubtitle(srt, detectFormat('demo.srt', srt)); assert.equal(cues[0].start, 1); assert.equal(cues[0].end, 2.5); assert.equal(subtitleText(cues[0].text), 'Hello');
  const vtt = parseSubtitle('WEBVTT\n\n00:00:01.000 --> 00:00:03.000 line:20% position:30%\nTest\n', 'vtt'); assert.equal(vtt[0].line, 20);
  const ass = '[Script Info]\nPlayResX: 1920\nPlayResY: 1080\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello\\NWorld'; const parsed = parseSubtitle(ass, 'ass'); assert.equal(parsed[0].start, 1); assert.equal(parsed[0].end, 4); assert.match(subtitleText(parsed[0].text), /Hello\nWorld/);
});
test('subtitle room payloads clamp preferences, sort overlaps and reject invalid cues', () => {
  const value = cleanSubtitlePayload({ ...emptySubtitles, fontSize: 900, enabled: true, activeIndex: 5, tracks: [{ label: 'test', cues: [{ start: 2, end: 4, text: 'B' }, { start: 1, end: 3, text: 'A' }] }] }); assert.equal(value.fontSize, 60); assert.equal(value.activeIndex, 0); assert.deepEqual(activeCues(value.tracks[0].cues, 2.5).map(cue => cue.text), ['A', 'B']); assert.equal(activeCues(value.tracks[0].cues, 4).length, 0);
  assert.throws(() => cleanSubtitlePayload({ tracks: [{ label: 'x', cues: [{ start: 3, end: 1, text: 'bad' }] }] }));
});
