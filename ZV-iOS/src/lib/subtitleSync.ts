import type { ParsedCue } from './subtitleParser.ts';
import { toByteArray } from 'base64-js';
export function cleanBitmap(value: ParsedCue['bitmap']): ParsedCue['bitmap'] {
  if (!value) return undefined;
  if (typeof value.src !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.src) || value.src.length > 1_400_000) throw new Error('位图字幕图片无效');
  for (const key of ['x', 'y', 'width', 'height', 'canvasWidth', 'canvasHeight'] as const) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 8192) throw new Error('位图字幕尺寸无效');
  if (!value.width || !value.height || !value.canvasWidth || !value.canvasHeight || value.x + value.width > value.canvasWidth || value.y + value.height > value.canvasHeight || value.width * value.height > 8_000_000) throw new Error('位图字幕坐标无效');
  const png = toByteArray(value.src.slice('data:image/png;base64,'.length));
  if (png.length < 33 || ![137,80,78,71,13,10,26,10].every((byte, i) => png[i] === byte) || String.fromCharCode(...png.slice(12, 16)) !== 'IHDR') throw new Error('位图字幕不是 PNG');
  const width = png[16] * 16777216 + png[17] * 65536 + png[18] * 256 + png[19];
  const height = png[20] * 16777216 + png[21] * 65536 + png[22] * 256 + png[23];
  if (width !== value.width || height !== value.height) throw new Error('位图字幕尺寸与图片不一致');
  return { src: value.src, x: value.x, y: value.y, width: value.width, height: value.height, canvasWidth: value.canvasWidth, canvasHeight: value.canvasHeight };
}
export type SubtitleTrack = { label: string; cues: ParsedCue[] };
export type SubtitleState = { enabled: boolean; tracks: SubtitleTrack[]; activeIndex: number; fontSize: number; offset: number; shiftX: number; shiftY: number; strokeWidth: number; shadowBlur: number; fontFamily: string };
export const emptySubtitles: SubtitleState = { enabled: false, tracks: [], activeIndex: -1, fontSize: 20, offset: 0, shiftX: 0, shiftY: 0, strokeWidth: 1, shadowBlur: 4, fontFamily: '' };
export function cleanSubtitlePayload(raw: unknown): SubtitleState {
  const value = raw as Partial<SubtitleState>;
  if (!value || !Array.isArray(value.tracks) || value.tracks.length > 16) throw new Error('字幕轨道数据无效');
  const tracks = value.tracks.map(track => {
    if (!track || typeof track.label !== 'string' || !Array.isArray(track.cues) || track.cues.length > 50000) throw new Error('字幕轨道数据无效');
    const cues = track.cues.map(cue => {
      if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end < cue.start || typeof cue.text !== 'string' || cue.text.length > 20000) throw new Error('字幕条目数据无效');
      return { start: cue.start, end: cue.end, text: cue.text, ...(cue.bitmap ? { bitmap: cleanBitmap(cue.bitmap) } : {}), ...(Number.isFinite(cue.line) ? { line: Math.max(0, Math.min(100, cue.line!)) } : {}), ...(Number.isFinite(cue.position) ? { position: Math.max(0, Math.min(100, cue.position!)) } : {}), ...(['left', 'center', 'right'].includes(cue.align || '') ? { align: cue.align } : {}) };
    }).sort((a, b) => a.start - b.start);
    return { label: track.label.slice(0, 200), cues };
  });
  if (new TextEncoder().encode(JSON.stringify(tracks)).length > 4 * 1024 * 1024) throw new Error('字幕同步数据过大');
  const number = (key: keyof SubtitleState, min: number, max: number) => typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key] as number)) : emptySubtitles[key] as number;
  return { enabled: value.enabled === true, tracks, activeIndex: Number.isInteger(value.activeIndex) ? Math.max(-1, Math.min(tracks.length - 1, value.activeIndex!)) : -1, fontSize: number('fontSize', 10, 60), offset: number('offset', -3600, 3600), shiftX: number('shiftX', -50, 50), shiftY: number('shiftY', -50, 50), strokeWidth: number('strokeWidth', 0, 4), shadowBlur: number('shadowBlur', 0, 12), fontFamily: typeof value.fontFamily === 'string' ? value.fontFamily.slice(0, 100) : '' };
}
export function activeCues(cues: ParsedCue[], time: number): ParsedCue[] {
  let left = 0, right = cues.length; while (left < right) { const middle = (left + right) >>> 1; if (cues[middle].start <= time) left = middle + 1; else right = middle; }
  return cues.slice(Math.max(0, left - 40), left).filter(cue => time >= cue.start && time < cue.end).slice(-6);
}
export function subtitleText(raw: string) { return raw.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
