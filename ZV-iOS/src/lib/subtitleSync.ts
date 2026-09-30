import type { ParsedCue } from './subtitleParser.ts';
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
      return { start: cue.start, end: cue.end, text: cue.text, ...(Number.isFinite(cue.line) ? { line: Math.max(0, Math.min(100, cue.line!)) } : {}), ...(Number.isFinite(cue.position) ? { position: Math.max(0, Math.min(100, cue.position!)) } : {}), ...(['left', 'center', 'right'].includes(cue.align || '') ? { align: cue.align } : {}) };
    }).sort((a, b) => a.start - b.start);
    return { label: track.label.slice(0, 200), cues };
  });
  if (JSON.stringify(tracks).length > 4 * 1024 * 1024) throw new Error('字幕同步数据过大');
  const number = (key: keyof SubtitleState, min: number, max: number) => typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key] as number)) : emptySubtitles[key] as number;
  return { enabled: value.enabled === true, tracks, activeIndex: Number.isInteger(value.activeIndex) ? Math.max(-1, Math.min(tracks.length - 1, value.activeIndex!)) : -1, fontSize: number('fontSize', 10, 60), offset: number('offset', -3600, 3600), shiftX: number('shiftX', -50, 50), shiftY: number('shiftY', -50, 50), strokeWidth: number('strokeWidth', 0, 4), shadowBlur: number('shadowBlur', 0, 12), fontFamily: typeof value.fontFamily === 'string' ? value.fontFamily.slice(0, 100) : '' };
}
export function activeCues(cues: ParsedCue[], time: number): ParsedCue[] {
  let left = 0, right = cues.length; while (left < right) { const middle = (left + right) >>> 1; if (cues[middle].start <= time) left = middle + 1; else right = middle; }
  return cues.slice(Math.max(0, left - 40), left).filter(cue => time >= cue.start && time < cue.end).slice(-6);
}
export function subtitleText(raw: string) { return raw.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
